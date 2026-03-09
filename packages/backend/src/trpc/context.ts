/// <reference path="../types/fastify.d.ts" />
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { ResolvedRuntimeMode } from '../config/runtimeMode.js'
import type { schema } from '../db/schema.js'
import type { ProcessManager } from '../runner/ProcessManager.js'
import type { LoopService } from '../services/LoopService.js'
import type { ChatService } from '../services/ChatService.js'
import type { MonitoringService } from '../services/MonitoringService.js'
import type { DevPreviewManager } from '../services/DevPreviewManager.js'
import type { TerminalService } from '../services/TerminalService.js'
import type { RalphProcessService } from '../services/RalphProcessService.js'
import type { ProjectService } from '../services/ProjectService.js'
import type { PresetService } from '../services/PresetService.js'
import type { SettingsService } from '../services/SettingsService.js'
import type { HatsPresetService } from '../services/HatsPresetService.js'
import type { TaskService } from '../services/TaskService.js'

export interface Context {
  runtime: ResolvedRuntimeMode
  db: BetterSQLite3Database<typeof schema>
  processManager: ProcessManager
  loopService: LoopService
  chatService: ChatService
  monitoringService: MonitoringService
  previewService: DevPreviewManager
  terminalService?: TerminalService
  ralphProcessService?: RalphProcessService
  projectService: ProjectService
  presetService: PresetService
  settingsService: SettingsService
  hatsPresetService: HatsPresetService
  taskService: TaskService
}

export function createContext(opts: CreateFastifyContextOptions): Context {
  return {
    runtime: opts.req.server.runtimeConfig,
    db: opts.req.server.db,
    processManager: opts.req.server.processManager,
    loopService: opts.req.server.loopService,
    chatService: opts.req.server.chatService,
    monitoringService: opts.req.server.monitoringService,
    previewService: opts.req.server.previewService,
    terminalService: opts.req.server.terminalService,
    ralphProcessService: opts.req.server.ralphProcessService,
    projectService: opts.req.server.projectService,
    presetService: opts.req.server.presetService,
    settingsService: opts.req.server.settingsService,
    hatsPresetService: opts.req.server.hatsPresetService,
    taskService: opts.req.server.taskService
  }
}
