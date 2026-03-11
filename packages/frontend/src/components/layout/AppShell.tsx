import { useEffect, useState } from 'react'
import type { PropsWithChildren, ReactNode } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useViewportHeight } from '@/hooks/useViewportHeight'

interface AppShellProps extends PropsWithChildren {
  sidebar: ReactNode
  headerActions?: ReactNode
  navigationKey?: string
}

export function AppShell({ sidebar, children, headerActions, navigationKey }: AppShellProps) {
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const isMobile = useMediaQuery('(max-width: 767px)')
  const viewportHeight = useViewportHeight()

  useEffect(() => {
    setIsMobileSidebarOpen(false)
  }, [navigationKey])

  useEffect(() => {
    if (!isMobile) {
      setIsMobileSidebarOpen(false)
    }
  }, [isMobile])

  return (
    <div
      className="grid min-h-screen grid-cols-1 overflow-hidden bg-zinc-950 text-zinc-100 md:grid-cols-[auto_1fr]"
      style={{ height: viewportHeight ? `${viewportHeight}px` : undefined }}
    >
      <aside
        className={`hidden min-h-0 overflow-y-auto bg-zinc-900 transition-all duration-200 md:block ${isDesktopSidebarCollapsed
            ? 'md:w-0 md:overflow-hidden md:border-r-0 md:p-0'
            : 'md:w-72 md:border-r md:border-zinc-800 md:p-4'
          }`}
      >
        {sidebar}
      </aside>
      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden px-2 py-2 sm:px-4 sm:py-4 md:p-6">
        <div className="mb-2 flex min-w-0 flex-wrap items-start justify-between gap-2 sm:mb-3 sm:gap-3 md:mb-4">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {isMobile ? (
              <button
                aria-label={isMobileSidebarOpen ? 'Close navigation' : 'Open navigation'}
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-zinc-700 px-2.5 text-sm text-zinc-100 hover:bg-zinc-900 md:hidden"
                onClick={() => {
                  setIsMobileSidebarOpen((current) => !current)
                }}
                type="button"
              >
                {isMobileSidebarOpen ? 'Close' : 'Menu'}
              </button>
            ) : (
              <button
                aria-label={isDesktopSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="rounded-md border border-zinc-700 px-2.5 py-2 text-xs text-zinc-200 hover:bg-zinc-900"
                onClick={() => {
                  setIsDesktopSidebarCollapsed((current) => !current)
                }}
                type="button"
              >
                <span aria-hidden="true" className="block text-sm leading-none">
                  {isDesktopSidebarCollapsed ? '›' : '‹'}
                </span>
              </button>
            )}
            {isMobile ? null : (
              <p className="min-w-0 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                This app is experimental and not fully implemented yet.
              </p>
            )}
          </div>
          <div className="min-w-0">{headerActions ?? null}</div>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      </main>
      {isMobile && isMobileSidebarOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-zinc-950/70"
            onClick={() => {
              setIsMobileSidebarOpen(false)
            }}
            type="button"
          />
          <section
            aria-label="Project navigation"
            aria-modal="true"
            className="absolute inset-y-0 left-0 flex w-[min(22rem,calc(100vw-2rem))] max-w-full flex-col border-r border-zinc-800 bg-zinc-900 p-4 shadow-2xl"
            role="dialog"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Navigation
              </h2>
              <button
                aria-label="Close navigation"
                className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800"
                onClick={() => {
                  setIsMobileSidebarOpen(false)
                }}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{sidebar}</div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
