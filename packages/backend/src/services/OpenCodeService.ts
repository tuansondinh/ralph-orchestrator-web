import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import {
  createOpencode,
  type Config,
  type EventMessagePartUpdated,
  type EventMessageUpdated,
  type EventPermissionUpdated,
  type EventSessionError,
  type EventSessionStatus,
  type Message,
  type OpencodeClient,
  type Part,
  type ServerOptions,
  type Session
} from '@opencode-ai/sdk'
import {
  DEFAULT_CHAT_PROVIDER,
  DEFAULT_OPENCODE_MODEL,
  type ChatProvider
} from '../lib/chatProviderConfig.js'
import type { SettingsService } from './SettingsService.js'
import type {
  ChatMessage,
  ChatSnapshot,
  ChatStatus,
  OpenCodeEvent,
  PendingConfirmation
} from '../types/chat.js'

interface OpenCodeServiceOptions {
  mcpEndpointUrl: string
  mcpHeaders?: Record<string, string>
  settingsService: Pick<SettingsService, 'get' | 'getProviderApiKey'>
  dataDir?: string
  createOpencode?: (options?: ServerOptions) => Promise<{
    client: OpencodeClient
    server: { url: string; close(): void }
  }>
  now?: () => number
}

type OpenCodeSdkEvent =
  | EventMessagePartUpdated
  | EventMessageUpdated
  | EventPermissionUpdated
  | EventSessionStatus
  | EventSessionError
  | { type: string; properties?: unknown }

function unwrapData<T>(value: T | { data?: T | undefined }) {
  if (isRecord(value) && 'data' in value) {
    return value.data as T | undefined
  }

  return value as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getPartText(parts: Part[] | undefined) {
  return (parts ?? [])
    .filter((part): part is Extract<Part, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

function mapSessionStatus(status: EventSessionStatus['properties']['status']): ChatStatus {
  return status.type === 'idle' ? 'idle' : 'busy'
}

function stringifyError(error: EventSessionError['properties']['error']) {
  const message = error?.data?.message
  return typeof message === 'string' && message.trim().length > 0
    ? message
    : 'OpenCode session error'
}

function getModelIdentifier(provider: string, model: string) {
  return `${provider}/${model}`
}

function getWorkspaceRootLabel() {
  const cwd = process.cwd().replace(/\\/g, '/').replace(/\/+$/, '')
  const segments = cwd.split('/').filter(Boolean)
  return segments.at(-1) ?? cwd
}

const RALPH_ASSISTANT_IDENTITY_PROMPT = [
  'You are Ralph Assistant, the built-in AI assistant for Ralph Orchestrator.',
  'Always refer to yourself as Ralph or Ralph Assistant when asked about your identity.',
  'Do not claim to be Claude Code, Claude, Codex, ChatGPT, Gemini, OpenCode, or any other CLI tool or model.',
  'If a user asks what model or provider is backing this chat, explain that you are Ralph Assistant running inside Ralph Orchestrator and, if relevant, that the configured provider/model may vary behind the scenes.',
  `The workspace root for this app session is "${getWorkspaceRootLabel()}". Treat that as the default project root unless the user explicitly switches to a subdirectory or a specific managed project.`,
  'Do not describe packages/backend or packages/frontend as the main project unless the user explicitly asks about those subdirectories.',
  'Help users manage projects, plan features, and orchestrate AI loop runs.',
  'When the user requests "ralph plan" or "ralph task":',
  'Call list_projects to retrieve available projects.',
  'Present the project list and ask the user which project they want to work on.',
  'Only after the user confirms a project, call activate_plan_mode or activate_task_mode with the projectId.',
  'All generated spec files MUST be written inside {project.path}/specs/{task-name}/.',
  'Never start planning without knowing the target project.'
].join(' ')

export class OpenCodeService {
  private readonly settingsService: Pick<SettingsService, 'get' | 'getProviderApiKey'>
  private mcpEndpointUrl: string
  private readonly mcpHeaders: Record<string, string>
  private readonly dataDir?: string
  private readonly createOpencodeFactory: NonNullable<OpenCodeServiceOptions['createOpencode']>
  private readonly now: () => number
  private readonly events = new EventEmitter()

  private client: OpencodeClient | null = null
  private server: { url: string; close(): void } | null = null
  private running = false
  private sessionId: string | null = null
  private status: ChatStatus = 'idle'
  private messages: ChatMessage[] = []
  private pendingConfirmation: PendingConfirmation | null = null
  private currentProvider: ChatProvider = DEFAULT_CHAT_PROVIDER
  private currentModel = DEFAULT_OPENCODE_MODEL
  private startPromise: Promise<void> | null = null
  private readonly knownUserMessageIds = new Set<string>()

  constructor(options: OpenCodeServiceOptions) {
    this.mcpEndpointUrl = options.mcpEndpointUrl
    this.mcpHeaders = options.mcpHeaders ?? {}
    this.settingsService = options.settingsService
    this.dataDir = options.dataDir
    this.createOpencodeFactory = options.createOpencode ?? createOpencode
    this.now = options.now ?? (() => Date.now())
  }

  async start() {
    if (this.running) {
      return
    }

    if (this.startPromise) {
      return this.startPromise
    }

    this.startPromise = this.startInternal()
    try {
      await this.startPromise
    } finally {
      this.startPromise = null
    }
  }

  async stop() {
    this.running = false
    this.sessionId = null
    this.pendingConfirmation = null
    this.status = 'idle'
    this.knownUserMessageIds.clear()
    this.server?.close()
    this.server = null
    this.client = null
  }

  isRunning() {
    return this.running
  }

  async healthCheck() {
    return this.running
  }

  async getOrCreateSession() {
    await this.ensureStarted()
    if (this.sessionId) {
      return this.sessionId
    }

    const session = unwrapData(await this.client!.session.create({}))
    if (!session) {
      throw new Error('Failed to create OpenCode session')
    }
    this.sessionId = this.readSessionId(session)
    return this.sessionId
  }

  getSnapshot(): ChatSnapshot {
    return {
      sessionId: this.sessionId,
      messages: [...this.messages],
      status: this.status,
      pendingConfirmation: this.pendingConfirmation
    }
  }

  async sendMessage(text: string) {
    const sessionId = await this.getOrCreateSession()
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      createdAt: this.now()
    }
    this.messages.push(message)
    this.setStatus('busy')
    await this.client!.session.promptAsync({
      path: { id: sessionId },
      body: {
        model: {
          providerID: this.currentProvider,
          modelID: this.currentModel
        },
        parts: [
          {
            type: 'text',
            text
          }
        ]
      }
    })
  }

  async confirmPermission(permissionId: string, confirmed: boolean) {
    const sessionId = this.sessionId
    if (!sessionId || !this.client) {
      throw new Error('No active OpenCode session')
    }

    await this.client.postSessionIdPermissionsPermissionId({
      path: {
        id: sessionId,
        permissionID: permissionId
      },
      body: {
        response: confirmed ? 'once' : 'reject'
      }
    })
    this.pendingConfirmation = null
  }

  onEvent(callback: (event: OpenCodeEvent) => void) {
    this.events.on('event', callback)
    return () => {
      this.events.off('event', callback)
    }
  }

  async updateModel(provider: string, model: string) {
    this.currentProvider = provider as ChatProvider
    this.currentModel = model

    if (!this.client) {
      return
    }

    await this.client.config.update({
      body: await this.buildConfig()
    })
  }

  async setMcpEndpointUrl(url: string) {
    if (url === this.mcpEndpointUrl) {
      return
    }

    this.mcpEndpointUrl = url

    if (!this.client) {
      return
    }

    await this.client.config.update({
      body: await this.buildConfig()
    })
  }

  private async startInternal() {
    const settings = await this.settingsService.get()
    this.currentProvider = settings.chatProvider
    this.currentModel = settings.opencodeModel

    const created = await this.createOpencodeFactory({
      config: await this.buildConfig(),
      // Avoid collisions with stale local OpenCode daemons that may still own the SDK default port.
      port: 0
    })

    this.client = created.client
    this.server = created.server
    await this.subscribeToEvents()
    this.running = true
  }

  private async ensureStarted() {
    if (!this.running) {
      await this.start()
    }
  }

  private async buildConfig(): Promise<Config> {
    const apiKey =
      (await this.settingsService.getProviderApiKey(this.currentProvider)) ??
      (await this.settingsService.getProviderApiKey(DEFAULT_CHAT_PROVIDER))

    return {
      model: getModelIdentifier(this.currentProvider, this.currentModel),
      agent: {
        general: {
          prompt: RALPH_ASSISTANT_IDENTITY_PROMPT
        }
      },
      provider: {
        [this.currentProvider]: {
          options: apiKey
            ? {
                apiKey
              }
            : {}
        }
      },
      mcp: {
        ralph: {
          type: 'remote',
          enabled: true,
          url: this.mcpEndpointUrl,
          headers: Object.keys(this.mcpHeaders).length > 0 ? this.mcpHeaders : undefined
        }
      }
    }
  }

  private async subscribeToEvents() {
    const client = this.client
    if (!client) {
      return
    }

    const subscription = await client.event.subscribe({})
    void this.consumeEvents(subscription.stream as AsyncIterable<OpenCodeSdkEvent>)
  }

  private async consumeEvents(stream: AsyncIterable<OpenCodeSdkEvent>) {
    try {
      for await (const event of stream) {
        this.handleEvent(event)
      }
    } finally {
      this.running = false
      this.client = null
      this.server = null
      this.sessionId = null
    }
  }

  private handleEvent(event: OpenCodeSdkEvent) {
    switch (event.type) {
      case 'message.part.updated':
        this.handleMessagePartUpdated(event as EventMessagePartUpdated)
        return
      case 'message.updated':
        this.handleMessageUpdated(event as EventMessageUpdated)
        return
      case 'permission.updated':
        this.handlePermissionUpdated(event as EventPermissionUpdated)
        return
      case 'session.status':
        this.setStatus(mapSessionStatus((event as EventSessionStatus).properties.status))
        return
      case 'session.error':
        this.status = 'error'
        this.emit({
          type: 'chat:error',
          error: stringifyError((event as EventSessionError).properties.error)
        })
        return
      default:
        return
    }
  }

  private handleMessagePartUpdated(event: EventMessagePartUpdated) {
    const part = event.properties.part
    if (this.knownUserMessageIds.has(part.messageID)) {
      return
    }
    if (part.type === 'text') {
      const assistantMessage = this.getOrCreateAssistantMessage(part.messageID)
      const delta = event.properties.delta ?? part.text
      assistantMessage.content += delta
      this.emit({
        type: 'chat:delta',
        text: delta
      })
      return
    }

    if (part.type === 'reasoning') {
      const thinkingMessage = this.getOrCreateThinkingMessage(part.id, part.time.start)
      thinkingMessage.content = part.text
      thinkingMessage.streaming = part.time.end === undefined
      this.emit({
        type: 'chat:message',
        message: thinkingMessage
      })
      return
    }

    if (part.type !== 'tool') {
      return
    }

    const args = isRecord(part.state.input) ? part.state.input : {}
    if (part.state.status === 'completed' || part.state.status === 'error') {
      this.emit({
        type: 'chat:tool-result',
        toolName: part.tool,
        result: part.state.status === 'completed' ? part.state.output : part.state.error,
        state: part.state.status
      })
      return
    }

    this.emit({
      type: 'chat:tool-call',
      toolName: part.tool,
      args,
      state: part.state.status
    })
  }

  private handleMessageUpdated(event: EventMessageUpdated) {
    const { info } = event.properties
    if (info.role !== 'assistant') {
      if (info.role === 'user') {
        this.knownUserMessageIds.add(info.id)
        // Clean up any false assistant message created before we knew this was a user message
        this.messages = this.messages.filter(
          (msg) => !(msg.id === info.id && msg.role === 'assistant')
        )
      }
      return
    }

    const assistantMessage = this.getOrCreateAssistantMessage(info.id)
    const content = getPartText(
      (event.properties as { parts?: Part[] }).parts
    )
    if (content.length > 0) {
      assistantMessage.content = content
    }
    if (assistantMessage.content.trim().length > 0) {
      this.emit({
        type: 'chat:message',
        message: assistantMessage
      })
    }
    this.setStatus('idle')
  }

  private handlePermissionUpdated(event: EventPermissionUpdated) {
    const metadata = isRecord(event.properties.metadata) ? event.properties.metadata : {}
    const toolName =
      typeof metadata.tool === 'string'
        ? metadata.tool
        : Array.isArray(event.properties.pattern) && typeof event.properties.pattern[0] === 'string'
          ? event.properties.pattern[0]
          : event.properties.title
    const args = isRecord(metadata.input)
      ? metadata.input
      : isRecord(metadata.args)
        ? metadata.args
        : {}

    this.pendingConfirmation = {
      permissionId: event.properties.id,
      toolName,
      description: event.properties.title,
      args
    }
    this.emit({
      type: 'chat:confirm-request',
      permissionId: event.properties.id,
      toolName,
      description: event.properties.title,
      args
    })
  }

  private getOrCreateAssistantMessage(id: string) {
    const existing = this.messages.find(
      (message) => message.id === id && message.role === 'assistant'
    )
    if (existing) {
      return existing
    }

    const created: ChatMessage = {
      id,
      role: 'assistant',
      content: '',
      createdAt: this.now()
    }
    this.messages.push(created)
    return created
  }

  private getOrCreateThinkingMessage(id: string, createdAt: number) {
    const existing = this.messages.find(
      (message) => message.id === id && message.role === 'thinking'
    )
    if (existing) {
      return existing
    }

    const created: ChatMessage = {
      id,
      role: 'thinking',
      content: '',
      createdAt,
      streaming: true
    }
    this.messages.push(created)
    return created
  }

  private setStatus(status: ChatStatus) {
    this.status = status
    this.emit({
      type: 'chat:status',
      status
    })
  }

  private emit(event: OpenCodeEvent) {
    this.events.emit('event', event)
  }

  private readSessionId(session: Session | { id: string }) {
    return session.id
  }
}
