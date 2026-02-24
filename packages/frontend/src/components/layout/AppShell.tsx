import type { PropsWithChildren, ReactNode } from 'react'

interface AppShellProps extends PropsWithChildren {
  sidebar: ReactNode
}

export function AppShell({ sidebar, children }: AppShellProps) {
  return (
    <div className="grid h-screen grid-cols-1 overflow-hidden bg-zinc-950 text-zinc-100 md:grid-cols-[18rem_1fr]">
      <aside className="min-h-0 overflow-y-auto border-b border-zinc-800 bg-zinc-900 p-4 md:border-b-0 md:border-r">
        {sidebar}
      </aside>
      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden p-6">{children}</main>
    </div>
  )
}
