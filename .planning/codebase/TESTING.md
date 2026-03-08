# Testing Patterns

**Analysis Date:** 2026-03-08

## Test Framework

**Runner:**
- Vitest 4.x
- Backend config: `packages/backend/vitest.config.ts`
- Frontend config: `packages/frontend/vitest.config.ts`

**Assertion Library:**
- Vitest `expect` (built-in)
- `@testing-library/jest-dom` for DOM assertions (frontend)

**Run Commands:**
```bash
npm test -w @ralph-ui/backend     # Run backend tests
npm test -w @ralph-ui/frontend    # Run frontend tests
npm run coverage -w @ralph-ui/backend   # Backend coverage (v8)
npm run coverage -w @ralph-ui/frontend  # Frontend coverage (v8)
```

## Test File Organization

**Backend:**
- Location: `packages/backend/test/` (separate directory)
- Naming: `{feature}.test.ts` (e.g., `loop.test.ts`, `db.test.ts`, `terminal-service.test.ts`)
- Include pattern: `test/**/*.test.ts`
- Environment: `node`

**Frontend:**
- Location: co-located next to source files
- Naming: `{ComponentName}.test.tsx` or `{hookName}.test.tsx`
- Include pattern: `src/**/*.test.tsx` (MUST be `.tsx`, not `.ts`)
- Environment: `jsdom`
- Setup file: `packages/frontend/src/test/setup.ts`

**E2E:**
- Playwright at `packages/frontend/test/e2e/`
- Run: `npm run test:e2e -w @ralph-ui/frontend`

## Test Structure

**Backend suite pattern:**
```typescript
import { afterEach, describe, expect, it, vi } from 'vitest'
// ... imports

describe('feature name', () => {
  const tempDirs: string[] = []
  const connections: DatabaseConnection[] = []

  async function createTestDatabase(name: string) {
    const dir = await mkdtemp(join(tmpdir(), `ralph-ui-${name}-`))
    tempDirs.push(dir)
    const filePath = join(dir, 'test.db')
    const connection = createDatabase({ filePath })
    connections.push(connection)
    migrateDatabase(connection.db)
    return connection
  }

  afterEach(async () => {
    // Clean up connections and temp dirs
    while (connections.length > 0) {
      const connection = connections.pop()
      if (connection) closeDatabase(connection)
    }
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) await rm(dir, { recursive: true, force: true })
    }
  })

  it('does something specific', async () => {
    const connection = await createTestDatabase('test-name')
    // ... test logic
  })
})
```

**Frontend store test pattern:**
```typescript
import { beforeEach, describe, expect, it } from 'vitest'
import { resetLoopStore, useLoopStore } from '@/stores/loopStore'

function makeLoop(overrides: Partial<LoopSummary> = {}): LoopSummary {
  return { id: 'loop-1', state: 'running', ...overrides }
}

describe('loopStore', () => {
  beforeEach(() => {
    resetLoopStore()
  })

  it('action does expected thing', () => {
    useLoopStore.getState().upsertLoop('project-1', makeLoop())
    expect(useLoopStore.getState().loopsByProject['project-1']).toHaveLength(1)
  })
})
```

**Frontend component test pattern:**
```typescript
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoopCard } from '@/components/loops/LoopCard'

function buildLoop(overrides: Partial<LoopSummary> = {}): LoopSummary {
  return { id: 'loop-1', state: 'completed', ...overrides }
}

describe('ComponentName', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders expected content', () => {
    render(<LoopCard loop={buildLoop()} isSelected={false} onSelect={() => {}} onStop={async () => {}} onRestart={async () => {}} />)
    expect(screen.getByText('Runtime: 5s')).toBeInTheDocument()
  })
})
```

## Mocking

**Backend PTY mocking (vi.hoisted pattern):**
```typescript
const { spawnMock, lastPty } = vi.hoisted(() => {
  let _last: unknown = null
  const spawnFn = vi.fn(() => {
    const dataCbs: ((d: string) => void)[] = []
    const exitCbs: ((e: { exitCode: number; signal?: number }) => void)[] = []
    const pty = {
      pid: 9999,
      onData: vi.fn((cb) => { dataCbs.push(cb) }),
      onExit: vi.fn((cb) => { exitCbs.push(cb) }),
      write: vi.fn(),
      kill: vi.fn(),
      resize: vi.fn(),
      _triggerData: (data: string) => { for (const cb of dataCbs) cb(data) },
      _triggerExit: (exitCode: number, signal?: number) => { for (const cb of exitCbs) cb({ exitCode, signal }) }
    }
    _last = pty
    return pty
  })
  return { spawnMock: spawnFn, lastPty: () => _last }
})

vi.mock('node-pty', () => ({ spawn: spawnMock }))
```

**Key rule:** `vi.hoisted()` MUST be used when mocking modules that are imported at the top level. The hoisted block runs before any imports.

**Frontend WebSocket mocking:**
- Custom `MockWebSocket` class defined in test file with `emitOpen()`, `emitClose()`, `emitMessage()` helpers
- Assigned to `globalThis.WebSocket` in `beforeEach`
- See `packages/frontend/src/hooks/useWebSocket.test.tsx`

**What to Mock:**
- `node-pty` (native module, requires hoisting)
- `Date.now()` for time-dependent tests
- WebSocket for frontend connection tests
- External binaries via mock `.mjs` scripts written to temp dirs

**What NOT to Mock:**
- SQLite database (use real temp DB)
- Drizzle ORM queries
- Zustand stores (test real store logic)
- React component rendering

## Fixtures and Factories

**Test data factories:**
```typescript
// Backend: createMockRalphBinary() writes a .mjs script to a temp dir
async function createMockRalphBinary(directory: string, options: { stopNoop?: boolean, ... } = {}) {
  const filePath = join(directory, 'mock-ralph.mjs')
  // ... writes executable script
  await chmod(filePath, 0o755)
  return filePath
}

// Frontend: makeLoop/buildLoop with Partial overrides
function makeLoop(overrides: Partial<LoopSummary> = {}): LoopSummary {
  return { id: 'loop-1', projectId: 'project-1', state: 'running', ...overrides }
}
```

**Location:**
- Factories defined inline in each test file (no shared fixture directory for unit tests)
- E2E fixtures: `packages/frontend/test/fixtures/`

## Database Test Setup

**Pattern:** Real SQLite databases in temp directories.

```typescript
// 1. Create temp dir
const dir = await mkdtemp(join(tmpdir(), 'ralph-ui-test-'))
// 2. Create database connection
const connection = createDatabase({ filePath: join(dir, 'test.db') })
// 3. Run migrations
migrateDatabase(connection.db)
// 4. Use connection.db for queries
// 5. Clean up in afterEach: closeDatabase(connection), rm(dir)
```

**Environment variables for integration tests:**
- `RALPH_UI_DB_PATH`: override database path
- `RALPH_UI_RALPH_BIN`: override ralph binary path

## Async Helpers

**waitFor pattern (backend):**
```typescript
async function waitFor(predicate: () => boolean, timeoutMs = 2_000, pollMs = 20) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out after ${timeoutMs}ms`)
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
}
```

## Injecting Private State

**TerminalService runtime injection:**
```typescript
function injectRuntime(service: TerminalService, sessionId: string, projectId: string, options = {}) {
  const runtimes = (service as unknown as { runtimes: Map<string, unknown> }).runtimes
  // ... inject mock runtime directly into private Map
}
```

Use this pattern when testing service methods that don't require full `startSession()` flow.

## Frontend Test Setup

**`packages/frontend/src/test/setup.ts`:**
- Imports `@testing-library/jest-dom/vitest` for DOM matchers
- Polyfills `window.matchMedia` (returns `matches: false`)
- Polyfills `globalThis.ResizeObserver` (no-op)

## Coverage

**Requirements:** No enforced thresholds
**Provider:** v8

```bash
npm run coverage -w @ralph-ui/backend    # Output: packages/backend/coverage/
npm run coverage -w @ralph-ui/frontend   # Output: packages/frontend/coverage/
```

## Test Types

**Unit Tests:**
- Backend: service logic, utility functions, parsers (`parse-diff.test.ts`, `safety.test.ts`)
- Frontend: store actions, hooks, component rendering, utility functions

**Integration Tests:**
- Backend: tRPC router tests with real DB + mock binary (`loop.test.ts`, `project.test.ts`)
- Backend: WebSocket tests with real Fastify server (`websocket.test.ts`)

**E2E Tests:**
- Playwright (configured but secondary)
- Location: `packages/frontend/test/e2e/`

## Common Patterns

**Async Testing:**
```typescript
it('handles async operation', async () => {
  const result = await service.doSomething()
  expect(result).toBeDefined()
})
```

**Error Testing:**
```typescript
it('throws on invalid input', async () => {
  await expect(service.doSomething('bad')).rejects.toThrow('expected message')
})
```

**Time mocking:**
```typescript
vi.spyOn(Date, 'now').mockReturnValue(1_770_768_000_000)
```

**Cleanup pattern:**
```typescript
afterEach(() => {
  cleanup()          // @testing-library cleanup (frontend)
  vi.restoreAllMocks()
})
```

---

*Testing analysis: 2026-03-08*
