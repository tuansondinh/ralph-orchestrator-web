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
    <nav
      aria-label="Project sections"
      className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-2 [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.id}
          className={({ isActive }) =>
            `shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs transition-colors sm:px-3 sm:py-2 sm:text-sm ${isActive
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
