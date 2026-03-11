export const CHAT_PROVIDERS = ['anthropic', 'openai', 'google'] as const

export type ChatProvider = (typeof CHAT_PROVIDERS)[number]

export type ProviderApiKeyStatus = 'saved' | 'environment' | 'missing'

export interface ChatProviderModelOption {
  id: string
  label: string
}

export const CHAT_PROVIDER_MODEL_OPTIONS: Record<ChatProvider, ChatProviderModelOption[]> = {
  anthropic: [
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { id: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1' },
    { id: 'claude-3-5-haiku-20241022', label: 'Claude Haiku 3.5' }
  ],
  openai: [
    { id: 'gpt-5-mini', label: 'GPT-5 Mini' },
    { id: 'gpt-5', label: 'GPT-5' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'o3', label: 'o3' },
    { id: 'o4-mini', label: 'o4-mini' }
  ],
  google: [
    { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }
  ]
}

export const DEFAULT_CHAT_PROVIDER: ChatProvider = 'anthropic'

export const DEFAULT_CHAT_MODEL_BY_PROVIDER: Record<ChatProvider, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-5-mini',
  google: 'gemini-2.5-flash'
}

export function getProviderLabel(provider: ChatProvider) {
  switch (provider) {
    case 'anthropic':
      return 'Anthropic'
    case 'openai':
      return 'OpenAI'
    default:
      return 'Google'
  }
}

export function getModelLabel(provider: ChatProvider, model: string) {
  return (
    CHAT_PROVIDER_MODEL_OPTIONS[provider].find((option) => option.id === model)?.label ?? model
  )
}

export function normalizeChatModel(provider: ChatProvider, model: string | undefined) {
  if (model && CHAT_PROVIDER_MODEL_OPTIONS[provider].some((option) => option.id === model)) {
    return model
  }

  return DEFAULT_CHAT_MODEL_BY_PROVIDER[provider]
}
