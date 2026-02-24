import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveRalphBinary } from '../src/lib/ralph.js'
import { OutputBuffer } from '../src/runner/OutputBuffer.js'
import { ProcessManager } from '../src/runner/ProcessManager.js'
import { RalphEventParser } from '../src/runner/RalphEventParser.js'

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2_000,
  pollMs = 20
) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms`)
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
}

describe('ProcessManager', () => {
  const tempDirs: string[] = []

  async function createTempDir(prefix: string) {
    const dir = await mkdtemp(join(tmpdir(), `ralph-ui-${prefix}-`))
    tempDirs.push(dir)
    return dir
  }

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) {
        await rm(dir, { recursive: true, force: true })
      }
    }
  })

  it('spawns a process and streams stdout output', async () => {
    const manager = new ProcessManager()
    const handle = await manager.spawn(process.cwd(), process.execPath, [
      '-e',
      'setTimeout(() => process.stdout.write("hello\\n"), 25); setTimeout(() => process.exit(0), 80);'
    ])
    const chunks: string[] = []

    manager.onOutput(handle.id, (chunk) => {
      chunks.push(chunk.data)
    })

    await waitFor(() => chunks.join('').includes('hello'))
    await manager.shutdown()
  })

  it('sends input to a running process via stdin', async () => {
    const manager = new ProcessManager()
    const handle = await manager.spawn(process.cwd(), process.execPath, [
      '-e',
      'process.stdin.setEncoding("utf8"); process.stdin.on("data", (chunk) => { process.stdout.write(`echo:${chunk}`); if (chunk.includes("quit")) process.exit(0); }); setInterval(() => {}, 200);'
    ])

    const chunks: string[] = []
    manager.onOutput(handle.id, (chunk) => {
      chunks.push(chunk.data)
    })

    await new Promise((resolve) => setTimeout(resolve, 50))
    manager.sendInput(handle.id, 'hello\n')

    await waitFor(() => chunks.join('').includes('echo:hello'))
    await manager.kill(handle.id, 'SIGKILL')
  })

  it('kills stubborn processes by sending SIGTERM then SIGKILL after grace period', async () => {
    const manager = new ProcessManager({ killGraceMs: 75 })
    const dir = await createTempDir('kill')
    const markerPath = join(dir, 'sigterm.txt')
    const markerArg = JSON.stringify(markerPath)

    const handle = await manager.spawn(process.cwd(), process.execPath, [
      '-e',
      `const fs = require("node:fs"); process.on("SIGTERM", () => { fs.writeFileSync(${markerArg}, "term\\n", "utf8"); }); console.log("ready"); setInterval(() => {}, 200);`
    ])

    const chunks: string[] = []
    manager.onOutput(handle.id, (chunk) => chunks.push(chunk.data))
    await waitFor(() => chunks.join('').includes('ready'))

    await manager.kill(handle.id)

    await waitFor(() => manager.list().length === 0)
    await expect(readFile(markerPath, 'utf8')).resolves.toContain('term')
    await manager.shutdown()
  })

  it('cleans up all active processes on shutdown', async () => {
    const manager = new ProcessManager({ killGraceMs: 50 })
    await manager.spawn(process.cwd(), process.execPath, [
      '-e',
      'setInterval(() => {}, 250);'
    ])
    await manager.spawn(process.cwd(), process.execPath, [
      '-e',
      'setInterval(() => {}, 250);'
    ])

    expect(manager.list().length).toBe(2)
    await manager.shutdown()
    expect(manager.list()).toEqual([])
  })

  it('spawns with a pseudo-terminal when tty mode is requested', async () => {
    const manager = new ProcessManager()
    const handle = await manager.spawn(
      process.cwd(),
      process.execPath,
      [
        '-e',
        'process.stdout.write(String(Boolean(process.stdin.isTTY))); setTimeout(() => process.exit(0), 10);'
      ],
      { tty: true }
    )

    const chunks: string[] = []
    manager.onOutput(handle.id, (chunk) => {
      chunks.push(chunk.data)
    })

    await waitFor(() => chunks.join('').includes('true'))
    await manager.shutdown()
  })

})

describe('OutputBuffer', () => {
  it('stores and replays only the last N lines', () => {
    const buffer = new OutputBuffer(3)
    buffer.append('line-1\nline-2\n')
    buffer.append('line-3\nline-4\n')

    expect(buffer.replay()).toEqual(['line-2', 'line-3', 'line-4'])
  })

  it('handles partial line chunks', () => {
    const buffer = new OutputBuffer(4)
    buffer.append('alpha')
    buffer.append('-one\nbeta')
    buffer.append('-two\n')

    expect(buffer.replay()).toEqual(['alpha-one', 'beta-two'])
  })

  it('supports unlimited replay when max lines is not finite', () => {
    const buffer = new OutputBuffer(Number.POSITIVE_INFINITY)
    for (let index = 1; index <= 8; index += 1) {
      buffer.append(`line-${index}\n`)
    }

    expect(buffer.replay()).toEqual([
      'line-1',
      'line-2',
      'line-3',
      'line-4',
      'line-5',
      'line-6',
      'line-7',
      'line-8'
    ])
  })
})

describe('RalphEventParser', () => {
  it('parses Ralph event lines with JSON payload', () => {
    const parser = new RalphEventParser()
    const parsed = parser.parseLine(
      'Event: loop:state - {"loopId":"l1","state":"running"}'
    )

    expect(parsed).not.toBeNull()
    expect(parsed?.topic).toBe('loop:state')
    expect(parsed?.payload).toEqual({ loopId: 'l1', state: 'running' })
  })

  it('returns null for non-event lines', () => {
    const parser = new RalphEventParser()
    expect(parser.parseLine('plain terminal output')).toBeNull()
  })
})

describe('resolveRalphBinary', () => {
  const tempDirs: string[] = []

  async function createTempDir(prefix: string) {
    const dir = await mkdtemp(join(tmpdir(), `ralph-ui-${prefix}-`))
    tempDirs.push(dir)
    return dir
  }

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) {
        await rm(dir, { recursive: true, force: true })
      }
    }
  })

  it('prefers local node_modules/.bin/ralph over PATH', async () => {
    const cwd = await createTempDir('cwd')
    const binDir = join(cwd, 'node_modules', '.bin')
    const localRalph = join(binDir, 'ralph')
    await mkdir(binDir, { recursive: true })
    await writeFile(localRalph, '#!/usr/bin/env bash\necho local\n', 'utf8')
    await chmod(localRalph, 0o755)

    const pathDir = await createTempDir('path')
    const pathRalph = join(pathDir, 'ralph')
    await writeFile(pathRalph, '#!/usr/bin/env bash\necho path\n', 'utf8')
    await chmod(pathRalph, 0o755)

    const resolved = await resolveRalphBinary({
      cwd,
      pathEnv: pathDir
    })

    expect(resolved).toBe(localRalph)
  })

  it('uses an explicitly configured binary path when provided', async () => {
    const cwd = await createTempDir('configured-cwd')
    const configured = join(cwd, 'custom-ralph')
    await writeFile(configured, '#!/usr/bin/env bash\necho configured\n', 'utf8')
    await chmod(configured, 0o755)

    const resolved = await resolveRalphBinary({
      cwd,
      customPath: configured
    })

    expect(resolved).toBe(configured)
  })

  it('throws a clear error when configured binary path is not executable', async () => {
    const cwd = await createTempDir('configured-invalid')
    const configured = join(cwd, 'missing-ralph')

    await expect(
      resolveRalphBinary({
        cwd,
        customPath: configured
      })
    ).rejects.toThrow(/configured ralph binary is not executable/i)
  })
})
