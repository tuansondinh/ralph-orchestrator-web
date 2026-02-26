import type { ModelMessage } from 'ai'
import { stepCountIs, streamText as streamTextImpl, tool } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import { openai } from '@ai-sdk/openai'
import type { RalphMcpToolDefinition } from '../mcp/RalphMcpServer.js'

export const DESTRUCTIVE_TOOLS = [
  'start_loop',
  'stop_loop',
  'create_project',
  'update_project',
  'delete_project',
  'kill_process',
  'update_settings'
] as const

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'
const DEFAULT_OPENAI_MODEL = 'gpt-4o'
const DEFAULT_CLAUDE_MODEL = 'claude-opus-4-6'
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000

type LanguageModelFactory = (modelId: string) => unknown

interface McpChatSession {
  messages: ModelMessage[]
  lastUsedAtMs: number
}

interface PendingToolConfirmation {
  promise: Promise<boolean>
  resolve: (confirmed: boolean) => void
}

export type AIModel = 'gemini' | 'openai' | 'claude'

export interface McpChatToolCallEvent {
  id: string
  name: string
  args: Record<string, unknown>
  requiresConfirmation: boolean
}

export interface McpChatToolResultEvent {
  id: string
  result: string
  link?: string
}

export interface McpChatStreamPart {
  type: string
  text?: string
  toolCallId?: string
  toolName?: string
  input?: unknown
  output?: unknown
}

export interface McpChatStreamTextInput {
  model: unknown
  messages: ModelMessage[]
  tools: Record<string, unknown>
  stopWhen: unknown
}

interface McpChatStreamTextResult {
  fullStream: AsyncIterable<McpChatStreamPart>
}

export type McpChatStreamText = (
  input: McpChatStreamTextInput
) => McpChatStreamTextResult

interface McpChatModelFactories {
  google: LanguageModelFactory
  openai: LanguageModelFactory
  anthropic: LanguageModelFactory
}

interface McpToolProvider {
  getToolDefinitions: () => RalphMcpToolDefinition[]
  executeTool: (name: string, args: unknown) => Promise<unknown>
}

interface McpChatServiceOptions {
  mcpServer: McpToolProvider
  streamText?: McpChatStreamText
  now?: () => number
  sessionTtlMs?: number
  modelFactories?: McpChatModelFactories
}

export interface McpChatStreamInput {
  sessionId: string
  model: AIModel
  messages: ModelMessage[]
  onTextDelta: (text: string) => void
  onToolCall: (event: McpChatToolCallEvent) => void
  onToolResult: (event: McpChatToolResultEvent) => void
  abortSignal?: AbortSignal
}

export interface McpChatConfirmToolCallInput {
  sessionId: string
  toolCallId: string
  confirmed: boolean
}

const defaultStreamText: McpChatStreamText = (input) =>
  streamTextImpl({
    model: input.model as never,
    messages: input.messages,
    tools: input.tools as never,
    stopWhen: input.stopWhen as never
  }) as unknown as McpChatStreamTextResult

const DEFAULT_MODEL_FACTORIES: McpChatModelFactories = {
  google,
  openai,
  anthropic
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringifyToolResult(value: unknown) {
  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value ?? null)
  } catch {
    return String(value)
  }
}

function getResultLink(value: unknown) {
  if (!isRecord(value) || typeof value.link !== 'string' || value.link.length === 0) {
    return undefined
  }

  return value.link
}

function getAbortReason(signal: AbortSignal) {
  const reason = signal.reason
  if (reason instanceof Error) {
    return reason
  }

  return new Error('Chat stream cancelled')
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (!signal?.aborted) {
    return
  }

  throw getAbortReason(signal)
}

export class McpChatService {
  private readonly sessions = new Map<string, McpChatSession>()
  private readonly pendingToolConfirmations = new Map<string, Map<string, PendingToolConfirmation>>()
  private readonly streamText: McpChatStreamText
  private readonly now: () => number
  private readonly sessionTtlMs: number
  private readonly mcpServer: McpToolProvider
  private readonly modelFactories: McpChatModelFactories

  constructor(options: McpChatServiceOptions) {
    this.mcpServer = options.mcpServer
    this.streamText = options.streamText ?? defaultStreamText
    this.now = options.now ?? (() => Date.now())
    this.sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS
    this.modelFactories = options.modelFactories ?? DEFAULT_MODEL_FACTORIES
  }

  getModelProvider(model: AIModel) {
    if (model === 'openai') {
      return this.modelFactories.openai(DEFAULT_OPENAI_MODEL)
    }

    if (model === 'claude') {
      return this.modelFactories.anthropic(DEFAULT_CLAUDE_MODEL)
    }

    return this.modelFactories.google(DEFAULT_GEMINI_MODEL)
  }

  async streamChat(input: McpChatStreamInput) {
    throwIfAborted(input.abortSignal)
    const session = this.getOrCreateSession(input.sessionId)
    const latestUserMessage = this.getLatestUserMessage(input.messages)
    session.messages.push(latestUserMessage)
    session.lastUsedAtMs = this.now()

    const toolLinksByCallId = new Map<string, string>()
    const stream = this.streamText({
      model: this.getModelProvider(input.model),
      messages: [...session.messages],
      tools: this.buildToolsMap(input.sessionId, toolLinksByCallId, input.abortSignal),
      stopWhen: stepCountIs(10)
    })

    let assistantResponse = ''

    for await (const part of stream.fullStream) {
      throwIfAborted(input.abortSignal)
      if (part.type === 'text-delta' && typeof part.text === 'string') {
        assistantResponse += part.text
        input.onTextDelta(part.text)
        continue
      }

      if (
        part.type === 'tool-call' &&
        typeof part.toolCallId === 'string' &&
        typeof part.toolName === 'string'
      ) {
        const requiresConfirmation = DESTRUCTIVE_TOOLS.includes(
          part.toolName as (typeof DESTRUCTIVE_TOOLS)[number]
        )
        if (requiresConfirmation) {
          this.getOrCreatePendingConfirmation(input.sessionId, part.toolCallId)
        }

        input.onToolCall({
          id: part.toolCallId,
          name: part.toolName,
          args: isRecord(part.input) ? part.input : {},
          requiresConfirmation
        })
        continue
      }

      if (
        part.type === 'tool-result' &&
        typeof part.toolCallId === 'string' &&
        typeof part.toolName === 'string'
      ) {
        const link = toolLinksByCallId.get(part.toolCallId) ?? getResultLink(part.output)
        toolLinksByCallId.delete(part.toolCallId)
        input.onToolResult({
          id: part.toolCallId,
          result: stringifyToolResult(part.output),
          link
        })
      }
    }

    if (assistantResponse.trim().length > 0) {
      session.messages.push({
        role: 'assistant',
        content: assistantResponse
      })
    }

    session.lastUsedAtMs = this.now()
  }

  confirmToolCall(input: McpChatConfirmToolCallInput) {
    const sessionConfirmations = this.pendingToolConfirmations.get(input.sessionId)
    const pending = sessionConfirmations?.get(input.toolCallId)
    if (!pending) {
      return false
    }

    pending.resolve(input.confirmed)
    this.deletePendingConfirmation(input.sessionId, input.toolCallId)
    return true
  }

  private buildToolsMap(
    sessionId: string,
    toolLinksByCallId: Map<string, string>,
    abortSignal?: AbortSignal
  ) {
    const tools = this.mcpServer.getToolDefinitions().map((definition) => [
      definition.name,
      tool<unknown, string>({
        description: definition.description,
        inputSchema: definition.inputSchema,
        execute: async (args: unknown, options: { toolCallId: string }) => {
          throwIfAborted(abortSignal)
          const requiresConfirmation = DESTRUCTIVE_TOOLS.includes(
            definition.name as (typeof DESTRUCTIVE_TOOLS)[number]
          )

          if (requiresConfirmation && options.toolCallId) {
            const confirmation = this.getOrCreatePendingConfirmation(
              sessionId,
              options.toolCallId
            )
            let confirmed: boolean
            try {
              confirmed = await this.awaitConfirmation(
                confirmation.promise,
                abortSignal
              )
            } finally {
              this.deletePendingConfirmation(sessionId, options.toolCallId)
            }

            if (!confirmed) {
              return stringifyToolResult({
                cancelled: true,
                message: 'Tool execution cancelled by user'
              })
            }
          }

          throwIfAborted(abortSignal)
          const result = await this.mcpServer.executeTool(definition.name, args)
          const link = getResultLink(result)
          if (link && options.toolCallId) {
            toolLinksByCallId.set(options.toolCallId, link)
          }
          return stringifyToolResult(result)
        }
      })
    ])

    return Object.fromEntries(tools)
  }

  private getOrCreateSession(sessionId: string) {
    const now = this.now()
    const existing = this.sessions.get(sessionId)
    if (existing && now - existing.lastUsedAtMs > this.sessionTtlMs) {
      this.sessions.delete(sessionId)
      this.pendingToolConfirmations.delete(sessionId)
    }

    const current =
      this.sessions.get(sessionId) ??
      ({
        messages: [],
        lastUsedAtMs: now
      } satisfies McpChatSession)

    current.lastUsedAtMs = now
    this.sessions.set(sessionId, current)
    return current
  }

  private getOrCreatePendingConfirmation(sessionId: string, toolCallId: string) {
    const sessionConfirmations =
      this.pendingToolConfirmations.get(sessionId) ?? new Map<string, PendingToolConfirmation>()
    if (!this.pendingToolConfirmations.has(sessionId)) {
      this.pendingToolConfirmations.set(sessionId, sessionConfirmations)
    }

    const existing = sessionConfirmations.get(toolCallId)
    if (existing) {
      return existing
    }

    let resolvePromise: ((confirmed: boolean) => void) | null = null
    const promise = new Promise<boolean>((resolve) => {
      resolvePromise = resolve
    })

    const pending: PendingToolConfirmation = {
      promise,
      resolve: (confirmed: boolean) => {
        resolvePromise?.(confirmed)
      }
    }

    sessionConfirmations.set(toolCallId, pending)
    return pending
  }

  private deletePendingConfirmation(sessionId: string, toolCallId: string) {
    const sessionConfirmations = this.pendingToolConfirmations.get(sessionId)
    if (!sessionConfirmations) {
      return
    }

    sessionConfirmations.delete(toolCallId)
    if (sessionConfirmations.size === 0) {
      this.pendingToolConfirmations.delete(sessionId)
    }
  }

  private async awaitConfirmation(
    confirmationPromise: Promise<boolean>,
    abortSignal?: AbortSignal
  ) {
    if (!abortSignal) {
      return confirmationPromise
    }

    if (abortSignal.aborted) {
      throw getAbortReason(abortSignal)
    }

    return new Promise<boolean>((resolve, reject) => {
      const onAbort = () => {
        abortSignal.removeEventListener('abort', onAbort)
        reject(getAbortReason(abortSignal))
      }

      abortSignal.addEventListener('abort', onAbort, { once: true })
      confirmationPromise.then(
        (confirmed) => {
          abortSignal.removeEventListener('abort', onAbort)
          resolve(confirmed)
        },
        (error: unknown) => {
          abortSignal.removeEventListener('abort', onAbort)
          reject(error)
        }
      )
    })
  }

  private getLatestUserMessage(messages: ModelMessage[]) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const candidate = messages[index]
      if (candidate?.role === 'user') {
        return candidate
      }
    }

    throw new Error('streamChat requires at least one user message')
  }
}
