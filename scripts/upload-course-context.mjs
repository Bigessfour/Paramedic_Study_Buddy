#!/usr/bin/env node
/**
 * Upload local course-context text into Amplify Storage + Material rows,
 * and optionally embeddings → S3 + CourseChunk rows.
 *
 * Requires:
 *   - amplify_outputs.json (from sandbox)
 *   - INGEST_EMAIL / INGEST_PASSWORD
 *
 * Usage:
 *   INGEST_EMAIL=... INGEST_PASSWORD=... node scripts/upload-course-context.mjs
 *   node scripts/upload-course-context.mjs --dry-run
 *   node scripts/upload-course-context.mjs --chapters-only
 *   node scripts/upload-course-context.mjs --skip-embeddings
 *   node scripts/upload-course-context.mjs --embeddings-only
 *   node scripts/upload-course-context.mjs --index-files
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { Amplify } from 'aws-amplify'
import { signIn, fetchAuthSession, signOut } from 'aws-amplify/auth'
import { uploadData } from 'aws-amplify/storage'
import { generateClient } from 'aws-amplify/data'

const ROOT = process.cwd()
const OUT_DIR = path.join(ROOT, 'course-context')
const MANIFEST = path.join(OUT_DIR, 'manifest.jsonl')
const BY_CHAPTER = path.join(OUT_DIR, 'by-chapter')
const EMBEDDINGS_FILE = path.join(OUT_DIR, 'embeddings', 'chunks.jsonl')
const MAX_DYNAMO_CHARS = 80_000
const CHUNK_BATCH = 25

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    chaptersOnly: argv.includes('--chapters-only'),
    indexFiles: argv.includes('--index-files'),
    skipEmbeddings: argv.includes('--skip-embeddings'),
    embeddingsOnly: argv.includes('--embeddings-only'),
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

async function listAllChunks(client) {
  const out = []
  let nextToken
  do {
    const { data, nextToken: token, errors } = await client.models.CourseChunk.list({
      limit: 200,
      nextToken,
    })
    if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '))
    out.push(...(data ?? []))
    nextToken = token
  } while (nextToken)
  return out
}

async function putEmbeddingsBackup(outputs, session, identityId, raw) {
  const bucket = outputs?.storage?.bucket_name
  const region = outputs?.storage?.aws_region || 'us-east-2'
  if (!bucket) throw new Error('amplify_outputs.json missing storage.bucket_name')
  if (!session.credentials) throw new Error('Missing Cognito credentials for S3 put')

  const key = `private/materials/${identityId}/course-pack/embeddings/chunks.jsonl`
  const s3 = new S3Client({
    region,
    credentials: session.credentials,
  })
  // Amplify uploadData hits FileReader for large multipart CRC in Node — use S3 SDK.
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.from(raw, 'utf8'),
      ContentType: 'application/x-ndjson; charset=utf-8',
    }),
  )
  return key
}

async function syncCourseChunks(client, outputs, session, identityId, args) {
  let raw
  try {
    raw = await fs.readFile(EMBEDDINGS_FILE, 'utf8')
  } catch {
    console.warn(
      `No ${EMBEDDINGS_FILE} — skip CourseChunk sync (run npm run embed:course first).`,
    )
    return { uploaded: 0, created: 0, deleted: 0 }
  }

  const rows = raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((r) => Array.isArray(r.embedding) && r.text && r.chunkKey)

  const s3Key = `private/materials/${identityId}/course-pack/embeddings/chunks.jsonl`

  if (args.dryRun) {
    console.log(`DRY embeddings → ${s3Key} (${rows.length} chunks)`)
    return { uploaded: 1, created: rows.length, deleted: 0 }
  }

  const putKey = await putEmbeddingsBackup(outputs, session, identityId, raw)
  console.log(`Embeddings backup → s3://${outputs.storage.bucket_name}/${putKey}`)

  const existing = await listAllChunks(client)
  const byKey = new Map(existing.map((c) => [c.chunkKey, c]))
  const wanted = new Set(rows.map((r) => r.chunkKey))

  let deleted = 0
  for (const old of existing) {
    if (!wanted.has(old.chunkKey)) {
      const { errors } = await client.models.CourseChunk.delete({ id: old.id })
      if (!errors?.length) deleted += 1
    }
  }

  let created = 0
  let updated = 0
  for (let i = 0; i < rows.length; i += CHUNK_BATCH) {
    const batch = rows.slice(i, i + CHUNK_BATCH)
    await Promise.all(
      batch.map(async (row) => {
        const embeddingJson = JSON.stringify(row.embedding)
        const prev = byKey.get(row.chunkKey)
        if (prev) {
          const { errors } = await client.models.CourseChunk.update({
            id: prev.id,
            chapter: String(row.chapter),
            source: String(row.source),
            tier: row.tier ? String(row.tier) : null,
            text: String(row.text).slice(0, MAX_DYNAMO_CHARS),
            embeddingJson,
            charStart: row.charStart ?? null,
            charEnd: row.charEnd ?? null,
            chunkKey: row.chunkKey,
          })
          if (!errors?.length) updated += 1
        } else {
          const { errors } = await client.models.CourseChunk.create({
            chapter: String(row.chapter),
            source: String(row.source),
            tier: row.tier ? String(row.tier) : null,
            text: String(row.text).slice(0, MAX_DYNAMO_CHARS),
            embeddingJson,
            charStart: row.charStart ?? null,
            charEnd: row.charEnd ?? null,
            chunkKey: row.chunkKey,
          })
          if (!errors?.length) created += 1
          else console.error(`CourseChunk create failed ${row.chunkKey}`, errors)
        }
      }),
    )
    if ((i + CHUNK_BATCH) % 100 < CHUNK_BATCH || i + CHUNK_BATCH >= rows.length) {
      console.log(
        `  CourseChunks progress ${Math.min(i + CHUNK_BATCH, rows.length)}/${rows.length}`,
      )
    }
  }

  console.log(
    `Embeddings: S3 ok; CourseChunks created=${created} updated=${updated} deleted=${deleted}`,
  )
  return { uploaded: 1, created: created + updated, deleted }
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
  if (!args.embeddingsOnly) {
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
  }

  const indexCount = uploads.filter((u) => u.indexMaterial).length
  console.log(
    args.embeddingsOnly
      ? 'Skipping text upload (--embeddings-only)…'
      : `Uploading ${uploads.length} text artifacts (${indexCount} Material rows)…`,
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

  if (!args.skipEmbeddings) {
    await syncCourseChunks(client, outputs, session, identityId, args)
  } else {
    console.log('Skipping embeddings (--skip-embeddings)')
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
