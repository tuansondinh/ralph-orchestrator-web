import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { capabilitiesApi, type RuntimeCapabilities } from '@/lib/capabilitiesApi'
import { githubApi, type GitHubConnectionSnapshot } from '@/lib/githubApi'

function formatConnectedAt(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(timestamp)
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function GitHubConnectCard() {
  const location = useLocation()
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities | null>(null)
  const [connection, setConnection] = useState<GitHubConnectionSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const githubState = params.get('github')
    const githubError = params.get('github_error')

    if (githubError) {
      setErrorMessage(githubError)
      return
    }

    if (githubState === 'connected') {
      setStatusMessage('GitHub connected.')
    }
  }, [location.search])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setIsLoading(true)

      try {
        const nextCapabilities = await capabilitiesApi.get()
        if (cancelled) {
          return
        }

        setCapabilities(nextCapabilities)

        if (!nextCapabilities.githubProjects) {
          setConnection(null)
          return
        }

        const nextConnection = await githubApi.getConnection()
        if (!cancelled) {
          setConnection(nextConnection)
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(toErrorMessage(error, 'Unable to load GitHub connection'))
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  if (!capabilities?.githubProjects) {
    return null
  }

  const onDisconnect = async () => {
    setIsDisconnecting(true)
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      await githubApi.disconnect()
      const nextConnection = await githubApi.getConnection()
      setConnection(nextConnection)
      setStatusMessage('GitHub disconnected.')
    } catch (error) {
      setErrorMessage(toErrorMessage(error, 'Unable to disconnect GitHub'))
    } finally {
      setIsDisconnecting(false)
    }
  }

  return (
    <section className="space-y-3 rounded-md border border-zinc-800 p-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">GitHub connector</h2>
        <p className="text-sm text-zinc-400">
          Connect GitHub to use cloud repository workflows.
        </p>
      </div>

      {isLoading ? <p className="text-sm text-zinc-400">Loading GitHub connection...</p> : null}
      {statusMessage ? <p className="text-sm text-emerald-300">{statusMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-300">{errorMessage}</p> : null}

      {!isLoading && connection ? (
        <div className="space-y-2 text-sm">
          <p className="text-zinc-100">Connected as @{connection.githubUsername}</p>
          <p className="text-zinc-400">Connected {formatConnectedAt(connection.connectedAt)}</p>
          <button
            className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isDisconnecting}
            onClick={() => void onDisconnect()}
            type="button"
          >
            Disconnect GitHub
          </button>
        </div>
      ) : null}

      {!isLoading && !connection ? (
        <div className="space-y-2 text-sm">
          <p className="text-zinc-100">GitHub is not connected.</p>
          <button
            className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
            onClick={() => githubApi.beginConnection()}
            type="button"
          >
            Connect GitHub
          </button>
        </div>
      ) : null}
    </section>
  )
}
