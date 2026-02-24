import { useEffect, useState, type FormEvent } from 'react'

export interface PreviewConfigInput {
  baseUrl: string
  command: string | null
}

interface ConfigurePreviewDialogProps {
  open: boolean
  initialBaseUrl: string
  initialCommand: string | null
  onClose: () => void
  onSave: (config: PreviewConfigInput) => Promise<void> | void
}

export function ConfigurePreviewDialog({
  open,
  initialBaseUrl,
  initialCommand,
  onClose,
  onSave
}: ConfigurePreviewDialogProps) {
  const [baseUrl, setBaseUrl] = useState('')
  const [command, setCommand] = useState('')

  useEffect(() => {
    if (open) {
      setBaseUrl(initialBaseUrl)
      setCommand(initialCommand ?? '')
    }
  }, [initialBaseUrl, initialCommand, open])

  useEffect(() => {
    const handleClose = () => {
      onClose()
    }

    window.addEventListener('ralph:close-dialogs', handleClose)
    return () => {
      window.removeEventListener('ralph:close-dialogs', handleClose)
    }
  }, [onClose])

  if (!open) {
    return null
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    await onSave({
      baseUrl: baseUrl.trim(),
      command: command.trim() ? command.trim() : null
    })
    onClose()
  }

  return (
    <section
      aria-label="Configure preview command"
      className="space-y-3 rounded-lg border border-zinc-700 bg-zinc-900 p-4"
      role="dialog"
    >
      <h3 className="text-lg font-semibold">Configure Preview Settings</h3>
      <p className="text-sm text-zinc-400">
        Override the preview host URL and start command used for future preview runs.
      </p>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-300">Preview Base URL</span>
          <input
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            onChange={(event) => setBaseUrl(event.target.value)}
            required
            type="text"
            value={baseUrl}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-300">Preview Command</span>
          <input
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            onChange={(event) => setCommand(event.target.value)}
            placeholder="npm run dev"
            type="text"
            value={command}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-md border border-zinc-700 bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200"
            type="submit"
          >
            Save Configuration
          </button>
        </div>
      </form>
    </section>
  )
}
