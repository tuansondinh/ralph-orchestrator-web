import { beforeEach, describe, expect, it } from 'vitest'
import { resetTerminalStore, useTerminalStore } from '@/stores/terminalStore'
import type { TerminalSessionRecord } from '@/lib/terminalApi'

function makeSession(overrides: Partial<TerminalSessionRecord> = {}): TerminalSessionRecord {
  return {
    id: overrides.id ?? 'session-1',
    projectId: overrides.projectId ?? 'project-1',
    state: overrides.state ?? 'active',
    shell: overrides.shell ?? '/bin/zsh',
    cwd: overrides.cwd ?? '/projects/test',
    pid: overrides.pid ?? 1234,
    cols: overrides.cols ?? 120,
    rows: overrides.rows ?? 36,
    createdAt: overrides.createdAt ?? 1000,
    endedAt: overrides.endedAt ?? null
  }
}

describe('terminalStore', () => {
  beforeEach(() => {
    resetTerminalStore()
  })

  it('initializes with empty state', () => {
    const state = useTerminalStore.getState()
    expect(state.sessionsByProject).toEqual({})
    expect(state.activeSessionIdByProject).toEqual({})
  })

  it('addSession adds a new terminal session', () => {
    const session = makeSession({ id: 'sess-1', projectId: 'proj-1' })
    useTerminalStore.getState().addSession('proj-1', session)
    expect(useTerminalStore.getState().sessionsByProject['proj-1']).toHaveLength(1)
    expect(useTerminalStore.getState().sessionsByProject['proj-1'][0]).toEqual(session)
  })

  it('addSession is idempotent for sessions with the same id', () => {
    const session = makeSession({ id: 'sess-1', projectId: 'proj-1' })
    useTerminalStore.getState().addSession('proj-1', session)
    useTerminalStore.getState().addSession('proj-1', session)
    expect(useTerminalStore.getState().sessionsByProject['proj-1']).toHaveLength(1)
  })

  it('updateSession updates session fields by id', () => {
    useTerminalStore.getState().addSession('proj-1', makeSession({ id: 'sess-1', state: 'active' }))
    useTerminalStore.getState().updateSession('sess-1', { state: 'completed', endedAt: 9999 })
    const session = useTerminalStore.getState().sessionsByProject['proj-1'][0]
    expect(session.state).toBe('completed')
    expect(session.endedAt).toBe(9999)
  })

  it('updateSession is a no-op when session id does not exist', () => {
    useTerminalStore.getState().addSession('proj-1', makeSession({ id: 'sess-1' }))
    useTerminalStore.getState().updateSession('unknown-sess', { state: 'completed' })
    expect(useTerminalStore.getState().sessionsByProject['proj-1'][0].state).toBe('active')
  })

  it('setActiveSession switches the active session for a project', () => {
    useTerminalStore.getState().addSession('proj-1', makeSession({ id: 'sess-1' }))
    useTerminalStore.getState().addSession('proj-1', makeSession({ id: 'sess-2' }))
    useTerminalStore.getState().setActiveSession('proj-1', 'sess-2')
    expect(useTerminalStore.getState().activeSessionIdByProject['proj-1']).toBe('sess-2')
  })

  it('setActiveSession can be set to null', () => {
    useTerminalStore.getState().setActiveSession('proj-1', 'sess-1')
    useTerminalStore.getState().setActiveSession('proj-1', null)
    expect(useTerminalStore.getState().activeSessionIdByProject['proj-1']).toBeNull()
  })

  it('removeSession removes session from the project list', () => {
    useTerminalStore.getState().addSession('proj-1', makeSession({ id: 'sess-1' }))
    useTerminalStore.getState().addSession('proj-1', makeSession({ id: 'sess-2' }))
    useTerminalStore.getState().removeSession('proj-1', 'sess-1')
    const sessions = useTerminalStore.getState().sessionsByProject['proj-1']
    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe('sess-2')
  })

  it('removeSession clears activeSessionId when the active session is removed', () => {
    useTerminalStore.getState().addSession('proj-1', makeSession({ id: 'sess-1' }))
    useTerminalStore.getState().setActiveSession('proj-1', 'sess-1')
    useTerminalStore.getState().removeSession('proj-1', 'sess-1')
    // Active session should fall back to null (no remaining sessions)
    expect(useTerminalStore.getState().activeSessionIdByProject['proj-1']).toBeNull()
  })

  it('sessions are isolated between different projects', () => {
    useTerminalStore
      .getState()
      .addSession('proj-1', makeSession({ id: 's1', projectId: 'proj-1' }))
    useTerminalStore
      .getState()
      .addSession('proj-2', makeSession({ id: 's2', projectId: 'proj-2' }))
    expect(useTerminalStore.getState().sessionsByProject['proj-1']).toHaveLength(1)
    expect(useTerminalStore.getState().sessionsByProject['proj-2']).toHaveLength(1)
    expect(useTerminalStore.getState().sessionsByProject['proj-1'][0].id).toBe('s1')
    expect(useTerminalStore.getState().sessionsByProject['proj-2'][0].id).toBe('s2')
  })
})
