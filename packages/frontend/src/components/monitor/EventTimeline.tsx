import { useMemo, useState } from 'react'
import type { MonitoringEvent } from '@/lib/monitoringApi'

interface EventTimelineProps {
  events: MonitoringEvent[]
}

function formatEventTime(timestamp: number) {
  if (!Number.isFinite(timestamp)) {
    return 'Unknown time'
  }
  return new Date(timestamp).toLocaleTimeString()
}

function eventDotColor(topic: string) {
  const normalized = topic.toLowerCase()
  if (
    normalized.includes('error') ||
    normalized.includes('fail') ||
    normalized.includes('crash')
  ) {
    return 'bg-red-400'
  }

  if (
    normalized.includes('complete') ||
    normalized.includes('success') ||
    normalized.includes('done')
  ) {
    return 'bg-emerald-400'
  }

  if (normalized.includes('warn')) {
    return 'bg-amber-400'
  }

  return 'bg-sky-400'
}

export function EventTimeline({ events }: EventTimelineProps) {
  const [topicFilter, setTopicFilter] = useState('all')
  const [hatFilter, setHatFilter] = useState('all')

  const topics = useMemo(
    () => Array.from(new Set(events.map((event) => event.topic))).sort(),
    [events]
  )

  const sourceHats = useMemo(
    () =>
      Array.from(
        new Set(
          events
            .map((event) => event.sourceHat)
            .filter((hat): hat is string => Boolean(hat))
        )
      ).sort(),
    [events]
  )

  const filtered = useMemo(
    () =>
      [...events]
        .sort((a, b) => b.timestamp - a.timestamp)
        .filter((event) => (topicFilter === 'all' ? true : event.topic === topicFilter))
        .filter((event) => (hatFilter === 'all' ? true : event.sourceHat === hatFilter)),
    [events, hatFilter, topicFilter]
  )

  return (
    <section className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Event Timeline</h3>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-zinc-400" htmlFor="topic-filter">
            Filter topic
          </label>
          <select
            aria-label="Filter topic"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
            id="topic-filter"
            onChange={(event) => setTopicFilter(event.target.value)}
            value={topicFilter}
          >
            <option value="all">All topics</option>
            {topics.map((topic) => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </select>
          <label className="text-xs text-zinc-400" htmlFor="hat-filter">
            Filter hat
          </label>
          <select
            aria-label="Filter hat"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
            id="hat-filter"
            onChange={(event) => setHatFilter(event.target.value)}
            value={hatFilter}
          >
            <option value="all">All hats</option>
            {sourceHats.map((hat) => (
              <option key={hat} value={hat}>
                {hat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-400">No events found.</p>
      ) : (
        <ol className="space-y-3">
          {filtered.map((event, index) => (
            <li
              key={`${event.topic}-${event.timestamp}-${index}`}
              className="flex items-start gap-3"
              data-testid="event-row"
            >
              <span
                className={`mt-1.5 h-2.5 w-2.5 rounded-full ${eventDotColor(event.topic)}`}
                data-testid="event-dot"
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm font-medium text-zinc-100" data-testid="event-topic">
                  {event.topic}
                </p>
                <p className="text-xs text-zinc-400">
                  {formatEventTime(event.timestamp)}
                  {event.sourceHat ? ` · ${event.sourceHat}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
