import { beforeEach, describe, expect, it } from 'vitest'
import { resetProjectStore, useProjectStore } from '@/stores/projectStore'
import type { ProjectRecord } from '@/lib/projectApi'

function makeProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: overrides.id ?? 'project-1',
    name: overrides.name ?? 'Test Project',
    path: overrides.path ?? '/projects/test',
    type: overrides.type ?? 'node',
    ralphConfig: overrides.ralphConfig ?? 'ralph.yml',
    createdAt: overrides.createdAt ?? 1000,
    updatedAt: overrides.updatedAt ?? 1000
  }
}

describe('projectStore', () => {
  beforeEach(() => {
    resetProjectStore()
  })

  it('initializes with empty projects and no active project', () => {
    const state = useProjectStore.getState()
    expect(state.projects).toEqual([])
    expect(state.activeProjectId).toBeNull()
    expect(state.isLoading).toBe(true)
  })

  it('setProjects replaces the entire project list', () => {
    const projects = [makeProject({ id: 'p1' }), makeProject({ id: 'p2' })]
    useProjectStore.getState().setProjects(projects)
    expect(useProjectStore.getState().projects).toEqual(projects)
  })

  it('setProjects overwrites a previously set list', () => {
    useProjectStore.getState().setProjects([makeProject({ id: 'p1' })])
    useProjectStore.getState().setProjects([makeProject({ id: 'p2' }), makeProject({ id: 'p3' })])
    const { projects } = useProjectStore.getState()
    expect(projects).toHaveLength(2)
    expect(projects.map((p) => p.id)).toEqual(['p2', 'p3'])
  })

  it('setActiveProject updates the active project ID', () => {
    useProjectStore.getState().setProjects([makeProject({ id: 'p1' })])
    useProjectStore.getState().setActiveProject('p1')
    expect(useProjectStore.getState().activeProjectId).toBe('p1')
  })

  it('setActiveProject can be set to null', () => {
    useProjectStore.getState().setActiveProject('p1')
    useProjectStore.getState().setActiveProject(null)
    expect(useProjectStore.getState().activeProjectId).toBeNull()
  })

  it('removeProject removes the project from the list', () => {
    useProjectStore
      .getState()
      .setProjects([makeProject({ id: 'p1' }), makeProject({ id: 'p2' })])
    useProjectStore.getState().removeProject('p1')
    const { projects } = useProjectStore.getState()
    expect(projects).toHaveLength(1)
    expect(projects[0].id).toBe('p2')
  })

  it('removeProject clears activeProjectId when the active project is removed', () => {
    useProjectStore.getState().setProjects([makeProject({ id: 'p1' })])
    useProjectStore.getState().setActiveProject('p1')
    useProjectStore.getState().removeProject('p1')
    expect(useProjectStore.getState().activeProjectId).toBeNull()
  })

  it('removeProject preserves activeProjectId when a different project is removed', () => {
    useProjectStore
      .getState()
      .setProjects([makeProject({ id: 'p1' }), makeProject({ id: 'p2' })])
    useProjectStore.getState().setActiveProject('p1')
    useProjectStore.getState().removeProject('p2')
    expect(useProjectStore.getState().activeProjectId).toBe('p1')
  })
})
