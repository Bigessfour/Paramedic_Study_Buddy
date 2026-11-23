import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ColumnDirective,
  ColumnsDirective,
  Filter,
  GridComponent,
  Inject,
  Page,
  Sort,
} from '@syncfusion/ej2-react-grids'
import { Button } from '@/components/ui/button'
import {
  listAttempts,
  parseAttemptPayload,
  type Attempt,
} from '@/lib/attempts'
import {
  attemptToMarkdown,
  copyText,
  downloadText,
} from '@/lib/exportAttempt'
import { track } from '@/lib/telemetry'

type Row = {
  id: string
  completedAt: string
  dateLabel: string
  scope: string
  scorePercent: number
  questionCount: number
  mcSummary: string
}

function toRows(attempts: Attempt[]): Row[] {
  return attempts.map((a) => ({
    id: a.id!,
    completedAt: a.completedAt ?? '',
    dateLabel: a.completedAt
      ? new Date(a.completedAt).toLocaleString()
      : '—',
    scope: a.scope,
    scorePercent: a.scorePercent,
    questionCount: a.questionCount,
    mcSummary: `${a.mcCorrect}/${a.mcTotal}`,
  }))
}

export function HistoryPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Row[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [exportMsg, setExportMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await listAttempts(100)
        if (!cancelled) {
          setAttempts(list)
          setRows(toRows(list))
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load history')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function exportLatest() {
    const latest = attempts[0]
    if (!latest) return
    const md = attemptToMarkdown(latest, parseAttemptPayload(latest))
    try {
      await copyText(md)
      track('export_clicked', { method: 'copy', source: 'history' })
      setExportMsg('Latest attempt copied as Markdown')
    } catch {
      downloadText(`attempt-latest.md`, md)
      track('export_clicked', { method: 'download', source: 'history' })
      setExportMsg('Download started for latest attempt')
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">History</h1>
          <p className="text-muted-foreground text-sm">
            Past practice tests for your account only. Click a row for detail.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={attempts.length === 0}
          onClick={() => void exportLatest()}
        >
          Copy latest as Markdown
        </Button>
      </div>
      {exportMsg ? (
        <p className="text-muted-foreground text-sm">{exportMsg}</p>
      ) : null}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {loading ? (
        <p className="text-muted-foreground text-sm">Loading attempts…</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No attempts yet.{' '}
          <Link className="text-primary underline-offset-2 hover:underline" to="/practice">
            Start a practice test
          </Link>
          .
        </p>
      ) : (
        <GridComponent
          dataSource={rows}
          allowPaging
          allowSorting
          allowFiltering
          filterSettings={{ type: 'Menu' }}
          pageSettings={{ pageSize: 10 }}
          rowSelected={(args) => {
            const id = (args.data as Row | undefined)?.id
            if (id) navigate(`/history/${id}`)
          }}
          height="420"
        >
          <ColumnsDirective>
            <ColumnDirective field="dateLabel" headerText="Date" width="180" />
            <ColumnDirective field="scope" headerText="Scope" width="280" />
            <ColumnDirective
              field="scorePercent"
              headerText="Score %"
              width="110"
              textAlign="Right"
            />
            <ColumnDirective
              field="questionCount"
              headerText="Questions"
              width="110"
              textAlign="Right"
            />
            <ColumnDirective
              field="mcSummary"
              headerText="MC"
              width="90"
              textAlign="Center"
              allowFiltering={false}
            />
          </ColumnsDirective>
          <Inject services={[Page, Sort, Filter]} />
        </GridComponent>
      )}
    </div>
  )
}
