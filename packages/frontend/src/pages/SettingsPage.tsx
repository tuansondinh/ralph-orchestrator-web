import { useEffect, useMemo, useState } from 'react'
import { SaveSettingsAction } from '@/components/common/SaveSettingsAction'
import {
  settingsApi,
  type SettingsSnapshot,
  type SettingsUpdateInput
} from '@/lib/settingsApi'
import { GitHubConnectCard } from '@/components/settings/GitHubConnectCard'
import { RalphProcessList } from '@/components/system/RalphProcessList'

const PROVIDER_TO_ASSISTANT_MODEL = {
  anthropic: 'claude',
  openai: 'openai',
  google: 'gemini'
} as const satisfies Record<SettingsSnapshot['chatProvider'], SettingsSnapshot['chatModel']>

function toUpdateInput(
  settings: SettingsSnapshot,
  options?: {
    providerApiKeys?: SettingsUpdateInput['providerApiKeys']
  }
): SettingsUpdateInput {
  return {
    chatModel: PROVIDER_TO_ASSISTANT_MODEL[settings.chatProvider],
    chatProvider: settings.chatProvider,
    opencodeModel: settings.opencodeModel,
    providerApiKeys: options?.providerApiKeys,
    ralphBinaryPath: settings.ralphBinaryPath,
    notifications: { ...settings.notifications },
    preview: { ...settings.preview }
  }
}

function parsePort(value: string, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function SettingsPage() {
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null)
  const [chatApiKeyInput, setChatApiKeyInput] = useState('')
  const [clearStoredApiKey, setClearStoredApiKey] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [binaryMessage, setBinaryMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isTestingBinary, setIsTestingBinary] = useState(false)
  const [isClearingData, setIsClearingData] = useState(false)

  useEffect(() => {
    let cancelled = false
    settingsApi
      .get()
      .then((result) => {
        if (!cancelled) {
          setSettings(result)
          setChatApiKeyInput('')
          setClearStoredApiKey(false)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load settings')
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const updateSettings = (updater: (current: SettingsSnapshot) => SettingsSnapshot) => {
    setSettings((current) => {
      if (!current) {
        return current
      }

      return updater(current)
    })
  }

  const dbPathLabel = useMemo(() => settings?.data.dbPath ?? 'Unknown', [settings])
  const selectedChatEnvVar = settings
    ? settings.providerEnvVarMap?.[settings.chatProvider] ?? null
    : null
  const isChatApiKeyMissing = settings
    ? settings.apiKeyStatus?.[settings.chatProvider] === false
    : false
  const hasStoredChatApiKey = settings
    ? settings.storedApiKeyStatus?.[settings.chatProvider] === true
    : false

  const onSave = async () => {
    if (!settings) {
      return
    }

    setIsSaving(true)
    setErrorMessage(null)
    setSaveMessage(null)

    try {
      const providerApiKeys =
        clearStoredApiKey || chatApiKeyInput.trim().length > 0
          ? {
              [settings.chatProvider]: clearStoredApiKey ? null : chatApiKeyInput.trim()
            }
          : undefined
      const updated = await settingsApi.update(
        toUpdateInput(settings, {
          providerApiKeys
        })
      )
      setSettings(updated)
      setChatApiKeyInput('')
      setClearStoredApiKey(false)
      setSaveMessage('Settings saved.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  const onTestBinary = async () => {
    if (!settings) {
      return
    }

    setIsTestingBinary(true)
    setErrorMessage(null)
    setBinaryMessage(null)

    try {
      const result = await settingsApi.testBinary({
        path: settings.ralphBinaryPath ?? undefined
      })
      setBinaryMessage(`Detected ${result.version} at ${result.path}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to validate binary')
    } finally {
      setIsTestingBinary(false)
    }
  }

  const onClearData = async () => {
    const confirmed = window.confirm(
      'Clear all project, loop, chat, and notification data from the local database?'
    )
    if (!confirmed) {
      return
    }

    setIsClearingData(true)
    setErrorMessage(null)
    setSaveMessage(null)

    try {
      await settingsApi.clearData({ confirm: true })
      setSaveMessage('Data cleared.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to clear data')
    } finally {
      setIsClearingData(false)
    }
  }

  if (!settings) {
    return (
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-zinc-400">Loading settings...</p>
        {errorMessage ? <p className="text-sm text-red-300">{errorMessage}</p> : null}
      </section>
    )
  }

  return (
    <section className="space-y-6 pb-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-zinc-400">
          Configure assistant, chat, Ralph binary, notification behavior, and preview defaults.
        </p>
      </header>

      <section className="space-y-3 rounded-md border border-zinc-800 p-4">
        <h2 className="text-lg font-semibold">Assistant</h2>
        <div className="grid max-w-2xl gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm" htmlFor="chat-provider">
            Provider
            <select
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              id="chat-provider"
              onChange={(event) =>
                updateSettings((current) => ({
                  ...current,
                  chatProvider: event.target.value as SettingsSnapshot['chatProvider'],
                  chatModel:
                    PROVIDER_TO_ASSISTANT_MODEL[
                      event.target.value as SettingsSnapshot['chatProvider']
                    ]
                }))
              }
              value={settings.chatProvider}
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="google">Google</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm" htmlFor="opencode-model">
            Model
            <input
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              id="opencode-model"
              onChange={(event) =>
                updateSettings((current) => ({
                  ...current,
                  opencodeModel: event.target.value
                }))
              }
              type="text"
              value={settings.opencodeModel}
            />
          </label>
        </div>

        <div className="max-w-2xl space-y-3">
          <label className="flex flex-col gap-1 text-sm" htmlFor="chat-api-key">
            API key
            <input
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              id="chat-api-key"
              onChange={(event) => {
                setChatApiKeyInput(event.target.value)
                if (clearStoredApiKey) {
                  setClearStoredApiKey(false)
                }
              }}
              placeholder={
                hasStoredChatApiKey
                  ? 'Stored key configured. Enter a new key to replace it.'
                  : `Paste ${selectedChatEnvVar ?? 'provider'} here to store it in Ralph settings.`
              }
              type="password"
              value={chatApiKeyInput}
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              checked={clearStoredApiKey}
              onChange={(event) => setClearStoredApiKey(event.target.checked)}
              type="checkbox"
            />
            Clear the stored API key for this provider on save
          </label>

          {hasStoredChatApiKey ? (
            <p className="text-sm text-zinc-400">
              A stored API key is already configured for this provider.
            </p>
          ) : null}
        </div>

        {isChatApiKeyMissing && selectedChatEnvVar ? (
          <p className="text-sm text-amber-300">
            No stored key or {selectedChatEnvVar} environment variable is configured. Assistant
            responses will fail until one is set.
          </p>
        ) : null}
      </section>

      <section className="space-y-3 rounded-md border border-zinc-800 p-4">
        <h2 className="text-lg font-semibold">Ralph binary</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[280px] flex-1 flex-col gap-1 text-sm" htmlFor="ralph-binary">
            Ralph binary path
            <input
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              id="ralph-binary"
              onChange={(event) =>
                updateSettings((current) => ({
                  ...current,
                  ralphBinaryPath: event.target.value
                }))
              }
              type="text"
              value={settings.ralphBinaryPath ?? ''}
            />
          </label>

          <button
            className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
            onClick={() => {
              const element = document.getElementById('ralph-binary')
              if (element instanceof HTMLInputElement) {
                element.focus()
                element.select()
              }
            }}
            type="button"
          >
            Browse
          </button>

          <button
            className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isTestingBinary}
            onClick={() => void onTestBinary()}
            type="button"
          >
            Test binary
          </button>
        </div>

        {binaryMessage ? <p className="text-sm text-emerald-300">{binaryMessage}</p> : null}
      </section>

      <section className="space-y-3 rounded-md border border-zinc-800 p-4">
        <h2 className="text-lg font-semibold">Notifications</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            checked={settings.notifications.loopComplete}
            onChange={(event) =>
              updateSettings((current) => ({
                ...current,
                notifications: {
                  ...current.notifications,
                  loopComplete: event.target.checked
                }
              }))
            }
            type="checkbox"
          />
          Loop complete notifications
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            checked={settings.notifications.loopFailed}
            onChange={(event) =>
              updateSettings((current) => ({
                ...current,
                notifications: {
                  ...current.notifications,
                  loopFailed: event.target.checked
                }
              }))
            }
            type="checkbox"
          />
          Loop failed notifications
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            checked={settings.notifications.needsInput}
            onChange={(event) =>
              updateSettings((current) => ({
                ...current,
                notifications: {
                  ...current.notifications,
                  needsInput: event.target.checked
                }
              }))
            }
            type="checkbox"
          />
          Needs input notifications
        </label>
      </section>

      <section className="space-y-3 rounded-md border border-zinc-800 p-4">
        <h2 className="text-lg font-semibold">Dev Preview</h2>
        <div className="grid max-w-md grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm" htmlFor="preview-port-start">
            Preview port start
            <input
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              id="preview-port-start"
              onChange={(event) =>
                updateSettings((current) => ({
                  ...current,
                  preview: {
                    ...current.preview,
                    portStart: parsePort(event.target.value, current.preview.portStart)
                  }
                }))
              }
              type="number"
              value={settings.preview.portStart}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm" htmlFor="preview-port-end">
            Preview port end
            <input
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              id="preview-port-end"
              onChange={(event) =>
                updateSettings((current) => ({
                  ...current,
                  preview: {
                    ...current.preview,
                    portEnd: parsePort(event.target.value, current.preview.portEnd)
                  }
                }))
              }
              type="number"
              value={settings.preview.portEnd}
            />
          </label>
        </div>
      </section>

      <GitHubConnectCard />

      <RalphProcessList />

      <section className="space-y-3 rounded-md border border-zinc-800 p-4">
        <h2 className="text-lg font-semibold">Data</h2>
        <p className="text-sm text-zinc-400">Database: {dbPathLabel}</p>
        <button
          className="rounded-md border border-red-700 px-3 py-2 text-sm text-red-200 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isClearingData}
          onClick={() => void onClearData()}
          type="button"
        >
          Clear data
        </button>
      </section>

      <footer className="flex items-center gap-3">
        <SaveSettingsAction
          errorMessage={errorMessage}
          isSaving={isSaving}
          onSave={onSave}
          saveMessage={saveMessage}
        />
      </footer>
    </section>
  )
}
