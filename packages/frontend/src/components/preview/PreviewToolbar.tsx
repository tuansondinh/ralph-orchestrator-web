import type { PreviewState } from '@/lib/previewApi'

interface PreviewToolbarProps {
  state: PreviewState
  url: string | null
  command: string | null
  args: string[]
  urlInput: string
  onUrlInputChange: (value: string) => void
  onSaveUrl: () => void
  isSavingUrl: boolean
  onCopyUrl: () => void
  onOpenInBrowser: () => void
  onRefresh: () => void
  onConfigure: () => void
}

function statusClasses(state: PreviewState) {
  if (state === 'ready') {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
  }

  if (state === 'starting') {
    return 'border-amber-500/40 bg-amber-500/10 text-amber-300'
  }

  if (state === 'error') {
    return 'border-red-500/40 bg-red-500/10 text-red-300'
  }

  return 'border-zinc-700 bg-zinc-900/70 text-zinc-300'
}

function formatState(state: PreviewState) {
  return `${state.slice(0, 1).toUpperCase()}${state.slice(1)}`
}

export function PreviewToolbar({
  state,
  url,
  command,
  args,
  urlInput,
  onUrlInputChange,
  onSaveUrl,
  isSavingUrl,
  onCopyUrl,
  onOpenInBrowser,
  onRefresh,
  onConfigure
}: PreviewToolbarProps) {
  const commandLabel = command
    ? [command, ...args].join(' ').trim()
    : 'No dev command detected yet'

  return (
    <section className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusClasses(state)}`}
        >
          {formatState(state)}
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 transition hover:bg-zinc-800"
            onClick={onRefresh}
            type="button"
          >
            Refresh
          </button>
          <button
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 transition hover:bg-zinc-800"
            onClick={onConfigure}
            type="button"
          >
            Configure
          </button>
          <button
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!url}
            onClick={onCopyUrl}
            type="button"
          >
            Copy URL
          </button>
          <button
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!url}
            onClick={onOpenInBrowser}
            type="button"
          >
            Open in Browser
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500">Preview URL</span>
          <input
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            onChange={(event) => onUrlInputChange(event.target.value)}
            placeholder="http://localhost:3001"
            type="text"
            value={urlInput}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md border border-zinc-700 bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSavingUrl}
            onClick={onSaveUrl}
            type="button"
          >
            {isSavingUrl ? 'Saving URL...' : 'Save URL'}
          </button>
        </div>
      </div>
      <p className="truncate text-xs text-zinc-500" title={commandLabel}>
        Command: {commandLabel}
      </p>
    </section>
  )
}
