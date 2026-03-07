import { createApp } from './app.js'
import { resolveBindHost } from './lib/safety.js'

const app = createApp()
const port = Number(process.env.PORT ?? 3003)
const host = resolveBindHost()
let shuttingDown = false

const start = async () => {
  try {
    await app.listen({ port, host })
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

const shutdown = async (signal: NodeJS.Signals) => {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  try {
    await app.close()
    process.exit(0)
  } catch (error) {
    app.log.error({ error, signal }, 'Failed to shutdown cleanly')
    process.exit(1)
  }
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})

void start()
