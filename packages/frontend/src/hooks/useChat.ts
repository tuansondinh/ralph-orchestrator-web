import { useCallback, useMemo } from 'react'
import { resolveAuthorizedHeaders } from '@/lib/authSession'
import {
  useChatOverlayStore,
  type OverlayMessage,
  type ToolConfirmation
} from '@/stores/chatOverlayStore'

interface ChatRequestMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
}

interface ChatStreamTextDeltaEvent {
  text: string
}

interface ChatStreamToolCallEvent {
  id: string
  name: string
  args: Record<string, unknown>
  requiresConfirmation: boolean
}

interface ChatStreamToolResultEvent {
  id: string
  result: string
  link?: string
}

interface ChatStreamErrorEvent {
  message: string
}

interface SseEvent {
  event: string
  data: unknown
}

type RuntimeEnv = {
  DEV: boolean
  VITE_RALPH_ORCHESTRATOR_BACKEND_ORIGIN?: string
  VITE_CHAT_STREAM_TIMEOUT_MS?: string
}

type RuntimeLocation = Pick<Location, 'hostname'>

function createId() {
  return globalThis.crypto.randomUUID()
}

function resolveDefaultDevBackendOrigin() {
  return 'http://127.0.0.1:3003'
}

function resolveDefaultChatStreamTimeoutMs() {
  return 30_000
}

function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

export function resolveChatBaseUrl(
  env: RuntimeEnv = import.meta.env,
  runtimeLocation: RuntimeLocation = window.location
) {
  const backendOrigin = env.VITE_RALPH_ORCHESTRATOR_BACKEND_ORIGIN
  if (typeof backendOrigin === 'string' && backendOrigin.trim().length > 0) {
    return backendOrigin.replace(/\/$/, '')
  }

  if (env.DEV || isLocalHost(runtimeLocation.hostname)) {
    return resolveDefaultDevBackendOrigin()
  }

  return ''
}

function resolveChatStreamTimeoutMs(env: RuntimeEnv = import.meta.env) {
  const raw = env.VITE_CHAT_STREAM_TIMEOUT_MS
  if (typeof raw !== 'string') {
    return resolveDefaultChatStreamTimeoutMs()
  }

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return resolveDefaultChatStreamTimeoutMs()
  }

  return parsed
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function uniqueUrls(urls: string[]) {
  return [...new Set(urls)]
}

function resolveChatEndpoints(chatBaseUrl: string, suffix: 'stream' | 'confirm') {
  const absoluteTrpc = chatBaseUrl ? `${chatBaseUrl}/trpc/chat/${suffix}` : ''

  if (absoluteTrpc) {
    return [absoluteTrpc]
  }

  return uniqueUrls([`/trpc/chat/${suffix}`])
}

async function fetchWithNotFoundFallback(urls: string[], init: RequestInit) {
  let lastResponse: Response | null = null
  let lastUrl = urls[0] ?? ''
  let lastError: unknown

  for (const url of urls) {
    try {
      const response = await fetch(url, init)
      if (response.ok) {
        return {
          response,
          url
        }
      }

      lastResponse = response
      lastUrl = url
      if (response.status !== 404) {
        return {
          response,
          url
        }
      }
    } catch (error) {
      lastError = error
      lastUrl = url
    }
  }

  if (lastResponse) {
    return {
      response: lastResponse,
      url: lastUrl
    }
  }

  if (lastError instanceof Error) {
    throw lastError
  }

  throw new Error(`Request failed for ${lastUrl}`)
}

async function readErrorMessage(response: Response) {
  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    try {
      const parsed = (await response.json()) as unknown
      if (isRecord(parsed) && typeof parsed.message === 'string' && parsed.message.length > 0) {
        return parsed.message
      }
    } catch {
      return ''
    }
  }

  try {
    const text = await response.text()
    return text.trim()
  } catch {
    return ''
  }
}

function parseSseBlock(block: string): SseEvent | null {
  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return null
  }

  let event = 'message'
  const dataLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim()
      continue
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim())
    }
  }

  const payload = dataLines.join('\n')
  if (payload.length === 0) {
    return {
      event,
      data: {}
    }
  }

  try {
    return {
      event,
      data: JSON.parse(payload)
    }
  } catch {
    return {
      event,
      data: {
        message: payload
      }
    }
  }
}

async function consumeSseStream(
  response: Response,
  onEvent: (event: SseEvent) => void
) {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Missing stream body')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const chunk = await reader.read()
    if (chunk.done) {
      break
    }

    buffer += decoder.decode(chunk.value, { stream: true })

    while (buffer.includes('\n\n')) {
      const boundary = buffer.indexOf('\n\n')
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)

      const event = parseSseBlock(block)
      if (event) {
        onEvent(event)
      }
    }
  }

  buffer += decoder.decode()
  const trailing = parseSseBlock(buffer)
  if (trailing) {
    onEvent(trailing)
  }
}

function toChatRequestMessages(messages: OverlayMessage[]): ChatRequestMessage[] {
  return messages
    .filter((message) => !message.isStreaming)
    .map((message) => ({
      role: message.role,
      content: message.content
    }))
}

export function useChat() {
  const chatBaseUrl = resolveChatBaseUrl()
  const chatStreamTimeoutMs = resolveChatStreamTimeoutMs()
  const streamEndpoints = useMemo(
    () => resolveChatEndpoints(chatBaseUrl, 'stream'),
    [chatBaseUrl]
  )
  const confirmEndpoints = useMemo(
    () => resolveChatEndpoints(chatBaseUrl, 'confirm'),
    [chatBaseUrl]
  )

  const confirmToolCall = useCallback(async (toolCallId: string, confirmed: boolean) => {
    const state = useChatOverlayStore.getState()
    const pending = state.pendingConfirmation

    if (
      !pending ||
      pending.id !== toolCallId ||
      pending.status !== 'pending' ||
      pending.isSubmitting
    ) {
      return
    }

    state.updatePendingConfirmation({
      isSubmitting: true
    })

    try {
      const { response, url } = await fetchWithNotFoundFallback(confirmEndpoints, {
        method: 'POST',
        headers: resolveAuthorizedHeaders({
          accept: 'application/json',
          'content-type': 'application/json'
        }),
        body: JSON.stringify({
          sessionId: state.sessionId,
          toolCallId,
          confirmed
        })
      })

      if (!response.ok) {
        const message = await readErrorMessage(response)
        throw new Error(
          message.length > 0
            ? message
            : `Tool confirmation request failed (${response.status}) at ${url}`
        )
      }

      const latest = useChatOverlayStore.getState()
      if (latest.pendingConfirmation?.id === toolCallId) {
        latest.setPendingConfirmation(null)
      }
    } catch (error) {
      const latest = useChatOverlayStore.getState()
      if (latest.pendingConfirmation?.id === toolCallId) {
        if (error instanceof Error && error.message === 'No pending confirmation found') {
          latest.setPendingConfirmation(null)
        } else {
          latest.updatePendingConfirmation({
            isSubmitting: false
          })
        }
      }

      latest.addMessage({
        id: createId(),
        role: 'assistant',
        content: error instanceof Error ? error.message : 'Failed to confirm tool call',
        timestamp: Date.now()
      })
    }
  }, [confirmEndpoints])

  const sendMessage = useCallback(async (text: string) => {
    const content = text.trim()
    if (content.length === 0) {
      return
    }

    const state = useChatOverlayStore.getState()
    state.addMessage({
      id: createId(),
      role: 'user',
      content,
      timestamp: Date.now()
    })

    state.appendStreamChunk('')

    const { sessionId, selectedModel, messages } = useChatOverlayStore.getState()
    const toolNameById = new Map<string, string>()
    const abortController = new AbortController()
    const timeoutMessage = `Chat stream request timed out after ${Math.ceil(
      chatStreamTimeoutMs / 1000
    )}s`
    const timeoutId =
      chatStreamTimeoutMs > 0
        ? setTimeout(() => {
            abortController.abort(new Error(timeoutMessage))
          }, chatStreamTimeoutMs)
        : null

    try {
      const { response, url } = await fetchWithNotFoundFallback(streamEndpoints, {
        method: 'POST',
        headers: resolveAuthorizedHeaders({
          accept: 'text/event-stream',
          'content-type': 'application/json'
        }),
        signal: abortController.signal,
        body: JSON.stringify({
          sessionId,
          model: selectedModel,
          messages: toChatRequestMessages(messages)
        })
      })

      if (!response.ok) {
        const message = await readErrorMessage(response)
        throw new Error(
          message.length > 0 ? message : `Chat stream request failed (${response.status}) at ${url}`
        )
      }

      let receivedTerminalEvent = false
      await consumeSseStream(response, ({ event, data }) => {
        const store = useChatOverlayStore.getState()

        if (event === 'text-delta' && isRecord(data) && typeof data.text === 'string') {
          const payload: ChatStreamTextDeltaEvent = {
            text: data.text
          }
          store.appendStreamChunk(payload.text)
          return
        }

        if (event === 'tool-call' && isRecord(data)) {
          const id = typeof data.id === 'string' ? data.id : ''
          const name = typeof data.name === 'string' ? data.name : ''
          const args = isRecord(data.args) ? data.args : {}
          const requiresConfirmation = data.requiresConfirmation === true

          if (id && name) {
            const payload: ChatStreamToolCallEvent = {
              id,
              name,
              args,
              requiresConfirmation
            }
            toolNameById.set(payload.id, payload.name)

            if (payload.requiresConfirmation) {
              const confirmation: ToolConfirmation = {
                id: payload.id,
                toolName: payload.name,
                description: `Confirm ${payload.name}`,
                args: payload.args,
                status: 'pending',
                isSubmitting: false
              }
              store.setPendingConfirmation(confirmation)
            }
          }
          return
        }

        if (event === 'tool-result' && isRecord(data) && typeof data.id === 'string') {
          const payload: ChatStreamToolResultEvent = {
            id: data.id,
            result: typeof data.result === 'string' ? data.result : JSON.stringify(data.result),
            link: typeof data.link === 'string' ? data.link : undefined
          }

          const toolName = toolNameById.get(payload.id)
          store.addMessage({
            id: createId(),
            role: 'tool',
            content: payload.result,
            toolCall: toolName
              ? {
                  id: payload.id,
                  name: toolName,
                  link: payload.link
                }
              : undefined,
            timestamp: Date.now()
          })
          return
        }

        if (event === 'done') {
          receivedTerminalEvent = true
          store.finalizeStreamMessage()
          return
        }

        if (event === 'error' && isRecord(data) && typeof data.message === 'string') {
          receivedTerminalEvent = true
          const payload: ChatStreamErrorEvent = {
            message: data.message
          }

          store.finalizeStreamMessage()
          store.setPendingConfirmation(null)
          store.addMessage({
            id: createId(),
            role: 'assistant',
            content: payload.message,
            timestamp: Date.now()
          })
        }
      })

      if (!receivedTerminalEvent) {
        const store = useChatOverlayStore.getState()
        store.finalizeStreamMessage()
        store.setPendingConfirmation(null)
      }
    } catch (error) {
      const store = useChatOverlayStore.getState()
      store.finalizeStreamMessage()
      store.setPendingConfirmation(null)
      let message = error instanceof Error ? error.message : 'Failed to stream chat response'
      if (abortController.signal.aborted) {
        const reason = abortController.signal.reason
        if (reason instanceof Error && reason.message.trim().length > 0) {
          message = reason.message
        } else if (typeof reason === 'string' && reason.trim().length > 0) {
          message = reason
        } else {
          message = timeoutMessage
        }
      }
      store.addMessage({
        id: createId(),
        role: 'assistant',
        content: message,
        timestamp: Date.now()
      })
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [chatStreamTimeoutMs, streamEndpoints])

  return {
    sendMessage,
    confirmToolCall
  }
}
