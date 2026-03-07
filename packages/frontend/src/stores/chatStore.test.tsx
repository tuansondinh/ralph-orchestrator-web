import { beforeEach, describe, expect, it } from 'vitest'
import { resetChatStore, useChatStore } from '@/stores/chatStore'
import type { ChatMessageRecord, ChatSessionRecord } from '@/stores/chatStore'

function makeSession(overrides: Partial<ChatSessionRecord> = {}): ChatSessionRecord {
  return {
    id: overrides.id ?? 'session-1',
    projectId: overrides.projectId ?? 'project-1',
    type: overrides.type ?? 'plan',
    backend: overrides.backend ?? 'claude',
    state: overrides.state ?? 'active',
    processId: overrides.processId ?? null,
    createdAt: overrides.createdAt ?? 1000,
    endedAt: overrides.endedAt ?? null
  }
}

function makeMessage(overrides: Partial<ChatMessageRecord> = {}): ChatMessageRecord {
  return {
    id: overrides.id ?? 'msg-1',
    sessionId: overrides.sessionId ?? 'session-1',
    role: overrides.role ?? 'user',
    content: overrides.content ?? 'Hello',
    timestamp: overrides.timestamp ?? 1000
  }
}

describe('chatStore', () => {
  beforeEach(() => {
    resetChatStore()
  })

  it('setSession stores session by project ID', () => {
    const session = makeSession({ id: 'session-1', projectId: 'project-1' })
    useChatStore.getState().setSession('project-1', session)
    expect(useChatStore.getState().sessionsByProject['project-1']).toEqual(session)
  })

  it('setSession also updates sessionTypeByProject and sessionBackendByProject', () => {
    useChatStore.getState().setSession('project-1', makeSession({ type: 'task', backend: 'gemini' }))
    expect(useChatStore.getState().sessionTypeByProject['project-1']).toBe('task')
    expect(useChatStore.getState().sessionBackendByProject['project-1']).toBe('gemini')
  })

  it('upsertMessage adds a new message', () => {
    useChatStore.getState().upsertMessage(makeMessage({ id: 'msg-1' }))
    const messages = useChatStore.getState().messagesBySession['session-1']
    expect(messages).toHaveLength(1)
    expect(messages![0].id).toBe('msg-1')
  })

  it('upsertMessage updates an existing message with matching id', () => {
    useChatStore.getState().upsertMessage(makeMessage({ id: 'msg-1', content: 'original' }))
    useChatStore.getState().upsertMessage(makeMessage({ id: 'msg-1', content: 'updated' }))
    const messages = useChatStore.getState().messagesBySession['session-1']
    expect(messages).toHaveLength(1)
    expect(messages![0].content).toBe('updated')
  })

  it('upsertMessage sorts messages by timestamp ascending', () => {
    useChatStore.getState().upsertMessage(makeMessage({ id: 'msg-c', timestamp: 3000 }))
    useChatStore.getState().upsertMessage(makeMessage({ id: 'msg-a', timestamp: 1000 }))
    useChatStore.getState().upsertMessage(makeMessage({ id: 'msg-b', timestamp: 2000 }))
    const ids = useChatStore.getState().messagesBySession['session-1']!.map((m) => m.id)
    expect(ids).toEqual(['msg-a', 'msg-b', 'msg-c'])
  })

  it('updateSessionState transitions session state correctly', () => {
    useChatStore.getState().setSession('project-1', makeSession({ id: 'session-1', state: 'active' }))
    useChatStore.getState().updateSessionState('session-1', 'completed', 9999)
    const session = useChatStore.getState().sessionsByProject['project-1']
    expect(session?.state).toBe('completed')
    expect(session?.endedAt).toBe(9999)
  })

  it('state is isolated between different projects', () => {
    useChatStore
      .getState()
      .setSession('project-1', makeSession({ id: 's1', projectId: 'project-1' }))
    useChatStore
      .getState()
      .setSession('project-2', makeSession({ id: 's2', projectId: 'project-2' }))
    expect(useChatStore.getState().sessionsByProject['project-1']?.id).toBe('s1')
    expect(useChatStore.getState().sessionsByProject['project-2']?.id).toBe('s2')
  })
})
