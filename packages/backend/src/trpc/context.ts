import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { schema } from '../db/schema.js'
import type { ProcessManager } from '../runner/ProcessManager.js'
import type { LoopService } from '../services/LoopService.js'
import type { ChatService } from '../services/ChatService.js'
import type { MonitoringService } from '../services/MonitoringService.js'
import type { DevPreviewManager } from '../services/DevPreviewManager.js'
import type { TerminalService } from '../services/TerminalService.js'
import type { RalphProcessService } from '../services/RalphProcessService.js'

export interface Context {
  db: BetterSQLite3Database<typeof schema>
  processManager: ProcessManager
  loopService: LoopService
  chatService: ChatService
  monitoringService: MonitoringService
  previewService: DevPreviewManager
  terminalService?: TerminalService
  ralphProcessService?: RalphProcessService
}

export function createContext(opts: CreateFastifyContextOptions): Context {
  return {
    db: opts.req.server.db,
    processManager: opts.req.server.processManager,
    loopService: opts.req.server.loopService,
    chatService: opts.req.server.chatService,
    monitoringService: opts.req.server.monitoringService,
    previewService: opts.req.server.previewService,
    terminalService: opts.req.server.terminalService,
    ralphProcessService: opts.req.server.ralphProcessService
  }
}
