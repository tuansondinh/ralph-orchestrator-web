import type { PropsWithChildren, ReactNode } from 'react'

interface AppShellProps extends PropsWithChildren {
  sidebar: ReactNode
  headerActions?: ReactNode
}

export function AppShell({ sidebar, children, headerActions }: AppShellProps) {
  return (
    <div className="grid h-screen grid-cols-1 overflow-hidden bg-zinc-950 text-zinc-100 md:grid-cols-[18rem_1fr]">
      <aside className="min-h-0 overflow-y-auto border-b border-zinc-800 bg-zinc-900 p-4 md:border-b-0 md:border-r">
        {sidebar}
      </aside>
      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            This app is experimental and not fully implemented yet.
          </p>
          {headerActions ?? null}
        </div>
        {children}
      </main>
    </div>
  )
}
