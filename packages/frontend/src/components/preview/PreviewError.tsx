interface PreviewErrorProps {
  message: string
  onRestart: () => void
  onConfigure: () => void
  isRestarting?: boolean
}

export function PreviewError({
  message,
  onRestart,
  onConfigure,
  isRestarting = false
}: PreviewErrorProps) {
  return (
    <section className="space-y-3 rounded-lg border border-red-500/40 bg-red-500/10 p-4">
      <h3 className="text-lg font-semibold text-red-200">Preview Error</h3>
      <p className="text-sm text-red-100">{message}</p>
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-md border border-red-300/40 bg-red-950/40 px-3 py-2 text-sm font-medium text-red-100 transition hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isRestarting}
          onClick={onRestart}
          type="button"
        >
          {isRestarting ? 'Restarting...' : 'Restart Preview'}
        </button>
        <button
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800"
          onClick={onConfigure}
          type="button"
        >
          Configure Command
        </button>
      </div>
    </section>
  )
}
