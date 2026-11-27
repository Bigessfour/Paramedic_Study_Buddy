import assert from 'node:assert/strict'
import { test } from 'node:test'
import JSZip from 'jszip'
import {
  MAX_MAILTO_URL,
  areaForPath,
  buildFeedbackReport,
  buildFeedbackZip,
  buildMailtoUrl,
  feedbackZipName,
  isAcceptedImage,
  pickLatestError,
  shouldIncludeError,
  suggestArea,
} from './feedbackReport.ts'
import type { FeedbackReportInput } from './feedbackReport.ts'

const capturedAt = '2026-11-27T16:41:00.000Z'

function baseInput(
  overrides: Partial<FeedbackReportInput> = {},
): FeedbackReportInput {
  return {
    email: 'student@example.com',
    userId: 'user-123',
    area: 'Practice Test',
    page: '/contact',
    happened: 'Generate spins and then nothing appears.',
    expected: 'A practice test.',
    steps: 'Open Practice and click Generate.',
    breadcrumbs: [
      {
        at: capturedAt,
        action: 'Opened Practice Test',
      },
    ],
    viewport: '1280x800',
    userAgent: 'TestBrowser',
    timeZone: 'UTC',
    capturedAt,
    imageNames: [],
    ...overrides,
  }
}

test('report keeps the stack in the zip text and out of the email', () => {
  const report = buildFeedbackReport(
    baseInput({
      error: {
        message: 'Generate failed',
        stack: 'at FrameOnlyInZip (PracticeTestPage.tsx:10)',
        route: '/practice',
        componentHint: 'PracticeTestPage',
      },
      imageNames: ['screenshot-1.png'],
    }),
  )
  assert.match(report.fullText, /FrameOnlyInZip/)
  assert.equal(report.mailBody.includes('FrameOnlyInZip'), false)
  assert.match(report.mailBody, /Generate failed/)
  assert.match(report.mailBody, /screenshot-1\.png/)
  assert.match(report.subject, /Practice Test/)
  assert.match(report.fullText, /Course text and test answers are not included/)
})

test('report redacts secrets and ignores course fields', () => {
  const input = {
    ...baseInput({
      happened: 'key sk-testkeytestkey123 and Bearer abcdefghij.token',
      expected: 'api_key=super-secret-value',
    }),
    extractedText: 'SECRET COURSE PARAGRAPH',
    payloadJson: 'attempt answers',
  }
  const report = buildFeedbackReport(input)
  assert.equal(report.fullText.includes('sk-testkeytestkey123'), false)
  assert.equal(report.fullText.includes('abcdefghij'), false)
  assert.equal(report.fullText.includes('super-secret-value'), false)
  assert.match(report.fullText, /\[redacted\]/)
  assert.equal(report.fullText.includes('SECRET COURSE PARAGRAPH'), false)
  assert.equal(report.fullText.includes('attempt answers'), false)
  assert.equal(report.mailBody.includes('SECRET COURSE PARAGRAPH'), false)
})

test('email keeps the zip name when the body is shortened', () => {
  const crumbs = Array.from({ length: 25 }, (_, index) => ({
    at: capturedAt,
    action: `Opened Practice Test ${index}`,
    detail: 'x'.repeat(180),
  }))
  const report = buildFeedbackReport(
    baseInput({
      happened: 'a'.repeat(2000),
      breadcrumbs: crumbs,
      error: {
        message: 'boom',
        stack: 'at FrameOnlyInZip (hidden.ts:1)',
      },
    }),
  )
  const zipName = 'study-buddy-feedback-20261127-1641.zip'
  const mailed = buildMailtoUrl(
    'dev@example.com',
    report.subject,
    report.mailBody,
    `\n\nPlease attach ${zipName}.`,
  )
  assert.equal(mailed.truncated, true)
  assert.ok(mailed.url.length <= MAX_MAILTO_URL)
  const body = new URLSearchParams(mailed.url.slice(mailed.url.indexOf('?') + 1)).get(
    'body',
  )
  assert.ok(body)
  assert.match(body, /Please attach study-buddy-feedback-20261127-1641\.zip/)
  assert.equal(body.includes('FrameOnlyInZip'), false)
})

test('mailto is empty without a real address', () => {
  const mailed = buildMailtoUrl('not-an-email', 'Hi', 'Body', '')
  assert.equal(mailed.url, '')
})

test('area follows the broken page, then the last opened page', () => {
  assert.equal(areaForPath('/history/attempt-1'), 'History')
  assert.equal(areaForPath('/contact'), 'Contact')
  assert.equal(areaForPath('/nope'), 'Something else')
  assert.equal(suggestArea('/practice', []), 'Practice Test')
  assert.equal(
    suggestArea('/contact', [
      { at: capturedAt, action: 'Opened Flashcards' },
      { at: capturedAt, action: 'Opened Contact' },
    ]),
    'Flashcards',
  )
  assert.equal(suggestArea(undefined, []), 'Something else')
})

test('recent logged errors are included and old ones are not', () => {
  const now = new Date('2026-11-27T16:41:00.000Z')
  const recent = {
    message: 'recent',
    createdAt: '2026-11-27T14:00:00.000Z',
  }
  const old = {
    message: 'old',
    createdAt: '2026-11-20T14:00:00.000Z',
  }
  assert.equal(shouldIncludeError(recent, now, false), true)
  assert.equal(shouldIncludeError(old, now, false), false)
  assert.equal(shouldIncludeError(old, now, true), true)
  assert.equal(
    pickLatestError([old, recent])?.message,
    'recent',
  )
})

test('screenshots are limited to common image types and 1.5 MB', () => {
  assert.equal(
    isAcceptedImage({ type: 'image/png', name: 'shot.png', size: 100 }),
    null,
  )
  assert.match(
    isAcceptedImage({ type: 'text/plain', name: 'notes.txt', size: 20 }) ?? '',
    /PNG/,
  )
  assert.match(
    isAcceptedImage({
      type: 'image/png',
      name: 'big.png',
      size: 1_500_001,
    }) ?? '',
    /1\.5 MB/,
  )
})

test('zip contains the report and renamed screenshots', async () => {
  const zipName = feedbackZipName(new Date(capturedAt))
  assert.equal(zipName, 'study-buddy-feedback-20261127-1641.zip')
  const bytes = await buildFeedbackZip('hello report', [
    { name: 'Photo.JPEG', bytes: new Uint8Array([1, 2, 3, 4]) },
  ])
  const unzipped = await JSZip.loadAsync(bytes)
  assert.equal(await unzipped.file('report.txt')?.async('string'), 'hello report')
  assert.ok(unzipped.file('screenshot-1.jpg'))
  assert.equal(unzipped.file('Photo.JPEG'), null)
})
