import type { Schema } from '../../amplify/data/resource'
import { dataClient } from '@/lib/amplifyData'

type Material = Schema['Material']['type']
type Attempt = Schema['Attempt']['type']

/** AppSync list pages; always drain nextToken so owners see full sets. */
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
