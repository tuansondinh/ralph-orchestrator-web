# Coding Conventions

**Analysis Date:** 2026-03-08

## Naming Patterns

**Files:**
- Backend services: PascalCase class name matching file name (`LoopService.ts`, `ChatService.ts`, `TerminalService.ts`)
- Backend utilities: camelCase (`loopUtils.ts`, `parseDiff.ts`, `detect.ts`)
- Backend lib: camelCase for pure functions, PascalCase for classes (`safety.ts`, `ServiceError.ts`)
- Frontend components: PascalCase matching component name (`LoopCard.tsx`, `ChatInput.tsx`, `AppShell.tsx`)
- Frontend stores: camelCase with `Store` suffix (`loopStore.ts`, `chatStore.ts`, `terminalStore.ts`)
- Frontend hooks: camelCase with `use` prefix (`useWebSocket.ts`, `useChat.ts`, `useKeyboardShortcuts.ts`)
- Test files: same name as source with `.test.ts` (backend) or `.test.tsx` (frontend)

**Functions:**
- Use camelCase: `createDatabase`, `migrateDatabase`, `resolveRalphBinary`
- Helper/factory functions in tests: `makeLoop()`, `buildLoop()`, `createTempDir()`, `createMockRalphBinary()`
- Event handlers in React: `onSelect`, `onStop`, `onRestart`

**Variables:**
- Use camelCase: `loopsByProject`, `outputsByLoop`, `selectedLoopIdByProject`
- Constants: UPPER_SNAKE_CASE (`MAX_OUTPUT_LINES_PER_LOOP`, `ACTIVE_STATES`, `CHAT_BACKENDS`)

**Types:**
- Interfaces: PascalCase with descriptive suffix (`LoopStartOptions`, `LoopCardProps`, `LoopStoreState`)
- Type aliases: PascalCase (`ServiceErrorCode`, `LoopLifecycleState`, `LoopBackend`)
- Props interfaces: `{ComponentName}Props` pattern (`LoopCardProps`)

## Code Style

**Formatting:**
- No Prettier config detected; relies on ESLint + editor settings
- Single quotes for strings
- No trailing commas in function params, trailing commas in objects/arrays
- 2-space indentation
- No semicolons (inferred from source files)

**Linting:**
- ESLint with flat config at `eslint.config.mjs`
- Uses `typescript-eslint` recommended rules
- Separate globals for backend (node), frontend (browser+node), and test files (node)
- Complexity check available via `npm run complexity` (max complexity: 12)

## Import Organization

**Order:**
1. Node built-ins (`node:crypto`, `node:path`, `node:fs/promises`)
2. Third-party packages (`drizzle-orm`, `vitest`, `zustand`, `react`)
3. Internal absolute imports (backend: `../src/...`, frontend: `@/...`)

**Path Aliases:**
- Frontend uses `@/` alias mapped to `./src` (configured in `packages/frontend/vitest.config.ts` and Vite config)
- Backend uses relative paths with `.js` extensions for ESM compatibility (`../db/connection.js`, `./loopUtils.js`)

**Backend ESM rule:** Always use `.js` extension in relative imports, even for `.ts` files. This is required by the ESM module system.

## Error Handling

**Backend patterns:**
- Custom `ServiceError` class at `packages/backend/src/lib/ServiceError.ts` with typed codes: `'BAD_REQUEST' | 'NOT_FOUND' | 'CONFLICT'`
- Domain-specific error subclasses: `LoopServiceError extends ServiceError`
- tRPC layer converts `ServiceError` to `TRPCError` via `asTRPCError()` helper in `packages/backend/src/trpc/router.ts`
- Unknown errors are re-thrown as-is
- Safety checks throw `TRPCError` with `'FORBIDDEN'` code

**Frontend patterns:**
- Error boundaries: `AppErrorBoundary` at `packages/frontend/src/components/errors/AppErrorBoundary.tsx`
- tRPC errors handled via React Query error states

## Logging

**Framework:** `console` (no structured logging library)

## Comments

**When to Comment:**
- Section dividers in test files using `// ---------------------------------------------------------------------------` blocks
- Inline comments for non-obvious logic (backward compatibility, edge cases)
- No JSDoc/TSDoc on functions; types serve as documentation

## Function Design

**Parameters:**
- Use options objects for functions with many params: `createMockRalphBinary(directory, options)`
- Partial overrides pattern for test factories: `makeLoop(overrides: Partial<LoopSummary>)`

**Return Values:**
- Services return plain objects or arrays, not class instances
- Zustand stores use immutable update patterns with spread operators

## Module Design

**Exports:**
- Backend services: named class exports (`export class LoopService`)
- Backend lib: named function/class exports
- Frontend components: named function exports (`export function LoopCard`)
- Frontend stores: named `create()` export (`export const useLoopStore = create<...>(...)`)
- Reset functions exported alongside stores for testing: `export function resetLoopStore()`

**Barrel Files:** Not used. Import directly from source files.

## Component Design

**React components:**
- Function components only (no class components)
- Props interface defined above the component in the same file
- Inline Tailwind CSS classes using template literals for conditional styling
- Use `clsx` and `tailwind-merge` for class composition
- Helper functions defined as plain functions above the component, not inside it

## State Management

**Zustand stores:**
- One store per domain: `loopStore`, `chatStore`, `terminalStore`, `projectStore`, `notificationStore`
- Located in `packages/frontend/src/stores/`
- Pattern: define `initialState` object, export `create<StoreState>()`, export `resetXStore()` that calls `set(initialState)`
- Access pattern: `useLoopStore.getState().actionName()` in tests, `useLoopStore((s) => s.field)` in components

---

*Convention analysis: 2026-03-08*
