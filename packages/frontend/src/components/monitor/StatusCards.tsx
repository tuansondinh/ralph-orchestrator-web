import type { ProjectStatus } from '@/lib/monitoringApi'

interface StatusCardsProps {
  status: ProjectStatus | null
}

function formatNumber(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--'
  }
  return value.toLocaleString()
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--'
  }
  return `${value}%`
}

export function StatusCards({ status }: StatusCardsProps) {
  const cards = [
    {
      label: 'Active Loops',
      value: formatNumber(status?.activeLoops)
    },
    {
      label: 'Total Runs',
      value: formatNumber(status?.totalRuns)
    },
    {
      label: 'Token Usage',
      value: formatNumber(status?.tokenUsage)
    },
    {
      label: 'Error Rate',
      value: formatPercent(status?.errorRate)
    }
  ]

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <article key={card.label} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-400">{card.label}</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-100">{card.value}</p>
        </article>
      ))}
    </section>
  )
}
