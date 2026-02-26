import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createApp } from '../src/app.js'
import {
  McpChatService,
  type McpChatStreamInput,
  type McpChatStreamPart,
  type McpChatStreamTextInput
} from '../src/services/McpChatService.js'

interface SseEvent {
  event: string
  data: Record<string, unknown>
}

function parseSseEvents(payload: string): SseEvent[] {
  return payload
    .split('\n\n')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => {
      const lines = chunk.split('\n')
      const eventLine = lines.find((line) => line.startsWith('event:'))
      const dataLine = lines.find((line) => line.startsWith('data:'))

      return {
        event: eventLine?.slice('event:'.length).trim() ?? 'message',
        data: JSON.parse(dataLine?.slice('data:'.length).trim() ?? '{}') as Record<
          string,
          unknown
        >
      }
    })
}

describe('chat stream route', () => {
  it('streams text/tool events and terminates with done', async () => {
    const app = createApp()

    try {
      const streamChat = vi.fn(async (input: McpChatStreamInput) => {
        input.onTextDelta('hello world')
        input.onToolCall({
          id: 'tool-1',
          name: 'delete_project',
          args: { projectId: 'project-1' },
          requiresConfirmation: true
        })
        input.onToolResult({
          id: 'tool-1',
          result: '{"ok":true}',
          link: '/project/project-1'
        })
      })
      app.mcpChatService.streamChat = streamChat as typeof app.mcpChatService.streamChat

      const response = await app.inject({
        method: 'POST',
        url: '/chat/stream',
        payload: {
          sessionId: 'session-1',
          model: 'gemini',
          messages: [
            {
              role: 'user',
              content: 'hello'
            }
          ]
        }
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toContain('text/event-stream')

      const events = parseSseEvents(response.body)
      expect(events).toContainEqual({
        event: 'text-delta',
        data: {
          text: 'hello world'
        }
      })
      expect(events).toContainEqual({
        event: 'tool-call',
        data: {
          id: 'tool-1',
          name: 'delete_project',
          args: { projectId: 'project-1' },
          requiresConfirmation: true
        }
      })
      expect(events).toContainEqual({
        event: 'tool-result',
        data: {
          id: 'tool-1',
          result: '{"ok":true}',
          link: '/project/project-1'
        }
      })
      expect(events.at(-1)).toEqual({
        event: 'done',
        data: {}
      })
      expect(streamChat).toHaveBeenCalledTimes(1)
    } finally {
      await app.close()
    }
  })

  it('returns an SSE error event for invalid request bodies', async () => {
    const app = createApp()

    try {
      const streamSpy = vi.spyOn(app.mcpChatService, 'streamChat')

      const response = await app.inject({
        method: 'POST',
        url: '/chat/stream',
        payload: {
          sessionId: '',
          model: 'gemini',
          messages: []
        }
      })

      expect(response.statusCode).toBe(400)
      expect(response.headers['content-type']).toContain('text/event-stream')

      const events = parseSseEvents(response.body)
      expect(events).toHaveLength(1)
      expect(events[0]?.event).toBe('error')
      expect(events[0]?.data).toHaveProperty('message')
      expect(typeof events[0]?.data.message).toBe('string')
      expect(streamSpy).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it('pauses /chat/stream on destructive tool call until /chat/confirm and then completes', async () => {
    const app = createApp()

    try {
      const executeTool = vi.fn(async () => ({ ok: true }))
      const streamText = vi.fn((input: McpChatStreamTextInput) => {
        const tools = input.tools as Record<
          string,
          {
            execute: (
              args: Record<string, unknown>,
              options: { toolCallId: string; messages: unknown[] }
            ) => Promise<string>
          }
        >

        return {
          fullStream: (async function* () {
            yield {
              type: 'tool-call',
              toolCallId: 'tool-confirm',
              toolName: 'delete_project',
              input: {
                projectId: 'project-1'
              }
            } satisfies McpChatStreamPart

            const output = await tools.delete_project.execute(
              {
                projectId: 'project-1'
              },
              {
                toolCallId: 'tool-confirm',
                messages: input.messages
              }
            )

            yield {
              type: 'tool-result',
              toolCallId: 'tool-confirm',
              toolName: 'delete_project',
              input: {
                projectId: 'project-1'
              },
              output
            } satisfies McpChatStreamPart
          })()
        }
      })

      app.mcpChatService = new McpChatService({
        mcpServer: {
          getToolDefinitions: () => [
            {
              name: 'delete_project',
              description: '[DESTRUCTIVE] Delete project',
              inputSchema: z.object({
                projectId: z.string()
              }),
              execute: executeTool
            }
          ],
          executeTool
        },
        streamText
      })

      const streamPromise = app.inject({
        method: 'POST',
        url: '/chat/stream',
        payload: {
          sessionId: 'confirm-route-session',
          model: 'gemini',
          messages: [
            {
              role: 'user',
              content: 'delete project one'
            }
          ]
        }
      })

      await new Promise((resolve) => setTimeout(resolve, 30))
      expect(executeTool).not.toHaveBeenCalled()

      const confirmResponse = await app.inject({
        method: 'POST',
        url: '/chat/confirm',
        payload: {
          sessionId: 'confirm-route-session',
          toolCallId: 'tool-confirm',
          confirmed: true
        }
      })

      expect(confirmResponse.statusCode).toBe(200)
      expect(confirmResponse.json()).toEqual({
        ok: true
      })

      const streamResponse = await streamPromise
      const events = parseSseEvents(streamResponse.body)
      expect(events).toContainEqual({
        event: 'tool-call',
        data: {
          id: 'tool-confirm',
          name: 'delete_project',
          args: {
            projectId: 'project-1'
          },
          requiresConfirmation: true
        }
      })
      expect(events).toContainEqual({
        event: 'tool-result',
        data: {
          id: 'tool-confirm',
          result: '{"ok":true}'
        }
      })
      expect(events.at(-1)).toEqual({
        event: 'done',
        data: {}
      })
      expect(executeTool).toHaveBeenCalledTimes(1)
    } finally {
      await app.close()
    }
  })
})
