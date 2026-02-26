import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

const filename = fileURLToPath(import.meta.url)
const packageRoot = dirname(filename)
const repoRoot = resolve(packageRoot, '..', '..')
const e2eRoot = resolve(packageRoot, 'test', '.tmp', 'e2e')
const fixtureProjectPath = resolve(e2eRoot, 'project')
const dbPath = resolve(e2eRoot, 'data.db')
const mockRalphPath = resolve(packageRoot, 'test', 'fixtures', 'mock-ralph.sh')
const backendPort = '43300'
const frontendPort = '41731'
const backendOrigin = `http://127.0.0.1:${backendPort}`
const frontendOrigin = `http://127.0.0.1:${frontendPort}`

function prepareE2EProjectFixture() {
  rmSync(e2eRoot, { recursive: true, force: true })
  mkdirSync(resolve(fixtureProjectPath, '.agent'), { recursive: true })

  const packageJson = {
    name: 'e2e-preview-project',
    version: '1.0.0',
    private: true,
    scripts: {
      dev: 'node dev-server.mjs'
    }
  }

  const devServerScript = `#!/usr/bin/env node
import { createServer } from 'node:http'

const args = process.argv.slice(2)
const portArgIndex = args.findIndex((arg) => arg === '--port' || arg === '-p')
const rawPort =
  portArgIndex >= 0 && portArgIndex + 1 < args.length
    ? args[portArgIndex + 1]
    : process.env.PORT || '3001'
const parsedPort = Number.parseInt(String(rawPort), 10)
const port = Number.isFinite(parsedPort) ? parsedPort : 3001

const server = createServer((_req, res) => {
  res.statusCode = 200
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.end('<!doctype html><html><body><h1>Preview fixture</h1></body></html>')
})

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(\`Local: http://127.0.0.1:\${port}\\n\`)
})

const shutdown = () => {
  server.close(() => process.exit(0))
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
`

  writeFileSync(resolve(fixtureProjectPath, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')
  writeFileSync(resolve(fixtureProjectPath, 'dev-server.mjs'), devServerScript, 'utf8')
  writeFileSync(resolve(fixtureProjectPath, 'ralph.yml'), 'name: e2e-fixture\n', 'utf8')
  writeFileSync(
    resolve(fixtureProjectPath, '.agent', 'event_history.jsonl'),
    `${JSON.stringify({
      topic: 'task.complete',
      sourceHat: 'builder',
      payload: { taskId: 'fixture-task' },
      timestamp: '2026-02-19T00:00:00.000Z'
    })}\n`,
    'utf8'
  )
}

prepareE2EProjectFixture()

process.env.RALPH_UI_E2E_PROJECT_PATH = fixtureProjectPath
process.env.RALPH_UI_E2E_DB_PATH = dbPath
process.env.RALPH_UI_E2E_MOCK_RALPH = mockRalphPath

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: frontendOrigin,
    trace: 'on-first-retry'
  },
  webServer: [
    {
      command: 'npm run dev -w @ralph-ui/backend',
      cwd: repoRoot,
      url: `${backendOrigin}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        PORT: backendPort,
        RALPH_UI_DB_PATH: dbPath,
        RALPH_UI_RALPH_BIN: mockRalphPath,
        RALPH_UI_METRICS_INTERVAL_MS: '250'
      }
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${frontendPort} --strictPort`,
      cwd: packageRoot,
      url: frontendOrigin,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_RALPH_ORCHESTRATOR_BACKEND_ORIGIN: backendOrigin
      }
    }
  ]
})
