#!/usr/bin/env node
/**
 * Reset developmental study progress while keeping Cognito users and course library.
 *
 * Deletes (owner-scoped, for the signed-in ingest/Mallorie user):
 *   Attempt, TutorThread, Flashcard, UsageEvent, ErrorLog,
 *   StudentProfile, StudyCheckIn
 *   FeatureRequest rows that look like smoke/dev tests
 *
 * Keeps:
 *   Cognito users, ClassMaterial, ClassChunk, Material, CourseChunk
 *   Non-smoke FeatureRequest rows (if any)
 *
 * Usage:
 *   node scripts/reset-dev-progress.mjs --dry-run
 *   node scripts/reset-dev-progress.mjs
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { Amplify } from 'aws-amplify'
import { signIn, signOut, getCurrentUser } from 'aws-amplify/auth'
import { generateClient } from 'aws-amplify/data'

const ROOT = process.cwd()
const dryRun = process.argv.includes('--dry-run')

async function loadEnvLocal() {
  try {
    const raw = await fs.readFile(path.join(ROOT, '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#') || !t.includes('=')) continue
      const i = t.indexOf('=')
      const k = t.slice(0, i)
      const v = t.slice(i + 1)
      if (!process.env[k]) process.env[k] = v
    }
  } catch {
    // optional
  }
}

async function listAll(client, modelName) {
  const out = []
  let nextToken
  do {
    const page = await client.models[modelName].list({
      limit: 100,
      nextToken,
    })
    if (page.errors?.length) {
      throw new Error(
        `${modelName} list: ${page.errors.map((e) => e.message).join('; ')}`,
      )
    }
    out.push(...(page.data ?? []))
    nextToken = page.nextToken
  } while (nextToken)
  return out
}

async function deleteAll(client, modelName, rows, label) {
  console.log(`${label}: ${rows.length}`)
  if (dryRun || rows.length === 0) return 0
  let n = 0
  for (const row of rows) {
    if (!row.id) continue
    const { errors } = await client.models[modelName].delete({ id: row.id })
    if (errors?.length) {
      console.warn(
        `  fail ${modelName} ${row.id}: ${errors.map((e) => e.message).join('; ')}`,
      )
      continue
    }
    n += 1
  }
  return n
}

function isSmokeFeatureRequest(row) {
  const title = String(row.title ?? '').toLowerCase()
  const desc = String(row.description ?? '').toLowerCase()
  const blob = `${title}\n${desc}`
  return (
    /smoke\s*test/.test(blob) ||
    /dev\s*test/.test(blob) ||
    /test request/.test(title) ||
    title === 'test' ||
    title.startsWith('test ')
  )
}

async function main() {
  await loadEnvLocal()
  const email = process.env.INGEST_EMAIL?.trim()
  const password = process.env.INGEST_PASSWORD
  if (!email || !password) {
    throw new Error('INGEST_EMAIL / INGEST_PASSWORD required in .env.local')
  }

  const outputs = JSON.parse(
    await fs.readFile(path.join(ROOT, 'amplify_outputs.json'), 'utf8'),
  )
  Amplify.configure(outputs)
  const client = generateClient()

  await signIn({ username: email, password })
  const user = await getCurrentUser()
  console.log(
    dryRun ? 'DRY RUN' : 'LIVE DELETE',
    `as ${email} (userId=${user.userId})`,
  )

  const progressModels = [
    'Attempt',
    'TutorThread',
    'Flashcard',
    'UsageEvent',
    'ErrorLog',
    'StudentProfile',
    'StudyCheckIn',
  ]

  for (const name of progressModels) {
    if (!client.models[name]) {
      console.log(`${name}: model missing in client (skip)`)
      continue
    }
    const rows = await listAll(client, name)
    const deleted = await deleteAll(client, name, rows, name)
    if (!dryRun) console.log(`  deleted ${deleted}`)
  }

  if (client.models.FeatureRequest) {
    const requests = await listAll(client, 'FeatureRequest')
    const smoke = requests.filter(isSmokeFeatureRequest)
    const keep = requests.filter((r) => !isSmokeFeatureRequest(r))
    console.log(
      `FeatureRequest: ${requests.length} total, smoke/dev=${smoke.length}, keep=${keep.length}`,
    )
    for (const r of keep) {
      console.log(
        `  keep: ${String(r.title ?? '').slice(0, 80)}`,
      )
    }
    const deleted = await deleteAll(
      client,
      'FeatureRequest',
      smoke,
      'FeatureRequest (smoke/dev only)',
    )
    if (!dryRun) console.log(`  deleted smoke ${deleted}`)
  }

  // Inventory kept library (no delete). Skip huge chunk tables unless --count-chunks.
  const keepModels = process.argv.includes('--count-chunks')
    ? ['Material', 'ClassMaterial', 'CourseChunk', 'ClassChunk']
    : ['Material', 'ClassMaterial']
  for (const name of keepModels) {
    if (!client.models[name]) continue
    const rows = await listAll(client, name)
    console.log(`KEEP ${name}: ${rows.length}`)
  }
  if (!process.argv.includes('--count-chunks')) {
    console.log('KEEP CourseChunk/ClassChunk: (skipped; pass --count-chunks to tally)')
  }

  await signOut()
  console.log(dryRun ? 'Dry run complete.' : 'Progress reset complete.')
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
