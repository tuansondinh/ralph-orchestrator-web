import type { ToolConfirmation } from '@/stores/chatOverlayStore'

interface ToolConfirmationCardProps {
  confirmation: ToolConfirmation
  onConfirm: () => void
  onCancel: () => void
}

export function ToolConfirmationCard({
  confirmation,
  onConfirm,
  onCancel
}: ToolConfirmationCardProps) {
  const isActionDisabled = confirmation.isSubmitting || confirmation.status !== 'pending'
  const statusLabel =
    confirmation.status === 'confirmed'
      ? 'Confirmed'
      : confirmation.status === 'cancelled'
        ? 'Cancelled'
        : confirmation.isSubmitting
          ? 'Submitting...'
          : 'Pending confirmation'

  return (
    <section className="rounded-lg border border-amber-600/60 bg-amber-950/30 p-3 text-xs text-zinc-200">
      <p className="font-semibold text-amber-300">{confirmation.toolName}</p>
      <p className="mt-1 text-zinc-300">{confirmation.description}</p>
      <pre className="mt-2 overflow-x-auto rounded bg-zinc-950 p-2 text-[11px] leading-relaxed text-zinc-200">
        {JSON.stringify(confirmation.args, null, 2)}
      </pre>
      <div className="mt-3 flex items-center gap-2">
        <button
          className="rounded border border-emerald-600 px-2 py-1 text-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isActionDisabled}
          onClick={onConfirm}
          type="button"
        >
          Confirm
        </button>
        <button
          className="rounded border border-zinc-600 px-2 py-1 text-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isActionDisabled}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <span className="ml-auto text-[11px] text-zinc-400">{statusLabel}</span>
      </div>
    </section>
  )
}
