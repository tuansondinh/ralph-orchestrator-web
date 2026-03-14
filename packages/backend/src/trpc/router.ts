import { initTRPC } from '@trpc/server'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import type { Context } from './context.js'
import { ServiceError } from '../lib/ServiceError.js'
import {
  allowsDangerousOperations,
  getDangerousOperationBlockMessage
} from '../lib/safety.js'
import { CHAT_PROVIDERS } from '../lib/chatProviderConfig.js'

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
const chatProviderSchema = z.enum(CHAT_PROVIDERS)
const chatSessionMutationInputSchema = z.object({
  projectId: z.string().min(1),
  type: z.enum(['plan', 'task']),
  backend: chatBackendSchema.optional(),
  initialInput: z.string().trim().min(1).optional()
})
const githubRepoListInputSchema = z
  .object({
    page: z.number().int().positive().optional(),
    perPage: z.number().int().positive().max(100).optional()
  })
  .optional()
const createNewGitHubProjectInputSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  private: z.boolean()
})
const importGitHubProjectInputSchema = z.object({
  owner: z.string().trim().min(1),
  repo: z.string().trim().min(1),
  defaultBranch: z.string().trim().min(1),
  name: z.string().trim().min(1).optional()
})
const createGitHubProjectInputSchema = z.union([
  createNewGitHubProjectInputSchema,
  importGitHubProjectInputSchema
])

function asTRPCError(error: unknown): never {
  if (error instanceof ServiceError) {
    throw new TRPCError({
      code: error.code,
      message: error.message
    })
  }

  throw error
}

function asCloudProjectCreationError(error: unknown): never {
  if (error instanceof ServiceError) {
    return asTRPCError(error)
  }

  throw new TRPCError({
    code: 'BAD_REQUEST',
    message:
      error instanceof Error ? error.message : 'Unable to create GitHub project.'
  })
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

function assertCloudGitHubAvailable(ctx: Context) {
  if (!ctx.runtime.capabilities.auth || !ctx.runtime.capabilities.githubProjects) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'GitHub procedures are unavailable in this runtime mode.'
    })
  }
}

function requireAuthenticatedCloudUser(ctx: Context) {
  assertCloudGitHubAvailable(ctx)

  if (!ctx.userId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required in cloud mode.'
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

async function requireProjectAccess(ctx: Context, projectId: string) {
  const project = await ctx.projectService.get(projectId).catch((error) => asTRPCError(error))

  if (ctx.runtime.capabilities.auth) {
    const userId = requireAuthenticatedCloudUser(ctx)
    const projectOwnerId = (project as { userId?: string | null }).userId
    if (projectOwnerId !== userId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not have access to this project.'
      })
    }
  }

  return project
}

const projectRouter = t.router({
  list: t.procedure.query(({ ctx }) => {
    if (ctx.runtime.capabilities.auth) {
      const userId = requireAuthenticatedCloudUser(ctx)
      return ctx.projectService
        .findByUserId(userId)
        .catch((error) => asTRPCError(error))
    }

    return ctx.projectService.list().catch((error) => asTRPCError(error))
  }),
  listGitHubRepos: t.procedure
    .input(githubRepoListInputSchema)
    .query(({ ctx, input }) => {
      const userId = requireAuthenticatedCloudUser(ctx)
      const githubService = requireGitHubService(ctx)

      return githubService
        .listConnectedRepos(userId, input?.page, input?.perPage)
        .catch((error) => {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              error instanceof Error ? error.message : 'Unable to list GitHub repositories.'
          })
        })
    }),
  createFromGitHub: t.procedure
    .input(createGitHubProjectInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = requireAuthenticatedCloudUser(ctx)
      const githubService = requireGitHubService(ctx)

      if ('owner' in input) {
        const githubToken = await githubService.getDecryptedToken(userId).catch((error) => {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              error instanceof Error ? error.message : 'Unable to read GitHub connection.'
          })
        })

        return ctx.projectService
          .createFromGitHub({
            userId,
            githubOwner: input.owner,
            githubRepo: input.repo,
            defaultBranch: input.defaultBranch,
            githubToken,
            name: input.name
          })
          .catch((error) => asCloudProjectCreationError(error))
      }

      return ctx.projectService
        .createFromGitHub({
          userId,
          name: input.name,
          description: input.description,
          private: input.private
        })
        .catch((error) => asCloudProjectCreationError(error))
    }),
  get: t.procedure
    .input(
      z.object({
        id: z.string().min(1)
      })
    )
    .query(({ ctx, input }) => requireProjectAccess(ctx, input.id)),
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
      requireProjectAccess(ctx, input.id)
        .then(() =>
          ctx.projectService.update(input.id, {
            name: input.name,
            path: input.path
          })
        )
        .catch((error) => asTRPCError(error))
    ),
  delete: t.procedure
    .input(
      z.object({
        id: z.string().min(1)
      })
    )
    .mutation(({ ctx, input }) =>
      requireProjectAccess(ctx, input.id)
        .then(() => ctx.projectService.delete(input.id))
        .catch((error) => asTRPCError(error))
    ),
  getConfig: t.procedure
    .input(
      z.object({
        projectId: z.string().min(1)
      })
    )
    .query(({ ctx, input }) =>
      requireProjectAccess(ctx, input.projectId)
        .then(() => ctx.projectService.getConfig(input.projectId))
        .catch((error) => asTRPCError(error))
    ),
  getPrompt: t.procedure
    .input(
      z.object({
        projectId: z.string().min(1)
      })
    )
    .query(({ ctx, input }) =>
      requireProjectAccess(ctx, input.projectId)
        .then(() => ctx.projectService.getPrompt(input.projectId))
        .catch((error) => asTRPCError(error))
    ),
  listWorktrees: t.procedure
    .input(
      z.object({
        projectId: z.string().min(1)
      })
    )
    .query(({ ctx, input }) =>
      requireProjectAccess(ctx, input.projectId)
        .then(() => ctx.projectService.listWorktrees(input.projectId))
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
      requireProjectAccess(ctx, input.projectId)
        .then(() => ctx.projectService.createWorktree(input.projectId, input.name))
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
      requireProjectAccess(ctx, input.projectId)
        .then(() =>
          ctx.projectService.updateConfig(input.projectId, {
            yaml: input.yaml,
            config: input.config
          })
        )
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
      requireProjectAccess(ctx, input.projectId)
        .then(() =>
          ctx.projectService.updatePrompt(input.projectId, { content: input.content })
        )
        .catch((error) => asTRPCError(error))
    ),
  clearRalphCache: t.procedure
    .input(
      z.object({
        projectId: z.string().min(1)
      })
    )
    .mutation(({ ctx, input }) =>
      requireProjectAccess(ctx, input.projectId)
        .then(() => ctx.projectService.clearRalphCache(input.projectId))
        .catch((error) => asTRPCError(error))
    )
})

const loopRouter = t.router({
  get: t.procedure
    .input(
      z.object({
        loopId: z.string().min(1)
      })
    )
    .query(({ ctx, input }) =>
      ctx.loopService
        .get(input.loopId)
        .catch((error) => asTRPCError(error))
    ),
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
  listBranches: t.procedure
    .input(
      z.object({
        projectId: z.string().min(1)
      })
    )
    .query(({ ctx, input }) =>
      ctx.loopService
        .listBranches(input.projectId)
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
        worktree: z.string().trim().min(1).optional(),
        gitBranch: z
          .object({
            mode: z.enum(['new', 'existing']),
            name: z.string().trim().min(1),
            baseBranch: z.string().trim().min(1).optional()
          })
          .optional(),
        autoPush: z.boolean().optional()
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
          worktree: input.worktree,
          gitBranch: input.gitBranch,
          autoPush: input.autoPush
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
  retryPush: t.procedure
    .input(
      z.object({
        loopId: z.string().min(1)
      })
    )
    .mutation(({ ctx, input }) =>
      ctx.loopService.retryPush(input.loopId).catch((error) => asTRPCError(error))
    ),
  createPullRequest: t.procedure
    .input(
      z.object({
        loopId: z.string().min(1),
        targetBranch: z.string().trim().min(1),
        title: z.string().trim().min(1).optional(),
        body: z.string().optional(),
        draft: z.boolean().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = requireAuthenticatedUserId(ctx)
      const githubService = requireGitHubService(ctx)
      const githubToken = await githubService.getDecryptedToken(userId).catch((error) => {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            error instanceof Error ? error.message : 'Unable to read GitHub connection.'
        })
      })

      return ctx.loopService
        .createPullRequest({
          loopId: input.loopId,
          targetBranch: input.targetBranch,
          title: input.title,
          body: input.body,
          draft: input.draft,
          token: githubToken
        })
        .catch((error) => asTRPCError(error))
    }),
  getMetrics: t.procedure
    .input(
      z.object({
        loopId: z.string().min(1)
      })
    )
    .query(({ ctx, input }) =>
      ctx.loopService.getMetrics(input.loopId).catch((error) => asTRPCError(error))
    ),
  getRecentEvents: t.procedure
    .input(
      z.object({
        loopId: z.string().min(1),
        limit: z.number().int().positive().max(50).optional()
      })
    )
    .query(({ ctx, input }) =>
      ctx.loopService
        .getRecentEvents(input.loopId, { limit: input.limit })
        .catch((error) => asTRPCError(error))
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
  githubConnection: t.procedure.query(({ ctx }) => {
    const userId = requireAuthenticatedCloudUser(ctx)
    const githubService = requireGitHubService(ctx)

    return githubService.getConnection(userId).then((connection) => {
      if (!connection) {
        return {
          connected: false as const,
          githubUsername: null,
          connectedAt: null
        }
      }

      return {
        connected: true as const,
        githubUsername: connection.githubUsername,
        connectedAt: connection.connectedAt
      }
    })
  }),
  disconnectGitHub: t.procedure.mutation(({ ctx }) => {
    const userId = requireAuthenticatedCloudUser(ctx)
    const githubService = requireGitHubService(ctx)

    return githubService.disconnect(userId).then(() => ({
      disconnected: true as const
    }))
  }),
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
          chatModel: z.string().trim().min(1).optional(),
          chatProvider: chatProviderSchema.optional(),
          opencodeModel: z.string().trim().min(1).optional(),
          providerApiKeys: z
            .object({
              anthropic: z.string().trim().min(1).nullable().optional(),
              openai: z.string().trim().min(1).nullable().optional(),
              google: z.string().trim().min(1).nullable().optional()
            })
            .optional(),
          providerApiKey: z
            .object({
              provider: z.enum(CHAT_PROVIDERS),
              value: z.string().optional().nullable()
            })
            .optional(),
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
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.settingsService
        .update(input ?? {})
        .catch((error) => asTRPCError(error))

      try {
        await ctx.openCodeService?.updateModel(updated.chatProvider, updated.opencodeModel)
      } catch {}

      return updated
    }),
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
