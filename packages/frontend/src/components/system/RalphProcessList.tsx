import { useCallback, useEffect, useState } from 'react'
import { ralphProcessApi, type RalphProcess } from '@/lib/ralphProcessApi'
import { isMissingTrpcProcedure } from '@/lib/trpcError'

const PROCESS_REFRESH_INTERVAL_MS = 5_000
const RALPH_PROCESS_API_UNAVAILABLE_MESSAGE =
  'Ralph process management is unavailable on this backend.'

export function RalphProcessList() {
  const [processes, setProcesses] = useState<RalphProcess[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEndpointUnavailable, setIsEndpointUnavailable] = useState(false)

  const fetchProcesses = useCallback(async () => {
    if (isEndpointUnavailable) {
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const result = await ralphProcessApi.list()
      setProcesses(result)
    } catch (err) {
      if (isMissingTrpcProcedure(err, /ralph\.list/i)) {
        setProcesses([])
        setIsEndpointUnavailable(true)
        setError(RALPH_PROCESS_API_UNAVAILABLE_MESSAGE)
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to fetch Ralph processes')
    } finally {
      setIsLoading(false)
    }
  }, [isEndpointUnavailable])

  useEffect(() => {
    if (isEndpointUnavailable) {
      return
    }

    void fetchProcesses()
    const interval = window.setInterval(() => {
      void fetchProcesses()
    }, PROCESS_REFRESH_INTERVAL_MS)

    return () => {
      window.clearInterval(interval)
    }
  }, [fetchProcesses, isEndpointUnavailable])

  const handleKill = async (pid: number) => {
    if (isEndpointUnavailable) {
      return
    }

    if (!window.confirm(`Are you sure you want to kill process ${pid}?`)) {
      return
    }
    try {
      await ralphProcessApi.kill(pid)
      fetchProcesses()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to kill process')
    }
  }

  const handleKillAll = async () => {
    if (isEndpointUnavailable) {
      return
    }

    if (!window.confirm('Are you sure you want to kill ALL Ralph processes?')) {
      return
    }
    try {
      await ralphProcessApi.killAll()
      fetchProcesses()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to kill all processes')
    }
  }

  return (
    <section className="space-y-4 rounded-md border border-zinc-800 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Ralph Processes</h2>
        <div className="flex gap-2">
          <button
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-100 hover:bg-zinc-900"
            disabled={isEndpointUnavailable}
            onClick={() => void fetchProcesses()}
            type="button"
          >
            Refresh
          </button>
          <button
            className="rounded-md border border-red-700 px-3 py-1.5 text-xs text-red-200 hover:bg-red-950/40 disabled:opacity-60"
            disabled={isEndpointUnavailable}
            onClick={() => void handleKillAll()}
            type="button"
          >
            Kill all
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-zinc-300">
          <thead className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-2 py-2 font-medium">PID</th>
              <th className="px-2 py-2 font-medium">User</th>
              <th className="px-2 py-2 font-medium">CPU%</th>
              <th className="px-2 py-2 font-medium">MEM%</th>
              <th className="px-2 py-2 font-medium">Started</th>
              <th className="px-2 py-2 font-medium">Command</th>
              <th className="px-2 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {isLoading && processes.length === 0 ? (
              <tr>
                <td className="px-2 py-4 text-center" colSpan={7}>
                  Loading processes...
                </td>
              </tr>
            ) : processes.length === 0 ? (
              <tr>
                <td className="px-2 py-4 text-center text-zinc-500" colSpan={7}>
                  No active Ralph processes found.
                </td>
              </tr>
            ) : (
              processes.map((proc) => (
                <tr className="hover:bg-zinc-900/40" key={proc.pid}>
                  <td className="px-2 py-2 font-mono">{proc.pid}</td>
                  <td className="px-2 py-2">{proc.user}</td>
                  <td className="px-2 py-2">{proc.cpu}</td>
                  <td className="px-2 py-2">{proc.mem}</td>
                  <td className="px-2 py-2">{proc.startedAt}</td>
                  <td className="max-w-md px-2 py-2">
                    <div
                      className="overflow-x-auto whitespace-nowrap text-xs font-mono text-zinc-300"
                      title={proc.command}
                    >
                      {proc.command}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <button
                      className="text-red-400 hover:text-red-300 hover:underline"
                      onClick={() => void handleKill(proc.pid)}
                    >
                      Kill
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
