import { useCallback, useEffect, useRef, useState } from 'react'
import { taskApi, type TaskRecord } from '@/lib/taskApi'

interface TasksViewProps {
  projectId: string
}

interface LoadTasksOptions {
  preserveOnError: boolean
}

const INITIAL_LOAD_OPTIONS: LoadTasksOptions = {
  preserveOnError: false
}

const REFRESH_LOAD_OPTIONS: LoadTasksOptions = {
  preserveOnError: true
}

function asErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Failed to load tasks'
}

export function TasksView({ projectId }: TasksViewProps) {
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latestRequestIdRef = useRef(0)

  const loadTasks = useCallback(
    async ({ preserveOnError }: LoadTasksOptions) => {
      const requestId = latestRequestIdRef.current + 1
      latestRequestIdRef.current = requestId

      setIsLoading(true)
      setError(null)

      try {
        const nextTasks = await taskApi.list(projectId)
        if (latestRequestIdRef.current !== requestId) {
          return
        }

        setTasks(nextTasks)
      } catch (nextError) {
        if (latestRequestIdRef.current !== requestId) {
          return
        }

        setError(asErrorMessage(nextError))
        if (!preserveOnError) {
          setTasks([])
        }
      } finally {
        if (latestRequestIdRef.current === requestId) {
          setIsLoading(false)
        }
      }
    },
    [projectId]
  )

  useEffect(() => {
    void loadTasks(INITIAL_LOAD_OPTIONS)
  }, [loadTasks])

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Tasks</h2>
          <p className="text-sm text-zinc-400">
            This view shows all tasks managed by ralph orchestrator.
          </p>
        </div>
        <button
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLoading}
          onClick={() => {
            void loadTasks(REFRESH_LOAD_OPTIONS)
          }}
          type="button"
        >
          Refresh
        </button>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {isLoading ? <p className="text-sm text-zinc-400">Loading tasks...</p> : null}

      {!isLoading && tasks.length === 0 ? (
        <p className="text-sm text-zinc-400">No tasks found for this project.</p>
      ) : null}

      {tasks.length > 0 ? (
        <ul className="space-y-3">
          {tasks.map((task) => (
            <li className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4" key={task.id}>
              <h3 className="text-base font-semibold text-zinc-100">{task.title}</h3>
              <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                <div>
                  <dt className="text-zinc-400">ID</dt>
                  <dd>{task.id}</dd>
                </div>
                <div>
                  <dt className="text-zinc-400">Status</dt>
                  <dd>{task.status}</dd>
                </div>
                <div>
                  <dt className="text-zinc-400">Priority</dt>
                  <dd>{task.priority ?? 'None'}</dd>
                </div>
                <div>
                  <dt className="text-zinc-400">Loop</dt>
                  <dd>{task.loop_id ?? 'None'}</dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-zinc-400">Description</dt>
                  <dd>{task.description}</dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-zinc-400">Blocked by</dt>
                  <dd>{task.blocked_by.length > 0 ? task.blocked_by.join(', ') : 'None'}</dd>
                </div>
                <div>
                  <dt className="text-zinc-400">Created</dt>
                  <dd>{task.created ?? 'None'}</dd>
                </div>
                <div>
                  <dt className="text-zinc-400">Closed</dt>
                  <dd>{task.closed ?? 'None'}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
