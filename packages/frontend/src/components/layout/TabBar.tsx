import { NavLink } from 'react-router-dom'
import { useCapabilities } from '@/hooks/useCapabilities'
import { getVisibleProjectTabs } from '@/lib/projectTabs'

interface TabBarProps {
  projectId: string
}

export function TabBar({ projectId }: TabBarProps) {
  const { capabilities } = useCapabilities()
  const tabs = getVisibleProjectTabs(capabilities)

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
