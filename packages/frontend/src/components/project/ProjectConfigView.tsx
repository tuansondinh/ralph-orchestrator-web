import { useEffect, useState } from 'react'
import { parse } from 'yaml'
import {
  projectConfigApi,
  type ProjectConfigSnapshot
} from '@/lib/projectConfigApi'

interface ProjectConfigViewProps {
  projectId: string
}

export function ProjectConfigView({ projectId }: ProjectConfigViewProps) {
  const [snapshot, setSnapshot] = useState<ProjectConfigSnapshot | null>(null)
  const [yamlDraft, setYamlDraft] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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
    <section className="space-y-4 rounded-md border border-zinc-800 p-4">
      <h2 className="text-xl font-semibold">Project settings</h2>

      <label className="flex flex-col gap-1 text-sm" htmlFor="project-config-yaml">
        YAML configuration
        <textarea
          className="h-[65vh] min-h-[28rem] rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100"
          id="project-config-yaml"
          onChange={(event) => setYamlDraft(event.target.value)}
          value={yamlDraft}
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSaving}
          onClick={() => void onSave()}
          type="button"
        >
          Save settings
        </button>
        {saveMessage ? <p className="text-sm text-emerald-300">{saveMessage}</p> : null}
        {errorMessage ? <p className="text-sm text-red-300">{errorMessage}</p> : null}
      </div>
    </section>
  )
}
