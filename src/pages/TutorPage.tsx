import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useStudentProfile } from '@/auth/StudentProfileProvider'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { dataClient } from '@/lib/amplifyData'
import { listAttempts } from '@/lib/attempts'
import { listStudyMaterials } from '@/lib/listAll'
import { listAllCourseChunks } from '@/lib/ragContext'
import { track } from '@/lib/telemetry'
import {
  consumeTutorExplainSeed,
  formatExplainPrompt,
} from '@/lib/tutorSeed'
import {
  resolveCitations,
  sourcesCatalogJson,
  type TutorCitation,
} from '@/lib/tutorSources'
import { runTutorTools } from '@/lib/tutorTools'
import type { Schema } from '../../amplify/data/resource'

type Material = Schema['Material']['type']
type CourseChunk = Schema['CourseChunk']['type']
type TutorThread = Schema['TutorThread']['type']

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  at: string
  citations?: TutorCitation[]
  toolsUsed?: string[]
}

function parseMessages(json: string): ChatMessage[] {
  try {
    const raw = JSON.parse(json) as unknown
    if (!Array.isArray(raw)) return []
    return raw
      .filter((m) => m && typeof m === 'object')
      .map((m) => {
        const row = m as Record<string, unknown>
        const citations = Array.isArray(row.citations)
          ? (row.citations as TutorCitation[])
          : undefined
        const toolsUsed = Array.isArray(row.toolsUsed)
          ? row.toolsUsed.map(String)
          : undefined
        return {
          role: row.role === 'assistant' ? 'assistant' : 'user',
          content: String(row.content ?? ''),
          at: String(row.at ?? new Date().toISOString()),
          citations,
          toolsUsed,
        } as ChatMessage
      })
      .filter((m) => m.content.trim())
  } catch {
    return []
  }
}

function CitationList({ citations }: { citations: TutorCitation[] }) {
  if (!citations.length) return null
  return (
    <div className="mt-2 space-y-2 border-t pt-2">
      <p className="text-muted-foreground text-[10px] uppercase tracking-wide">
        Sources
      </p>
      <ul className="flex flex-col gap-2">
        {citations.map((c) => {
          const isExternal = Boolean(c.href?.startsWith('http'))
          return (
            <li
              key={c.sourceId}
              className="bg-muted/30 rounded-md border px-2 py-1.5 text-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {c.sourceId}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {c.kind}
                </Badge>
                {c.href ? (
                  isExternal ? (
                    <a
                      href={c.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-foreground font-medium underline underline-offset-2"
                    >
                      {c.label}
                    </a>
                  ) : (
                    <Link
                      to={c.href}
                      className="text-foreground font-medium underline underline-offset-2"
                    >
                      {c.label}
                    </Link>
                  )
                ) : (
                  <span className="text-foreground font-medium">{c.label}</span>
                )}
              </div>
              {c.note ? (
                <p className="text-muted-foreground mt-1">{c.note}</p>
              ) : null}
              {c.excerpt ? (
                <details className="mt-1">
                  <summary className="text-muted-foreground cursor-pointer">
                    View excerpt
                  </summary>
                  <p className="text-muted-foreground mt-1 max-h-32 overflow-auto whitespace-pre-wrap">
                    {c.excerpt}
                  </p>
                </details>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function TutorPage() {
  const [searchParams] = useSearchParams()
  const { profile, checkIns, preferredName } = useStudentProfile()
  const [materials, setMaterials] = useState<Material[]>([])
  const [chunks, setChunks] = useState<CourseChunk[]>([])
  const [threads, setThreads] = useState<TutorThread[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [contextLoading, setContextLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [usedSample, setUsedSample] = useState(false)
  const [retrievalMode, setRetrievalMode] = useState<
    'semantic' | 'enhanced-lexical' | 'sample'
  >('sample')
  const [followUps, setFollowUps] = useState<string[]>([])
  const [lastTools, setLastTools] = useState<string[]>([])
  const materialsRef = useRef<Material[]>([])
  const chunksRef = useRef<CourseChunk[]>([])
  const explainStarted = useRef(false)
  const profileRef = useRef(profile)
  const checkInsRef = useRef(checkIns)

  materialsRef.current = materials
  chunksRef.current = chunks
  profileRef.current = profile
  checkInsRef.current = checkIns

  async function loadThreads() {
    const { data, errors } = await dataClient.models.TutorThread.list({
      limit: 50,
    })
    if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '))
    const sorted = [...(data ?? [])].sort((a, b) =>
      (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
    )
    setThreads(sorted)
    return sorted
  }

  async function sendMessage(
    text: string,
    prior: ChatMessage[],
    threadId: string | null,
  ) {
    let recentAttempts: Awaited<ReturnType<typeof listAttempts>> = []
    try {
      recentAttempts = await listAttempts(5)
    } catch {
      recentAttempts = []
    }

    const tools = await runTutorTools({
      message: text,
      materials: materialsRef.current,
      chunks: chunksRef.current,
      profile: profileRef.current,
      checkIns: checkInsRef.current,
      recentAttempts,
    })

    setUsedSample(tools.usedSample)
    setRetrievalMode(tools.retrieval)
    setLastTools(tools.toolsUsed)

    const nextMessages: ChatMessage[] = [
      ...prior,
      { role: 'user', content: text, at: new Date().toISOString() },
    ]
    setMessages(nextMessages)
    setInput('')

    const { data, errors } = await dataClient.mutations.tutorChat({
      message: text,
      context: tools.context,
      historyJson: JSON.stringify(
        nextMessages.slice(0, -1).map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ),
      ...(tools.studentContext
        ? { studentContext: tools.studentContext }
        : {}),
      sourcesJson: sourcesCatalogJson(tools.sources),
    })
    if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '))

    const payload =
      typeof data === 'string'
        ? (JSON.parse(data) as {
            reply?: string
            followUps?: string[]
            citations?: unknown
          })
        : ((data ?? {}) as {
            reply?: string
            followUps?: string[]
            citations?: unknown
          })

    const reply = String(payload.reply ?? '').trim()
    if (!reply) throw new Error('Empty tutor reply')

    const citations = resolveCitations(payload.citations, tools.sources)

    const withAssistant: ChatMessage[] = [
      ...nextMessages,
      {
        role: 'assistant',
        content: reply,
        at: new Date().toISOString(),
        citations,
        toolsUsed: tools.toolsUsed,
      },
    ]
    setMessages(withAssistant)
    setFollowUps(
      Array.isArray(payload.followUps)
        ? payload.followUps.map(String).filter(Boolean)
        : [],
    )

    const title =
      text.length > 48 ? `${text.slice(0, 45)}…` : text || 'Tutor chat'
    const messagesJson = JSON.stringify(withAssistant)
    const updatedAt = new Date().toISOString()

    if (threadId) {
      const { errors: upErr } = await dataClient.models.TutorThread.update({
        id: threadId,
        messagesJson,
        usedSampleContext: tools.usedSample,
        updatedAt,
      })
      if (upErr?.length) throw new Error(upErr.map((e) => e.message).join('; '))
    } else {
      const { data: created, errors: createErr } =
        await dataClient.models.TutorThread.create({
          title,
          messagesJson,
          usedSampleContext: tools.usedSample,
          updatedAt,
        })
      if (createErr?.length) {
        throw new Error(createErr.map((e) => e.message).join('; '))
      }
      setActiveId(created?.id ?? null)
    }
    track('tutor_message_sent', {
      messageLength: text.length,
      citationCount: citations.length,
      toolCount: tools.toolsUsed.length,
    })
    await loadThreads()
  }

  useEffect(() => {
    void (async () => {
      setContextLoading(true)
      try {
        const mats = await listStudyMaterials()
        setMaterials(mats)
        await loadThreads()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tutor')
      }
      try {
        setChunks(await listAllCourseChunks())
      } catch {
        setChunks([])
      } finally {
        setContextLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (contextLoading || explainStarted.current) return
    if (searchParams.get('explain') !== '1') return
    const seed = consumeTutorExplainSeed()
    if (!seed) return
    explainStarted.current = true
    const prompt = formatExplainPrompt(seed)
    setBusy(true)
    setError(null)
    setActiveId(null)
    setMessages([])
    setFollowUps([])
    void sendMessage(prompt, [], null)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Tutor request failed')
      })
      .finally(() => setBusy(false))
  }, [contextLoading, searchParams])

  function openThread(thread: TutorThread) {
    setActiveId(thread.id ?? null)
    setMessages(parseMessages(thread.messagesJson))
    setUsedSample(Boolean(thread.usedSampleContext))
    setFollowUps([])
    setLastTools([])
    setError(null)
  }

  function startNewThread() {
    setActiveId(null)
    setMessages([])
    setFollowUps([])
    setLastTools([])
    setError(null)
  }

  async function onSend(event: FormEvent) {
    event.preventDefault()
    const text = input.trim()
    if (!text) return
    setBusy(true)
    setError(null)
    try {
      await sendMessage(text, messages, activeId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tutor request failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          AI Tutor
          {preferredName && preferredName !== 'there'
            ? ` for ${preferredName}`
            : ''}
        </h1>
        <p className="text-muted-foreground text-sm">
          Grounded in your course materials, Cycle schedule, and private study
          profile — with clickable source citations. Commercial texts (e.g.
          Olson) stay gated.
        </p>
      </div>

      {error ? (
        <Alert>
          <AlertTitle>Tutor error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Threads</CardTitle>
            <CardDescription>Your chats only</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button type="button" variant="outline" onClick={startNewThread}>
              New chat
            </Button>
            {threads.length === 0 ? (
              <p className="text-muted-foreground text-xs">No threads yet.</p>
            ) : (
              <ul className="flex max-h-80 flex-col gap-1 overflow-auto">
                {threads.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={`hover:bg-muted w-full rounded-md px-2 py-1.5 text-left text-xs ${
                        activeId === t.id ? 'bg-muted font-medium' : ''
                      }`}
                      onClick={() => openThread(t)}
                    >
                      {t.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="flex min-h-[420px] flex-col">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">Conversation</CardTitle>
              {usedSample ? (
                <Badge variant="outline">Sample context</Badge>
              ) : (
                <Badge variant="secondary">
                  {retrievalMode === 'semantic'
                    ? 'Semantic retrieval'
                    : 'Your materials'}
                </Badge>
              )}
              {lastTools.map((t) => (
                <Badge key={t} variant="outline" className="text-[10px]">
                  {t}
                </Badge>
              ))}
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3 overflow-auto">
            {messages.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Ask about airway, ECG, pharma, or anything in your chapters.
                Replies cite course files, schedule, and approved supplements.
              </p>
            ) : (
              messages.map((m, i) => (
                <div
                  key={`${m.at}-${i}`}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    m.role === 'user' ? 'bg-muted/40 ml-6' : 'mr-6'
                  }`}
                >
                  <p className="text-muted-foreground mb-1 text-[10px] uppercase">
                    {m.role}
                  </p>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.role === 'assistant' && m.citations?.length ? (
                    <CitationList citations={m.citations} />
                  ) : null}
                </div>
              ))
            )}
            {followUps.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {followUps.map((q) => (
                  <Button
                    key={q}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setInput(q)}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            ) : null}
          </CardContent>
          <CardFooter>
            <form className="flex w-full flex-col gap-2" onSubmit={onSend}>
              <Label htmlFor="tutor-input" className="sr-only">
                Message
              </Label>
              <textarea
                id="tutor-input"
                rows={3}
                className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Explain junctional rhythms…"
                disabled={busy}
              />
              <Button
                type="submit"
                disabled={busy || contextLoading || !input.trim()}
              >
                {contextLoading
                  ? 'Loading context…'
                  : busy
                    ? 'Thinking…'
                    : 'Send'}
              </Button>
            </form>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
