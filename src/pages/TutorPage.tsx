import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
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
import { listAllMaterials } from '@/lib/listAll'
import { listAllCourseChunks, selectRagContext } from '@/lib/ragContext'
import { track } from '@/lib/telemetry'
import {
  consumeTutorExplainSeed,
  formatExplainPrompt,
} from '@/lib/tutorSeed'
import type { Schema } from '../../amplify/data/resource'

type Material = Schema['Material']['type']
type CourseChunk = Schema['CourseChunk']['type']
type TutorThread = Schema['TutorThread']['type']

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  at: string
}

function parseMessages(json: string): ChatMessage[] {
  try {
    const raw = JSON.parse(json) as unknown
    if (!Array.isArray(raw)) return []
    return raw
      .filter((m) => m && typeof m === 'object')
      .map((m) => {
        const row = m as Record<string, unknown>
        return {
          role: row.role === 'assistant' ? 'assistant' : 'user',
          content: String(row.content ?? ''),
          at: String(row.at ?? new Date().toISOString()),
        } as ChatMessage
      })
      .filter((m) => m.content.trim())
  } catch {
    return []
  }
}

export function TutorPage() {
  const [searchParams] = useSearchParams()
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
  const materialsRef = useRef<Material[]>([])
  const chunksRef = useRef<CourseChunk[]>([])
  const explainStarted = useRef(false)

  materialsRef.current = materials
  chunksRef.current = chunks

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
    const selected = await selectRagContext(
      materialsRef.current,
      text,
      chunksRef.current,
    )
    setUsedSample(selected.usedSample)
    setRetrievalMode(selected.retrieval)

    const nextMessages: ChatMessage[] = [
      ...prior,
      { role: 'user', content: text, at: new Date().toISOString() },
    ]
    setMessages(nextMessages)
    setInput('')

    const { data, errors } = await dataClient.mutations.tutorChat({
      message: text,
      context: selected.context,
      historyJson: JSON.stringify(
        nextMessages.slice(0, -1).map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ),
    })
    if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '))

    const payload =
      typeof data === 'string'
        ? (JSON.parse(data) as {
            reply?: string
            followUps?: string[]
          })
        : ((data ?? {}) as { reply?: string; followUps?: string[] })

    const reply = String(payload.reply ?? '').trim()
    if (!reply) throw new Error('Empty tutor reply')

    const withAssistant: ChatMessage[] = [
      ...nextMessages,
      {
        role: 'assistant',
        content: reply,
        at: new Date().toISOString(),
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
        usedSampleContext: selected.usedSample,
        updatedAt,
      })
      if (upErr?.length) throw new Error(upErr.map((e) => e.message).join('; '))
    } else {
      const { data: created, errors: createErr } =
        await dataClient.models.TutorThread.create({
          title,
          messagesJson,
          usedSampleContext: selected.usedSample,
          updatedAt,
        })
      if (createErr?.length) {
        throw new Error(createErr.map((e) => e.message).join('; '))
      }
      setActiveId(created?.id ?? null)
    }
    track('tutor_message_sent', { messageLength: text.length })
    await loadThreads()
  }

  useEffect(() => {
    void (async () => {
      setContextLoading(true)
      try {
        const mats = await listAllMaterials()
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
    setError(null)
  }

  function startNewThread() {
    setActiveId(null)
    setMessages([])
    setFollowUps([])
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
        <h1 className="text-2xl font-semibold tracking-tight">AI Tutor</h1>
        <p className="text-muted-foreground text-sm">
          Ask questions grounded in your uploaded course materials.
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
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3 overflow-auto">
            {messages.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Ask about airway, ECG, pharma, or anything in your chapters.
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
