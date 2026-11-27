import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '@/lib/errorLog'
import { stashPendingError } from '@/lib/feedbackTrail'
import { Button } from '@/components/ui/button'

type Props = { children: ReactNode }
type State = { hasError: boolean; message: string }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'Something went wrong',
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const route =
      typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}`.slice(0, 300)
        : undefined
    const componentHint = info.componentStack?.slice(0, 120) || 'ErrorBoundary'
    reportError({
      message: error.message || 'React render error',
      stack: error.stack,
      componentHint,
    })
    stashPendingError({
      message: error.message || 'Something went wrong',
      stack: error.stack,
      route,
      componentHint,
      createdAt: new Date().toISOString(),
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-background flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            Something went wrong
          </h1>
          <p className="text-muted-foreground max-w-md text-sm">
            {this.state.message}. The error was saved with this page so you can
            send it to the developer. Try reloading, or report it while it is
            still on screen.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' })
                window.location.assign('/dashboard')
              }}
            >
              Back to dashboard
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                window.location.assign('/contact')
              }}
            >
              Tell the developer
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
