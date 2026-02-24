# Implementation Plan: Lucent Builder Improvements

## Checklist

- [ ] Step 1: Fix Stop Button — invoke `ralph loops stop`
- [ ] Step 2: Backend diff endpoint — `LoopService.getDiff` + tRPC procedure
- [ ] Step 3: Diff parsing utility + unit tests
- [ ] Step 4: `DiffViewer` frontend component
- [ ] Step 5: Wire `DiffViewer` into `LoopDetail` as a "Review Changes" tab

---

## Step 1: Fix Stop Button

**Objective:** Replace OS-signal-based process killing with `ralph loops stop` so Ralph's child processes are also terminated.

**Implementation guidance:**
- In `packages/backend/src/services/LoopService.ts`, update `stop(loopId)`:
  - Keep the `requireLoop` call and runtime lookup.
  - If `runtime?.active && runtime.processId`: instead of `processManager.kill(runtime.processId)`, run the Ralph binary with `['loops', 'stop', '--loop-id', loopId]` (or the correct Ralph CLI flag — verify with `ralph loops stop --help`).
  - Use Node's built-in `execFile` (promisified) or `execa` to run this command with `cwd: project.path`.
  - The existing `handleState` listener on the process will fire when Ralph exits and update the DB/emit state.
  - The fallback path (no active runtime) stays unchanged — just marks DB as stopped.

**Test requirements:**
- Update `LoopService` unit tests: mock the Ralph binary invocation, assert `ralph loops stop --loop-id <id>` is called when stopping an active loop.
- Assert the DB update path is still used for inactive loops.

**Integration notes:** No changes to the tRPC router or frontend needed for this step.

**Demo:** Stop a running loop — the process (and all its children) terminate; the loop card shows `stopped` state.

---

## Step 2: Backend Diff Endpoint

**Objective:** Add `LoopService.getDiff(loopId)` and expose it via tRPC `loop.getDiff`.

**Implementation guidance:**

Add to `packages/backend/src/services/LoopService.ts`:

```typescript
export interface DiffFile {
  path: string
  status: 'M' | 'A' | 'D' | 'R'
  diff: string
  additions: number
  deletions: number
}

export interface LoopDiff {
  available: boolean
  reason?: string
  baseBranch?: string
  worktreeBranch?: string
  files?: DiffFile[]
  stats?: { filesChanged: number; additions: number; deletions: number }
}

async getDiff(loopId: string): Promise<LoopDiff> {
  const run = await this.requireLoop(loopId)
  if (!run.worktree) {
    return { available: false, reason: 'No worktree configured for this loop.' }
  }

  const project = this.db.select().from(projects).where(eq(projects.id, run.projectId)).get()
  if (!project) {
    return { available: false, reason: 'Project not found.' }
  }

  // Determine base branch
  let baseBranch = 'main'
  try {
    const { stdout } = await execFileAsync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd: project.path })
    baseBranch = stdout.trim().replace('refs/remotes/origin/', '')
  } catch { /* fall back to 'main' */ }

  // Get unified diff
  const { stdout: rawDiff } = await execFileAsync(
    'git', ['diff', `${baseBranch}...${run.worktree}`, '--'],
    { cwd: project.path }
  )

  const files = parseDiff(rawDiff)
  const stats = {
    filesChanged: files.length,
    additions: files.reduce((s, f) => s + f.additions, 0),
    deletions: files.reduce((s, f) => s + f.deletions, 0)
  }

  return { available: true, baseBranch, worktreeBranch: run.worktree, files, stats }
}
```

Add to `packages/backend/src/trpc/router.ts`:
```typescript
getDiff: t.procedure
  .input(z.object({ loopId: z.string().min(1) }))
  .query(({ ctx, input }) =>
    ctx.loopService.getDiff(input.loopId).catch((error) => asTRPCError(error))
  ),
```

**Test requirements:**
- Mock `execFileAsync` to return a sample unified diff string.
- Assert `getDiff` returns correct `DiffFile[]` with accurate `additions`/`deletions` counts.
- Assert `available: false` when `run.worktree` is null.

**Integration notes:** Typecheck must pass (`npm run typecheck`).

**Demo:** Call `getDiff` via a tRPC playground or curl — returns JSON with files and stats.

---

## Step 3: Diff Parsing Utility

**Objective:** Implement and test `parseDiff(rawDiff: string): DiffFile[]`.

**Implementation guidance:**

Create `packages/backend/src/lib/parseDiff.ts`:

```typescript
export function parseDiff(raw: string): DiffFile[] {
  const files: DiffFile[] = []
  const fileBlocks = raw.split(/^diff --git /m).filter(Boolean)

  for (const block of fileBlocks) {
    const pathMatch = block.match(/^a\/.+ b\/(.+)/)
    if (!pathMatch) continue
    const path = pathMatch[1].trim()

    const status: DiffFile['status'] =
      /^new file/m.test(block) ? 'A' :
      /^deleted file/m.test(block) ? 'D' :
      /^rename/m.test(block) ? 'R' : 'M'

    const lines = block.split('\n')
    let additions = 0
    let deletions = 0
    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) additions++
      else if (line.startsWith('-') && !line.startsWith('---')) deletions++
    }

    files.push({ path, status, diff: block, additions, deletions })
  }

  return files
}
```

**Test requirements:**
- Unit tests with fixture diff strings covering: modified file, added file, deleted file, renamed file, multi-hunk diff.
- Assert `additions`/`deletions` counts are accurate.
- Assert `path` is extracted correctly (including paths with spaces if possible).

**Integration notes:** Import `parseDiff` in `LoopService.getDiff`.

**Demo:** Tests pass — `npm run test -w @ralph-ui/backend`.

---

## Step 4: DiffViewer Frontend Component

**Objective:** Build the `DiffViewer` React component that renders the sidebar + unified diff.

**Implementation guidance:**

Create `packages/frontend/src/components/loops/DiffViewer.tsx`:

- Use `trpc.loop.getDiff.useQuery({ loopId })`.
- Loading state: spinner.
- `available: false`: empty state card with `reason` message.
- When available:
  - **Header bar:** "N files changed · +X −Y" with green/red coloring on counts.
  - **Two-column layout:** left sidebar (fixed ~220px), right diff area (scrollable).
  - **Sidebar:** list of `DiffFile` items — file path, `[M/A/D]` badge, `+X -Y`. Clicking calls `document.getElementById(file.path)?.scrollIntoView({ behavior: 'smooth' })`.
  - **Diff area:** for each file, render:
    - File header: path, status badge, counts, collapse/expand button.
    - Diff lines (up to 30 initially). Lines styled by prefix:
      - `+` (non `+++`): `bg-green-950 text-green-300`
      - `-` (non `---`): `bg-red-950 text-red-300`
      - `@@`: `text-blue-400 bg-transparent`
      - other: default
    - "Show all N lines" / "Collapse" button.
  - Each file section has `id={file.path}` for sidebar anchor scrolling.

```typescript
const [expanded, setExpanded] = useState<Set<string>>(new Set())
const PREVIEW_LINES = 30

// Render lines for a file
function renderDiffLines(file: DiffFile, isExpanded: boolean) {
  const lines = file.diff.split('\n')
  const visible = isExpanded ? lines : lines.slice(0, PREVIEW_LINES)
  return visible.map((line, i) => <DiffLine key={i} content={line} />)
}
```

**Test requirements:**
- RTL test: mock `trpc.loop.getDiff` returning a sample diff, assert file names render in sidebar and diff lines render in main panel.
- Test expand/collapse toggle — click "Show all" and assert more lines appear.
- Test `available: false` — assert empty state message is rendered.

**Integration notes:** Use existing Tailwind classes consistent with the app's dark theme. No new dependencies.

**Demo:** Render `DiffViewer` in Storybook or in the loop detail view (temporarily hardcoded to a known loopId) — diff displays correctly.

---

## Step 5: Wire DiffViewer into LoopDetail

**Objective:** Add a "Review Changes" tab to the loop detail view that renders `DiffViewer`.

**Implementation guidance:**

In `packages/frontend/src/components/loops/LoopDetail.tsx`:

- Determine if the tab should be visible:
  ```typescript
  const showReviewTab = ['completed', 'needs-review', 'merged', 'stopped'].includes(loop.state)
  ```
- Add a tab button "Review Changes" to the existing tab bar (alongside "Output", "Events", etc.).
- When tab is active, render `<DiffViewer loopId={loop.id} />`.

**Test requirements:**
- Update `LoopDetail` tests (if they exist): assert "Review Changes" tab appears for `completed` state and is absent for `running` state.

**Integration notes:**
- Run full test suite: `npm run test`
- Run typecheck: `npm run typecheck`
- Run build: `npm run build`

**Demo:** Open a completed loop with a worktree — "Review Changes" tab appears, clicking it shows the diff viewer with sidebar and file diffs.
