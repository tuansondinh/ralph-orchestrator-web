---
status: completed
created: 2026-03-07
started: 2026-03-07
completed: 2026-03-07
---
# Task: Critical Security Fixes

## Description
Fix command injection vulnerabilities, leaked credentials, and container security issues found during codebase review.

## Background
The codebase has several security issues ranging from command injection via `exec()` with string interpolation, a leaked API key in `.env.local`, shell command construction risks in LoopService, and a Dockerfile running as root.

## Technical Requirements

### 1. Fix command injection in RalphProcessService
**File:** `packages/backend/src/services/RalphProcessService.ts`

Replace `exec()` with `process.kill()` for the `kill()` and `killAll()` methods:

```ts
// BEFORE (line 118):
await execAsync(`kill -9 ${pid}`)

// AFTER:
process.kill(pid, 'SIGKILL')
```

- Remove the `exec` and `promisify` imports if no longer needed
- The `list()` method using `ps -axo ...` is fine since it has no user input
- Add input validation directly in the service: verify `pid` is a positive integer before calling `process.kill()`

### 2. Audit and fix shell command construction in LoopService
**File:** `packages/backend/src/services/LoopService.ts`

- Find the `buildRunCommand` function and verify all user-supplied values (config paths, prompt text, backend names, worktree paths) are properly shell-escaped
- If any values are interpolated into the shell command string without escaping, fix them using proper quoting/escaping
- Consider switching from `bash -lc shellCommand` to `execFile` with explicit args array where possible

### 3. Rotate leaked API key
**File:** `.env.local`

- The file contains a Google AI API key in plaintext. Replace the value with a placeholder:
  ```
  GOOGLE_GENERATIVE_AI_API_KEY=your-api-key-here
  ```
- Note: The actual key rotation must happen in the Google Cloud Console (out of scope for this task, but flag it)

### 4. Dockerfile: add non-root user
**File:** `Dockerfile`

Add a non-root user to the runtime stage, before `COPY` directives:
```dockerfile
RUN addgroup --system app && adduser --system --ingroup app app
USER app
```

## Dependencies
- None

## Implementation Approach
1. Fix RalphProcessService first (smallest, most critical)
2. Audit buildRunCommand in LoopService
3. Update .env.local
4. Update Dockerfile
5. Run existing tests to verify no regressions

## Acceptance Criteria

1. **No exec with string interpolation**
   - Given the RalphProcessService
   - When `kill()` or `killAll()` is called
   - Then `process.kill()` is used instead of `exec()` with string interpolation

2. **Shell command construction is safe**
   - Given user-supplied config paths, prompts, or backend names
   - When a loop is started via LoopService
   - Then all values passed to shell commands are properly escaped or passed as array arguments

3. **No leaked credentials**
   - Given the `.env.local` file
   - When it is read
   - Then it contains only placeholder values, not real API keys

4. **Container runs as non-root**
   - Given the Dockerfile
   - When the container is built and started
   - Then the process runs as a non-root user

5. **Existing tests pass**
   - Given the security fixes
   - When `npm test` is run
   - Then all existing tests pass without modification

## Metadata
- **Complexity**: Medium
- **Labels**: security, p0
- **Required Skills**: Node.js, shell escaping, Docker
