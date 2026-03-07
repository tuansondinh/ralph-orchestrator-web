import { NavLink } from 'react-router-dom'

const tabs = [
  { id: 'loops', label: 'Loops' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'hats-presets', label: 'Hats presets' },
  { id: 'settings', label: 'Settings' },
  { id: 'monitor', label: 'Monitor' },
  { id: 'preview', label: 'Preview' }
]

interface TabBarProps {
  projectId: string
}

export function TabBar({ projectId }: TabBarProps) {
  return (
    <nav aria-label="Project sections" className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <NavLink
          key={tab.id}
          className={({ isActive }) =>
            `rounded-md px-3 py-2 text-sm transition-colors ${isActive
              ? 'bg-zinc-100 text-zinc-900'
              : 'border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
            }`
          }
          to={`/project/${projectId}/${tab.id}`}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
