import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import type { LoopOutputSnapshot } from '../services/LoopService.js'
import type { MonitoringStatus } from '../services/MonitoringService.js'

interface ProjectWithPresetContext {
  path: string
  ralphConfig: string | null
}

interface ReadOnlyLoopRunsInput {
  projectId?: string
  loopId?: string
}

interface LoopOutputInput {
  loopId: string
  limit?: number
}

interface StartLoopInput {
  projectId: string
  config?: string
  prompt?: string
  promptSnapshot?: string
  promptFile?: string
  backend?: 'claude' | 'kiro' | 'gemini' | 'codex' | 'amp' | 'copilot' | 'opencode'
  exclusive?: boolean
  worktree?: string
}

interface StopLoopInput {
  loopId: string
}

interface CreateProjectInput {
  name: string
  path: string
  createIfMissing?: boolean
}

interface UpdateProjectInput {
  projectId: string
  name?: string
  path?: string
}

interface DeleteProjectInput {
  projectId: string
}

interface KillProcessInput {
  pid: number
}

interface UpdateSettingsInput {
  ralphBinaryPath?: string | null
  notifications?: {
    loopComplete?: boolean
    loopFailed?: boolean
    needsInput?: boolean
  }
  preview?: {
    portStart?: number
    portEnd?: number
    baseUrl?: string | null
    command?: string | null
  }
}

export interface RalphMcpServerDependencies {
  projectService: {
    list: () => Promise<unknown>
    get: (projectId: string) => Promise<ProjectWithPresetContext & Record<string, unknown>>
    create: (input: CreateProjectInput) => Promise<unknown>
    update: (
      projectId: string,
      updates: {
        name?: string
        path?: string
      }
    ) => Promise<unknown>
    delete: (projectId: string) => Promise<void>
  }
  presetService: {
    listForProject: (projectConfig?: {
      path: string
      ralphConfig?: string | null
    }) => Promise<unknown>
  }
  loopService: {
    list: (projectId: string) => Promise<unknown>
    get: (loopId: string) => Promise<unknown>
    getOutput: (input: LoopOutputInput) => Promise<LoopOutputSnapshot>
    start: (projectId: string, options: Record<string, unknown>) => Promise<unknown>
    stop: (loopId: string) => Promise<void>
  }
  monitoringService: {
    getStatus: () => Promise<MonitoringStatus>
  }
  settingsService: {
    get: () => Promise<unknown>
    update: (input: UpdateSettingsInput) => Promise<unknown>
  }
  ralphProcessService: {
    kill: (pid: number) => Promise<void>
  }
  hatsPresetService: {
    list: () => Promise<unknown>
  }
}

export class RalphMcpServer {
  readonly server: McpServer
  private readonly transport: StreamableHTTPServerTransport
  private connected = false

  constructor(private readonly dependencies: RalphMcpServerDependencies) {
    this.server = new McpServer(
      {
        name: 'ralph-orchestrator-mcp',
        version: '0.1.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    )
    this.transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID()
    })
    this.registerReadOnlyTools()
    this.registerDestructiveTools()
  }

  async start() {
    if (this.connected) {
      return
    }

    await this.server.connect(this.transport)
    this.connected = true
  }

  async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
    parsedBody?: unknown
  ) {
    await this.start()
    await this.transport.handleRequest(request, response, parsedBody)
  }

  async close() {
    if (!this.connected) {
      return
    }

    await this.server.close()
    this.connected = false
  }

  private registerReadOnlyTools() {
    this.server.registerTool(
      'list_projects',
      {
        description: 'List all projects',
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true }
      },
      async () => this.asJsonToolResult(await this.dependencies.projectService.list())
    )

    this.server.registerTool(
      'get_project',
      {
        description: 'Get project details',
        inputSchema: z.object({
          projectId: z.string().trim().min(1)
        }),
        annotations: { readOnlyHint: true }
      },
      async (args) =>
        this.asJsonToolResult(await this.dependencies.projectService.get(args.projectId))
    )

    this.server.registerTool(
      'list_presets',
      {
        description: 'List presets for a project',
        inputSchema: z.object({
          projectId: z.string().trim().min(1)
        }),
        annotations: { readOnlyHint: true }
      },
      async (args) => {
        const project = await this.dependencies.projectService.get(args.projectId)
        return this.asJsonToolResult(
          await this.dependencies.presetService.listForProject({
            path: project.path,
            ralphConfig: project.ralphConfig
          })
        )
      }
    )

    this.server.registerTool(
      'get_loop_runs',
      {
        description: 'List loop runs for a project or return a specific loop',
        inputSchema: z
          .object({
            projectId: z.string().trim().min(1).optional(),
            loopId: z.string().trim().min(1).optional()
          })
          .refine((input) => Boolean(input.loopId || input.projectId), {
            message: 'projectId is required when loopId is not provided'
          }),
        annotations: { readOnlyHint: true }
      },
      async (args: ReadOnlyLoopRunsInput) => {
        if (args.loopId) {
          return this.asJsonToolResult(await this.dependencies.loopService.get(args.loopId))
        }

        return this.asJsonToolResult(
          await this.dependencies.loopService.list(String(args.projectId))
        )
      }
    )

    this.server.registerTool(
      'get_loop_output',
      {
        description: 'Get recent loop output lines with a deep-link',
        inputSchema: z.object({
          loopId: z.string().trim().min(1),
          limit: z.number().int().positive().max(500).optional()
        }),
        annotations: { readOnlyHint: true }
      },
      async (args: LoopOutputInput) =>
        this.asJsonToolResult(await this.dependencies.loopService.getOutput(args))
    )

    this.server.registerTool(
      'get_monitoring',
      {
        description: 'Get monitoring status',
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true }
      },
      async () => this.asJsonToolResult(await this.dependencies.monitoringService.getStatus())
    )

    this.server.registerTool(
      'get_settings',
      {
        description: 'Get application settings',
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true }
      },
      async () => this.asJsonToolResult(await this.dependencies.settingsService.get())
    )

    this.server.registerTool(
      'list_hats_presets',
      {
        description: 'List hats presets',
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true }
      },
      async () => this.asJsonToolResult(await this.dependencies.hatsPresetService.list())
    )
  }

  private registerDestructiveTools() {
    this.server.registerTool(
      'start_loop',
      {
        description: '[DESTRUCTIVE] Start a Ralph loop run',
        inputSchema: z.object({
          projectId: z.string().trim().min(1),
          config: z.string().trim().min(1).optional(),
          prompt: z.string().trim().min(1).optional(),
          promptSnapshot: z.string().trim().min(1).optional(),
          promptFile: z.string().trim().min(1).optional(),
          backend: z
            .enum(['claude', 'kiro', 'gemini', 'codex', 'amp', 'copilot', 'opencode'])
            .optional(),
          exclusive: z.boolean().optional(),
          worktree: z.string().trim().min(1).optional()
        })
      },
      async (args: StartLoopInput) => {
        const { projectId, ...options } = args
        return this.asJsonToolResult(await this.dependencies.loopService.start(projectId, options))
      }
    )

    this.server.registerTool(
      'stop_loop',
      {
        description: '[DESTRUCTIVE] Stop a running loop',
        inputSchema: z.object({
          loopId: z.string().trim().min(1)
        })
      },
      async (args: StopLoopInput) => {
        await this.dependencies.loopService.stop(args.loopId)
        return this.asJsonToolResult(null)
      }
    )

    this.server.registerTool(
      'create_project',
      {
        description: '[DESTRUCTIVE] Create a new project',
        inputSchema: z.object({
          name: z.string().trim().min(1),
          path: z.string().trim().min(1),
          createIfMissing: z.boolean().optional()
        })
      },
      async (args: CreateProjectInput) =>
        this.asJsonToolResult(await this.dependencies.projectService.create(args))
    )

    this.server.registerTool(
      'update_project',
      {
        description: '[DESTRUCTIVE] Update project config',
        inputSchema: z
          .object({
            projectId: z.string().trim().min(1),
            name: z.string().trim().min(1).optional(),
            path: z.string().trim().min(1).optional()
          })
          .refine((input) => Boolean(input.name || input.path), {
            message: 'At least one update field is required'
          })
      },
      async (args: UpdateProjectInput) => {
        const { projectId, ...updates } = args
        return this.asJsonToolResult(
          await this.dependencies.projectService.update(projectId, updates)
        )
      }
    )

    this.server.registerTool(
      'delete_project',
      {
        description: '[DESTRUCTIVE] Delete a project',
        inputSchema: z.object({
          projectId: z.string().trim().min(1)
        })
      },
      async (args: DeleteProjectInput) => {
        await this.dependencies.projectService.delete(args.projectId)
        return this.asJsonToolResult(null)
      }
    )

    this.server.registerTool(
      'kill_process',
      {
        description: '[DESTRUCTIVE] Kill a specific Ralph process by PID',
        inputSchema: z.object({
          pid: z.number().int().positive()
        })
      },
      async (args: KillProcessInput) => {
        await this.dependencies.ralphProcessService.kill(args.pid)
        return this.asJsonToolResult(null)
      }
    )

    this.server.registerTool(
      'update_settings',
      {
        description: '[DESTRUCTIVE] Update app settings',
        inputSchema: z.object({
          ralphBinaryPath: z.string().trim().min(1).nullable().optional(),
          notifications: z
            .object({
              loopComplete: z.boolean().optional(),
              loopFailed: z.boolean().optional(),
              needsInput: z.boolean().optional()
            })
            .optional(),
          preview: z
            .object({
              portStart: z.number().int().positive().optional(),
              portEnd: z.number().int().positive().optional(),
              baseUrl: z.string().trim().min(1).nullable().optional(),
              command: z.string().trim().min(1).nullable().optional()
            })
            .optional()
        })
      },
      async (args: UpdateSettingsInput) =>
        this.asJsonToolResult(await this.dependencies.settingsService.update(args))
    )
  }

  private asJsonToolResult(payload: unknown) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(payload ?? null)
        }
      ]
    }
  }
}
