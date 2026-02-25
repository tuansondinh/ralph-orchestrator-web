import { create } from 'zustand'
import type { LoopMetrics, LoopSummary } from '@/lib/loopApi'

interface LoopStoreState {
  loopsByProject: Record<string, LoopSummary[]>
  outputsByLoop: Record<string, string[]>
  metricsByLoop: Record<string, LoopMetrics | undefined>
  selectedLoopIdByProject: Record<string, string | null | undefined>
  setLoops: (projectId: string, loops: LoopSummary[]) => void
  upsertLoop: (projectId: string, loop: LoopSummary) => void
  updateLoopById: (loopId: string, updates: Partial<LoopSummary>) => void
  appendOutput: (loopId: string, line: string) => void
  setMetrics: (loopId: string, metrics: LoopMetrics) => void
  setSelectedLoop: (projectId: string, loopId: string | null) => void
}

const initialState = {
  loopsByProject: {} as Record<string, LoopSummary[]>,
  outputsByLoop: {} as Record<string, string[]>,
  metricsByLoop: {} as Record<string, LoopMetrics | undefined>,
  selectedLoopIdByProject: {} as Record<string, string | null | undefined>
}

export const useLoopStore = create<LoopStoreState>((set) => ({
  ...initialState,
  setLoops: (projectId, loops) =>
    set((state) => ({
      loopsByProject: {
        ...state.loopsByProject,
        [projectId]: [...loops]
      }
    })),
  upsertLoop: (projectId, loop) =>
    set((state) => {
      const currentLoops = state.loopsByProject[projectId] ?? []
      const existingIndex = currentLoops.findIndex((candidate) => candidate.id === loop.id)

      if (existingIndex >= 0) {
        const updated = [...currentLoops]
        updated[existingIndex] = loop
        return {
          loopsByProject: {
            ...state.loopsByProject,
            [projectId]: updated
          }
        }
      }

      return {
        loopsByProject: {
          ...state.loopsByProject,
          [projectId]: [loop, ...currentLoops]
        }
      }
    }),
  updateLoopById: (loopId, updates) =>
    set((state) => {
      const normalizedUpdates = Object.fromEntries(
        Object.entries(updates).filter(([, value]) => value !== undefined)
      ) as Partial<LoopSummary>
      const nextLoopsByProject: Record<string, LoopSummary[]> = {}
      for (const [projectId, loops] of Object.entries(state.loopsByProject)) {
        nextLoopsByProject[projectId] = loops.map((loop) => {
          if (loop.id !== loopId) {
            return loop
          }

          const merged: LoopSummary = {
            ...loop,
            ...normalizedUpdates
          }

          if (typeof normalizedUpdates.iterations === 'number') {
            merged.iterations = Math.max(
              loop.iterations,
              Math.max(0, Math.floor(normalizedUpdates.iterations))
            )
          }
          if (typeof normalizedUpdates.tokensUsed === 'number') {
            merged.tokensUsed = Math.max(
              loop.tokensUsed,
              Math.max(0, Math.floor(normalizedUpdates.tokensUsed))
            )
          }
          if (typeof normalizedUpdates.errors === 'number') {
            merged.errors = Math.max(
              loop.errors,
              Math.max(0, Math.floor(normalizedUpdates.errors))
            )
          }

          return merged
        })
      }

      return {
        loopsByProject: nextLoopsByProject
      }
    }),
  appendOutput: (loopId, line) =>
    set((state) => ({
      outputsByLoop: {
        ...state.outputsByLoop,
        [loopId]: [...(state.outputsByLoop[loopId] ?? []), line]
      }
    })),
  setMetrics: (loopId, metrics) =>
    set((state) => ({
      metricsByLoop: {
        ...state.metricsByLoop,
        [loopId]: state.metricsByLoop[loopId]
          ? {
              ...metrics,
              iterations: Math.max(state.metricsByLoop[loopId]?.iterations ?? 0, metrics.iterations),
              runtime: Math.max(state.metricsByLoop[loopId]?.runtime ?? 0, metrics.runtime),
              tokensUsed: Math.max(state.metricsByLoop[loopId]?.tokensUsed ?? 0, metrics.tokensUsed),
              errors: Math.max(state.metricsByLoop[loopId]?.errors ?? 0, metrics.errors)
            }
          : metrics
      }
    })),
  setSelectedLoop: (projectId, loopId) =>
    set((state) => ({
      selectedLoopIdByProject: {
        ...state.selectedLoopIdByProject,
        [projectId]: loopId
      }
    }))
}))

export function resetLoopStore() {
  useLoopStore.setState({ ...initialState })
}
