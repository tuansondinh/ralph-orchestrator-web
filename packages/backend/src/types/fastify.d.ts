import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { User } from '@supabase/supabase-js'
import type { ResolvedRuntimeMode } from '../config/runtimeMode.js'
import type { DatabaseConnection, DatabaseProvider } from '../db/connection.js'
import type { schema } from '../db/schema.js'
import type { ProcessManager } from '../runner/ProcessManager.js'
import type { LoopService } from '../services/LoopService.js'
import type { ChatService } from '../services/ChatService.js'
import type { MonitoringService } from '../services/MonitoringService.js'
import type { DevPreviewManager } from '../services/DevPreviewManager.js'
import type { TerminalService } from '../services/TerminalService.js'
import type { RalphProcessService } from '../services/RalphProcessService.js'
import type { McpChatService } from '../services/McpChatService.js'
import type { RalphMcpServer } from '../mcp/RalphMcpServer.js'
import type { ProjectService } from '../services/ProjectService.js'
import type { PresetService } from '../services/PresetService.js'
import type { SettingsService } from '../services/SettingsService.js'
import type { HatsPresetService } from '../services/HatsPresetService.js'
import type { TaskService } from '../services/TaskService.js'

declare module 'fastify' {
  interface FastifyInstance {
    runtimeConfig: ResolvedRuntimeMode
    db: BetterSQLite3Database<typeof schema>
    dbConnection: DatabaseConnection
    databaseProvider: DatabaseProvider
    processManager: ProcessManager
    loopService: LoopService
    chatService: ChatService
    monitoringService: MonitoringService
    previewService: DevPreviewManager
    terminalService: TerminalService
    ralphProcessService: RalphProcessService
    mcpChatService: McpChatService
    ralphMcpServer: RalphMcpServer
    projectService: ProjectService
    presetService: PresetService
    settingsService: SettingsService
    hatsPresetService: HatsPresetService
    taskService: TaskService
  }

  interface FastifyRequest {
    userId?: string
    supabaseUser?: User
  }
}
