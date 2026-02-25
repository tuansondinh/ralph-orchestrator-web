import { initTRPC } from '@trpc/server'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import type { Context } from './context.js'
import { ProjectService, ProjectServiceError } from '../services/ProjectService.js'
import { LoopServiceError } from '../services/LoopService.js'
import { ChatServiceError } from '../services/ChatService.js'
import { MonitoringServiceError } from '../services/MonitoringService.js'
import { DevPreviewManagerError } from '../services/DevPreviewManager.js'
import { SettingsService, SettingsServiceError } from '../services/SettingsService.js'
import { PresetService, PresetServiceError } from '../services/PresetService.js'
import {
  HatsPresetService,
  HatsPresetServiceError
} from '../services/HatsPresetService.js'
import { TerminalServiceError } from '../services/TerminalService.js'
import { TaskService, TaskServiceError } from '../services/TaskService.js'
import {
  allowsDangerousOperations,
  getDangerousOperationBlockMessage
} from '../lib/safety.js'

const t = initTRPC.context<Context>().create()

function asTRPCError(error: unknown): never {
  if (
    error instanceof ProjectServiceError ||
    error instanceof LoopServiceError ||
    error instanceof ChatServiceError ||
    error instanceof MonitoringServiceError ||
    error instanceof DevPreviewManagerError ||
    error instanceof SettingsServiceError ||
    error instanceof PresetServiceError ||
    error instanceof HatsPresetServiceError ||
    error instanceof TerminalServiceError ||
    error instanceof TaskServiceError
  ) {
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

const projectRouter = t.router({
  list: t.procedure.query(({ ctx }) =>
    new ProjectService(ctx.db).list().catch((error) => asTRPCError(error))
  ),
  get: t.procedure
    .input(
      z.object({
        id: z.string().min(1)
      })
    )
    .query(({ ctx, input }) =>
      new ProjectService(ctx.db)
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
      new ProjectService(ctx.db)
        .create(input)
        .catch((error) => asTRPCError(error))
    ),
  selectDirectory: t.procedure.mutation(({ ctx }) =>
    new ProjectService(ctx.db)
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
      new ProjectService(ctx.db)
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
      new ProjectService(ctx.db)
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
      new ProjectService(ctx.db)
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
      new ProjectService(ctx.db)
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
      new ProjectService(ctx.db)
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
      new ProjectService(ctx.db)
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
      new ProjectService(ctx.db)
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
      new ProjectService(ctx.db)
        .updatePrompt(input.projectId, { content: input.content })
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
        backend: z
          .enum(['claude', 'kiro', 'gemini', 'codex', 'amp', 'copilot', 'opencode'])
          .optional(),
        exclusive: z.boolean().optional(),
        worktree: z.string().trim().min(1).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      let config = input.config
      if (input.presetFilename) {
        const project = await new ProjectService(ctx.db)
          .get(input.projectId)
          .catch((error) => asTRPCError(error))

        config = await new PresetService()
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
    .input(
      z.object({
        projectId: z.string().min(1),
        type: z.enum(['plan', 'task']),
        backend: z
          .enum(['claude', 'kiro', 'gemini', 'codex', 'amp', 'copilot', 'opencode'])
          .optional(),
        initialInput: z.string().trim().min(1).optional()
      })
    )
    .mutation(({ ctx, input }) =>
      ctx.chatService
        .startSession(input.projectId, input.type, input.initialInput, input.backend)
        .catch((error) => asTRPCError(error))
    ),
  restartSession: t.procedure
    .input(
      z.object({
        projectId: z.string().min(1),
        type: z.enum(['plan', 'task']),
        backend: z
          .enum(['claude', 'kiro', 'gemini', 'codex', 'amp', 'copilot', 'opencode'])
          .optional(),
        initialInput: z.string().trim().min(1).optional()
      })
    )
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
        const project = await new ProjectService(ctx.db)
          .get(input.projectId)
          .catch((error) => asTRPCError(error))
        projectConfig = {
          path: project.path,
          ralphConfig: project.ralphConfig
        }
      }

      return new PresetService()
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
        const project = await new ProjectService(ctx.db)
          .get(input.projectId)
          .catch((error) => asTRPCError(error))
        projectPath = project.path
      }

      return new PresetService()
        .get(input.filename, projectPath)
        .catch((error) => asTRPCError(error))
    })
})

const hatsPresetsRouter = t.router({
  list: t.procedure.query(() =>
    new HatsPresetService().list().catch((error) => asTRPCError(error))
  ),
  get: t.procedure
    .input(
      z.object({
        id: z.string().trim().min(1)
      })
    )
    .query(({ input }) =>
      new HatsPresetService().get(input.id).catch((error) => asTRPCError(error))
    )
})

const previewSettingsRouter = t.router({
  get: t.procedure.query(({ ctx }) =>
    new SettingsService(ctx.db)
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
      new SettingsService(ctx.db)
        .updatePreviewSettings({
          baseUrl: input.baseUrl,
          command: input.command
        })
        .catch((error) => asTRPCError(error))
    )
})

const settingsRouter = t.router({
  get: t.procedure.query(({ ctx }) =>
    new SettingsService(ctx.db).get().catch((error) => asTRPCError(error))
  ),
  getDefaultPreset: t.procedure.query(({ ctx }) =>
    new SettingsService(ctx.db)
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
        const project = await new ProjectService(ctx.db)
          .get(input.projectId)
          .catch((error) => asTRPCError(error))
        projectPath = project.path
      }

      await new PresetService()
        .resolvePath(input.filename, projectPath)
        .catch((error) => asTRPCError(error))
      return new SettingsService(ctx.db)
        .setDefaultPreset(input.filename)
        .catch((error) => asTRPCError(error))
    }),
  update: t.procedure
    .input(
      z
        .object({
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
      new SettingsService(ctx.db)
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
        return new SettingsService(ctx.db)
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
        return new SettingsService(ctx.db)
          .clearData(input.confirm)
          .catch((error) => asTRPCError(error))
      }
    )
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
      new TaskService(ctx.db)
        .list(input.projectId)
        .catch((error) => asTRPCError(error))
    )
})

export const appRouter = t.router({
  healthcheck: t.procedure.query(() => ({ status: 'ok' })),
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
  terminal: terminalRouter,
  ralph: ralphRouter
})

export type AppRouter = typeof appRouter
