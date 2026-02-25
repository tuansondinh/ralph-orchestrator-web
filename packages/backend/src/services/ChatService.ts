import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { stripVTControlCharacters } from 'node:util'
import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import {
  chatMessages,
  chatSessions,
  projects,
  type ChatMessage,
  type ChatSession,
  schema
} from '../db/schema.js'
import { resolveRalphBinary } from '../lib/ralph.js'
import { ProcessManager, type OutputChunk, type ProcessState } from '../runner/ProcessManager.js'

type ServiceErrorCode = 'BAD_REQUEST' | 'NOT_FOUND' | 'CONFLICT'
type ChatState = 'active' | 'waiting' | 'completed'

export type ChatSessionType = 'plan' | 'task' | 'loop'
export type ChatSessionBackend =
  | 'claude'
  | 'kiro'
  | 'gemini'
  | 'codex'
  | 'amp'
  | 'copilot'
  | 'opencode'
export type ChatRole = 'user' | 'assistant'
const DEFAULT_CHAT_BACKEND: ChatSessionBackend = 'codex'

export interface ChatSessionSummary {
  id: string
  projectId: string
  type: ChatSessionType
  backend: ChatSessionBackend
  state: ChatState
  processId: string | null
  createdAt: number
  endedAt: number | null
}

export interface ChatMessageSummary {
  id: string
  sessionId: string
  role: ChatRole
  content: string
  timestamp: number
}

interface ChatServiceOptions {
  resolveBinary?: () => Promise<string>
  now?: () => Date
  logger?: ChatLogger
}

interface ChatLogger {
  debug: (context: Record<string, unknown>, message: string) => void
  info: (context: Record<string, unknown>, message: string) => void
  error: (context: Record<string, unknown>, message: string) => void
}

interface ChatRuntime {
  processId: string | null
  active: boolean
  backend: ChatSessionBackend
  parser: ChatOutputParser
  unsubOutput: () => void
  unsubState: () => void
}

type Database = BetterSQLite3Database<typeof schema>

const MESSAGE_EVENT_PREFIX = 'chat-message:'
const STATE_EVENT_PREFIX = 'chat-state:'
const C0_CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g
const MAX_BUFFERED_MESSAGE_CHARS = 1_200
const NOOP_LOGGER: ChatLogger = {
  debug: () => { },
  info: () => { },
  error: () => { }
}

export class ChatServiceError extends Error {
  code: ServiceErrorCode

  constructor(code: ServiceErrorCode, message: string) {
    super(message)
    this.name = 'ChatServiceError'
    this.code = code
  }
}

class ChatOutputParser {
  private lineBuffer = ''
  private messageBuffer = ''
  private escapeRemainder = ''

  parseChunk(chunk: string) {
    const messages: string[] = []
    let waiting = false

    const sanitized = this.sanitizeChunk(chunk)
    for (let index = 0; index < sanitized.length; index += 1) {
      const char = sanitized[index]

      if (char === '\r') {
        const next = sanitized[index + 1]
        if (next === '\n') {
          continue
        }

        // PTY streams may emit bare CR as either redraw or line terminator.
        // Treat it as a soft line break to avoid dropping output lines.
        if (this.lineBuffer.length > 0) {
          if (this.consumeLine(this.lineBuffer, messages)) {
            waiting = true
          }
          this.lineBuffer = ''
        }
        continue
      }

      if (char === '\n') {
        if (this.consumeLine(this.lineBuffer, messages)) {
          waiting = true
        }
        this.lineBuffer = ''
        continue
      }

      this.lineBuffer += char
    }

    if (this.lineBuffer.trim().length > 0 && looksLikePrompt(this.lineBuffer.trim())) {
      if (this.consumeLine(this.lineBuffer, messages)) {
        waiting = true
      }
      this.lineBuffer = ''
    }

    return { messages, waiting }
  }

  flushRemaining() {
    const messages: string[] = []

    if (this.lineBuffer.length > 0) {
      this.appendLine(this.cleanLine(this.lineBuffer))
    }
    this.lineBuffer = ''
    this.flushMessage(messages)

    return messages
  }

  private consumeLine(line: string, messages: string[]) {
    const cleaned = this.cleanLine(line)
    const trimmed = cleaned.trim()

    if (trimmed.length === 0) {
      this.flushMessage(messages)
      return false
    }

    if (looksLikePrompt(trimmed)) {
      this.flushMessage(messages)
      return true
    }

    this.appendLine(cleaned)
    if (this.messageBuffer.length >= MAX_BUFFERED_MESSAGE_CHARS) {
      this.flushMessage(messages)
    }

    return false
  }

  private appendLine(value: string) {
    if (value.length === 0) {
      if (!this.messageBuffer || this.messageBuffer.endsWith('\n\n')) {
        return
      }
      this.messageBuffer += '\n'
      return
    }

    this.messageBuffer = this.messageBuffer ? `${this.messageBuffer}\n${value}` : value
  }

  private flushMessage(messages: string[]) {
    const normalized = this.messageBuffer.trim()
    this.messageBuffer = ''
    if (normalized.length > 0) {
      messages.push(normalized)
    }
  }

  private sanitizeChunk(chunk: string) {
    const combined = `${this.escapeRemainder}${chunk}`
    this.escapeRemainder = findTrailingEscapePrefix(combined)
    const stableText = this.escapeRemainder
      ? combined.slice(0, -this.escapeRemainder.length)
      : combined

    return stripVTControlCharacters(stableText).replace(C0_CONTROL_CHAR_PATTERN, '')
  }

  private cleanLine(line: string) {
    return line.replace(C0_CONTROL_CHAR_PATTERN, '')
  }
}

function findTrailingEscapePrefix(input: string) {
  const esc = '\u001B'
  const csi = '\u009B'
  const lastEsc = input.lastIndexOf(esc)
  const lastCsi = input.lastIndexOf(csi)
  const start = Math.max(lastEsc, lastCsi)
  if (start === -1) {
    return ''
  }

  const suffix = input.slice(start)
  if (lastEsc === start) {
    const second = suffix[1]
    if (!second) {
      return suffix
    }

    if (second === '[') {
      return /[\x40-\x7E]$/.test(suffix) ? '' : suffix
    }

    if (second === ']') {
      return /\u0007$|\u001B\\$/.test(suffix) ? '' : suffix
    }

    return suffix.length >= 2 ? '' : suffix
  }

  return /[\x40-\x7E]$/.test(suffix) ? '' : suffix
}

function looksLikePrompt(text: string) {
  const trimmed = text.trim()
  if (!trimmed) {
    return false
  }

  if (/^(>|>>)\s*$/.test(trimmed)) {
    return true
  }

  if (/^(you|user|input|answer|reply)\s*[:>]\s*$/i.test(trimmed)) {
    return true
  }

  if (
    /(?:your\s+input|enter\s+your|provide\s+input|waiting\s+for\s+input)/i.test(trimmed)
  ) {
    return true
  }

  if (/continue\s+anyway\?\s*\[[^\]]+\]:?\s*$/i.test(trimmed)) {
    return true
  }

  if (/^\s*[›>]\s*$/.test(trimmed)) {
    return true
  }

  if (/\b\d+%\s+context\s+left\b/i.test(trimmed)) {
    return true
  }

  if (/\?\s*for\s+shortcuts\b/i.test(trimmed)) {
    return true
  }

  return false
}

export class ChatService {
  private readonly resolveBinary: () => Promise<string>
  private readonly now: () => Date
  private readonly logger: ChatLogger
  private readonly runtimes = new Map<string, ChatRuntime>()
  private readonly sessionBackends = new Map<string, ChatSessionBackend>()
  private readonly events = new EventEmitter()

  constructor(
    private readonly db: Database,
    private readonly processManager: ProcessManager,
    options: ChatServiceOptions = {}
  ) {
    this.resolveBinary = options.resolveBinary ?? (() => resolveRalphBinary())
    this.now = options.now ?? (() => new Date())
    this.logger = options.logger ?? NOOP_LOGGER
  }

  async startSession(
    projectId: string,
    type: ChatSessionType,
    initialInput?: string,
    backend: ChatSessionBackend = DEFAULT_CHAT_BACKEND
  ): Promise<ChatSessionSummary> {
    const project = this.requireProject(projectId)

    const activeSession = await this.getActiveSessionForProject(projectId)
    if (activeSession) {
      this.logger.debug(
        {
          projectId,
          sessionId: activeSession.id
        },
        '[ChatService] Reusing active session'
      )
      return this.toSessionSummary(activeSession)
    }

    const sessionId = randomUUID()
    await this.startRuntime(sessionId, projectId, type, backend, project.path)

    const nowMs = this.now().getTime()
    await this.db
      .insert(chatSessions)
      .values({
        id: sessionId,
        projectId,
        type,
        state: 'active',
        createdAt: nowMs,
        endedAt: null
      })
      .run()

    this.events.emit(`${STATE_EVENT_PREFIX}${sessionId}`, 'active')
    this.logger.info(
      {
        projectId,
        sessionId,
        type,
        backend,
        processId: this.runtimes.get(sessionId)?.processId ?? null,
        initialInputLength: initialInput?.trim().length ?? 0
      },
      '[ChatService] Session started'
    )

    if (initialInput && initialInput.trim().length > 0) {
      await this.sendMessage(sessionId, initialInput)
    }

    return this.getSession(sessionId)
  }

  async sendMessage(sessionId: string, message: string): Promise<void> {
    const content = message.trim()
    if (!content) {
      throw new ChatServiceError('BAD_REQUEST', 'Message is required')
    }

    const session = await this.requireSession(sessionId)
    if (session.state === 'completed') {
      throw new ChatServiceError(
        'BAD_REQUEST',
        `Chat session is already completed: ${sessionId}`
      )
    }

    let runtime = this.runtimes.get(sessionId)
    let startedRuntime = false
    if (!runtime?.active || !runtime.processId) {
      const project = this.requireProject(session.projectId)
      runtime = await this.startRuntime(
        sessionId,
        session.projectId,
        session.type as ChatSessionType,
        this.resolveSessionBackend(sessionId),
        project.path
      )
      startedRuntime = true
    }

    const timestamp = this.now().getTime()
    await this.db
      .insert(chatMessages)
      .values({
        id: randomUUID(),
        sessionId,
        role: 'user',
        content,
        timestamp
      })
      .run()

    await this.setSessionState(sessionId, 'active')

    const processId = runtime.processId
    if (!processId) {
      throw new ChatServiceError('BAD_REQUEST', `Chat session is not running: ${sessionId}`)
    }

    try {
      if (startedRuntime) {
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
      this.processManager.sendInput(processId, `${content}\r\n`)
      this.logger.debug(
        {
          sessionId,
          processId,
          messageLength: content.length
        },
        '[ChatService] Message sent'
      )
    } catch (error) {
      this.logger.error(
        {
          sessionId,
          processId,
          error: error instanceof Error ? error.message : String(error)
        },
        '[ChatService] Failed to send message'
      )
      throw new ChatServiceError(
        'BAD_REQUEST',
        error instanceof Error ? error.message : 'Unable to send message to session'
      )
    }
  }

  async endSession(sessionId: string): Promise<void> {
    const session = await this.requireSession(sessionId)
    const runtime = this.runtimes.get(sessionId)

    if (runtime?.active && runtime.processId) {
      const processId = runtime.processId
      runtime.unsubOutput()
      runtime.unsubState()
      runtime.active = false
      runtime.processId = null

      this.runtimes.set(sessionId, runtime)
      await this.processManager.kill(processId)
    }

    if (session.state !== 'completed') {
      await this.setSessionState(sessionId, 'completed')
    }

    this.logger.info(
      {
        sessionId,
        projectId: session.projectId
      },
      '[ChatService] Session ended'
    )
  }

  async restartSession(
    projectId: string,
    type: ChatSessionType,
    initialInput?: string,
    backend?: ChatSessionBackend
  ): Promise<ChatSessionSummary> {
    const activeSession = await this.getActiveSessionForProject(projectId)
    const nextBackend = activeSession
      ? backend ?? this.resolveSessionBackend(activeSession.id)
      : backend ?? DEFAULT_CHAT_BACKEND

    if (activeSession) {
      await this.endSession(activeSession.id)
    }

    return this.startSession(projectId, type, initialInput, nextBackend)
  }

  async getProjectSession(projectId: string): Promise<ChatSessionSummary | null> {
    this.requireProject(projectId)
    const activeSession = await this.getActiveSessionForProject(projectId)
    if (!activeSession) {
      return null
    }

    return this.toSessionSummary(activeSession)
  }

  async getSession(sessionId: string): Promise<ChatSessionSummary> {
    const session = await this.requireSession(sessionId)
    return this.toSessionSummary(session)
  }

  async getHistory(sessionId: string): Promise<ChatMessageSummary[]> {
    await this.requireSession(sessionId)

    const rows = this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .all()
      .sort((a, b) => a.timestamp - b.timestamp)

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      role: row.role as ChatRole,
      content: row.content,
      timestamp: row.timestamp
    }))
  }

  subscribeMessages(sessionId: string, cb: (message: ChatMessageSummary) => void) {
    const key = `${MESSAGE_EVENT_PREFIX}${sessionId}`
    this.events.on(key, cb)
    return () => this.events.off(key, cb)
  }

  subscribeState(sessionId: string, cb: (state: ChatState) => void) {
    const key = `${STATE_EVENT_PREFIX}${sessionId}`
    this.events.on(key, cb)
    return () => this.events.off(key, cb)
  }

  async replayMessages(sessionId: string) {
    return this.getHistory(sessionId)
  }

  private toSessionSummary(row: ChatSession): ChatSessionSummary {
    const runtime = this.runtimes.get(row.id)
    const backend = runtime?.backend ?? this.resolveSessionBackend(row.id)
    this.sessionBackends.set(row.id, backend)

    return {
      id: row.id,
      projectId: row.projectId,
      type: row.type as ChatSessionType,
      backend,
      state: row.state as ChatState,
      processId: runtime?.active ? runtime.processId : null,
      createdAt: row.createdAt,
      endedAt: row.endedAt
    }
  }

  private async requireSession(sessionId: string) {
    const row = this.db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId))
      .get()

    if (!row) {
      throw new ChatServiceError('NOT_FOUND', `Chat session not found: ${sessionId}`)
    }

    return row
  }

  private requireProject(projectId: string) {
    const project = this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get()

    if (!project) {
      throw new ChatServiceError('NOT_FOUND', `Project not found: ${projectId}`)
    }

    return project
  }

  private async getActiveSessionForProject(projectId: string) {
    const rows = this.db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.projectId, projectId))
      .all()
      .sort((a, b) => b.createdAt - a.createdAt)

    for (const row of rows) {
      if (row.state !== 'completed') {
        return row
      }
    }

    return null
  }

  private async handleOutput(sessionId: string, chunk: OutputChunk) {
    const runtime = this.runtimes.get(sessionId)
    if (!runtime) {
      return
    }

    const parsed = runtime.parser.parseChunk(chunk.data)
    for (const content of parsed.messages) {
      await this.persistAssistantMessage(sessionId, content, chunk.timestamp)
    }

    if (parsed.waiting) {
      await this.setSessionState(sessionId, 'waiting')
    }
  }

  private async handleState(sessionId: string, state: ProcessState) {
    const runtime = this.runtimes.get(sessionId)
    if (!runtime) {
      return
    }

    const remaining = runtime.parser.flushRemaining()
    for (const content of remaining) {
      await this.persistAssistantMessage(sessionId, content, this.now())
    }

    runtime.unsubOutput()
    runtime.unsubState()
    runtime.active = false
    runtime.processId = null

    this.logger.info(
      {
        sessionId,
        processState: state
      },
      '[ChatService] Process state changed'
    )

    const nextState: ChatState =
      state === 'running'
        ? 'active'
        : state === 'completed'
          ? 'waiting'
          : 'completed'
    await this.setSessionState(sessionId, nextState)
  }

  private async startRuntime(
    sessionId: string,
    projectId: string,
    type: ChatSessionType,
    backend: ChatSessionBackend,
    cwd: string
  ) {
    let binaryPath: string
    try {
      binaryPath = await this.resolveBinary()
    } catch (error) {
      throw new ChatServiceError(
        'BAD_REQUEST',
        error instanceof Error ? error.message : 'Unable to resolve Ralph binary'
      )
    }

    const handle = await this.processManager.spawn(projectId, binaryPath, [type, '--backend', backend], {
      cwd,
      tty: true
    })

    const runtime: ChatRuntime = {
      processId: handle.id,
      active: true,
      backend,
      parser: new ChatOutputParser(),
      unsubOutput: () => { },
      unsubState: () => { }
    }

    this.runtimes.set(sessionId, runtime)
    this.sessionBackends.set(sessionId, backend)
    runtime.unsubOutput = this.processManager.onOutput(handle.id, (chunk) => {
      void this.handleOutput(sessionId, chunk)
    })
    runtime.unsubState = this.processManager.onStateChange(handle.id, (state) => {
      void this.handleState(sessionId, state)
    })

    this.logger.info(
      {
        projectId,
        sessionId,
        type,
        backend,
        processId: handle.id
      },
      '[ChatService] Session runtime started'
    )

    return runtime
  }

  private async persistAssistantMessage(
    sessionId: string,
    content: string,
    timestamp: Date
  ) {
    const normalized = content.trim()
    if (!normalized) {
      return
    }

    const message: ChatMessage = {
      id: randomUUID(),
      sessionId,
      role: 'assistant',
      content: normalized,
      timestamp: timestamp.getTime()
    }

    await this.db.insert(chatMessages).values(message).run()

    this.events.emit(`${MESSAGE_EVENT_PREFIX}${sessionId}`, {
      id: message.id,
      sessionId,
      role: 'assistant',
      content: normalized,
      timestamp: message.timestamp
    } satisfies ChatMessageSummary)
  }

  private async setSessionState(sessionId: string, state: ChatState) {
    const current = await this.requireSession(sessionId)
    if (current.state === state) {
      return
    }

    await this.db
      .update(chatSessions)
      .set({
        state,
        endedAt: state === 'completed' ? this.now().getTime() : null
      })
      .where(eq(chatSessions.id, sessionId))
      .run()

    this.events.emit(`${STATE_EVENT_PREFIX}${sessionId}`, state)
  }

  private resolveSessionBackend(sessionId: string): ChatSessionBackend {
    return this.sessionBackends.get(sessionId) ?? DEFAULT_CHAT_BACKEND
  }
}
