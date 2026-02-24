import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TasksView } from '@/components/tasks/TasksView'
import { taskApi, type TaskRecord } from '@/lib/taskApi'

vi.mock('@/lib/taskApi', () => ({
  taskApi: {
    list: vi.fn()
  }
}))

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

const firstTask: TaskRecord = {
  id: 'task-1',
  title: 'Fix selector timeout',
  description: 'Update notifications flow selectors',
  status: 'open',
  priority: 2,
  blocked_by: ['task-0'],
  loop_id: 'loop-1',
  created: '2026-02-24T12:00:00.000Z',
  closed: null
}

const secondTask: TaskRecord = {
  id: 'task-2',
  title: 'Refresh task list UX',
  description: 'Preserve stale data after refresh failure',
  status: 'in_progress',
  priority: 1,
  blocked_by: [],
  loop_id: null,
  created: '2026-02-24T13:00:00.000Z',
  closed: null
}

const closedTask: TaskRecord = {
  id: 'task-3',
  title: 'Stabilize task list feature',
  description: 'Finalize and verify app task listing',
  status: 'closed',
  priority: 3,
  blocked_by: [],
  loop_id: null,
  created: '2026-02-24T14:00:00.000Z',
  closed: '2026-02-24T15:00:00.000Z'
}

describe('TasksView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('auto-loads tasks once on mount and renders required fields', async () => {
    vi.mocked(taskApi.list).mockResolvedValueOnce([firstTask])

    render(<TasksView projectId="project-1" />)

    await waitFor(() => {
      expect(taskApi.list).toHaveBeenCalledTimes(1)
    })
    expect(taskApi.list).toHaveBeenCalledWith('project-1')

    expect(await screen.findByText('Fix selector timeout')).toBeInTheDocument()
    expect(screen.getByText('task-1')).toBeInTheDocument()
    expect(screen.getByText('Update notifications flow selectors')).toBeInTheDocument()
    expect(screen.getByText('open')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('task-0')).toBeInTheDocument()
    expect(screen.getByText('loop-1')).toBeInTheDocument()
    expect(screen.getByText('2026-02-24T12:00:00.000Z')).toBeInTheDocument()
  })

  it('shows a loading state while fetching', async () => {
    const deferred = createDeferred<TaskRecord[]>()
    vi.mocked(taskApi.list).mockReturnValueOnce(deferred.promise)

    render(<TasksView projectId="project-1" />)

    expect(await screen.findByText('Loading tasks...')).toBeInTheDocument()

    deferred.resolve([])
    expect(await screen.findByText('No tasks found for this project.')).toBeInTheDocument()
  })

  it('renders an empty state when the list is empty', async () => {
    vi.mocked(taskApi.list).mockResolvedValueOnce([])

    render(<TasksView projectId="project-1" />)

    expect(await screen.findByText('No tasks found for this project.')).toBeInTheDocument()
  })

  it('renders an error message when the initial request fails', async () => {
    vi.mocked(taskApi.list).mockRejectedValueOnce(new Error('Failed to load tasks'))

    render(<TasksView projectId="project-1" />)

    expect(await screen.findByText('Failed to load tasks')).toBeInTheDocument()
  })

  it('refreshes and updates the list with the next response', async () => {
    vi.mocked(taskApi.list).mockResolvedValueOnce([firstTask]).mockResolvedValueOnce([secondTask])

    render(<TasksView projectId="project-1" />)

    expect(await screen.findByText('Fix selector timeout')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    await waitFor(() => {
      expect(taskApi.list).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByText('Refresh task list UX')).toBeInTheDocument()
  })

  it('includes closed tasks without filtering them out', async () => {
    vi.mocked(taskApi.list).mockResolvedValueOnce([firstTask, closedTask])

    render(<TasksView projectId="project-1" />)

    expect(await screen.findByText('Stabilize task list feature')).toBeInTheDocument()
    expect(screen.getByText('closed')).toBeInTheDocument()
    expect(screen.getByText('2026-02-24T15:00:00.000Z')).toBeInTheDocument()
  })

  it('shows refresh error and keeps the last successful list visible', async () => {
    vi.mocked(taskApi.list)
      .mockResolvedValueOnce([firstTask])
      .mockRejectedValueOnce(new Error('Refresh failed'))

    render(<TasksView projectId="project-1" />)

    expect(await screen.findByText('Fix selector timeout')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(await screen.findByText('Refresh failed')).toBeInTheDocument()
    expect(screen.getByText('Fix selector timeout')).toBeInTheDocument()
  })
})
