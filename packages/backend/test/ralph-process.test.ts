import { describe, expect, it } from 'vitest'
import { isLikelyRalphCommand } from '../src/services/RalphProcessService.js'

describe('isLikelyRalphCommand', () => {
  it('accepts direct ralph executable commands even when path includes lucent-builder', () => {
    const command =
      '/Users/sonwork/Workspace/lucent-builder/node_modules/@ralph-orchestrator/ralph-cli/node_modules/.bin_real/ralph run --config /Users/sonwork/Workspace/check4recycling/ralph.yml'

    expect(isLikelyRalphCommand(command)).toBe(true)
  })

  it('accepts wrapped node invocations that execute a ralph script', () => {
    const command =
      'node --conditions node /Users/sonwork/Workspace/lucent-builder/node_modules/@ralph-orchestrator/ralph-cli/node_modules/.bin_real/ralph loops'

    expect(isLikelyRalphCommand(command)).toBe(true)
  })

  it('rejects unrelated commands that only mention ralph in arguments or prompt text', () => {
    const codexCommand =
      '/Users/sonwork/.nvm/versions/node/v22.22.0/lib/node_modules/@openai/codex/vendor/codex/codex --prompt "run ralph loops and emit LOOP_COMPLETE"'
    const viteCommand =
      'node /Users/sonwork/Workspace/lucent-builder/node_modules/.bin/vite'

    expect(isLikelyRalphCommand(codexCommand)).toBe(false)
    expect(isLikelyRalphCommand(viteCommand)).toBe(false)
  })
})
