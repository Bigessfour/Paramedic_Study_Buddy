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
import { listAttempts, type Attempt } from '@/lib/attempts'

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
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const attempts = await listAttempts(100)
        if (!cancelled) setRows(toRows(attempts))
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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="text-muted-foreground text-sm">
          Past practice tests for your account only. Click a row for detail.
        </p>
      </div>

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
