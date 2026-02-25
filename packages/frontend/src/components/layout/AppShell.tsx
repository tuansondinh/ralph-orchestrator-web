import { useState } from 'react'
import type { PropsWithChildren, ReactNode } from 'react'

interface AppShellProps extends PropsWithChildren {
  sidebar: ReactNode
  headerActions?: ReactNode
}

export function AppShell({ sidebar, children, headerActions }: AppShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  return (
    <div className="grid h-screen grid-cols-1 overflow-hidden bg-zinc-950 text-zinc-100 md:grid-cols-[auto_1fr]">
      <aside
        className={`min-h-0 overflow-y-auto bg-zinc-900 transition-all duration-200 ${isSidebarCollapsed
            ? 'hidden border-b-0 p-0 md:block md:w-0 md:overflow-hidden md:border-r-0'
            : 'border-b border-zinc-800 p-4 md:w-72 md:border-b-0 md:border-r'
          }`}
      >
        {sidebar}
      </aside>
      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <button
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="rounded-md border border-zinc-700 px-2.5 py-2 text-xs text-zinc-200 hover:bg-zinc-900"
              onClick={() => {
                setIsSidebarCollapsed((current) => !current)
              }}
              type="button"
            >
              <span aria-hidden="true" className="block text-sm leading-none">
                {isSidebarCollapsed ? '›' : '‹'}
              </span>
            </button>
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              This app is experimental and not fully implemented yet.
            </p>
          </div>
          {headerActions ?? null}
        </div>
        {children}
      </main>
    </div>
  )
}
