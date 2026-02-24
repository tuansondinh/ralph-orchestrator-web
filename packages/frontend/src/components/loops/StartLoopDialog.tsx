import { FormEvent, useCallback, useEffect, useState } from 'react'
import type { StartLoopInput } from '@/lib/loopApi'
import { presetApi, type PresetSummary } from '@/lib/presetApi'
import { settingsApi } from '@/lib/settingsApi'
import { worktreeApi, type WorktreeSummary } from '@/lib/worktreeApi'

interface StartLoopDialogProps {
  projectId: string
  onStart: (input: StartLoopInput) => Promise<void>
}

const FALLBACK_PRESET_FILENAME = 'hatless-baseline.yml'

function selectAvailablePreset(presets: PresetSummary[], preferred: string) {
  const normalizedPreferred = preferred.trim()
  const hasPreferred = presets.some((preset) => preset.filename === normalizedPreferred)
  if (hasPreferred) {
    return normalizedPreferred
  }

  return presets[0]?.filename ?? ''
}

export function StartLoopDialog({ projectId, onStart }: StartLoopDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSavingDefault, setIsSavingDefault] = useState(false)
  const [isPresetLoading, setIsPresetLoading] = useState(false)
  const [isWorktreeLoading, setIsWorktreeLoading] = useState(false)
  const [isCreatingWorktree, setIsCreatingWorktree] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [presets, setPresets] = useState<PresetSummary[]>([])
  const [worktrees, setWorktrees] = useState<WorktreeSummary[]>([])
  const [selectedWorktree, setSelectedWorktree] = useState('')
  const [newWorktreeName, setNewWorktreeName] = useState('')
  const [defaultPreset, setDefaultPreset] = useState(FALLBACK_PRESET_FILENAME)
  const [selectedPreset, setSelectedPreset] = useState(FALLBACK_PRESET_FILENAME)
  const [exclusive, setExclusive] = useState(false)

  const resetForm = useCallback(() => {
    setPrompt('')
    setSelectedPreset(selectAvailablePreset(presets, defaultPreset))
    setSelectedWorktree('')
    setNewWorktreeName('')
    setExclusive(false)
    setError(null)
    setStatusMessage(null)
  }, [defaultPreset, presets])



  useEffect(() => {
    let cancelled = false
    setIsPresetLoading(true)
    setError(null)

    Promise.all([presetApi.list(projectId), settingsApi.getDefaultPreset()])
      .then(([nextPresets, configuredDefault]) => {
        if (cancelled) {
          return
        }

        setPresets(nextPresets)
        const normalizedDefault =
          configuredDefault.trim().length > 0
            ? configuredDefault
            : FALLBACK_PRESET_FILENAME
        setDefaultPreset(normalizedDefault)

        if (nextPresets.length === 0) {
          setSelectedPreset('')
          setError('No presets available. Add a preset YAML file first.')
          return
        }

        const selected = selectAvailablePreset(nextPresets, normalizedDefault)
        setSelectedPreset(selected)

        if (selected !== normalizedDefault) {
          setError(
            `Default preset "${normalizedDefault}" is unavailable. Using "${selected}" for this run.`
          )
          return
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(
            nextError instanceof Error ? nextError.message : 'Failed to load presets'
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsPresetLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    let cancelled = false
    setIsWorktreeLoading(true)

    worktreeApi
      .list(projectId)
      .then((nextWorktrees) => {
        if (!cancelled) {
          setWorktrees(nextWorktrees)
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(
            nextError instanceof Error ? nextError.message : 'Failed to load worktrees'
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsWorktreeLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [projectId])



  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    if (!selectedPreset) {
      setError('Select a preset before starting a loop.')
      setIsSubmitting(false)
      return
    }

    try {
      const payload: StartLoopInput = {
        prompt: prompt.trim() || undefined,
        presetFilename: selectedPreset,
        exclusive
      }
      if (selectedWorktree) {
        payload.worktree = selectedWorktree
      }

      await onStart(payload)
      resetForm()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to start loop')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSaveDefaultPreset = async () => {
    if (!selectedPreset) {
      setError('Select a preset before saving it as default.')
      return
    }

    setError(null)
    setStatusMessage(null)
    setIsSavingDefault(true)

    try {
      const saved = await settingsApi.setDefaultPreset({
        filename: selectedPreset,
        projectId
      })
      setDefaultPreset(saved)
      setStatusMessage('Default preset saved.')
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to save default preset'
      )
    } finally {
      setIsSavingDefault(false)
    }
  }

  const handleCreateWorktree = async () => {
    const trimmed = newWorktreeName.trim()
    if (!trimmed) {
      setError('Worktree name is required.')
      return
    }

    setError(null)
    setStatusMessage(null)
    setIsCreatingWorktree(true)

    try {
      const created = await worktreeApi.create(projectId, trimmed)
      setWorktrees((current) => {
        const next = current.filter((item) => item.name !== created.name)
        return [...next, created].sort((a, b) => a.name.localeCompare(b.name))
      })
      setSelectedWorktree(created.branch ?? created.name)
      setNewWorktreeName('')
      setStatusMessage(`Worktree "${created.name}" created.`)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to create worktree')
    } finally {
      setIsCreatingWorktree(false)
    }
  }



  return (
    <section className="w-full space-y-3 rounded-lg border border-zinc-700 bg-zinc-900 p-4">
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div className="space-y-1">
          <label className="block text-xs uppercase text-zinc-400" htmlFor="loop-prompt">
            Prompt
          </label>
          <textarea
            id="loop-prompt"
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            rows={3}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs uppercase text-zinc-400" htmlFor="loop-preset">
            Preset
          </label>
          <select
            id="loop-preset"
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            value={selectedPreset}
            disabled={isPresetLoading || presets.length === 0}
            onChange={(event) => {
              setSelectedPreset(event.target.value)
              setError(null)
              setStatusMessage(null)
            }}
          >
            {presets.length === 0 ? (
              <option value="">No presets available</option>
            ) : (
              <>
                <option disabled value="">
                  Select a preset
                </option>
                {presets.map((preset) => (
                  <option key={preset.filename} value={preset.filename}>
                    {preset.name}
                  </option>
                ))}
              </>
            )}
          </select>
          <p className="text-xs text-zinc-400">Current default: {defaultPreset}</p>
          <button
            className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            type="button"
            disabled={isPresetLoading || isSavingDefault || !selectedPreset}
            onClick={handleSaveDefaultPreset}
          >
            Save default preset
          </button>
        </div>
        <div className="space-y-2">
          <label className="block text-xs uppercase text-zinc-400" htmlFor="loop-worktree">
            Worktree (Optional)
          </label>
          <select
            id="loop-worktree"
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            value={selectedWorktree}
            disabled={isWorktreeLoading}
            onChange={(event) => {
              setSelectedWorktree(event.target.value)
              setError(null)
            }}
          >
            <option value="">Default workspace</option>
            {worktrees.map((worktree) => {
              const value = worktree.branch ?? ''
              return (
                <option
                  key={`${worktree.path}:${worktree.branch ?? 'detached'}`}
                  disabled={!worktree.branch}
                  value={value}
                >
                  {worktree.name}
                  {worktree.branch ? ` (${worktree.branch})` : ' (detached)'}
                </option>
              )
            })}
          </select>
          <div className="flex items-center gap-2">
            <input
              className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              id="new-worktree-name"
              placeholder="New worktree name"
              value={newWorktreeName}
              onChange={(event) => setNewWorktreeName(event.target.value)}
            />
            <button
              className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              type="button"
              disabled={isCreatingWorktree || isWorktreeLoading}
              onClick={handleCreateWorktree}
            >
              Add Worktree
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              checked={exclusive}
              type="checkbox"
              onChange={(event) => setExclusive(event.target.checked)}
            />
            Exclusive mode
          </label>
          <p className="text-xs text-zinc-400">
            On: wait for a single primary loop slot. Off: loop may run in a parallel
            worktree. Parallel worktrees auto-merge after completion by default.
          </p>
        </div>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {statusMessage ? <p className="text-sm text-emerald-400">{statusMessage}</p> : null}
        <div className="flex items-center justify-end gap-2">
          <button
            className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-50"
            disabled={isSubmitting || isPresetLoading || !selectedPreset}
            type="submit"
          >
            Start
          </button>
        </div>
      </form>
    </section>
  )
}
