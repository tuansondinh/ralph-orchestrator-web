import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SPIKE_SCRIPT_PATH = new URL('../../../scripts/opencode-spike.ts', import.meta.url)
const SPIKE_RESULTS_PATH = new URL(
  '../../../specs/chat-loop-control/research/opencode-spike-results.md',
  import.meta.url
)

describe('OpenCode spike deliverables', () => {
  it('ships a runnable spike script that exercises the required SDK paths', async () => {
    await expect(access(SPIKE_SCRIPT_PATH, constants.F_OK)).resolves.toBeUndefined()

    const script = await readFile(SPIKE_SCRIPT_PATH, 'utf8')

    expect(script).toContain('@opencode-ai/sdk')
    expect(script).toContain('createOpencode')
    expect(script).toContain('/mcp')
    expect(script).toContain('client.event.subscribe')
    expect(script).toContain('permission.updated')
    expect(script).toContain('config.update')
    expect(script).toMatch(/SIGKILL|kill/i)
  })

  it('documents permission, lifecycle, and model update findings for the implementation task', async () => {
    await expect(access(SPIKE_RESULTS_PATH, constants.F_OK)).resolves.toBeUndefined()

    const results = await readFile(SPIKE_RESULTS_PATH, 'utf8')

    expect(results).toContain('permission.updated')
    expect(results).toMatch(/start_loop|stop_loop/)
    expect(results).toMatch(/config\.update|model update/i)
    expect(results).toMatch(/SIGKILL|crash recovery|restart/i)
    expect(results).toMatch(/recommended implementation strategy/i)
  })
})
