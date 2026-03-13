import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loopApi, type GitBranchInfo, type LoopBackend, type StartLoopInput } from '@/lib/loopApi'
import { RALPH_BACKENDS } from '@/lib/backends'
import { presetApi, type PresetSummary } from '@/lib/presetApi'
import { settingsApi } from '@/lib/settingsApi'
import { worktreeApi, type WorktreeSummary } from '@/lib/worktreeApi'

interface StartLoopDialogProps {
  projectId: string
  onStart: (input: StartLoopInput) => Promise<void>
  initialPrompt?: string
  promptPath?: string
  onPromptSave?: (content: string) => Promise<void>
}

const FALLBACK_PRESET_FILENAME = 'hatless-baseline.yml'
type BackendSelection = 'auto' | LoopBackend
type GitBranchMode = 'new' | 'existing'
const CUSTOM_USER_SETTING_LABEL = 'Custom user setting'

function selectAvailablePreset(presets: PresetSummary[], preferred: string) {
  const normalizedPreferred = preferred.trim()
  const hasPreferred = presets.some((preset) => preset.filename === normalizedPreferred)
  if (hasPreferred) {
    return normalizedPreferred
  }

  return presets[0]?.filename ?? ''
}

const PROMPT_HINT_PLACEHOLDER = 'PUT YOUR PROMPT IN HERE'

function formatPresetDisplayName(filename: string) {
  const normalized = filename.trim().toLowerCase()
  if (normalized === 'ralph.yml' || normalized === 'ralph.yaml') {
    return CUSTOM_USER_SETTING_LABEL
  }

  return filename
}

function getBranchDisplayName(branch: GitBranchInfo) {
  return branch.current ? `${branch.name} (current)` : branch.name
}

function getDefaultBaseBranch(branches: GitBranchInfo[]) {
  return branches.find((branch) => branch.current)?.name ?? branches[0]?.name ?? ''
}

export function StartLoopDialog({
  projectId,
  onStart,
  initialPrompt = '',
  promptPath = 'PROMPT.md',
  onPromptSave
}: StartLoopDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSavingDefault, setIsSavingDefault] = useState(false)
  const [isSavingPrompt, setIsSavingPrompt] = useState(false)
  const [isPresetLoading, setIsPresetLoading] = useState(false)
  const [isWorktreeLoading, setIsWorktreeLoading] = useState(false)
  const [isBranchLoading, setIsBranchLoading] = useState(false)
  const [isCreatingWorktree, setIsCreatingWorktree] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [prompt, setPrompt] = useState(initialPrompt)
  const [promptDirty, setPromptDirty] = useState(false)
  const [presets, setPresets] = useState<PresetSummary[]>([])
  const [worktrees, setWorktrees] = useState<WorktreeSummary[]>([])
  const [branches, setBranches] = useState<GitBranchInfo[]>([])
  const [selectedWorktree, setSelectedWorktree] = useState('')
  const [newWorktreeName, setNewWorktreeName] = useState('')
  const [defaultPreset, setDefaultPreset] = useState(FALLBACK_PRESET_FILENAME)
  const [selectedPreset, setSelectedPreset] = useState(FALLBACK_PRESET_FILENAME)
  const [selectedBackend, setSelectedBackend] = useState<BackendSelection>('auto')
  const [exclusive, setExclusive] = useState(false)
  const [gitBranchMode, setGitBranchMode] = useState<GitBranchMode>('new')
  const [gitBranchName, setGitBranchName] = useState('')
  const [baseBranch, setBaseBranch] = useState('')
  const [autoPush, setAutoPush] = useState(false)

  const resetForm = useCallback(() => {
    setPrompt(initialPrompt)
    setPromptDirty(false)
    setSelectedPreset(selectAvailablePreset(presets, defaultPreset))
    setSelectedBackend('auto')
    setSelectedWorktree('')
    setNewWorktreeName('')
    setExclusive(false)
    setGitBranchMode('new')
    setGitBranchName('')
    setBaseBranch(getDefaultBaseBranch(branches))
    setAutoPush(false)
    setError(null)
    setStatusMessage(null)
  }, [branches, defaultPreset, initialPrompt, presets])

  useEffect(() => {
    setPromptDirty(false)
  }, [projectId])

  useEffect(() => {
    if (!promptDirty) {
      setPrompt(initialPrompt)
    }
  }, [initialPrompt, promptDirty])



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

  useEffect(() => {
    let cancelled = false
    setIsBranchLoading(true)

    loopApi
      .listBranches(projectId)
      .then((nextBranches) => {
        if (!cancelled) {
          setBranches(nextBranches)
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(
            nextError instanceof Error ? nextError.message : 'Failed to load git branches'
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsBranchLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    const defaultBaseBranch = getDefaultBaseBranch(branches)
    if (!defaultBaseBranch) {
      if (baseBranch) {
        setBaseBranch('')
      }
      return
    }

    const selectedBranchStillExists = branches.some((branch) => branch.name === baseBranch)
    if (!baseBranch || !selectedBranchStillExists) {
      setBaseBranch(defaultBaseBranch)
    }
  }, [baseBranch, branches])



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
        presetFilename: selectedPreset,
        exclusive
      }
      if (selectedBackend !== 'auto') {
        payload.backend = selectedBackend
      }

      if (onPromptSave) {
        setIsSavingPrompt(true)
        await onPromptSave(prompt)
        setPromptDirty(false)
        payload.promptSnapshot = prompt
      } else {
        payload.prompt = prompt.trim() || undefined
      }

      if (selectedWorktree) {
        payload.worktree = selectedWorktree
      }

      const normalizedGitBranchName = gitBranchName.trim()
      if (normalizedGitBranchName) {
        payload.gitBranch = {
          mode: gitBranchMode,
          name: normalizedGitBranchName
        }

        if (gitBranchMode === 'new' && baseBranch) {
          payload.gitBranch.baseBranch = baseBranch
        }

        payload.autoPush = autoPush
      }

      await onStart(payload)
      resetForm()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to start loop')
    } finally {
      setIsSavingPrompt(false)
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
    <section className="h-full min-h-0 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-4">
      <form className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto pr-1" onSubmit={handleSubmit}>
        <div className="space-y-1">
          <label className="block text-xs uppercase text-zinc-400" htmlFor="loop-prompt">
            PROMPT.md
          </label>
          <textarea
            id="loop-prompt"
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            rows={8}
            placeholder={PROMPT_HINT_PLACEHOLDER}
            value={prompt}
            onBlur={() => {
              if (!promptDirty || !onPromptSave) {
                return
              }

              setIsSavingPrompt(true)
              void onPromptSave(prompt)
                .then(() => {
                  setPromptDirty(false)
                })
                .catch((nextError) => {
                  setError(
                    nextError instanceof Error
                      ? nextError.message
                      : 'Failed to save prompt file'
                  )
                })
                .finally(() => {
                  setIsSavingPrompt(false)
                })
            }}
            onChange={(event) => {
              setPrompt(event.target.value)
              setPromptDirty(true)
              setError(null)
            }}
          />
          <p className="text-xs text-zinc-400">
            Loaded from <code>{promptPath}</code>. You can edit this before starting the loop.
          </p>
          {isSavingPrompt ? (
            <p className="text-xs text-zinc-400">Saving {promptPath}...</p>
          ) : null}
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-xs uppercase text-zinc-400" htmlFor="loop-preset">
              Hats preset
            </label>
            <Link
              className="text-xs text-zinc-300 underline underline-offset-2 hover:text-zinc-100"
              to={`/project/${projectId}/hats-presets`}
            >
              see hats presets config
            </Link>
          </div>
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
                    {formatPresetDisplayName(preset.filename)}
                  </option>
                ))}
              </>
            )}
          </select>
          <p className="text-xs text-zinc-400">
            Current default: {formatPresetDisplayName(defaultPreset)}
          </p>
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
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="space-y-1">
              <label className="block text-xs uppercase text-zinc-400" htmlFor="loop-git-branch-mode">
                Branch mode
              </label>
              <select
                id="loop-git-branch-mode"
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                value={gitBranchMode}
                onChange={(event) => {
                  setGitBranchMode(event.target.value as GitBranchMode)
                  setError(null)
                }}
              >
                <option value="new">Create new branch</option>
                <option value="existing">Use existing branch</option>
              </select>
              <p className="text-xs text-zinc-500">
                Leave branch name empty to run without git branch setup.
              </p>
            </div>
            <div className="mt-3 space-y-1">
              <label className="block text-xs uppercase text-zinc-400" htmlFor="loop-git-branch-name">
                Branch name
              </label>
              <input
                id="loop-git-branch-name"
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                list="loop-git-branch-options"
                placeholder={
                  gitBranchMode === 'new' ? 'feature/your-branch' : 'Select an existing branch'
                }
                value={gitBranchName}
                onChange={(event) => {
                  setGitBranchName(event.target.value)
                  setError(null)
                }}
              />
              <datalist id="loop-git-branch-options">
                {branches.map((branch) => (
                  <option key={branch.name} value={branch.name} />
                ))}
              </datalist>
            </div>
            {gitBranchMode === 'new' ? (
              <div className="mt-3 space-y-1">
                <label className="block text-xs uppercase text-zinc-400" htmlFor="loop-base-branch">
                  Base branch
                </label>
                <select
                  id="loop-base-branch"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                  value={baseBranch}
                  disabled={isBranchLoading || branches.length === 0}
                  onChange={(event) => {
                    setBaseBranch(event.target.value)
                    setError(null)
                  }}
                >
                  {branches.length === 0 ? (
                    <option value="">
                      {isBranchLoading ? 'Loading branches...' : 'No branches available'}
                    </option>
                  ) : (
                    branches.map((branch) => (
                      <option key={branch.name} value={branch.name}>
                        {getBranchDisplayName(branch)}
                      </option>
                    ))
                  )}
                </select>
              </div>
            ) : null}
            <div className="mt-3 space-y-1">
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  checked={autoPush}
                  disabled={!gitBranchName.trim()}
                  type="checkbox"
                  onChange={(event) => setAutoPush(event.target.checked)}
                />
                Auto-push when loop completes
              </label>
            </div>
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
        <div className="space-y-1">
          <label className="block text-xs uppercase text-zinc-400" htmlFor="loop-backend">
            AI-BACKEND
          </label>
          <select
            id="loop-backend"
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            value={selectedBackend}
            onChange={(event) => {
              setSelectedBackend(event.target.value as BackendSelection)
              setError(null)
            }}
          >
            <option value="auto">auto (default)</option>
            {RALPH_BACKENDS.map((backend) => (
              <option key={backend} value={backend}>
                {backend}
              </option>
            ))}
          </select>
          <p className="text-xs text-zinc-500">
            Auto leaves backend unset so Ralph config/auto-detection decides.
          </p>
        </div>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {statusMessage ? <p className="text-sm text-emerald-400">{statusMessage}</p> : null}
        <div className="flex items-center justify-center pt-1">
          <button
            className="w-full max-w-sm rounded-md bg-zinc-100 px-6 py-2.5 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-200 disabled:opacity-50"
            disabled={isSubmitting || isSavingPrompt || isPresetLoading || !selectedPreset}
            type="submit"
          >
            Start
          </button>
        </div>
      </form>
    </section>
  )
}
