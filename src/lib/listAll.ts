import type { Schema } from '../../amplify/data/resource'
import { dataClient } from '@/lib/amplifyData'

type Material = Schema['Material']['type']
type ClassMaterial = Schema['ClassMaterial']['type']
type Attempt = Schema['Attempt']['type']
type CourseChunk = Schema['CourseChunk']['type']
type ClassChunk = Schema['ClassChunk']['type']

/** Personal uploads only (owner-scoped). */
export async function listAllMaterials(pageSize = 100): Promise<Material[]> {
  const rows: Material[] = []
  let nextToken: string | null | undefined
  do {
    const result = await dataClient.models.Material.list({
      limit: pageSize,
      nextToken: nextToken ?? undefined,
    })
    if (result.errors?.length) {
      throw new Error(result.errors.map((e) => e.message).join('; '))
    }
    rows.push(...(result.data ?? []))
    nextToken = result.nextToken
  } while (nextToken)
  return rows
}

/** Shared class textbook materials (readable by any signed-in user). */
export async function listClassMaterials(pageSize = 100): Promise<ClassMaterial[]> {
  const rows: ClassMaterial[] = []
  let nextToken: string | null | undefined
  do {
    const result = await dataClient.models.ClassMaterial.list({
      limit: pageSize,
      nextToken: nextToken ?? undefined,
    })
    if (result.errors?.length) {
      throw new Error(result.errors.map((e) => e.message).join('; '))
    }
    rows.push(...(result.data ?? []))
    nextToken = result.nextToken
  } while (nextToken)
  return rows
}

/**
 * Personal + class materials for RAG / flashcard generation.
 * Class rows win on duplicate filenames.
 */
export async function listStudyMaterials(pageSize = 100): Promise<Material[]> {
  const [personal, shared] = await Promise.all([
    listAllMaterials(pageSize),
    listClassMaterials(pageSize),
  ])
  const byName = new Map<string, Material>()
  for (const m of personal) {
    byName.set((m.filename ?? m.id ?? '').toLowerCase(), m)
  }
  for (const m of shared) {
    // Structural overlap with Material; cast for shared RAG helpers.
    byName.set((m.filename ?? m.id ?? '').toLowerCase(), m as unknown as Material)
  }
  return [...byName.values()]
}

export async function listAllAttempts(pageSize = 100): Promise<Attempt[]> {
  const rows: Attempt[] = []
  let nextToken: string | null | undefined
  do {
    const result = await dataClient.models.Attempt.list({
      limit: pageSize,
      nextToken: nextToken ?? undefined,
    })
    if (result.errors?.length) {
      throw new Error(result.errors.map((e) => e.message).join('; '))
    }
    rows.push(...(result.data ?? []))
    nextToken = result.nextToken
  } while (nextToken)
  return rows
}

async function listPersonalChunks(pageSize: number): Promise<CourseChunk[]> {
  const out: CourseChunk[] = []
  let nextToken: string | null | undefined
  do {
    const page = await dataClient.models.CourseChunk.list({
      limit: pageSize,
      nextToken: nextToken ?? undefined,
    })
    if (page.errors?.length) {
      throw new Error(page.errors.map((e) => e.message).join('; '))
    }
    out.push(...(page.data ?? []))
    nextToken = page.nextToken
  } while (nextToken)
  return out
}

async function listClassChunks(pageSize: number): Promise<ClassChunk[]> {
  const out: ClassChunk[] = []
  let nextToken: string | null | undefined
  do {
    const page = await dataClient.models.ClassChunk.list({
      limit: pageSize,
      nextToken: nextToken ?? undefined,
    })
    if (page.errors?.length) {
      throw new Error(page.errors.map((e) => e.message).join('; '))
    }
    out.push(...(page.data ?? []))
    nextToken = page.nextToken
  } while (nextToken)
  return out
}

/** Personal CourseChunks + shared ClassChunks (class wins on chunkKey). */
export async function listStudyChunks(pageSize = 100): Promise<CourseChunk[]> {
  const [personal, shared] = await Promise.all([
    listPersonalChunks(pageSize),
    listClassChunks(pageSize),
  ])
  const byKey = new Map<string, CourseChunk>()
  for (const c of personal) {
    if (c.chunkKey) byKey.set(c.chunkKey, c)
  }
  for (const c of shared) {
    if (c.chunkKey) byKey.set(c.chunkKey, c as unknown as CourseChunk)
  }
  return [...byKey.values()]
}
