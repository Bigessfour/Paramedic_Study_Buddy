import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '@/lib/errorLog'
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
    reportError({
      message: error.message || 'React render error',
      stack: error.stack,
      componentHint: info.componentStack?.slice(0, 120) || 'ErrorBoundary',
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
            {this.state.message}. The error was logged for diagnosis. Try
            reloading the page.
          </p>
          <Button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, message: '' })
              window.location.assign('/dashboard')
            }}
          >
            Back to dashboard
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
