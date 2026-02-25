import { randomUUID } from 'node:crypto'
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  closeDatabase,
  createDatabase,
  migrateDatabase,
  type DatabaseConnection
} from '../src/db/connection.js'
import { projects } from '../src/db/schema.js'
import { appRouter } from '../src/trpc/router.js'
import { ProcessManager } from '../src/runner/ProcessManager.js'
import { ChatService } from '../src/services/ChatService.js'
import { DevPreviewManager } from '../src/services/DevPreviewManager.js'
import { LoopService } from '../src/services/LoopService.js'
import { MonitoringService } from '../src/services/MonitoringService.js'
import { PresetService } from '../src/services/PresetService.js'

async function createTempDir(prefix: string) {
  return mkdtemp(join(tmpdir(), `ralph-ui-${prefix}-`))
}

async function createMockRalphBinary(directory: string) {
  const filePath = join(directory, 'mock-presets-ralph.mjs')
  const script = `#!/usr/bin/env node
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const scriptDir = dirname(fileURLToPath(import.meta.url))
const pidFile = join(scriptDir, 'mock-presets-ralph.pid')

if (args[0] === 'loops' && args[1] === 'list') {
  process.stdout.write('[]\\n')
  process.exit(0)
}

if (args[0] === 'loops' && args[1] === 'stop') {
  if (existsSync(pidFile)) {
    const pid = Number(readFileSync(pidFile, 'utf8').trim())
    if (Number.isFinite(pid)) {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {}
    }
  }
  process.exit(0)
}

writeFileSync(pidFile, String(process.pid), 'utf8')

const timer = setInterval(() => {
  process.stdout.write('tick\\n')
}, 50)

process.on('SIGTERM', () => {
  clearInterval(timer)
  if (existsSync(pidFile)) {
    try {
      unlinkSync(pidFile)
    } catch {}
  }
  process.exit(0)
})
`

  await writeFile(filePath, script, 'utf8')
  await chmod(filePath, 0o755)
  return filePath
}

describe('preset features', () => {
  const tempDirs: string[] = []
  const connections: DatabaseConnection[] = []
  const managers: ProcessManager[] = []

  afterEach(async () => {
    while (managers.length > 0) {
      await managers.pop()?.shutdown()
    }

    while (connections.length > 0) {
      const connection = connections.pop()
      if (connection) {
        closeDatabase(connection)
      }
    }

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) {
        await rm(dir, { recursive: true, force: true })
      }
    }
  })

  async function setupCaller() {
    const tempDir = await createTempDir('preset-routes')
    tempDirs.push(tempDir)

    const dbPath = join(tempDir, 'preset.db')
    const connection = createDatabase({ filePath: dbPath })
    migrateDatabase(connection.db)
    connections.push(connection)

    const binaryPath = await createMockRalphBinary(tempDir)
    const processManager = new ProcessManager({ killGraceMs: 100 })
    managers.push(processManager)

    const loopService = new LoopService(connection.db, processManager, {
      resolveBinary: async () => binaryPath
    })
    const chatService = new ChatService(connection.db, processManager, {
      resolveBinary: async () => binaryPath
    })
    const monitoringService = new MonitoringService(connection.db, loopService)
    const previewService = new DevPreviewManager(connection.db, processManager)

    const caller = appRouter.createCaller({
      db: connection.db,
      processManager,
      loopService,
      chatService,
      monitoringService,
      previewService
    })

    return {
      caller,
      connection,
      processManager,
      tempDir
    }
  }

  it('lists only YAML files from a directory using preset names', async () => {
    const tempDir = await createTempDir('preset-list')
    tempDirs.push(tempDir)

    await writeFile(join(tempDir, 'code-assist.yml'), 'model: gpt-5\n', 'utf8')
    await writeFile(join(tempDir, 'spec-driven.yml'), 'model: gpt-5-mini\n', 'utf8')
    await writeFile(join(tempDir, 'README.md'), '# ignore\n', 'utf8')

    const service = new PresetService(tempDir)
    await expect(service.list()).resolves.toEqual([
      {
        filename: 'code-assist.yml',
        name: 'code-assist'
      },
      {
        filename: 'spec-driven.yml',
        name: 'spec-driven'
      }
    ])
  })

  it('lists and resolves nested YAML presets from subdirectories', async () => {
    const tempDir = await createTempDir('preset-nested')
    tempDirs.push(tempDir)

    await mkdir(join(tempDir, 'minimal'), { recursive: true })
    await writeFile(join(tempDir, 'minimal', 'default.yml'), 'model: gpt-5\n', 'utf8')

    const service = new PresetService(tempDir)
    await expect(service.list()).resolves.toEqual([
      {
        filename: 'minimal/default.yml',
        name: 'default'
      }
    ])
    await expect(service.resolvePath('minimal/default.yml')).resolves.toBe(
      join(tempDir, 'minimal', 'default.yml')
    )
    await expect(service.get('minimal/default.yml')).resolves.toMatchObject({
      filename: 'minimal/default.yml'
    })
  })

  it('exposes presets and default preset settings via tRPC', async () => {
    const { caller } = await setupCaller()

    const presets = await caller.presets.list()
    expect(presets.some((preset) => preset.filename === 'code-assist.yml')).toBe(true)
    expect(presets.some((preset) => preset.filename === 'pdd-to-code-assist.yml')).toBe(
      true
    )
    expect(presets.some((preset) => preset.filename === 'spec-driven.yml')).toBe(true)

    const preset = await caller.presets.get({
      filename: 'code-assist.yml'
    })
    expect(preset.filename).toBe('code-assist.yml')
    expect(preset.content.length).toBeGreaterThan(0)

    await expect(caller.settings.getDefaultPreset()).resolves.toBe('hatless-baseline.yml')
    await caller.settings.setDefaultPreset({
      filename: 'pdd-to-code-assist.yml'
    })
    await expect(caller.settings.getDefaultPreset()).resolves.toBe(
      'pdd-to-code-assist.yml'
    )
  })

  it('allows saving a project-local preset as default when projectId is provided', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const now = Date.now()
    const projectId = randomUUID()
    const projectPath = join(tempDir, 'project-local-preset')
    await mkdir(projectPath, { recursive: true })
    await writeFile(join(projectPath, 'project-only.yml'), 'model: gpt-5\n', 'utf8')

    await connection.db
      .insert(projects)
      .values({
        id: projectId,
        name: 'Project Local Preset',
        path: projectPath,
        type: 'node',
        ralphConfig: 'project-only.yml',
        createdAt: now,
        updatedAt: now
      })
      .run()

    await expect(
      caller.settings.setDefaultPreset({
        filename: 'project-only.yml',
        projectId
      })
    ).resolves.toBe('project-only.yml')
    await expect(caller.settings.getDefaultPreset()).resolves.toBe('project-only.yml')
  })

  it('returns an error when project lookup fails instead of falling back globally', async () => {
    const { caller } = await setupCaller()

    await expect(
      caller.presets.list({
        projectId: 'missing-project'
      })
    ).rejects.toThrow('Project not found: missing-project')

    await expect(
      caller.presets.get({
        filename: 'code-assist.yml',
        projectId: 'missing-project'
      })
    ).rejects.toThrow('Project not found: missing-project')
  })

  it('rejects project preset path traversal attempts', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const now = Date.now()
    const projectId = randomUUID()
    const projectPath = join(tempDir, 'project-preset-safety')
    await mkdir(projectPath, { recursive: true })
    await writeFile(join(projectPath, 'local.yml'), 'model: gpt-5\n', 'utf8')
    await writeFile(join(tempDir, 'outside.yml'), 'model: gpt-5-mini\n', 'utf8')

    await connection.db
      .insert(projects)
      .values({
        id: projectId,
        name: 'Project Preset Safety',
        path: projectPath,
        type: 'node',
        ralphConfig: 'local.yml',
        createdAt: now,
        updatedAt: now
      })
      .run()

    await expect(
      caller.presets.get({
        filename: '../outside.yml',
        projectId
      })
    ).rejects.toThrow('Invalid preset filename')

    await expect(
      caller.presets.get({
        filename: '/tmp/outside.yml',
        projectId
      })
    ).rejects.toThrow('Invalid preset filename')
  })

  it('starts loops with the selected preset config path', async () => {
    const { caller, connection, processManager, tempDir } = await setupCaller()
    const now = Date.now()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })

    const projectId = randomUUID()
    await connection.db
      .insert(projects)
      .values({
        id: projectId,
        name: 'Preset Loop Project',
        path: projectPath,
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: now,
        updatedAt: now
      })
      .run()

    const started = await caller.loop.start({
      projectId,
      prompt: 'with-preset',
      presetFilename: 'spec-driven.yml'
    })
    const handle = processManager
      .list()
      .find((candidate) => candidate.id === started.processId)

    expect(handle?.command).toBe('bash')
    expect(handle?.args[0]).toBe('-lc')
    expect(handle?.args[1]).toContain('--config')
    expect(handle?.args[1]).toMatch(
      /packages[/\\]backend[/\\]presets[/\\]spec-driven\.yml/
    )

    await caller.loop.stop({ loopId: started.id })
  })
})
