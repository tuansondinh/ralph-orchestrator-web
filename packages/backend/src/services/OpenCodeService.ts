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

export class OpenCodeService {
  private readonly settingsService: Pick<SettingsService, 'get' | 'getProviderApiKey'>
  private readonly mcpEndpointUrl: string
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

  constructor(options: OpenCodeServiceOptions) {
    this.mcpEndpointUrl = options.mcpEndpointUrl
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
    this.emit({
      type: 'chat:message',
      message
    })
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
    this.running = true
    this.subscribeToEvents()
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
          url: this.mcpEndpointUrl
        }
      }
    }
  }

  private subscribeToEvents() {
    const client = this.client
    if (!client) {
      return
    }

    void (async () => {
      try {
        const subscription = await client.event.subscribe({})
        for await (const event of subscription.stream as AsyncIterable<OpenCodeSdkEvent>) {
          this.handleEvent(event)
        }
      } finally {
        this.running = false
        this.client = null
        this.server = null
        this.sessionId = null
      }
    })()
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
      return
    }

    const assistantMessage = this.getOrCreateAssistantMessage(info.id)
    const content = getPartText(
      (event.properties as { parts?: Part[] }).parts
    )
    if (content.length > 0) {
      assistantMessage.content = content
    }
    this.emit({
      type: 'chat:message',
      message: assistantMessage
    })
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
