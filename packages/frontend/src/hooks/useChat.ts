import { useCallback } from 'react'
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

function createId() {
  return globalThis.crypto.randomUUID()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
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
      const response = await fetch('/chat/confirm', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: state.sessionId,
          toolCallId,
          confirmed
        })
      })

      if (!response.ok) {
        throw new Error(`Tool confirmation request failed (${response.status})`)
      }

      const latest = useChatOverlayStore.getState()
      if (latest.pendingConfirmation?.id === toolCallId) {
        latest.updatePendingConfirmation({
          status: confirmed ? 'confirmed' : 'cancelled',
          isSubmitting: false
        })
      }
    } catch (error) {
      const latest = useChatOverlayStore.getState()
      if (latest.pendingConfirmation?.id === toolCallId) {
        latest.updatePendingConfirmation({
          isSubmitting: false
        })
      }

      latest.addMessage({
        id: createId(),
        role: 'assistant',
        content: error instanceof Error ? error.message : 'Failed to confirm tool call',
        timestamp: Date.now()
      })
    }
  }, [])

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

    try {
      const response = await fetch('/chat/stream', {
        method: 'POST',
        headers: {
          accept: 'text/event-stream',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sessionId,
          model: selectedModel,
          messages: toChatRequestMessages(messages)
        })
      })

      if (!response.ok) {
        throw new Error(`Chat stream request failed (${response.status})`)
      }

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
          store.finalizeStreamMessage()
          return
        }

        if (event === 'error' && isRecord(data) && typeof data.message === 'string') {
          const payload: ChatStreamErrorEvent = {
            message: data.message
          }

          store.finalizeStreamMessage()
          store.addMessage({
            id: createId(),
            role: 'assistant',
            content: payload.message,
            timestamp: Date.now()
          })
        }
      })
    } catch (error) {
      const store = useChatOverlayStore.getState()
      store.finalizeStreamMessage()
      const message = error instanceof Error ? error.message : 'Failed to stream chat response'
      store.addMessage({
        id: createId(),
        role: 'assistant',
        content: message,
        timestamp: Date.now()
      })
    }
  }, [])

  return {
    sendMessage,
    confirmToolCall
  }
}
