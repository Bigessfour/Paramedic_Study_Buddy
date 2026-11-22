#!/usr/bin/env node
/**
 * Local high-quality course pack extract.
 * Reads Paramedic Book/, writes course-context/. Does NOT call AWS.
 *
 * Usage:
 *   node scripts/ingest-course-pack.mjs              # all tiers A→G
 *   node scripts/ingest-course-pack.mjs --tiers A,B,C
 *   node scripts/ingest-course-pack.mjs --ocr         # OCR sparse PDFs after native
 *   node scripts/ingest-course-pack.mjs --limit 5
 */
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import mammoth from 'mammoth'
import JSZip from 'jszip'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)

const ROOT = process.cwd()
const SOURCE_DIR = path.join(ROOT, 'Paramedic Book')
const OUT_DIR = path.join(ROOT, 'course-context')
const BY_FILE = path.join(OUT_DIR, 'by-file')
const BY_CHAPTER = path.join(OUT_DIR, 'by-chapter')
const BY_TIER = path.join(OUT_DIR, 'by-tier')
const MANIFEST = path.join(OUT_DIR, 'manifest.jsonl')
const REPORT = path.join(OUT_DIR, 'qc-report.json')

GlobalWorkerOptions.workerSrc = path.join(
  ROOT,
  'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
)

const PDF_CHARS_PER_PAGE_MIN = 400
const PPTX_CHARS_PER_SLIDE_MIN = 80
const COPYRIGHT_RE =
  /Copyright ©.*?Ascend Learning Company.*?Surgeons\.?/gi

const TIER_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

function classify(filename) {
  if (/Lecture Outlines/i.test(filename)) return 'A'
  if (/Learning Objectives/i.test(filename)) return 'B'
  if (/Assessment in Action/i.test(filename)) return 'C'
  if (/Case Studies/i.test(filename)) return 'D'
  if (/Skill/i.test(filename)) return 'E'
  if (/Slides\s*-/i.test(filename)) return 'G'
  return 'F'
}

function chapterOf(filename) {
  const m = filename.match(/Chapter\s+(\d+)/i)
  return m ? Number(m[1]) : null
}

function slugify(name) {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w.\- ()]+/g, '_')
    .replace(/\s+/g, '-')
    .slice(0, 120)
}

function parseArgs(argv) {
  const args = {
    tiers: new Set(TIER_ORDER),
    ocr: false,
    limit: Infinity,
  }
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--ocr') args.ocr = true
    else if (a === '--tiers') {
      args.tiers = new Set(
        argv[++i].split(',').map((t) => t.trim().toUpperCase()),
      )
    } else if (a === '--limit') args.limit = Number(argv[++i])
  }
  return args
}

async function ensureDirs() {
  await fs.mkdir(BY_FILE, { recursive: true })
  await fs.mkdir(BY_CHAPTER, { recursive: true })
  for (const t of TIER_ORDER) {
    await fs.mkdir(path.join(BY_TIER, t), { recursive: true })
  }
}

async function sha256File(filePath) {
  const buf = await fs.readFile(filePath)
  return crypto.createHash('sha256').update(buf).digest('hex')
}

function cleanText(text) {
  return text
    .replace(COPYRIGHT_RE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function extractDocx(filePath) {
  const result = await mammoth.extractRawText({ path: filePath })
  return { text: cleanText(result.value), method: 'mammoth', pages: null }
}

async function extractPdfNative(filePath) {
  const data = new Uint8Array(await fs.readFile(filePath))
  const pdf = await getDocument({ data, disableWorker: true }).promise
  const pageTexts = []
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    pageTexts.push(pageText)
  }
  const text = cleanText(pageTexts.join('\n\n'))
  const charsPerPage = pdf.numPages ? text.length / pdf.numPages : 0
  return {
    text,
    method: 'pdfjs',
    pages: pdf.numPages,
    charsPerPage,
    needsOcr: charsPerPage < PDF_CHARS_PER_PAGE_MIN,
    pageTexts,
  }
}

async function extractPptx(filePath) {
  const buf = await fs.readFile(filePath)
  const zip = await JSZip.loadAsync(buf)
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)/i)?.[1] || 0)
      const nb = Number(b.match(/slide(\d+)/i)?.[1] || 0)
      return na - nb
    })
  const noteNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(n))
    .sort()

  const slideTexts = []
  for (const name of slideNames) {
    const xml = await zip.files[name].async('string')
    const parts = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((m) => m[1])
    slideTexts.push(parts.join(' '))
  }
  const noteTexts = []
  for (const name of noteNames) {
    const xml = await zip.files[name].async('string')
    const parts = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((m) => m[1])
    noteTexts.push(parts.join(' '))
  }

  const body = [
    ...slideTexts.map((t, i) => `## Slide ${i + 1}\n${t}`),
    ...(noteTexts.length
      ? ['## Speaker notes', ...noteTexts.map((t, i) => `### Notes ${i + 1}\n${t}`)]
      : []),
  ].join('\n\n')

  const text = cleanText(body)
  const slides = slideNames.length || 1
  const charsPerSlide = text.length / slides
  return {
    text,
    method: 'pptx-xml',
    pages: slides,
    charsPerPage: charsPerSlide,
    needsOcr: charsPerSlide < PPTX_CHARS_PER_SLIDE_MIN,
  }
}

async function ocrPdfPages(filePath, pageTexts) {
  // Local PDFKit render + Vision OCR (avoid AWS Textract / pdfjs canvas).
  const sparsePages = []
  for (let i = 0; i < (pageTexts?.length ?? 0); i += 1) {
    if ((pageTexts[i] ?? '').trim().length < PDF_CHARS_PER_PAGE_MIN) {
      sparsePages.push(i + 1)
    }
  }
  if (sparsePages.length === 0) {
    return { text: cleanText((pageTexts ?? []).join('\n\n')), method: 'pdfjs' }
  }

  const swiftScript = path.join(ROOT, 'scripts/ocr-pdf.swift')
  const pagesArg = sparsePages.join(',')
  console.log(`  PDFKit+Vision OCR on ${sparsePages.length} sparse pages…`)
  const { stdout } = await execFileAsync(
    'swift',
    [swiftScript, filePath, pagesArg, '2.0'],
    { maxBuffer: 40 * 1024 * 1024 },
  )

  const ocrParts = stdout.split(/\n\n---PAGE---\n\n/)
  const ocrByPage = new Map()
  sparsePages.forEach((pageNum, idx) => {
    ocrByPage.set(pageNum, (ocrParts[idx] ?? '').trim())
  })

  const merged = []
  let ocrPages = 0
  for (let i = 0; i < pageTexts.length; i += 1) {
    const native = pageTexts[i] ?? ''
    const pageNum = i + 1
    if (!ocrByPage.has(pageNum)) {
      merged.push(native)
      continue
    }
    const ocrText = ocrByPage.get(pageNum) ?? ''
    if (ocrText.length > native.trim().length) {
      merged.push(ocrText)
      ocrPages += 1
    } else {
      merged.push(native)
    }
  }

  return {
    text: cleanText(merged.join('\n\n')),
    method: ocrPages > 0 ? 'pdfkit+vision-ocr' : 'pdfjs',
  }
}

function artifactHeader(meta) {
  return [
    '---',
    `source: ${meta.source}`,
    `chapter: ${meta.chapter ?? ''}`,
    `tier: ${meta.tier}`,
    `method: ${meta.method}`,
    `chars: ${meta.chars}`,
    `needsOcr: ${meta.needsOcr ?? false}`,
    `sha256: ${meta.sha256}`,
    '---',
    '',
  ].join('\n')
}

async function loadExistingManifest() {
  try {
    const raw = await fs.readFile(MANIFEST, 'utf8')
    const map = new Map()
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue
      const row = JSON.parse(line)
      map.set(row.source, row)
    }
    return map
  } catch {
    return new Map()
  }
}

async function writeManifest(rows) {
  const lines = rows.map((r) => JSON.stringify(r)).join('\n') + '\n'
  await fs.writeFile(MANIFEST, lines)
}

async function rebuildChapterBundles(manifestRows) {
  const byChapter = new Map()
  for (const row of manifestRows) {
    if (row.status !== 'ok' && row.status !== 'ok-partial') continue
    if (row.chapter == null) continue
    if (!byChapter.has(row.chapter)) byChapter.set(row.chapter, [])
    byChapter.get(row.chapter).push(row)
  }

  for (const [chapter, rows] of [...byChapter.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    rows.sort(
      (a, b) =>
        TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) ||
        a.source.localeCompare(b.source),
    )
    const parts = []
    for (const row of rows) {
      const body = await fs.readFile(row.outPath, 'utf8')
      const withoutHeader = body.replace(/^---[\s\S]*?---\n*/, '')
      parts.push(
        `# ${row.source}\n\n_Tier ${row.tier} · ${row.method}_\n\n${withoutHeader.trim()}`,
      )
    }
    const out = path.join(
      BY_CHAPTER,
      `chapter-${String(chapter).padStart(2, '0')}.md`,
    )
    await fs.writeFile(
      out,
      `# Chapter ${chapter}\n\n${parts.join('\n\n---\n\n')}\n`,
    )
  }
}

async function main() {
  const args = parseArgs(process.argv)
  await ensureDirs()

  const entries = (await fs.readdir(SOURCE_DIR))
    .filter((n) => !n.startsWith('.'))
    .filter((n) => /\.(pdf|docx|pptx)$/i.test(n))
    .sort()

  const existing = await loadExistingManifest()
  const rows = []
  let processed = 0

  for (const name of entries) {
    const tier = classify(name)
    if (!args.tiers.has(tier)) continue
    if (processed >= args.limit) break

    const filePath = path.join(SOURCE_DIR, name)
    const st = await fs.stat(filePath)
    if (!st.isFile()) continue

    const hash = await sha256File(filePath)
    const prev = existing.get(name)
    const outName = `${slugify(name)}.txt`
    const outPath = path.join(BY_FILE, outName)
    const tierPath = path.join(BY_TIER, tier, outName)

    const shouldOcrRetry =
      args.ocr &&
      (prev?.needsOcr || prev?.status === 'error' || prev?.status === 'ok-partial')
    if (
      prev?.sha256 === hash &&
      prev?.outPath &&
      prev?.status === 'ok' &&
      !shouldOcrRetry
    ) {
      try {
        await fs.access(prev.outPath)
        rows.push(prev)
        console.log(`SKIP ${name}`)
        continue
      } catch {
        // regenerate
      }
    }

    console.log(`EXTRACT [${tier}] ${name}`)
    processed += 1
    const chapter = chapterOf(name)
    let result
    try {
      const ext = path.extname(name).toLowerCase()
      if (ext === '.docx') result = await extractDocx(filePath)
      else if (ext === '.pdf') result = await extractPdfNative(filePath)
      else if (ext === '.pptx') result = await extractPptx(filePath)
      else continue

      if (args.ocr && result.needsOcr && ext === '.pdf') {
        console.log(`  OCR sparse PDF pages…`)
        try {
          const ocr = await ocrPdfPages(filePath, result.pageTexts)
          if (ocr.text && ocr.text.length >= result.text.length) {
            result.text = ocr.text
            result.method = ocr.method
            result.needsOcr = false
          }
        } catch (ocrErr) {
          console.warn(`  OCR fallback to native: ${ocrErr.message}`)
        }
      }

      const meta = {
        source: name,
        chapter,
        tier,
        method: result.method,
        chars: result.text.length,
        needsOcr: Boolean(result.needsOcr),
        sha256: hash,
      }
      const body = artifactHeader(meta) + result.text + '\n'
      await fs.writeFile(outPath, body)
      await fs.writeFile(tierPath, body)

      const row = {
        source: name,
        chapter,
        tier,
        method: result.method,
        chars: result.text.length,
        pages: result.pages ?? null,
        charsPerPage: result.charsPerPage ?? null,
        needsOcr: Boolean(result.needsOcr),
        sha256: hash,
        sizeBytes: st.size,
        outPath,
        status: result.text.length > 0 ? 'ok' : 'ok-partial',
        updatedAt: new Date().toISOString(),
      }
      rows.push(row)
    } catch (err) {
      console.error(`  FAIL ${name}: ${err.message}`)
      rows.push({
        source: name,
        chapter,
        tier,
        sha256: hash,
        sizeBytes: st.size,
        status: 'error',
        error: err.message,
        updatedAt: new Date().toISOString(),
      })
    }
  }

  // Keep skipped tiers from previous manifest
  for (const [source, row] of existing) {
    if (!rows.find((r) => r.source === source)) rows.push(row)
  }
  rows.sort((a, b) => a.source.localeCompare(b.source))
  await writeManifest(rows)
  await rebuildChapterBundles(rows.filter((r) => args.tiers.has(r.tier) || existing.has(r.source)))

  const needsOcr = rows.filter((r) => r.needsOcr)
  const report = {
    total: rows.length,
    ok: rows.filter((r) => r.status === 'ok').length,
    partial: rows.filter((r) => r.status === 'ok-partial').length,
    error: rows.filter((r) => r.status === 'error').length,
    needsOcr: needsOcr.length,
    needsOcrSamples: needsOcr.slice(0, 20).map((r) => ({
      source: r.source,
      charsPerPage: r.charsPerPage,
      chars: r.chars,
    })),
    byTier: Object.fromEntries(
      TIER_ORDER.map((t) => [t, rows.filter((r) => r.tier === t).length]),
    ),
  }
  await fs.writeFile(REPORT, JSON.stringify(report, null, 2))
  console.log('\nQC', report)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
