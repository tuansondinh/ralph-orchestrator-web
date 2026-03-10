import { createOpencode } from '@opencode-ai/sdk'

async function main() {
  const { client, server } = await createOpencode({
    config: {
      model: 'anthropic/claude-sonnet-4-20250514',
      mcp: {
        ralph: {
          type: 'remote',
          enabled: true,
          url: 'http://localhost:3003/mcp'
        }
      }
    }
  })

  try {
    const session = await client.session.create({})
    const events = await client.event.subscribe({})

    void (async () => {
      for await (const event of events.stream) {
        if (event.type === 'permission.updated') {
          console.log('permission.updated', event.properties.id)
        }
      }
    })()

    await client.session.promptAsync({
      path: { id: session.data?.id ?? session.id },
      body: {
        parts: [{ type: 'text', text: 'List projects, then try start_loop.' }]
      }
    })

    await client.config.update({
      body: {
        model: 'openai/gpt-4o'
      }
    })
  } finally {
    server.close()
  }
}

void main().catch((error) => {
  console.error(error)
  process.kill(process.pid, 'SIGKILL')
})
