#!/usr/bin/env node
/**
 * Upload local course-context text into Amplify Storage + Material rows.
 * Prefers pushing cheap text from this machine; no Textract.
 *
 * Requires:
 *   - amplify_outputs.json (from sandbox)
 *   - Cognito user session via env:
 *       INGEST_EMAIL / INGEST_PASSWORD  (temp; not committed)
 *   - or already-configured Amplify auth in process (not typical for node)
 *
 * Usage:
 *   INGEST_EMAIL=... INGEST_PASSWORD=... node scripts/upload-course-context.mjs
 *   node scripts/upload-course-context.mjs --dry-run
 *   node scripts/upload-course-context.mjs --chapters-only
 *   node scripts/upload-course-context.mjs --index-files   # also Material-index by-file (noisy)
 *
 * Default: upload all by-file + chapter text to S3; create Material rows for
 * chapters only (keeps Practice Test / Materials UI usable under list limits).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { Amplify } from 'aws-amplify'
import { signIn, fetchAuthSession, signOut } from 'aws-amplify/auth'
import { uploadData } from 'aws-amplify/storage'
import { generateClient } from 'aws-amplify/data'

const ROOT = process.cwd()
const OUT_DIR = path.join(ROOT, 'course-context')
const MANIFEST = path.join(OUT_DIR, 'manifest.jsonl')
const BY_CHAPTER = path.join(OUT_DIR, 'by-chapter')
const MAX_DYNAMO_CHARS = 80_000

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    chaptersOnly: argv.includes('--chapters-only'),
    indexFiles: argv.includes('--index-files'),
    limit: (() => {
      const i = argv.indexOf('--limit')
      return i >= 0 ? Number(argv[i + 1]) : Infinity
    })(),
  }
}

async function loadOutputs() {
  const raw = await fs.readFile(path.join(ROOT, 'amplify_outputs.json'), 'utf8')
  return JSON.parse(raw)
}

async function readManifest() {
  const raw = await fs.readFile(MANIFEST, 'utf8')
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((r) => r.status === 'ok' || r.status === 'ok-partial')
}

function stripHeader(body) {
  return body.replace(/^---[\s\S]*?---\n*/, '')
}

async function main() {
  const args = parseArgs(process.argv)
  const email = process.env.INGEST_EMAIL
  const password = process.env.INGEST_PASSWORD
  if (!args.dryRun && (!email || !password)) {
    console.error(
      'Set INGEST_EMAIL and INGEST_PASSWORD for the Cognito user that should own materials.',
    )
    process.exit(1)
  }

  const outputs = await loadOutputs()
  Amplify.configure(outputs)
  const client = generateClient()

  if (!args.dryRun) {
    await signIn({ username: email, password })
  }

  const session = args.dryRun
    ? { identityId: 'dry-run-identity' }
    : await fetchAuthSession()
  const identityId = session.identityId
  if (!identityId) throw new Error('Missing identityId')

  const uploads = []
  if (!args.chaptersOnly) {
    const rows = await readManifest()
    for (const row of rows.slice(0, args.limit)) {
      uploads.push({
        label: row.source,
        localPath: row.outPath,
        s3Key: `private/materials/${identityId}/course-pack/by-file/${path.basename(row.outPath)}`,
        contentType: 'text/plain; charset=utf-8',
        indexMaterial: args.indexFiles,
      })
    }
  }

  const chapterFiles = (await fs.readdir(BY_CHAPTER))
    .filter((n) => n.endsWith('.md'))
    .sort()
  for (const name of chapterFiles) {
    uploads.push({
      label: name,
      localPath: path.join(BY_CHAPTER, name),
      s3Key: `private/materials/${identityId}/course-pack/by-chapter/${name}`,
      contentType: 'text/markdown; charset=utf-8',
      indexMaterial: true,
    })
  }

  const indexCount = uploads.filter((u) => u.indexMaterial).length
  console.log(
    `Uploading ${uploads.length} text artifacts (${indexCount} Material rows)…`,
  )
  let uploaded = 0
  let indexed = 0
  for (const item of uploads) {
    const body = await fs.readFile(item.localPath, 'utf8')
    const text = stripHeader(body)
    const truncated =
      text.length > MAX_DYNAMO_CHARS
        ? `${text.slice(0, MAX_DYNAMO_CHARS)}\n\n[Truncated for index; full text in S3]`
        : text

    if (args.dryRun) {
      console.log(
        `DRY ${item.s3Key} (${text.length} chars)${item.indexMaterial ? ' [Material]' : ''}`,
      )
      uploaded += 1
      if (item.indexMaterial) indexed += 1
      continue
    }

    await uploadData({
      path: item.s3Key,
      data: body,
      options: { contentType: item.contentType },
    }).result
    uploaded += 1

    if (item.indexMaterial) {
      const { errors } = await client.models.Material.create({
        filename: item.label,
        contentType: item.contentType,
        sizeBytes: Buffer.byteLength(body, 'utf8'),
        s3Key: item.s3Key,
        extractedText: truncated,
        extractStatus: 'ready',
        uploadedAt: new Date().toISOString(),
      })
      if (errors?.length) {
        console.error(`Material create failed for ${item.label}`, errors)
      } else {
        indexed += 1
      }
    }

    if (uploaded % 25 === 0) {
      console.log(`  ${uploaded}/${uploads.length} uploaded, ${indexed} indexed`)
    }
  }

  if (!args.dryRun) {
    await signOut()
  }
  console.log(`Done. Uploaded ${uploaded} to S3, indexed ${indexed} Material rows.`)
}

main().catch(async (err) => {
  console.error(err)
  try {
    await signOut()
  } catch {
    // ignore
  }
  process.exit(1)
})
