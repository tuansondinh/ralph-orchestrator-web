import { useEffect, useState } from 'react'
import { hatsPresetApi, type HatsPresetSummary } from '@/lib/hatsPresetApi'
import { projectConfigApi } from '@/lib/projectConfigApi'

interface HatsPresetsViewProps {
  projectId: string
}

export function HatsPresetsView({ projectId }: HatsPresetsViewProps) {
  const [presets, setPresets] = useState<HatsPresetSummary[]>([])
  const [sourceDirectory, setSourceDirectory] = useState<string | null>(null)
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [yamlContent, setYamlContent] = useState('')
  const [isLoadingPresets, setIsLoadingPresets] = useState(true)
  const [isLoadingContent, setIsLoadingContent] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoadingPresets(true)
    setErrorMessage(null)
    setSaveMessage(null)
    setYamlContent('')
    setSelectedPresetId('')

    hatsPresetApi
      .list()
      .then((result) => {
        if (cancelled) {
          return
        }

        setSourceDirectory(result.sourceDirectory)
        setPresets(result.presets)
        setSelectedPresetId(result.presets[0]?.id ?? '')
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Unable to load hats presets'
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingPresets(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedPresetId) {
      setYamlContent('')
      return
    }

    let cancelled = false
    setIsLoadingContent(true)
    setErrorMessage(null)
    setSaveMessage(null)

    hatsPresetApi
      .get(selectedPresetId)
      .then((result) => {
        if (cancelled) {
          return
        }

        setYamlContent(result.content)
        setSourceDirectory(result.sourceDirectory)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setYamlContent('')
          setErrorMessage(
            error instanceof Error ? error.message : 'Unable to load preset config'
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingContent(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedPresetId])

  const onApplyToSettings = async () => {
    if (!selectedPresetId || !yamlContent) {
      return
    }

    const confirmed = window.confirm(
      'Replace the current project settings YAML with this hats preset?'
    )
    if (!confirmed) {
      return
    }

    setIsApplying(true)
    setErrorMessage(null)
    setSaveMessage(null)

    try {
      await projectConfigApi.update({
        projectId,
        yaml: yamlContent
      })
      setSaveMessage('Preset copied to project settings.')
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to copy preset to settings'
      )
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-md border border-zinc-800 p-4 pb-8">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Hats presets</h2>
        <p className="text-sm text-zinc-400">
          Browse preset YAML configs and copy one into this project&apos;s settings.
        </p>
        {sourceDirectory ? (
          <p className="text-xs text-zinc-500">
            Source: <code>{sourceDirectory}</code>
          </p>
        ) : null}
      </header>

      {isLoadingPresets ? (
        <p className="text-sm text-zinc-400">Loading hats presets...</p>
      ) : (
        <label className="flex max-w-xl flex-col gap-1 text-sm" htmlFor="hats-preset-select">
          Preset
          <select
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            id="hats-preset-select"
            onChange={(event) => {
              setSelectedPresetId(event.target.value)
            }}
            value={selectedPresetId}
          >
            {presets.length === 0 ? (
              <option value="">No presets found</option>
            ) : (
              presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.id}
                </option>
              ))
            )}
          </select>
        </label>
      )}

      <label className="flex min-h-0 flex-1 flex-col gap-1 text-sm" htmlFor="hats-preset-yaml">
        YAML config
        <textarea
          className="min-h-[24rem] w-full flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100"
          id="hats-preset-yaml"
          readOnly
          value={
            isLoadingContent
              ? 'Loading preset config...'
              : yamlContent || '# Select a preset to view its YAML config.'
          }
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isApplying || !selectedPresetId || !yamlContent}
          onClick={() => void onApplyToSettings()}
          type="button"
        >
          Copy to project settings
        </button>
        {saveMessage ? <p className="text-sm text-emerald-300">{saveMessage}</p> : null}
        {errorMessage ? <p className="text-sm text-red-300">{errorMessage}</p> : null}
      </div>
    </section>
  )
}
