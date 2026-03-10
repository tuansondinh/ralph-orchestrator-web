import { initTRPC } from '@trpc/server'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import type { Context } from './context.js'
import { ServiceError } from '../lib/ServiceError.js'
import {
  allowsDangerousOperations,
  getDangerousOperationBlockMessage
} from '../lib/safety.js'

const t = initTRPC.context<Context>().create()
const CHAT_BACKENDS = [
  'claude',
  'kiro',
  'gemini',
  'codex',
  'amp',
  'copilot',
  'opencode'
] as const
const chatBackendSchema = z.enum(CHAT_BACKENDS)
const chatSessionMutationInputSchema = z.object({
  projectId: z.string().min(1),
  type: z.enum(['plan', 'task']),
  backend: chatBackendSchema.optional(),
  initialInput: z.string().trim().min(1).optional()
})

function asTRPCError(error: unknown): never {
  if (error instanceof ServiceError) {
    throw new TRPCError({
      code: error.code,
      message: error.message
    })
  }

  throw error
}

function assertDangerousOperationAllowed(operation: string) {
  if (allowsDangerousOperations()) {
    return
  }

  throw new TRPCError({
    code: 'FORBIDDEN',
    message: getDangerousOperationBlockMessage(operation)
  })
}

function requireAuthenticatedUserId(ctx: Context) {
  if (!ctx.userId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required'
    })
  }

  return ctx.userId
}

function requireGitHubService(ctx: Context) {
  if (!ctx.githubService) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'GitHub connector is not configured'
    })
  }

  return ctx.githubService
}

const projectRouter = t.router({
  list: t.procedure.query(({ ctx }) => {
    const listPromise =
      ctx.runtime.mode === 'cloud' && ctx.userId
        ? ctx.projectService.findByUserId(ctx.userId)
        : ctx.projectService.list()

    return listPromise.catch((error) => asTRPCError(error))
  }),
  get: t.procedure
    .input(
      z.object({
        id: z.string().min(1)
      })
    )
    .query(({ ctx, input }) =>
      ctx.projectService
        .get(input.id)
        .catch((error) => asTRPCError(error))
    ),
  create: t.procedure
    .input(
      z.object({
        name: z.string().trim().min(1),
        path: z.string().trim().min(1),
        ralphConfig: z.string().trim().min(1).optional(),
        createIfMissing: z.boolean().optional()
      })
    )
    .mutation(({ ctx, input }) =>
      ctx.projectService
        .create(input)
        .catch((error) => asTRPCError(error))
    ),
  createFromGitHub: t.procedure
    .input(
      z.object({
        githubOwner: z.string().trim().min(1),
        githubRepo: z.string().trim().min(1),
        defaultBranch: z.string().trim().min(1),
        name: z.string().trim().min(1).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const githubService = requireGitHubService(ctx)
      const userId = requireAuthenticatedUserId(ctx)
      const githubToken = await githubService
        .getDecryptedToken(userId)
        .catch((error) => asTRPCError(error))

      return ctx.projectService
        .createFromGitHub({
          userId,
          githubOwner: input.githubOwner,
          githubRepo: input.githubRepo,
          defaultBranch: input.defaultBranch,
          githubToken,
          name: input.name
        })
        .catch((error) => asTRPCError(error))
    }),
  selectDirectory: t.procedure.mutation(({ ctx }) =>
    ctx.projectService
      .selectDirectory()
      .catch((error) => asTRPCError(error))
  ),
  update: t.procedure
    .input(
      z
        .object({
          id: z.string().min(1),
          name: z.string().trim().min(1).optional(),
          path: z.string().trim().min(1).optional()
        })
        .refine((input) => input.name !== undefined || input.path !== undefined, {
          message: 'At least one field must be updated'
        })
    )
    .mutation(({ ctx, input }) =>
      ctx.projectService
        .update(input.id, {
          name: input.name,
          path: input.path
        })
        .catch((error) => asTRPCError(error))
    ),
  delete: t.procedure
    .input(
      z.object({
        id: z.string().min(1)
      })
    )
    .mutation(({ ctx, input }) =>
      ctx.projectService
        .delete(input.id)
        .catch((error) => asTRPCError(error))
    ),
  getConfig: t.procedure
    .input(
      z.object({
        projectId: z.string().min(1)
      })
    )
    .query(({ ctx, input }) =>
      ctx.projectService
        .getConfig(input.projectId)
        .catch((error) => asTRPCError(error))
    ),
  getPrompt: t.procedure
    .input(
      z.object({
        projectId: z.string().min(1)
      })
    )
    .query(({ ctx, input }) =>
      ctx.projectService
        .getPrompt(input.projectId)
        .catch((error) => asTRPCError(error))
    ),
  listWorktrees: t.procedure
    .input(
      z.object({
        projectId: z.string().min(1)
      })
    )
    .query(({ ctx, input }) =>
      ctx.projectService
        .listWorktrees(input.projectId)
        .catch((error) => asTRPCError(error))
    ),
  createWorktree: t.procedure
    .input(
      z.object({
        projectId: z.string().min(1),
        name: z.string().trim().min(1)
      })
    )
    .mutation(({ ctx, input }) =>
      ctx.projectService
        .createWorktree(input.projectId, input.name)
        .catch((error) => asTRPCError(error))
    ),
  updateConfig: t.procedure
    .input(
      z
        .object({
          projectId: z.string().min(1),
          yaml: z.string().optional(),
          config: z.record(z.string(), z.unknown()).optional()
        })
        .refine((input) => input.yaml !== undefined || input.config !== undefined, {
          message: 'Either yaml or config is required'
        })
    )
    .mutation(({ ctx, input }) =>
      ctx.projectService
        .updateConfig(input.projectId, {
          yaml: input.yaml,
          config: input.config
        })
        .catch((error) => asTRPCError(error))
    ),
  updatePrompt: t.procedure
    .input(
      z.object({
        projectId: z.string().min(1),
        content: z.string()
      })
    )
    .mutation(({ ctx, input }) =>
      ctx.projectService
        .updatePrompt(input.projectId, { content: input.content })
        .catch((error) => asTRPCError(error))
    ),
  clearRalphCache: t.procedure
    .input(
      z.object({
        projectId: z.string().min(1)
      })
    )
    .mutation(({ ctx, input }) =>
      ctx.projectService
        .clearRalphCache(input.projectId)
        .catch((error) => asTRPCError(error))
    )
})

const loopRouter = t.router({
  list: t.procedure
    .input(
      z.object({
        projectId: z.string().min(1)
      })
    )
    .query(({ ctx, input }) =>
      ctx.loopService
        .list(input.projectId)
        .catch((error) => asTRPCError(error))
    ),
  start: t.procedure
    .input(
      z.object({
        projectId: z.string().min(1),
        config: z.string().trim().min(1).optional(),
        presetFilename: z.string().trim().min(1).optional(),
        prompt: z.string().trim().min(1).optional(),
        promptSnapshot: z.string().optional(),
        promptFile: z.string().trim().min(1).optional(),
        backend: chatBackendSchema.optional(),
        exclusive: z.boolean().optional(),
        worktree: z.string().trim().min(1).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      let config = input.config
      if (input.presetFilename) {
        const project = await ctx.projectService
          .get(input.projectId)
          .catch((error) => asTRPCError(error))

        config = await ctx.presetService
          .resolvePath(input.presetFilename, project.path)
          .catch((error) => asTRPCError(error))
      }

      return ctx.loopService
        .start(input.projectId, {
          config,
          prompt: input.prompt,
          promptSnapshot: input.promptSnapshot,
          promptFile: input.promptFile,
          backend: input.backend,
          exclusive: input.exclusive,
          worktree: input.worktree
        })
        .catch((error) => asTRPCError(error))
    }),
  stop: t.procedure
    .input(
      z.object({
        loopId: z.string().min(1)
      })
    )
    .mutation(({ ctx, input }) =>
      ctx.loopService.stop(input.loopId).catch((error) => asTRPCError(error))
    ),
  restart: t.procedure
    .input(
      z.object({
        loopId: z.string().min(1)
      })
    )
    .mutation(({ ctx, input }) =>
      ctx.loopService.restart(input.loopId).catch((error) => asTRPCError(error))
    ),
  getMetrics: t.procedure
    .input(
      z.object({
        loopId: z.string().min(1)
      })
    )
    .query(({ ctx, input }) =>
      ctx.loopService.getMetrics(input.loopId).catch((error) => asTRPCError(error))
    ),
  getDiff: t.procedure
    .input(
      z.object({
        loopId: z.string().min(1)
      })
    )
    .query(({ ctx, input }) =>
      ctx.loopService.getDiff(input.loopId).catch((error) => asTRPCError(error))
    )
})

const chatRouter = t.router({
  startSession: t.procedure
    .input(chatSessionMutationInputSchema)
    .mutation(({ ctx, input }) =>
      ctx.chatService
        .startSession(input.projectId, input.type, input.initialInput, input.backend)
        .catch((error) => asTRPCError(error))
    ),
  restartSession: t.procedure
    .input(chatSessionMutationInputSchema)
    .mutation(({ ctx, input }) =>
      ctx.chatService
        .restartSession(input.projectId, input.type, input.initialInput, input.backend)
        .catch((error) => asTRPCError(error))
    ),
  getProjectSession: t.procedure
    .input(
      z.object({
        projectId: z.string().min(1)
      })
    )
    .query(({ ctx, input }) =>
      ctx.chatService
        .getProjectSession(input.projectId)
        .catch((error) => asTRPCError(error))
    ),
  sendMessage: t.procedure
    .input(
      z.object({
        sessionId: z.string().min(1),
        message: z.string().trim().min(1)
      })
    )
    .mutation(({ ctx, input }) =>
      ctx.chatService
        .sendMessage(input.sessionId, input.message)
        .catch((error) => asTRPCError(error))
    ),
  endSession: t.procedure
    .input(
      z.object({
        sessionId: z.string().min(1)
      })
    )
    .mutation(({ ctx, input }) =>
      ctx.chatService
        .endSession(input.sessionId)
        .catch((error) => asTRPCError(error))
    ),
  getHistory: t.procedure
    .input(
      z.object({
        sessionId: z.string().min(1)
      })
    )
    .query(({ ctx, input }) =>
      ctx.chatService
        .getHistory(input.sessionId)
        .catch((error) => asTRPCError(error))
    )
})

const monitoringRouter = t.router({
  projectStatus: t.procedure
    .input(
      z.object({
        projectId: z.string().min(1)
      })
    )
    .query(({ ctx, input }) =>
      ctx.monitoringService
        .getProjectStatus(input.projectId)
        .catch((error) => asTRPCError(error))
    ),
  loopMetrics: t.procedure
    .input(
      z.object({
        loopId: z.string().min(1)
      })
    )
    .query(({ ctx, input }) =>
      ctx.monitoringService
        .getLoopMetrics(input.loopId)
        .catch((error) => asTRPCError(error))
    ),
  eventHistory: t.procedure
    .input(
      z.object({
        projectId: z.string().min(1),
        topic: z.string().trim().min(1).optional(),
        sourceHat: z.string().trim().min(1).optional(),
        limit: z.number().int().positive().max(500).optional()
      })
    )
    .query(({ ctx, input }) =>
      ctx.monitoringService
        .getEventHistory(input.projectId, {
          topic: input.topic,
          sourceHat: input.sourceHat,
          limit: input.limit
        })
        .catch((error) => asTRPCError(error))
    ),
  fileContent: t.procedure
    .input(
      z.object({
        loopId: z.string().min(1),
        path: z.string().trim().min(1)
      })
    )
    .query(({ ctx, input }) =>
      ctx.monitoringService
        .getFileContent(input.loopId, input.path)
        .catch((error) => asTRPCError(error))
    )
})

const previewRouter = t.router({
  start: t.procedure
    .input(
      z.object({
        projectId: z.string().min(1)
      })
    )
    .mutation(({ ctx, input }) =>
      ctx.previewService.start(input.projectId).catch((error) => asTRPCError(error))
    ),
  stop: t.procedure
    .input(
      z.object({
        projectId: z.string().min(1)
      })
    )
    .mutation(({ ctx, input }) =>
      ctx.previewService.stop(input.projectId).catch((error) => asTRPCError(error))
    ),
  status: t.procedure
    .input(
      z.object({
        projectId: z.string().min(1)
      })
    )
    .query(({ ctx, input }) =>
      ctx.previewService
        .getStatus(input.projectId)
        .catch((error) => asTRPCError(error))
    )
})

const notificationRouter = t.router({
  list: t.procedure
    .input(
      z
        .object({
          projectId: z.string().min(1).optional(),
          limit: z.number().int().positive().max(200).optional()
        })
        .optional()
    )
    .query(({ ctx, input }) =>
      ctx.loopService
        .listNotifications({
          projectId: input?.projectId,
          limit: input?.limit
        })
        .catch((error) => asTRPCError(error))
    ),
  markRead: t.procedure
    .input(
      z.object({
        notificationId: z.string().min(1)
      })
    )
    .mutation(({ ctx, input }) =>
      ctx.loopService
        .markNotificationRead(input.notificationId)
        .catch((error) => asTRPCError(error))
    )
})

const presetsRouter = t.router({
  list: t.procedure
    .input(
      z
        .object({
          projectId: z.string().min(1).optional()
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      let projectConfig
      if (input?.projectId) {
        const project = await ctx.projectService
          .get(input.projectId)
          .catch((error) => asTRPCError(error))
        projectConfig = {
          path: project.path,
          ralphConfig: project.ralphConfig
        }
      }

      return ctx.presetService
        .listForProject(projectConfig)
        .catch((error) => asTRPCError(error))
    }),
  get: t.procedure
    .input(
      z.object({
        filename: z.string().trim().min(1),
        projectId: z.string().min(1).optional()
      })
    )
    .query(async ({ ctx, input }) => {
      let projectPath
      if (input.projectId) {
        const project = await ctx.projectService
          .get(input.projectId)
          .catch((error) => asTRPCError(error))
        projectPath = project.path
      }

      return ctx.presetService
        .get(input.filename, projectPath)
        .catch((error) => asTRPCError(error))
    }),
  save: t.procedure
    .input(z.object({ name: z.string().trim().min(1), content: z.string().trim().min(1) }))
    .mutation(({ ctx, input }) =>
      ctx.presetService.save(input.name, input.content).catch((error) => asTRPCError(error))
    )
})

const hatsPresetsRouter = t.router({
  list: t.procedure.query(({ ctx }) =>
    ctx.hatsPresetService.list().catch((error) => asTRPCError(error))
  ),
  get: t.procedure
    .input(
      z.object({
        id: z.string().trim().min(1)
      })
    )
    .query(({ ctx, input }) =>
      ctx.hatsPresetService.get(input.id).catch((error) => asTRPCError(error))
    )
})

const previewSettingsRouter = t.router({
  get: t.procedure.query(({ ctx }) =>
    ctx.settingsService
      .getPreviewSettings()
      .catch((error) => asTRPCError(error))
  ),
  set: t.procedure
    .input(
      z
        .object({
          baseUrl: z.string().optional().nullable(),
          command: z.string().optional().nullable()
        })
        .refine(
          (input) => input.baseUrl !== undefined || input.command !== undefined,
          'At least one preview settings field is required'
        )
    )
    .mutation(({ ctx, input }) =>
      ctx.settingsService
        .updatePreviewSettings({
          baseUrl: input.baseUrl,
          command: input.command
        })
        .catch((error) => asTRPCError(error))
    )
})

const settingsRouter = t.router({
  get: t.procedure.query(({ ctx }) =>
    ctx.settingsService.get().catch((error) => asTRPCError(error))
  ),
  getDefaultPreset: t.procedure.query(({ ctx }) =>
    ctx.settingsService
      .getDefaultPreset()
      .catch((error) => asTRPCError(error))
  ),
  setDefaultPreset: t.procedure
    .input(
      z.object({
        filename: z.string().trim().min(1),
        projectId: z.string().min(1).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      let projectPath: string | undefined
      if (input.projectId) {
        const project = await ctx.projectService
          .get(input.projectId)
          .catch((error) => asTRPCError(error))
        projectPath = project.path
      }

      await ctx.presetService
        .resolvePath(input.filename, projectPath)
        .catch((error) => asTRPCError(error))
      return ctx.settingsService
        .setDefaultPreset(input.filename)
        .catch((error) => asTRPCError(error))
    }),
  update: t.procedure
    .input(
      z
        .object({
          chatModel: z.enum(['gemini', 'openai', 'claude']).optional(),
          ralphBinaryPath: z.string().optional().nullable(),
          appearance: z
            .object({
              theme: z.enum(['light', 'dark', 'system']).optional(),
              accentColor: z
                .string()
                .trim()
                .regex(/^#[0-9a-fA-F]{6}$/)
                .optional()
            })
            .optional(),
          notifications: z
            .object({
              loopComplete: z.boolean().optional(),
              loopFailed: z.boolean().optional(),
              needsInput: z.boolean().optional()
            })
            .optional(),
          preview: z
            .object({
              portStart: z.number().int().positive().max(65535).optional(),
              portEnd: z.number().int().positive().max(65535).optional(),
              baseUrl: z.string().optional().nullable(),
              command: z.string().optional().nullable()
            })
            .optional()
        })
        .optional()
    )
    .mutation(({ ctx, input }) =>
      ctx.settingsService
        .update(input ?? {})
        .catch((error) => asTRPCError(error))
    ),
  testBinary: t.procedure
    .input(
      z
        .object({
          path: z.string().optional()
        })
        .optional()
    )
    .mutation(({ ctx, input }) =>
      {
        assertDangerousOperationAllowed('settings.testBinary')
        return ctx.settingsService
          .testBinary(input?.path)
          .catch((error) => asTRPCError(error))
      }
    ),
  clearData: t.procedure
    .input(
      z.object({
        confirm: z.boolean()
      })
    )
    .mutation(({ ctx, input }) =>
      {
        assertDangerousOperationAllowed('settings.clearData')
        return ctx.settingsService
          .clearData(input.confirm)
          .catch((error) => asTRPCError(error))
      }
    )
})

const githubRouter = t.router({
  getConnection: t.procedure.query(async ({ ctx }) => {
    const githubService = requireGitHubService(ctx)
    const userId = requireAuthenticatedUserId(ctx)
    const connection = await githubService
      .getConnection(userId)
      .catch((error) => asTRPCError(error))

    if (!connection) {
      return null
    }

    return {
      githubUserId: connection.githubUserId,
      githubUsername: connection.githubUsername,
      scope: connection.scope,
      connectedAt: connection.connectedAt
    }
  }),
  listRepos: t.procedure
    .input(
      z.object({
        page: z.number().int().positive().optional()
      })
    )
    .query(({ ctx, input }) => {
      const githubService = requireGitHubService(ctx)
      const userId = requireAuthenticatedUserId(ctx)

      return githubService
        .getDecryptedToken(userId)
        .then((token) => githubService.listRepos(token, input.page ?? 1))
        .catch((error) => asTRPCError(error))
    }),
  disconnect: t.procedure.mutation(({ ctx }) => {
    const githubService = requireGitHubService(ctx)
    const userId = requireAuthenticatedUserId(ctx)

    return githubService.disconnect(userId).catch((error) => asTRPCError(error))
  })
})

const terminalRouter = t.router({
  startSession: t.procedure
    .input(
      z.object({
        projectId: z.string().min(1),
        cols: z.number().int().positive().optional(),
        rows: z.number().int().positive().optional(),
        initialCommand: z.string().trim().min(1).optional()
      })
    )
    .mutation(({ ctx, input }) => {
      assertDangerousOperationAllowed('terminal.startSession')
      if (!ctx.terminalService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Terminal service not initialized'
        })
      }
      return ctx.terminalService
        .startSession(input)
        .catch((error) => asTRPCError(error))
    }),
  getProjectSession: t.procedure
    .input(
      z.object({
        projectId: z.string().min(1)
      })
    )
    .query(({ ctx, input }) => {
      assertDangerousOperationAllowed('terminal.getProjectSession')
      if (!ctx.terminalService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Terminal service not initialized'
        })
      }
      return ctx.terminalService
        .getProjectSession(input.projectId)
        .catch((error) => asTRPCError(error))
    }),
  getProjectSessions: t.procedure
    .input(
      z.object({
        projectId: z.string().min(1)
      })
    )
    .query(({ ctx, input }) => {
      assertDangerousOperationAllowed('terminal.getProjectSessions')
      if (!ctx.terminalService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Terminal service not initialized'
        })
      }
      return ctx.terminalService
        .getProjectSessions(input.projectId)
        .catch((error) => asTRPCError(error))
    }),
  endSession: t.procedure
    .input(
      z.object({
        sessionId: z.string().min(1)
      })
    )
    .mutation(({ ctx, input }) => {
      assertDangerousOperationAllowed('terminal.endSession')
      if (!ctx.terminalService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Terminal service not initialized'
        })
      }
      try {
        ctx.terminalService.endSession(input.sessionId)
      } catch (error) {
        asTRPCError(error)
      }
    }),
  getOutputHistory: t.procedure
    .input(
      z.object({
        sessionId: z.string().min(1)
      })
    )
    .query(({ ctx, input }) => {
      assertDangerousOperationAllowed('terminal.getOutputHistory')
      if (!ctx.terminalService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Terminal service not initialized'
        })
      }
      return ctx.terminalService.replayOutput(input.sessionId)
    })
})

const ralphRouter = t.router({
  list: t.procedure.query(({ ctx }) => {
    assertDangerousOperationAllowed('ralph.list')
    if (!ctx.ralphProcessService) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ralph process service not initialized'
      })
    }
    return ctx.ralphProcessService.list().catch((error) => asTRPCError(error))
  }),
  kill: t.procedure
    .input(
      z.object({
        pid: z.number().int().positive()
      })
    )
    .mutation(({ ctx, input }) => {
      assertDangerousOperationAllowed('ralph.kill')
      if (!ctx.ralphProcessService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Ralph process service not initialized'
        })
      }
      return ctx.ralphProcessService.kill(input.pid).catch((error) => asTRPCError(error))
    }),
  killAll: t.procedure.mutation(({ ctx }) => {
    assertDangerousOperationAllowed('ralph.killAll')
    if (!ctx.ralphProcessService) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ralph process service not initialized'
      })
    }
    return ctx.ralphProcessService.killAll().catch((error) => asTRPCError(error))
  })
})

const taskRouter = t.router({
  list: t.procedure
    .input(
      z.object({
        projectId: z.string().min(1)
      })
    )
    .query(({ ctx, input }) =>
      ctx.taskService
        .list(input.projectId)
        .catch((error) => asTRPCError(error))
    )
})

export const appRouter = t.router({
  healthcheck: t.procedure.query(() => ({ status: 'ok' })),
  capabilities: t.procedure.query(({ ctx }) => {
    return ctx.runtime.capabilities
  }),
  project: projectRouter,
  loop: loopRouter,
  task: taskRouter,
  chat: chatRouter,
  monitoring: monitoringRouter,
  preview: previewRouter,
  previewSettings: previewSettingsRouter,
  notification: notificationRouter,
  presets: presetsRouter,
  hatsPresets: hatsPresetsRouter,
  settings: settingsRouter,
  github: githubRouter,
  terminal: terminalRouter,
  ralph: ralphRouter
})

export type AppRouter = typeof appRouter
