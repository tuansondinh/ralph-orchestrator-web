import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'

function parseSseMessages(payload: string): Array<Record<string, unknown>> {
  return payload
    .split('\n\n')
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice('data:'.length).trim())
        .join('')
    )
    .filter((data) => data.length > 0)
    .map((data) => JSON.parse(data) as Record<string, unknown>)
}

describe('MCP HTTP transport', () => {
  it('accepts initialize and returns all MCP tool definitions', async () => {
    const app = createApp()

    try {
      const initializeResponse = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json'
        },
        payload: {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: LATEST_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: {
              name: 'backend-test-client',
              version: '1.0.0'
            }
          }
        }
      })

      expect(initializeResponse.statusCode).toBe(200)

      const sessionId = initializeResponse.headers['mcp-session-id']
      expect(typeof sessionId).toBe('string')

      const toolsResponse = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          'mcp-protocol-version': LATEST_PROTOCOL_VERSION,
          'mcp-session-id': String(sessionId)
        },
        payload: {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {}
        }
      })

      expect(toolsResponse.statusCode).toBe(200)

      const toolMessages = parseSseMessages(toolsResponse.body)
      const toolListResult = toolMessages.find((message) => message.id === 2)

      expect(toolListResult).toBeDefined()
      const tools =
        ((toolListResult?.result as { tools?: Array<{ name?: string }> } | undefined)?.tools ??
          [])
          .map((tool) => tool.name)
          .sort()

      expect(tools).toEqual(
        [
          'activate_plan_mode',
          'activate_task_mode',
          'get_loop_output',
          'get_loop_runs',
          'get_monitoring',
          'get_project',
          'get_settings',
          'kill_process',
          'create_project',
          'delete_project',
          'list_hats_presets',
          'list_presets',
          'list_projects',
          'start_loop',
          'stop_loop',
          'update_project',
          'update_settings'
        ].sort()
      )
    } finally {
      await app.close()
    }
  })
})
