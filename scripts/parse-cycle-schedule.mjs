#!/usr/bin/env node
/**
 * Parse OCR'd Cycle 17 schedule text into course-context/schedule/cycle-17.json.
 *
 * Usage:
 *   node scripts/parse-cycle-schedule.mjs
 *   node scripts/parse-cycle-schedule.mjs --source "400 - Cycle 17 Schedule Updated 2026-09-29.pdf"
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const OUT_DIR = path.join(ROOT, 'course-context')
const MANIFEST = path.join(OUT_DIR, 'manifest.jsonl')
const SCHEDULE_DIR = path.join(OUT_DIR, 'schedule')
const OUT_FILE = path.join(SCHEDULE_DIR, 'cycle-17.json')

const MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}

const TOPIC_CHAPTERS = [
  { re: /airway|ventilat|respiratory|intubat|\bpeep\b|tidal/i, chapters: ['16', '17'], topics: ['airway', 'ventilation'] },
  { re: /pharm|agonis|antagon|med math|toxicolog|acid.?base/i, chapters: ['13', '14', '15'], topics: ['pharmacology'] },
  { re: /cardio|\bekg\b|12.?lead|\bacls\b/i, chapters: ['18', '19'], topics: ['cardiology'] },
  { re: /trauma|burn|\bshock\b|hemorrhag|spinal|ortho/i, chapters: ['30', '31', '32', '33', '34', '35'], topics: ['trauma'] },
  { re: /neuro|stroke|seizure|behavioral/i, chapters: ['19', '29'], topics: ['neurology'] },
  { re: /\bob\b|newborn|pediatric|\bpals\b|geriatric/i, chapters: ['42', '43', '44', '45'], topics: ['ob-peds'] },
  { re: /immun|infect|sepsis|endocrin|gi\/gu|hematolog|street drug/i, chapters: ['20', '21', '22', '24', '25', '26'], topics: ['medical'] },
  { re: /assessment|history|documentation|critical thinking|medical legal|terminology/i, chapters: ['5', '6', '10', '11', '12'], topics: ['fundamentals'] },
  { re: /\bmci\b|\bics\b|triage|tactical|austere|field orientation/i, chapters: ['48', '50', '51', '52', '53'], topics: ['ops'] },
]

function parseArgs(argv) {
  const i = argv.indexOf('--source')
  return {
    source:
      i >= 0
        ? String(argv[i + 1] || '')
        : '400 - Cycle 17 Schedule Updated 2026-09-29.pdf',
  }
}

async function loadScheduleText(sourceName) {
  const raw = await fs.readFile(MANIFEST, 'utf8')
  const rows = raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  const row = rows.find((r) => r.source === sourceName)
  if (!row?.outPath) {
    throw new Error(`Manifest missing ${sourceName} — run ingest first`)
  }
  const body = await fs.readFile(row.outPath, 'utf8')
  return body.replace(/^---[\s\S]*?---\n*/, '')
}

function stripHeaderNoise(line) {
  return line
    .replace(/St\.\s*Anthony Paramedic Academy Cycle #\d+ Schedule/gi, '')
    .replace(/Updated\s+\w+\s+\d+(?:st|nd|rd|th)?,?\s*\d{4}/gi, '')
    .trim()
}

function inferChaptersAndTopics(label) {
  const chapters = new Set()
  const topics = new Set()
  for (const rule of TOPIC_CHAPTERS) {
    if (rule.re.test(label)) {
      for (const c of rule.chapters) chapters.add(c)
      for (const t of rule.topics) topics.add(t)
    }
  }
  const chapterHits = [...label.matchAll(/chapters?\s*([\d,\s&\-–]+)/gi)]
  for (const m of chapterHits) {
    const chunk = m[1]
    for (const part of chunk.split(/[,&]/)) {
      const range = part.match(/(\d+)\s*[-–]\s*(\d+)/)
      if (range) {
        const a = Number(range[1])
        const b = Number(range[2])
        for (let n = Math.min(a, b); n <= Math.max(a, b); n += 1) {
          chapters.add(String(n))
        }
      } else {
        const n = part.match(/(\d+)/)
        if (n) chapters.add(String(Number(n[1])))
      }
    }
  }
  return {
    chapters: [...chapters].sort((a, b) => Number(a) - Number(b)),
    topics: [...topics],
  }
}

/**
 * Walk OCR lines; emit day sessions with inferred ISO dates.
 * Cycle 17 starts Oct 2026 → Mar 2027 for undated months.
 */
function parseSessions(text) {
  const lines = text
    .split(/\n/)
    .map((l) => stripHeaderNoise(l))
    .filter(Boolean)

  const sessions = []
  let week = null
  let pendingDow = null
  let yearCursor = 2026
  let lastMonth = 10

  const flush = (dateIso, label, raw, weekNum) => {
    const cleaned = label.replace(/\s+/g, ' ').trim()
    if (
      !cleaned ||
      /^(AM|PM|Assignments|Homework|This Week|LAB|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i.test(
        cleaned,
      )
    ) {
      return
    }
    const meta = inferChaptersAndTopics(cleaned + ' ' + (raw || ''))
    sessions.push({
      date: dateIso,
      week: weekNum,
      label: cleaned.slice(0, 160),
      topics: meta.topics,
      chapters: meta.chapters,
      raw: (raw || cleaned).slice(0, 240),
    })
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const weekMatch = line.match(/^Week\s+(\d+)\b/i)
    if (weekMatch) {
      week = Number(weekMatch[1])
      pendingDow = null
      continue
    }

    if (/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i.test(line)) {
      pendingDow = line
      continue
    }

    const dateMatch = line.match(
      /^(January|February|March|April|May|June|July|August|September|October|November|December)[.,]?\s+(\d{1,2})(?:[.,]?\s*(\d{4}))?/i,
    )
    if (dateMatch && pendingDow) {
      const monthName = dateMatch[1].toLowerCase()
      const day = Number(dateMatch[2])
      const month = MONTHS[monthName]
      // Cycle 17: Oct–Dec 2026, Jan–Mar 2027 (ignore OCR year typos).
      let year = month >= 10 ? 2026 : month <= 3 ? 2027 : 2026
      if (dateMatch[3]) {
        const explicit = Number(dateMatch[3])
        if (month >= 10 && (explicit === 2026 || explicit === 2025)) year = 2026
        if (month <= 3 && (explicit === 2026 || explicit === 2027)) year = 2027
      }
      yearCursor = year
      lastMonth = month

      const dateIso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

      // Collect following topic lines until next dow/date/week
      const bits = []
      let j = i + 1
      while (j < lines.length) {
        const nxt = lines[j]
        if (/^Week\s+\d+/i.test(nxt)) break
        if (/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i.test(nxt)) break
        if (/^(January|February|March|April|May|June|July|August|September|October|November|December)[.,]?\s+\d{1,2}/i.test(nxt)) break
        if (/^(AM|PM|Assignments|Homework\s*-\s*Quizzes|This Week)$/i.test(nxt)) {
          j += 1
          continue
        }
        bits.push(nxt)
        j += 1
        if (bits.length >= 8) break
      }
      const label = bits.join(' ').trim() || pendingDow
      const rawBlock = [pendingDow, line, ...bits].join(' | ')
      flush(dateIso, label, rawBlock, week)
      pendingDow = null
      continue
    }
  }

  // Dedupe by date+label
  const seen = new Set()
  const unique = []
  for (const s of sessions) {
    const key = `${s.date}::${s.label}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(s)
  }
  unique.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label))
  return unique
}

async function main() {
  const args = parseArgs(process.argv)
  const text = await loadScheduleText(args.source)
  const sessions = parseSessions(text)
  if (sessions.length === 0) {
    throw new Error('No sessions parsed from schedule text')
  }

  await fs.mkdir(SCHEDULE_DIR, { recursive: true })
  const payload = {
    cycle: '17',
    source: args.source,
    timezone: 'America/Denver',
    generatedAt: new Date().toISOString(),
    sessionCount: sessions.length,
    sessions,
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8')
  console.log(
    `Wrote ${sessions.length} sessions → ${OUT_FILE} (first ${sessions[0]?.date}, last ${sessions.at(-1)?.date})`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
