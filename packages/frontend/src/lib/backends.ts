export const RALPH_BACKENDS = [
  'claude',
  'kiro',
  'gemini',
  'codex',
  'amp',
  'copilot',
  'opencode'
] as const

export type RalphBackend = (typeof RALPH_BACKENDS)[number]
