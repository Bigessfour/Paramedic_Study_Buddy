import { useAuth } from '@/auth/AuthProvider'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function DashboardPage() {
  const { user } = useAuth()

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Welcome back
          {user?.email ? `, ${user.email}` : ''}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your account</CardTitle>
          <CardDescription>
            Data is isolated by Cognito user id. Classmates cannot see your
            materials or practice history.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <dl className="grid gap-2">
            <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
              <dt className="text-muted-foreground w-28 shrink-0">Email</dt>
              <dd className="font-medium">{user?.email ?? '—'}</dd>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
              <dt className="text-muted-foreground w-28 shrink-0">User id</dt>
              <dd className="font-mono text-xs break-all">{user?.userId}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Next up</CardTitle>
          <CardDescription>
            Materials upload and practice tests land in later phases.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Use the sidebar to preview Materials, Practice Test, and History
          placeholders.
        </CardContent>
      </Card>
    </div>
  )
}
