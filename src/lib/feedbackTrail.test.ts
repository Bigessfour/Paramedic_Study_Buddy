import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clearPendingError,
  createMemoryTrailStore,
  listBreadcrumbs,
  pushBreadcrumb,
  readPendingError,
  stashPendingError,
} from './feedbackTrail.ts'

test('trail keeps the newest 25 crumbs and drops duplicate bursts', () => {
  const store = createMemoryTrailStore()
  pushBreadcrumb('Opened Dashboard', undefined, store)
  pushBreadcrumb('Opened Dashboard', undefined, store)
  assert.equal(listBreadcrumbs(store).length, 1)
  for (let index = 0; index < 30; index++) {
    pushBreadcrumb(`Step ${index}`, `detail ${index}`, store)
  }
  const crumbs = listBreadcrumbs(store)
  assert.equal(crumbs.length, 25)
  assert.equal(crumbs[0]?.action, 'Step 5')
  assert.equal(crumbs.at(-1)?.action, 'Step 29')
})

test('corrupt trail data reads as empty', () => {
  const store = createMemoryTrailStore()
  store.setItem('psb.feedback.trail', '{oops')
  assert.deepEqual(listBreadcrumbs(store), [])
})

test('pending error is scrubbed and can be cleared', () => {
  const store = createMemoryTrailStore()
  stashPendingError(
    {
      message: 'failed with sk-testkeytestkey123',
      stack: 'Bearer abcdefghij.token',
      route: '/practice',
    },
    store,
  )
  const pending = readPendingError(store)
  assert.ok(pending)
  assert.equal(pending.message.includes('sk-testkeytestkey123'), false)
  assert.match(pending.message, /\[redacted\]/)
  assert.equal(pending.stack?.includes('abcdefghij'), false)
  clearPendingError(store)
  assert.equal(readPendingError(store), null)
})

test('storage failures do not throw', () => {
  const store = {
    getItem: () => '[]',
    setItem: () => {
      throw new Error('quota')
    },
    removeItem: () => {
      throw new Error('quota')
    },
  }
  assert.doesNotThrow(() => pushBreadcrumb('Opened Dashboard', undefined, store))
  assert.doesNotThrow(() =>
    stashPendingError({ message: 'boom', route: '/practice' }, store),
  )
  assert.doesNotThrow(() => clearPendingError(store))
})
