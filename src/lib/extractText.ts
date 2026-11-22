import mammoth from 'mammoth'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

/** Keep DynamoDB item size comfortable for v1. */
export const MAX_EXTRACT_CHARS = 80_000

const PDF_TYPES = new Set(['application/pdf'])
const DOCX_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

export function isSupportedMaterial(file: File): boolean {
  const name = file.name.toLowerCase()
  if (PDF_TYPES.has(file.type) || name.endsWith('.pdf')) return true
  if (DOCX_TYPES.has(file.type) || name.endsWith('.docx')) return true
  return false
}

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (PDF_TYPES.has(file.type) || name.endsWith('.pdf')) {
    return extractPdf(file)
  }
  if (DOCX_TYPES.has(file.type) || name.endsWith('.docx')) {
    return extractDocx(file)
  }
  throw new Error('Unsupported file type. Upload a PDF or DOCX.')
}

async function extractPdf(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data }).promise
  const parts: string[] = []
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    parts.push(pageText)
    if (parts.join('\n').length >= MAX_EXTRACT_CHARS) break
  }
  return truncate(parts.join('\n\n'))
}

async function extractDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return truncate(result.value)
}

function truncate(text: string): string {
  const cleaned = text.replace(/\s+\n/g, '\n').trim()
  if (cleaned.length <= MAX_EXTRACT_CHARS) return cleaned
  return `${cleaned.slice(0, MAX_EXTRACT_CHARS)}\n\n[Truncated for storage]`
}
