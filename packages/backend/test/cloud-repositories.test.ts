import { describe, expect, it, vi } from 'vitest'
import {
  type GitHubConnectionRecord,
  type GitHubConnectionRepository,
  type LoopOutputChunkRecord,
  type LoopOutputRepository,
  type ProjectRecord
} from '../src/db/repositories/contracts.js'

function createGitHubConnectionRepositoryStub(): GitHubConnectionRepository {
  const store = new Map<string, GitHubConnectionRecord>()
  return {
    findByUserId: vi.fn(async (userId: string) => store.get(userId) ?? null),
    create: vi.fn(async (record: GitHubConnectionRecord) => {
      store.set(record.userId, record)
    }),
    delete: vi.fn(async (userId: string) => {
      store.delete(userId)
    })
  }
}

function createLoopOutputRepositoryStub(): LoopOutputRepository {
  const store = new Map<string, LoopOutputChunkRecord[]>()
  return {
    append: vi.fn(async (chunk: LoopOutputChunkRecord) => {
      const chunks = store.get(chunk.loopRunId) ?? []
      chunks.push(chunk)
      store.set(chunk.loopRunId, chunks)
    }),
    getByLoopRunId: vi.fn(async (loopRunId: string, afterSequence?: number) => {
      const chunks = store.get(loopRunId) ?? []
      if (afterSequence === undefined) return chunks
      return chunks.filter((c) => c.sequence > afterSequence)
    }),
    deleteByLoopRunId: vi.fn(async (loopRunId: string) => {
      store.delete(loopRunId)
    })
  }
}

describe('GitHubConnectionRepository', () => {
  it('stores and retrieves GitHub connections by userId', async () => {
    const repo = createGitHubConnectionRepositoryStub()
    const record: GitHubConnectionRecord = {
      id: 'conn-1',
      userId: 'user-1',
      githubUserId: 12345,
      githubUsername: 'testuser',
      accessToken: 'encrypted:token',
      scope: 'repo',
      connectedAt: Date.now()
    }

    await repo.create(record)
    const found = await repo.findByUserId('user-1')

    expect(found).toEqual(record)
  })

  it('returns null when no connection exists', async () => {
    const repo = createGitHubConnectionRepositoryStub()
    const found = await repo.findByUserId('nonexistent')
    expect(found).toBeNull()
  })

  it('deletes connections by userId', async () => {
    const repo = createGitHubConnectionRepositoryStub()
    const record: GitHubConnectionRecord = {
      id: 'conn-1',
      userId: 'user-1',
      githubUserId: 12345,
      githubUsername: 'testuser',
      accessToken: 'encrypted:token',
      scope: 'repo',
      connectedAt: Date.now()
    }

    await repo.create(record)
    await repo.delete('user-1')
    const found = await repo.findByUserId('user-1')

    expect(found).toBeNull()
  })
})

describe('LoopOutputRepository', () => {
  it('appends and retrieves output chunks', async () => {
    const repo = createLoopOutputRepositoryStub()
    const chunk1: LoopOutputChunkRecord = {
      id: 'chunk-1',
      loopRunId: 'loop-1',
      sequence: 0,
      stream: 'stdout',
      data: 'Hello ',
      createdAt: Date.now()
    }
    const chunk2: LoopOutputChunkRecord = {
      id: 'chunk-2',
      loopRunId: 'loop-1',
      sequence: 1,
      stream: 'stdout',
      data: 'World',
      createdAt: Date.now()
    }

    await repo.append(chunk1)
    await repo.append(chunk2)
    const chunks = await repo.getByLoopRunId('loop-1')

    expect(chunks).toHaveLength(2)
    expect(chunks[0].data).toBe('Hello ')
    expect(chunks[1].data).toBe('World')
  })

  it('filters chunks by sequence', async () => {
    const repo = createLoopOutputRepositoryStub()
    const chunks: LoopOutputChunkRecord[] = [
      { id: 'c1', loopRunId: 'loop-1', sequence: 0, stream: 'stdout', data: 'a', createdAt: 1 },
      { id: 'c2', loopRunId: 'loop-1', sequence: 1, stream: 'stdout', data: 'b', createdAt: 2 },
      { id: 'c3', loopRunId: 'loop-1', sequence: 2, stream: 'stdout', data: 'c', createdAt: 3 }
    ]

    for (const chunk of chunks) {
      await repo.append(chunk)
    }

    const filtered = await repo.getByLoopRunId('loop-1', 1)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].sequence).toBe(2)
  })

  it('deletes chunks by loopRunId', async () => {
    const repo = createLoopOutputRepositoryStub()
    const chunk: LoopOutputChunkRecord = {
      id: 'chunk-1',
      loopRunId: 'loop-1',
      sequence: 0,
      stream: 'stdout',
      data: 'test',
      createdAt: Date.now()
    }

    await repo.append(chunk)
    await repo.deleteByLoopRunId('loop-1')
    const chunks = await repo.getByLoopRunId('loop-1')

    expect(chunks).toHaveLength(0)
  })

  it('returns empty array when no chunks exist', async () => {
    const repo = createLoopOutputRepositoryStub()
    const chunks = await repo.getByLoopRunId('nonexistent')
    expect(chunks).toHaveLength(0)
  })
})

describe('ProjectRecord cloud fields', () => {
  it('supports optional cloud fields', () => {
    const localProject: ProjectRecord = {
      id: 'project-1',
      name: 'Local Project',
      path: '/tmp/project',
      type: null,
      ralphConfig: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const cloudProject: ProjectRecord = {
      id: 'project-2',
      name: 'Cloud Project',
      path: '/home/app/workspaces/project-2',
      type: null,
      ralphConfig: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      userId: 'user-1',
      githubOwner: 'octocat',
      githubRepo: 'Hello-World',
      defaultBranch: 'main',
      workspacePath: '/home/app/workspaces/project-2'
    }

    expect(localProject.userId).toBeUndefined()
    expect(cloudProject.userId).toBe('user-1')
    expect(cloudProject.githubOwner).toBe('octocat')
    expect(cloudProject.githubRepo).toBe('Hello-World')
    expect(cloudProject.defaultBranch).toBe('main')
    expect(cloudProject.workspacePath).toBe('/home/app/workspaces/project-2')
  })
})
