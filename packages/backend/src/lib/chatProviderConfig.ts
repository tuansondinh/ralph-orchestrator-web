export const CHAT_PROVIDERS = ['anthropic', 'openai', 'google'] as const

export const CHAT_PROVIDER_ENV_VAR_MAP = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY'
} as const

export type ChatProvider = (typeof CHAT_PROVIDERS)[number]

export const DEFAULT_CHAT_PROVIDER: ChatProvider = 'anthropic'
export const DEFAULT_OPENCODE_MODEL = 'claude-sonnet-4-20250514'
