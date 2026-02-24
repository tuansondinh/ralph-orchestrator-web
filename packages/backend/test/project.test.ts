import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import { count, eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import {
  closeDatabase,
  createDatabase,
  migrateDatabase,
  type DatabaseConnection
} from '../src/db/connection.js'
import { notifications, projects } from '../src/db/schema.js'
import { detectProjectType } from '../src/lib/detect.js'
import { ProcessManager } from '../src/runner/ProcessManager.js'
import { LoopService } from '../src/services/LoopService.js'
import { ChatService } from '../src/services/ChatService.js'
import { MonitoringService } from '../src/services/MonitoringService.js'
import { DevPreviewManager } from '../src/services/DevPreviewManager.js'
import { appRouter } from '../src/trpc/router.js'

const execFile = promisify(execFileCallback)

async function runGit(projectPath: string, args: string[]) {
  await execFile('git', args, { cwd: projectPath })
}

describe('project type detection', () => {
  const tempDirs: string[] = []

  async function createProjectDir(prefix: string) {
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

  it('detects node, rust, and python project types', async () => {
    const nodeDir = await createProjectDir('node')
    await writeFile(join(nodeDir, 'package.json'), '{"name":"demo"}\n', 'utf8')

    const rustDir = await createProjectDir('rust')
    await writeFile(join(rustDir, 'Cargo.toml'), '[package]\nname = "demo"\n', 'utf8')

    const pythonDir = await createProjectDir('python')
    await writeFile(
      join(pythonDir, 'pyproject.toml'),
      '[project]\nname = "demo"\n',
      'utf8'
    )

    await expect(detectProjectType(nodeDir)).resolves.toBe('node')
    await expect(detectProjectType(rustDir)).resolves.toBe('rust')
    await expect(detectProjectType(pythonDir)).resolves.toBe('python')
  })
})

describe('project tRPC routes', () => {
  const tempDirs: string[] = []
  const connections: DatabaseConnection[] = []
  const managers: ProcessManager[] = []

  async function createTempDir(prefix: string) {
    const dir = await mkdtemp(join(tmpdir(), `ralph-ui-${prefix}-`))
    tempDirs.push(dir)
    return dir
  }

  async function createContext() {
    const dbDir = await createTempDir('db')
    const dbPath = join(dbDir, 'test.db')
    const connection = createDatabase({ filePath: dbPath })
    migrateDatabase(connection.db)
    connections.push(connection)
    const processManager = new ProcessManager()
    managers.push(processManager)
    const loopService = new LoopService(connection.db, processManager)
    const chatService = new ChatService(connection.db, processManager)
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

    return { caller, connection }
  }

  async function createCaller() {
    const { caller } = await createContext()
    return caller
  }

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

  it('creates, gets, updates, lists, and deletes projects', async () => {
    const caller = await createCaller()
    const nodeDir = await createTempDir('project-node')
    await writeFile(join(nodeDir, 'package.json'), '{"name":"demo"}\n', 'utf8')

    const created = await caller.project.create({
      name: 'Demo',
      path: nodeDir
    })

    expect(created.path).toBe(resolve(nodeDir))
    expect(created.type).toBe('node')
    expect(created.ralphConfig).toBe('ralph.yml')
    await expect(access(join(nodeDir, 'ralph.yml'))).resolves.toBeUndefined()
    await expect(readFile(join(nodeDir, 'ralph.yml'), 'utf8')).resolves.toContain(
      'backend: "claude"'
    )

    const fetched = await caller.project.get({ id: created.id })
    expect(fetched).toMatchObject({ id: created.id, name: 'Demo' })

    const updated = await caller.project.update({
      id: created.id,
      name: 'Renamed Demo'
    })
    expect(updated.name).toBe('Renamed Demo')

    const listed = await caller.project.list()
    expect(listed).toHaveLength(1)
    expect(listed[0]?.id).toBe(created.id)

    await caller.project.delete({ id: created.id })

    const afterDelete = await caller.project.list()
    expect(afterDelete).toEqual([])
    await expect(access(nodeDir)).resolves.toBeUndefined()
    const st = await stat(nodeDir)
    expect(st.isDirectory()).toBe(true)
  })

  it('creates missing project directory and scaffolds default ralph.yml', async () => {
    const caller = await createCaller()
    const baseDir = await createTempDir('project-create')
    const projectDir = join(baseDir, 'new-project-dir')

    const created = await caller.project.create({
      name: 'Created On Demand',
      path: projectDir
    })

    expect(created.path).toBe(resolve(projectDir))
    expect(created.type).toBe('unknown')
    expect(created.ralphConfig).toBe('ralph.yml')
    await expect(access(projectDir)).resolves.toBeUndefined()
    const stats = await stat(projectDir)
    expect(stats.isDirectory()).toBe(true)
    await expect(readFile(join(projectDir, 'ralph.yml'), 'utf8')).resolves.toContain(
      'completion_promise: "LOOP_COMPLETE"'
    )
  })

  it('keeps newly created project ralph.yml at default template even if parent has a template', async () => {
    const caller = await createCaller()
    const baseDir = await createTempDir('project-create-parent-template')
    const projectDir = join(baseDir, 'new-project-dir')
    await writeFile(
      join(baseDir, 'ralph.yml'),
      'model: gpt-5-mini\nmax_runtime_seconds: 900\n',
      'utf8'
    )

    const created = await caller.project.create({
      name: 'Created From Parent Template',
      path: projectDir
    })

    expect(created.path).toBe(resolve(projectDir))
    expect(created.ralphConfig).toBe('ralph.yml')
    await expect(readFile(join(projectDir, 'ralph.yml'), 'utf8')).resolves.toContain(
      'backend: "claude"'
    )
  })

  it('keeps existing project config files when opening a project', async () => {
    const caller = await createCaller()
    const parentDir = await createTempDir('project-open-existing-yaml')
    const projectDir = join(parentDir, 'existing-app')
    await mkdir(projectDir, { recursive: true })
    await writeFile(join(parentDir, 'ralph.yml'), 'model: gpt-5\nmax_turns: 12\n', 'utf8')
    await writeFile(join(projectDir, 'package.json'), '{"name":"existing-app"}\n', 'utf8')
    await writeFile(join(projectDir, 'ralph.yaml'), 'model: gpt-5-mini\n', 'utf8')

    const created = await caller.project.create({
      name: 'Existing YAML Project',
      path: projectDir,
      createIfMissing: false
    })

    expect(created.path).toBe(resolve(projectDir))
    expect(created.type).toBe('node')
    expect(created.ralphConfig).toBe('ralph.yaml')
    await expect(readFile(join(projectDir, 'ralph.yaml'), 'utf8')).resolves.toContain(
      'model: gpt-5-mini'
    )
    await expect(access(join(projectDir, 'ralph.yml'))).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  it('copies parent ralph.yml into opened projects when project config is missing', async () => {
    const caller = await createCaller()
    const parentDir = await createTempDir('project-open-existing-parent-template')
    const projectDir = join(parentDir, 'existing-app')
    await mkdir(projectDir, { recursive: true })
    await writeFile(join(parentDir, 'ralph.yml'), 'model: gpt-5\nmax_turns: 12\n', 'utf8')
    await writeFile(join(projectDir, 'package.json'), '{"name":"existing-app"}\n', 'utf8')

    const created = await caller.project.create({
      name: 'Existing Project Without Config',
      path: projectDir,
      createIfMissing: false
    })

    expect(created.path).toBe(resolve(projectDir))
    expect(created.type).toBe('node')
    expect(created.ralphConfig).toBe('ralph.yml')
    await expect(readFile(join(projectDir, 'ralph.yml'), 'utf8')).resolves.toContain(
      'max_turns: 12'
    )
  })

  it('rejects project creation when createIfMissing is false and path does not exist', async () => {
    const caller = await createCaller()
    const baseDir = await createTempDir('project-open')
    const missingPath = join(baseDir, 'missing-project')

    await expect(
      caller.project.create({
        name: 'Existing Project',
        path: missingPath,
        createIfMissing: false
      })
    ).rejects.toThrow(/does not exist/i)
  })

  it('rejects project creation when path is not a directory', async () => {
    const caller = await createCaller()
    const baseDir = await createTempDir('project-file')
    const badPath = join(baseDir, 'not-a-directory.txt')
    await writeFile(badPath, 'hello\n', 'utf8')

    await expect(
      caller.project.create({
        name: 'Invalid',
        path: badPath
      })
    ).rejects.toThrow(/path/i)
  })

  it('lists all projects', async () => {
    const caller = await createCaller()
    const nodeDir = await createTempDir('project-list-node')
    await writeFile(join(nodeDir, 'package.json'), '{"name":"node-app"}\n', 'utf8')

    const rustDir = await createTempDir('project-list-rust')
    await writeFile(
      join(rustDir, 'Cargo.toml'),
      '[package]\nname = "rust-app"\n',
      'utf8'
    )

    const pythonDir = await createTempDir('project-list-python')
    await writeFile(
      join(pythonDir, 'pyproject.toml'),
      '[project]\nname = "python-app"\n',
      'utf8'
    )

    await caller.project.create({ name: 'Node app', path: nodeDir })
    await caller.project.create({ name: 'Rust app', path: rustDir })
    await caller.project.create({ name: 'Python app', path: pythonDir })

    const listed = await caller.project.list()
    expect(listed).toHaveLength(3)
    expect(new Set(listed.map((project) => project.type))).toEqual(
      new Set(['node', 'rust', 'python'])
    )
  })

  it('returns an error when project id does not exist', async () => {
    const caller = await createCaller()

    await expect(caller.project.get({ id: 'missing' })).rejects.toThrow(
      /not found/i
    )
  })

  it('deletes projects even when notifications exist for that project', async () => {
    const { caller, connection } = await createContext()
    const projectDir = await createTempDir('project-delete-with-notifications')
    const now = Date.now()

    const created = await caller.project.create({
      name: 'Delete Me',
      path: projectDir
    })

    await connection.db.insert(notifications).values({
      id: 'notification-project-delete-1',
      projectId: created.id,
      type: 'loop_complete',
      title: 'Loop completed',
      message: 'Done',
      read: 0,
      createdAt: now
    })

    await expect(caller.project.delete({ id: created.id })).resolves.toBeUndefined()

    const [remainingNotifications] = await connection.db
      .select({ count: count() })
      .from(notifications)
      .where(eq(notifications.projectId, created.id))
    expect(remainingNotifications?.count).toBe(0)
  })

  it('reads and updates per-project ralph.yml configuration', async () => {
    const caller = await createCaller()
    const projectDir = await createTempDir('project-config')

    const created = await caller.project.create({
      name: 'Configurable',
      path: projectDir
    })

    const initialConfig = await caller.project.getConfig({ projectId: created.id })
    expect(initialConfig.projectId).toBe(created.id)
    expect(initialConfig.yaml).toContain('backend: "claude"')
    expect(initialConfig.config).toMatchObject({
      cli: {
        backend: 'claude'
      },
      event_loop: {
        completion_promise: 'LOOP_COMPLETE'
      }
    })

    const updated = await caller.project.updateConfig({
      projectId: created.id,
      yaml: 'model: gpt-5-mini\nignore:\n  - node_modules\n  - dist\n'
    })

    expect(updated.config).toMatchObject({
      model: 'gpt-5-mini',
      ignore: ['node_modules', 'dist']
    })
    await expect(readFile(join(projectDir, 'ralph.yml'), 'utf8')).resolves.toContain(
      'model: gpt-5-mini'
    )

    await expect(
      caller.project.updateConfig({
        projectId: created.id,
        yaml: 'model: [broken'
      })
    ).rejects.toThrow(/yaml/i)
  })

  it('returns current prompt file content using configured event_loop.prompt_file', async () => {
    const caller = await createCaller()
    const projectDir = await createTempDir('project-prompt')
    await mkdir(join(projectDir, 'prompts'), { recursive: true })
    await writeFile(
      join(projectDir, 'ralph.yml'),
      'model: gpt-5\nevent_loop:\n  prompt_file: prompts/current.md\n',
      'utf8'
    )
    await writeFile(
      join(projectDir, 'prompts', 'current.md'),
      '# Current Prompt\nDo the work.\n',
      'utf8'
    )

    const created = await caller.project.create({
      name: 'Prompt Project',
      path: projectDir,
      createIfMissing: false
    })

    const prompt = await caller.project.getPrompt({
      projectId: created.id
    })
    expect(prompt.projectId).toBe(created.id)
    expect(prompt.path).toBe('prompts/current.md')
    expect(prompt.content).toContain('# Current Prompt')
  })

  it('creates and lists named git worktrees for a project', async () => {
    const caller = await createCaller()
    const projectDir = await createTempDir('project-worktrees')
    await runGit(projectDir, ['init', '-b', 'main'])
    await runGit(projectDir, ['config', 'user.name', 'Test User'])
    await runGit(projectDir, ['config', 'user.email', 'test@example.com'])
    await writeFile(join(projectDir, 'README.md'), 'hello\n', 'utf8')
    await runGit(projectDir, ['add', '.'])
    await runGit(projectDir, ['commit', '-m', 'initial'])

    const created = await caller.project.create({
      name: 'Worktree Project',
      path: projectDir,
      createIfMissing: false
    })

    const initial = await caller.project.listWorktrees({ projectId: created.id })
    expect(initial).toEqual([])

    const added = await caller.project.createWorktree({
      projectId: created.id,
      name: 'feature-a'
    })

    expect(added.name).toBe('feature-a')
    expect(added.branch).toBe('feature-a')
    expect(added.isPrimary).toBe(false)
    const addedStats = await stat(added.path)
    expect(addedStats.isDirectory()).toBe(true)

    const listed = await caller.project.listWorktrees({ projectId: created.id })
    expect(listed).toHaveLength(1)
    expect(listed[0]?.name).toBe('feature-a')
    expect(listed[0]?.branch).toBe('feature-a')
  })

  it('resolves legacy projects with null config field to existing ralph.yaml', async () => {
    const { caller, connection } = await createContext()
    const projectDir = await createTempDir('project-config-legacy-yaml')
    await writeFile(join(projectDir, 'ralph.yaml'), 'model: gpt-5-mini\n', 'utf8')

    const projectId = 'legacy-null-config-project'
    const now = Date.now()
    await connection.db
      .insert(projects)
      .values({
        id: projectId,
        name: 'Legacy config project',
        path: resolve(projectDir),
        type: 'node',
        ralphConfig: null,
        createdAt: now,
        updatedAt: now
      })
      .run()

    const initial = await caller.project.getConfig({ projectId })
    expect(initial.yaml).toContain('model: gpt-5-mini')

    await caller.project.updateConfig({
      projectId,
      yaml: 'model: gpt-5\n'
    })
    await expect(readFile(join(projectDir, 'ralph.yaml'), 'utf8')).resolves.toContain(
      'model: gpt-5'
    )

    const persisted = await caller.project.get({ id: projectId })
    expect(persisted.ralphConfig).toBe('ralph.yaml')
  })
})
