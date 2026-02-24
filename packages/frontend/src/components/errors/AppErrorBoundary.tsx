import { Component, type ErrorInfo, type ReactNode } from 'react'

interface AppErrorBoundaryProps {
  children: ReactNode
  resetKey: string
}

interface AppErrorBoundaryState {
  hasError: boolean
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false
  }

  static getDerivedStateFromError() {
    return {
      hasError: true
    }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {}

  componentDidUpdate(prevProps: AppErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({
        hasError: false
      })
    }
  }

  private readonly handleReset = () => {
    this.setState({
      hasError: false
    })
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <section
        aria-live="polite"
        className="space-y-3 rounded-lg border border-red-500/30 bg-red-950/20 p-4"
        role="alert"
      >
        <h2 className="text-lg font-semibold text-red-200">Something went wrong</h2>
        <p className="text-sm text-red-100/90">Try refreshing this section.</p>
        <button
          className="rounded-md border border-red-300/40 px-3 py-2 text-sm text-red-100 hover:bg-red-900/30"
          onClick={this.handleReset}
          type="button"
        >
          Try again
        </button>
      </section>
    )
  }
}
