import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ConfigurePreviewDialog,
  type PreviewConfigInput
} from '@/components/preview/ConfigurePreviewDialog'
import { PreviewError } from '@/components/preview/PreviewError'
import { PreviewFrame } from '@/components/preview/PreviewFrame'
import { PreviewToolbar } from '@/components/preview/PreviewToolbar'
import { useWebSocket } from '@/hooks/useWebSocket'
import {
  previewApi,
  type PreviewSettings,
  type PreviewStatus
} from '@/lib/previewApi'

interface PreviewViewProps {
  projectId: string
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((candidate): candidate is string => typeof candidate === 'string')
}

function parseUrl(raw: string) {
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

function stripTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function buildPreviewUrl(baseUrl: string, port: number) {
  const parsed = parseUrl(baseUrl)
  if (!parsed) {
    return null
  }

  parsed.port = String(port)
  parsed.pathname = ''
  parsed.search = ''
  parsed.hash = ''
  return stripTrailingSlash(parsed.toString())
}

function asPreviewStatus(message: Record<string, unknown>): PreviewStatus | null {
  if (message.type !== 'preview.state') {
    return null
  }

  const state = asString(message.state)
  if (state !== 'starting' && state !== 'ready' && state !== 'stopped' && state !== 'error') {
    return null
  }

  const projectId = asString(message.projectId)
  if (!projectId) {
    return null
  }

  const url = asString(message.url)
  const command = asString(message.command)

  return {
    projectId,
    state,
    url,
    port: asNumber(message.port, 0),
    command,
    args: asArray(message.args),
    error: typeof message.error === 'string' ? message.error : null
  }
}

export function PreviewView({ projectId }: PreviewViewProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isRestarting, setIsRestarting] = useState(false)
  const [isSavingUrl, setIsSavingUrl] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewStatus | null>(null)
  const [previewUrlInput, setPreviewUrlInput] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const [isConfigureOpen, setIsConfigureOpen] = useState(false)
  const [previewSettings, setPreviewSettings] = useState<PreviewSettings | null>(null)
  const [settingsSaveMessage, setSettingsSaveMessage] = useState<string | null>(null)

  const channels = useMemo(() => [`preview:${projectId}:state`], [projectId])

  const startPreview = useCallback(async () => {
    const started = await previewApi.start(projectId)
    setPreview(started)
    setRequestError(null)
  }, [projectId])

  useEffect(() => {
    let cancelled = false

    setIsLoading(true)
    setRequestError(null)
    setSettingsSaveMessage(null)
    setPreview(null)
    setPreviewUrlInput('')

    const load = async () => {
      try {
        const current = await previewApi.status(projectId)
        if (cancelled) {
          return
        }

        if (!current || current.state === 'stopped') {
          await startPreview()
          return
        }

        setPreview(current)
      } catch (error) {
        if (!cancelled) {
          setRequestError(error instanceof Error ? error.message : 'Failed to load preview')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [projectId, startPreview])

  useEffect(() => {
    let cancelled = false

    previewApi
      .getSettings()
      .then((settings) => {
        if (!cancelled) {
          setPreviewSettings(settings)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRequestError(error instanceof Error ? error.message : 'Failed to load preview settings')
        }
      })

    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    if (preview?.url) {
      setPreviewUrlInput(preview.url)
      return
    }

    if (previewSettings?.baseUrl && preview?.port) {
      const configured = buildPreviewUrl(previewSettings.baseUrl, preview.port)
      if (configured) {
        setPreviewUrlInput(configured)
      }
    }
  }, [preview?.port, preview?.url, previewSettings?.baseUrl])

  const handleMessage = useCallback(
    (message: Record<string, unknown>) => {
      const nextPreview = asPreviewStatus(message)
      if (!nextPreview || nextPreview.projectId !== projectId) {
        return
      }

      setPreview(nextPreview)
      if (nextPreview.state === 'error') {
        setRequestError(nextPreview.error ?? 'Preview process crashed')
      } else {
        setRequestError(null)
      }
    },
    [projectId]
  )

  const { isConnected } = useWebSocket({
    channels,
    onMessage: handleMessage
  })

  const activePreviewUrl = useMemo(() => {
    const parsedInput = parseUrl(previewUrlInput.trim())
    if (parsedInput) {
      return stripTrailingSlash(parsedInput.toString())
    }

    return preview?.url ?? null
  }, [preview?.url, previewUrlInput])

  const handleRestart = useCallback(async () => {
    setIsRestarting(true)
    try {
      await startPreview()
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Failed to restart preview')
    } finally {
      setIsRestarting(false)
    }
  }, [startPreview])

  const handleCopyUrl = useCallback(() => {
    if (!activePreviewUrl || !navigator.clipboard?.writeText) {
      return
    }

    void navigator.clipboard.writeText(activePreviewUrl)
  }, [activePreviewUrl])

  const handleOpenInBrowser = useCallback(() => {
    if (!activePreviewUrl) {
      return
    }

    window.open(activePreviewUrl, '_blank', 'noopener,noreferrer')
  }, [activePreviewUrl])

  const handleSaveUrl = useCallback(async () => {
    const parsed = parseUrl(previewUrlInput.trim())
    if (!parsed) {
      setRequestError('Preview URL must be a valid http(s) URL')
      return
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      setRequestError('Preview URL must use http:// or https://')
      return
    }

    setIsSavingUrl(true)
    try {
      const updated = await previewApi.setSettings({
        baseUrl: parsed.origin
      })
      setPreviewSettings(updated)
      setSettingsSaveMessage('Preview URL saved.')
      setRequestError(null)

      if (preview?.port) {
        const nextUrl = buildPreviewUrl(updated.baseUrl, preview.port)
        if (nextUrl) {
          setPreview((current) => (current ? { ...current, url: nextUrl } : current))
          setPreviewUrlInput(nextUrl)
          setReloadToken((value) => value + 1)
        }
      }
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Failed to save preview URL')
    } finally {
      setIsSavingUrl(false)
    }
  }, [preview?.port, previewUrlInput])

  const handleSaveConfig = useCallback(async (config: PreviewConfigInput) => {
    try {
      const updated = await previewApi.setSettings(config)
      setPreviewSettings(updated)
      setSettingsSaveMessage('Preview settings saved.')
      setRequestError(null)
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Failed to save preview settings')
      throw error
    }
  }, [])

  const errorMessage = preview?.error ?? requestError

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Preview</h2>
        <span className="text-xs text-zinc-400">
          {isConnected ? 'Live connected' : 'Connecting...'}
        </span>
      </div>

      <PreviewToolbar
        args={preview?.args ?? []}
        command={preview?.command ?? null}
        isSavingUrl={isSavingUrl}
        onConfigure={() => setIsConfigureOpen(true)}
        onCopyUrl={handleCopyUrl}
        onOpenInBrowser={handleOpenInBrowser}
        onRefresh={() => setReloadToken((value) => value + 1)}
        onSaveUrl={handleSaveUrl}
        onUrlInputChange={setPreviewUrlInput}
        state={preview?.state ?? 'stopped'}
        url={activePreviewUrl}
        urlInput={previewUrlInput}
      />

      {settingsSaveMessage ? (
        <p className="text-sm text-emerald-300">
          {settingsSaveMessage}
        </p>
      ) : null}

      {requestError && !preview?.error ? (
        <p className="text-sm text-red-400">{requestError}</p>
      ) : null}

      {isLoading ? <p className="text-sm text-zinc-400">Loading preview status...</p> : null}
      {preview?.state === 'starting' ? (
        <p className="text-sm text-zinc-300">Starting preview server...</p>
      ) : null}

      {preview?.state === 'error' ? (
        <PreviewError
          isRestarting={isRestarting}
          message={errorMessage ?? 'Preview process crashed'}
          onConfigure={() => setIsConfigureOpen(true)}
          onRestart={handleRestart}
        />
      ) : null}

      {preview?.state === 'ready' && activePreviewUrl ? (
        <PreviewFrame
          key={`${activePreviewUrl}-${reloadToken}`}
          onError={() => setRequestError('Preview frame failed to load')}
          url={activePreviewUrl}
        />
      ) : null}

      {!isLoading && preview?.state === 'stopped' ? (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">
          Preview server is stopped. Use restart if you want to try again.
        </section>
      ) : null}

      <ConfigurePreviewDialog
        initialBaseUrl={previewSettings?.baseUrl ?? 'http://localhost'}
        initialCommand={previewSettings?.command ?? null}
        onClose={() => setIsConfigureOpen(false)}
        onSave={handleSaveConfig}
        open={isConfigureOpen}
      />
    </section>
  )
}
