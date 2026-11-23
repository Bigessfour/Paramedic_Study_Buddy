#!/usr/bin/env node
/**
 * Chunk + embed course-context/by-chapter into gitignored embeddings/chunks.jsonl.
 * Provider: Amazon Bedrock Titan Embed Text v2 (same model as Lambda embedQuery).
 *
 * Usage:
 *   AWS_PROFILE=steve-copilot npm run embed:course
 *   npm run embed:course -- --limit 3
 *   npm run embed:course -- --force
 *   npm run embed:course -- --chapters 1,2
 *
 * Env (optional):
 *   EMBEDDING_PROVIDER=bedrock
 *   EMBEDDING_MODEL=amazon.titan-embed-text-v2:0
 *   AWS_REGION / BEDROCK_REGION (default us-east-2)
 *   EMBED_CHUNK_SIZE=800 EMBED_CHUNK_OVERLAP=120 EMBED_MAX_CHAPTER_CHARS=40000
 *   (Chapter 1 uses up to 200000 when it contains the table-gap supplement.)
 */
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime'

const ROOT = process.cwd()
const OUT_DIR = path.join(ROOT, 'course-context')
const BY_CHAPTER = path.join(OUT_DIR, 'by-chapter')
const EMBED_DIR = path.join(OUT_DIR, 'embeddings')
const OUT_FILE = path.join(EMBED_DIR, 'chunks.jsonl')
const META_FILE = path.join(EMBED_DIR, 'meta.json')

const MODEL =
  process.env.EMBEDDING_MODEL || 'amazon.titan-embed-text-v2:0'
const REGION =
  process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-east-2'
const CHUNK_SIZE = Number(process.env.EMBED_CHUNK_SIZE || 800)
const OVERLAP = Number(process.env.EMBED_CHUNK_OVERLAP || 120)
const MAX_CHAPTER_CHARS = Number(
  process.env.EMBED_MAX_CHAPTER_CHARS || 40_000,
)
const MAX_CHAPTER_CHARS_SUPPLEMENTED = Number(
  process.env.EMBED_MAX_CHAPTER_CHARS_SUPPLEMENTED || 200_000,
)
const DIMENSIONS = 1024
const CONCURRENCY = Number(process.env.EMBED_CONCURRENCY || 4)

function parseArgs(argv) {
  const limitIdx = argv.indexOf('--limit')
  const chaptersIdx = argv.indexOf('--chapters')
  const chapters =
    chaptersIdx >= 0
      ? new Set(
          String(argv[chaptersIdx + 1] || '')
            .split(',')
            .map((s) => String(Number(s.trim())))
            .filter((s) => s && s !== 'NaN'),
        )
      : null
  return {
    force: argv.includes('--force'),
    dryRun: argv.includes('--dry-run'),
    limit: limitIdx >= 0 ? Number(argv[limitIdx + 1]) : Infinity,
    chapters,
  }
}

function stripHeader(body) {
  return body.replace(/^---[\s\S]*?---\n*/, '')
}

function normalizeText(body) {
  return stripHeader(body).replace(/\s+/g, ' ').trim()
}

function contentHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)
}

function chunkText(text, size = CHUNK_SIZE, overlap = OVERLAP) {
  if (text.length <= size) {
    return [{ text, charStart: 0, charEnd: text.length }]
  }
  const parts = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(text.length, start + size)
    parts.push({ text: text.slice(start, end), charStart: start, charEnd: end })
    if (end >= text.length) break
    start = Math.max(0, end - overlap)
  }
  return parts
}

function chapterLabel(filename) {
  const m = filename.match(/chapter-(\d+)/i)
  return m ? String(Number(m[1])) : filename
}

async function loadExisting() {
  try {
    const raw = await fs.readFile(OUT_FILE, 'utf8')
    const byKey = new Map()
    for (const line of raw.split('\n').filter(Boolean)) {
      const row = JSON.parse(line)
      if (row.chunkKey) byKey.set(row.chunkKey, row)
    }
    return byKey
  } catch {
    return new Map()
  }
}

async function embedOne(client, text) {
  const body = JSON.stringify({
    inputText: text.slice(0, 8000),
    dimensions: DIMENSIONS,
    normalize: true,
  })
  const res = await client.send(
    new InvokeModelCommand({
      modelId: MODEL,
      contentType: 'application/json',
      accept: 'application/json',
      body: Buffer.from(body),
    }),
  )
  const payload = JSON.parse(new TextDecoder().decode(res.body))
  const embedding = payload.embedding
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error('Bedrock returned empty embedding')
  }
  return embedding
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  )
  return results
}

async function main() {
  const args = parseArgs(process.argv)
  const provider = process.env.EMBEDDING_PROVIDER || 'bedrock'
  if (provider !== 'bedrock') {
    console.error(
      `Only bedrock is supported for batch embed (got EMBEDDING_PROVIDER=${provider}).`,
    )
    process.exit(1)
  }

  await fs.mkdir(EMBED_DIR, { recursive: true })
  let files = (await fs.readdir(BY_CHAPTER))
    .filter((n) => /^chapter-\d+\.md$/i.test(n))
    .sort()
  if (args.chapters?.size) {
    files = files.filter((n) => args.chapters.has(chapterLabel(n)))
  }
  files = files.slice(0, args.limit)

  if (files.length === 0) {
    console.error('No chapter-*.md files in course-context/by-chapter')
    process.exit(1)
  }

  const existing = args.force ? new Map() : await loadExisting()
  const client = new BedrockRuntimeClient({ region: REGION })

  /** @type {Array<{chunkKey:string, chapter:string, source:string, tier:string, text:string, charStart:number, charEnd:number, contentHash:string, needsEmbed:boolean, embedding?:number[]}>} */
  const planned = []

  // When re-embedding a subset, keep other chapters' existing rows.
  if (args.chapters?.size) {
    for (const row of existing.values()) {
      if (!args.chapters.has(String(row.chapter))) {
        planned.push({
          ...row,
          needsEmbed: false,
          embedding: row.embedding,
        })
      }
    }
  }

  for (const name of files) {
    const body = await fs.readFile(path.join(BY_CHAPTER, name), 'utf8')
    const normalized = normalizeText(body)
    const hasSupplement =
      /Course supplement|1\.\s*Manpower[\s\S]{0,400}15\.\s*Mutual aid/i.test(
        body,
      )
    const cap = hasSupplement
      ? MAX_CHAPTER_CHARS_SUPPLEMENTED
      : MAX_CHAPTER_CHARS
    const full = normalized.slice(0, cap)
    const chapter = chapterLabel(name)
    const parts = chunkText(full)
    for (const part of parts) {
      const hash = contentHash(part.text)
      const chunkKey = `${name}#${part.charStart}#${hash}`
      const prev = existing.get(chunkKey)
      planned.push({
        chunkKey,
        chapter,
        source: name,
        tier: hasSupplement ? 'S' : 'A',
        text: part.text,
        charStart: part.charStart,
        charEnd: part.charEnd,
        contentHash: hash,
        needsEmbed: args.force || !prev?.embedding,
        embedding: prev?.embedding,
      })
    }
  }

  const toEmbed = planned.filter((p) => p.needsEmbed)
  console.log(
    `Chapters ${files.length}; chunks ${planned.length}; embed ${toEmbed.length} (reuse ${planned.length - toEmbed.length}); model=${MODEL} region=${REGION}`,
  )

  if (args.dryRun) {
    console.log('Dry run — no Bedrock calls.')
    return
  }

  let done = 0
  await mapPool(toEmbed, CONCURRENCY, async (item) => {
    item.embedding = await embedOne(client, item.text)
    done += 1
    if (done % 25 === 0 || done === toEmbed.length) {
      console.log(`  embedded ${done}/${toEmbed.length}`)
    }
  })

  const lines = planned.map((p) =>
    JSON.stringify({
      chunkKey: p.chunkKey,
      chapter: p.chapter,
      source: p.source,
      tier: p.tier,
      text: p.text,
      charStart: p.charStart,
      charEnd: p.charEnd,
      contentHash: p.contentHash,
      embedding: p.embedding,
      model: MODEL,
      dimensions: DIMENSIONS,
      provider: 'bedrock',
    }),
  )

  await fs.writeFile(OUT_FILE, lines.join('\n') + '\n', 'utf8')
  await fs.writeFile(
    META_FILE,
    JSON.stringify(
      {
        provider: 'bedrock',
        model: MODEL,
        region: REGION,
        dimensions: DIMENSIONS,
        chunkSize: CHUNK_SIZE,
        overlap: OVERLAP,
        maxChapterChars: MAX_CHAPTER_CHARS,
        chapterCount: files.length,
        chunkCount: planned.length,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
    'utf8',
  )
  console.log(`Wrote ${planned.length} chunks → ${OUT_FILE}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
