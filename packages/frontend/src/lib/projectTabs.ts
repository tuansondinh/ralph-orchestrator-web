import type { RuntimeCapabilities } from '@/lib/capabilitiesApi'

type CapabilityGate = keyof Pick<RuntimeCapabilities, 'preview'>

const keyboardShortcutTabs = ['loops', 'terminal', 'monitor', 'preview'] as const
const visibleProjectTabs = [
  'loops',
  'chat',
  'tasks',
  'terminal',
  'monitor',
  'preview',
  'hats-presets',
  'settings'
] as const
const rememberedProjectTabs = [
  'loops',
  'tasks',
  'terminal',
  'monitor',
  'preview',
  'hats-presets',
  'settings'
] as const
const allProjectTabs = visibleProjectTabs

export type ProjectTabId = (typeof allProjectTabs)[number]
export type RememberedProjectTab = (typeof rememberedProjectTabs)[number]

type ProjectTabDefinition = {
  id: ProjectTabId
  label: string
  capability?: CapabilityGate
}

export const projectTabs: readonly ProjectTabDefinition[] = [
  { id: 'loops', label: 'Loops' },
  { id: 'chat', label: 'Chat' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'hats-presets', label: 'Hats presets' },
  { id: 'settings', label: 'Settings' },
  { id: 'monitor', label: 'Monitor' },
  { id: 'preview', label: 'Preview', capability: 'preview' }
]

function isCapabilityVisible(
  capabilities: RuntimeCapabilities | null,
  capability: CapabilityGate | undefined
) {
  if (!capability) {
    return true
  }

  return capabilities?.[capability] !== false
}

export function isProjectTabId(value: string | undefined): value is ProjectTabId {
  return Boolean(value && allProjectTabs.includes(value as ProjectTabId))
}

export function isRememberedProjectTab(value: string | undefined): value is RememberedProjectTab {
  return Boolean(value && rememberedProjectTabs.includes(value as RememberedProjectTab))
}

export function getVisibleProjectTabs(capabilities: RuntimeCapabilities | null) {
  return projectTabs.filter((tab) => isCapabilityVisible(capabilities, tab.capability))
}

export function getProjectShortcutTabs(capabilities: RuntimeCapabilities | null) {
  return keyboardShortcutTabs.filter((tab) =>
    isCapabilityVisible(
      capabilities,
      tab === 'preview' ? tab : undefined
    )
  )
}

export function resolveProjectTab(
  tab: ProjectTabId | RememberedProjectTab | null | undefined,
  capabilities: RuntimeCapabilities | null
) {
  if (tab && getVisibleProjectTabs(capabilities).some((candidate) => candidate.id === tab)) {
    return tab
  }

  return 'loops' as const
}
