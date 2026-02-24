import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { DatabaseConnection } from '../db/connection.js'
import type { schema } from '../db/schema.js'
import type { ProcessManager } from '../runner/ProcessManager.js'
import type { LoopService } from '../services/LoopService.js'
import type { ChatService } from '../services/ChatService.js'
import type { MonitoringService } from '../services/MonitoringService.js'
import type { DevPreviewManager } from '../services/DevPreviewManager.js'
import type { TerminalService } from '../services/TerminalService.js'
import type { RalphProcessService } from '../services/RalphProcessService.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: BetterSQLite3Database<typeof schema>
    dbConnection: DatabaseConnection
    processManager: ProcessManager
    loopService: LoopService
    chatService: ChatService
    monitoringService: MonitoringService
    previewService: DevPreviewManager
    terminalService: TerminalService
    ralphProcessService: RalphProcessService
  }
}
