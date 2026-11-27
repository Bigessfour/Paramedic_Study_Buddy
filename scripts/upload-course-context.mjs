#!/usr/bin/env node
/**
 * Upload local course-context text into the shared class library
 * (ClassMaterial + ClassChunk + class-library/ S3), readable by all
 * signed-in classmates. Attempts/tutor/flashcards stay per-user.
 *
 * Requires:
 *   - amplify_outputs.json (from sandbox)
 *   - INGEST_EMAIL / INGEST_PASSWORD (uploader = ClassMaterial owner)
 *
 * Usage:
 *   INGEST_EMAIL=... INGEST_PASSWORD=... node scripts/upload-course-context.mjs
 *   node scripts/upload-course-context.mjs --dry-run
 *   node scripts/upload-course-context.mjs --chapters-only
 *   node scripts/upload-course-context.mjs --skip-embeddings
 *   node scripts/upload-course-context.mjs --embeddings-only
 *   node scripts/upload-course-context.mjs --index-files
 *   node scripts/upload-course-context.mjs --personal   # legacy private path (not shared)
 *   node scripts/upload-course-context.mjs --schedule-only
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
const SCHEDULE_FILE = path.join(OUT_DIR, 'schedule', 'cycle-17.json')
const SCHEDULE_FILENAME = 'schedule/cycle-17.json'
const MAX_DYNAMO_CHARS = 80_000
const CHUNK_BATCH = 25

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    chaptersOnly: argv.includes('--chapters-only'),
    indexFiles: argv.includes('--index-files'),
    skipEmbeddings: argv.includes('--skip-embeddings'),
    embeddingsOnly: argv.includes('--embeddings-only'),
    scheduleOnly: argv.includes('--schedule-only'),
    personal: argv.includes('--personal'),
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

function libraryRoot(personal, identityId) {
  return personal
    ? `private/materials/${identityId}`
    : `class-library/${identityId}`
}

async function listAllModel(client, modelName) {
  const out = []
  let nextToken
  do {
    const { data, nextToken: token, errors } = await client.models[modelName].list({
      limit: 200,
      nextToken,
    })
    if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '))
    out.push(...(data ?? []))
    nextToken = token
  } while (nextToken)
  return out
}

async function putEmbeddingsBackup(outputs, session, s3Key, raw) {
  const bucket = outputs?.storage?.bucket_name
  const region = outputs?.storage?.aws_region || 'us-east-2'
  if (!bucket) throw new Error('amplify_outputs.json missing storage.bucket_name')
  if (!session.credentials) throw new Error('Missing Cognito credentials for S3 put')

  const s3 = new S3Client({
    region,
    credentials: session.credentials,
  })
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: Buffer.from(raw, 'utf8'),
      ContentType: 'application/x-ndjson; charset=utf-8',
    }),
  )
  return s3Key
}

async function upsertScheduleMaterial(client, root, args) {
  let raw
  try {
    raw = await fs.readFile(SCHEDULE_FILE, 'utf8')
  } catch {
    console.warn(`No ${SCHEDULE_FILE} — skip schedule upload (run parse-cycle-schedule.mjs).`)
    return { uploaded: 0, indexed: 0 }
  }

  const s3Key = `${root}/course-pack/${SCHEDULE_FILENAME}`
  if (args.dryRun) {
    console.log(`DRY schedule → ${s3Key} (${raw.length} chars)`)
    return { uploaded: 1, indexed: 1 }
  }

  await uploadData({
    path: s3Key,
    data: raw,
    options: { contentType: 'application/json; charset=utf-8' },
  }).result

  const existing = await listAllModel(client, args.personal ? 'Material' : 'ClassMaterial')
  const materialModel = args.personal ? 'Material' : 'ClassMaterial'
  const prior = existing.filter((m) => m.filename === SCHEDULE_FILENAME)
  for (const old of prior) {
    await client.models[materialModel].delete({ id: old.id })
  }

  const truncated =
    raw.length > MAX_DYNAMO_CHARS
      ? `${raw.slice(0, MAX_DYNAMO_CHARS)}\n\n[Truncated; full JSON in S3]`
      : raw
  const { errors } = await client.models[materialModel].create({
    filename: SCHEDULE_FILENAME,
    contentType: 'application/json',
    sizeBytes: Buffer.byteLength(raw, 'utf8'),
    s3Key,
    extractedText: truncated,
    extractStatus: 'ready',
    uploadedAt: new Date().toISOString(),
  })
  if (errors?.length) {
    console.error(`${materialModel} schedule create failed`, errors)
    return { uploaded: 1, indexed: 0 }
  }
  console.log(`Schedule indexed → ${SCHEDULE_FILENAME}`)
  return { uploaded: 1, indexed: 1 }
}

async function syncCourseChunks(client, outputs, session, identityId, args) {
  const materialModel = args.personal ? 'CourseChunk' : 'ClassChunk'
  let raw
  try {
    raw = await fs.readFile(EMBEDDINGS_FILE, 'utf8')
  } catch {
    console.warn(
      `No ${EMBEDDINGS_FILE} — skip ${materialModel} sync (run npm run embed:course first).`,
    )
    return { uploaded: 0, created: 0, deleted: 0 }
  }

  const rows = raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((r) => Array.isArray(r.embedding) && r.text && r.chunkKey)

  const root = libraryRoot(args.personal, identityId)
  const s3Key = `${root}/course-pack/embeddings/chunks.jsonl`

  if (args.dryRun) {
    console.log(`DRY embeddings → ${s3Key} (${rows.length} chunks → ${materialModel})`)
    return { uploaded: 1, created: rows.length, deleted: 0 }
  }

  const putKey = await putEmbeddingsBackup(outputs, session, s3Key, raw)
  console.log(`Embeddings backup → s3://${outputs.storage.bucket_name}/${putKey}`)

  const existing = await listAllModel(client, materialModel)
  const byKey = new Map(existing.map((c) => [c.chunkKey, c]))
  const wanted = new Set(rows.map((r) => r.chunkKey))

  let deleted = 0
  for (const old of existing) {
    if (!wanted.has(old.chunkKey)) {
      const { errors } = await client.models[materialModel].delete({ id: old.id })
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
          const { errors } = await client.models[materialModel].update({
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
          const { errors } = await client.models[materialModel].create({
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
          else console.error(`${materialModel} create failed ${row.chunkKey}`, errors)
        }
      }),
    )
    if ((i + CHUNK_BATCH) % 100 < CHUNK_BATCH || i + CHUNK_BATCH >= rows.length) {
      console.log(
        `  ${materialModel} progress ${Math.min(i + CHUNK_BATCH, rows.length)}/${rows.length}`,
      )
    }
  }

  console.log(
    `Embeddings: S3 ok; ${materialModel} created=${created} updated=${updated} deleted=${deleted}`,
  )
  return { uploaded: 1, created: created + updated, deleted }
}

async function main() {
  const args = parseArgs(process.argv)
  const email = process.env.INGEST_EMAIL
  const password = process.env.INGEST_PASSWORD
  if (!args.dryRun && (!email || !password)) {
    console.error(
      'Set INGEST_EMAIL and INGEST_PASSWORD for the Cognito user that owns the class library upload.',
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

  const root = libraryRoot(args.personal, identityId)
  const materialModel = args.personal ? 'Material' : 'ClassMaterial'
  console.log(
    args.personal
      ? 'Mode: personal (private, not shared with classmates)'
      : 'Mode: class library (shared read for all signed-in classmates)',
  )

  if (args.scheduleOnly) {
    const sched = await upsertScheduleMaterial(client, root, args)
    if (!args.dryRun) await signOut()
    console.log(
      `Done (schedule-only). Uploaded ${sched.uploaded}, indexed ${sched.indexed}.`,
    )
    return
  }

  const uploads = []
  if (!args.embeddingsOnly) {
    if (!args.chaptersOnly) {
      const rows = await readManifest()
      for (const row of rows.slice(0, args.limit)) {
        uploads.push({
          label: row.source,
          localPath: row.outPath,
          s3Key: `${root}/course-pack/by-file/${path.basename(row.outPath)}`,
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
        s3Key: `${root}/course-pack/by-chapter/${name}`,
        contentType: 'text/markdown; charset=utf-8',
        indexMaterial: true,
      })
    }
  }

  const indexCount = uploads.filter((u) => u.indexMaterial).length
  console.log(
    args.embeddingsOnly
      ? 'Skipping text upload (--embeddings-only)…'
      : `Uploading ${uploads.length} text artifacts (${indexCount} ${materialModel} rows)…`,
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
        `DRY ${item.s3Key} (${text.length} chars)${item.indexMaterial ? ` [${materialModel}]` : ''}`,
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
      const { errors } = await client.models[materialModel].create({
        filename: item.label,
        contentType: item.contentType,
        sizeBytes: Buffer.byteLength(body, 'utf8'),
        s3Key: item.s3Key,
        extractedText: truncated,
        extractStatus: 'ready',
        uploadedAt: new Date().toISOString(),
      })
      if (errors?.length) {
        console.error(`${materialModel} create failed for ${item.label}`, errors)
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

  const sched = await upsertScheduleMaterial(client, root, args)
  uploaded += sched.uploaded
  indexed += sched.indexed

  if (!args.dryRun) {
    await signOut()
  }
  console.log(
    `Done. Uploaded ${uploaded} to S3, indexed ${indexed} ${materialModel} rows.`,
  )
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
