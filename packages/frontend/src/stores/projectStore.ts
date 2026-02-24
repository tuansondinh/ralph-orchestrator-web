import { create } from 'zustand'
import type { ProjectRecord } from '@/lib/projectApi'

interface ProjectState {
  projects: ProjectRecord[]
  activeProjectId: string | null
  isLoading: boolean
  error: string | null
  setProjects: (projects: ProjectRecord[]) => void
  addProject: (project: ProjectRecord) => void
  removeProject: (projectId: string) => void
  setActiveProject: (id: string | null) => void
  setLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void
}

const initialState = {
  projects: [] as ProjectRecord[],
  activeProjectId: null as string | null,
  isLoading: true,
  error: null as string | null
}

export const useProjectStore = create<ProjectState>((set) => ({
  ...initialState,
  setProjects: (projects) => set({ projects }),
  addProject: (project) =>
    set((state) => {
      if (state.projects.some((existingProject) => existingProject.id === project.id)) {
        return state
      }

      return { projects: [...state.projects, project] }
    }),
  removeProject: (projectId) =>
    set((state) => ({
      projects: state.projects.filter((project) => project.id !== projectId),
      activeProjectId:
        state.activeProjectId === projectId ? null : state.activeProjectId
    })),
  setActiveProject: (id) => set({ activeProjectId: id }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error })
}))

export function resetProjectStore() {
  useProjectStore.setState({ ...initialState })
}
