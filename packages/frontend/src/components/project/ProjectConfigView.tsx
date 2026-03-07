import { useEffect, useState } from 'react'
import { parse } from 'yaml'
import { SaveSettingsAction } from '@/components/common/SaveSettingsAction'
import {
  projectConfigApi,
  type ProjectConfigSnapshot
} from '@/lib/projectConfigApi'
import { presetApi } from '@/lib/presetApi'

interface ProjectConfigViewProps {
  projectId: string
}

export function ProjectConfigView({ projectId }: ProjectConfigViewProps) {
  const [snapshot, setSnapshot] = useState<ProjectConfigSnapshot | null>(null)
  const [yamlDraft, setYamlDraft] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [presetName, setPresetName] = useState('')
  const [isSavingPreset, setIsSavingPreset] = useState(false)
  const [presetSaveMessage, setPresetSaveMessage] = useState<string | null>(null)
  const [presetErrorMessage, setPresetErrorMessage] = useState<string | null>(null)
  const [isClearingCache, setIsClearingCache] = useState(false)
  const [clearCacheMessage, setClearCacheMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSnapshot(null)
    setErrorMessage(null)
    setSaveMessage(null)

    projectConfigApi
      .get(projectId)
      .then((nextSnapshot) => {
        if (cancelled) {
          return
        }

        setSnapshot(nextSnapshot)
        setYamlDraft(nextSnapshot.yaml)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load project config')
        }
      })

    return () => {
      cancelled = true
    }
  }, [projectId])

  const onSave = async () => {
    if (!snapshot) {
      return
    }

    setIsSaving(true)
    setSaveMessage(null)
    setErrorMessage(null)

    try {
      try {
        parse(yamlDraft)
      } catch {
        throw new Error('Invalid YAML syntax')
      }

      const updated = await projectConfigApi.update({
        projectId,
        yaml: yamlDraft
      })

      setSnapshot(updated)
      setYamlDraft(updated.yaml)
      setSaveMessage('Project settings saved.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save config')
    } finally {
      setIsSaving(false)
    }
  }

  const onSaveAsPreset = async () => {
    setIsSavingPreset(true)
    setPresetSaveMessage(null)
    setPresetErrorMessage(null)

    try {
      const saved = await presetApi.save(presetName, yamlDraft)
      setPresetSaveMessage(`Saved as preset "${saved.name}". Available in Start Loop.`)
      setPresetName('')
    } catch (error) {
      setPresetErrorMessage(error instanceof Error ? error.message : 'Unable to save preset')
    } finally {
      setIsSavingPreset(false)
    }
  }

  const onClearRalphCache = async () => {
    const confirmed = window.confirm("Delete the .ralph folder for this project? This clears Ralph's memory and cache.")
    if (!confirmed) {
      return
    }

    setIsClearingCache(true)
    setClearCacheMessage(null)

    try {
      await projectConfigApi.clearRalphCache(projectId)
      setClearCacheMessage('Ralph cache cleared.')
    } catch (error) {
      setClearCacheMessage(error instanceof Error ? error.message : 'Unable to clear Ralph cache')
    } finally {
      setIsClearingCache(false)
    }
  }

  if (!snapshot) {
    return (
      <section className="space-y-3 rounded-md border border-zinc-800 p-4">
        <h2 className="text-xl font-semibold">Project settings</h2>
        <p className="text-sm text-zinc-400">Loading project config...</p>
        {errorMessage ? <p className="text-sm text-red-300">{errorMessage}</p> : null}
      </section>
    )
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-md border border-zinc-800 p-4 pb-8">
      <h2 className="text-xl font-semibold">Project settings</h2>

      <label className="flex min-h-0 flex-1 flex-col gap-1 text-sm" htmlFor="project-config-yaml">
        YAML configuration
        <textarea
          className="min-h-[24rem] w-full flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100"
          id="project-config-yaml"
          onChange={(event) => setYamlDraft(event.target.value)}
          value={yamlDraft}
        />
      </label>

      <div className="flex items-center gap-3">
        <SaveSettingsAction
          errorMessage={errorMessage}
          isSaving={isSaving}
          onSave={onSave}
          saveMessage={saveMessage}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500"
          onChange={(event) => setPresetName(event.target.value)}
          placeholder="my-preset"
          type="text"
          value={presetName}
        />
        <button
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!presetName.trim() || isSavingPreset}
          onClick={() => { void onSaveAsPreset() }}
          type="button"
        >
          {isSavingPreset ? 'Saving…' : 'Save as preset'}
        </button>
        {presetSaveMessage ? (
          <p className="text-sm text-green-400">{presetSaveMessage}</p>
        ) : null}
        {presetErrorMessage ? (
          <p className="text-sm text-red-400">{presetErrorMessage}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-md border border-red-700 px-3 py-2 text-sm text-red-200 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isClearingCache}
          onClick={() => { void onClearRalphCache() }}
          type="button"
        >
          {isClearingCache ? 'Clearing…' : 'Clear Ralph cache'}
        </button>
        {clearCacheMessage ? (
          <p className="text-sm text-zinc-400">{clearCacheMessage}</p>
        ) : null}
      </div>
    </section>
  )
}
