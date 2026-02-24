import { create } from 'zustand'
import type { TerminalSessionRecord } from '@/lib/terminalApi'

interface TerminalState {
    // sessionsByProject maps projectId -> list of active/stopped terminal sessions
    sessionsByProject: Record<string, TerminalSessionRecord[]>
    // activeSessionIdByProject maps projectId -> current viewed terminal sessionId
    activeSessionIdByProject: Record<string, string | null>

    setSessions: (projectId: string, sessions: TerminalSessionRecord[]) => void
    addSession: (projectId: string, session: TerminalSessionRecord) => void
    updateSession: (sessionId: string, updates: Partial<TerminalSessionRecord>) => void
    removeSession: (projectId: string, sessionId: string) => void
    setActiveSession: (projectId: string, sessionId: string | null) => void
}

export const useTerminalStore = create<TerminalState>((set) => ({
    sessionsByProject: {},
    activeSessionIdByProject: {},

    setSessions: (projectId, sessions) =>
        set((state) => ({
            sessionsByProject: {
                ...state.sessionsByProject,
                [projectId]: sessions
            }
        })),

    addSession: (projectId, session) =>
        set((state) => {
            const current = state.sessionsByProject[projectId] || []
            if (current.some((s) => s.id === session.id)) {
                return state
            }
            return {
                sessionsByProject: {
                    ...state.sessionsByProject,
                    [projectId]: [...current, session]
                }
            }
        }),

    updateSession: (sessionId, updates) =>
        set((state) => {
            const nextSessionsByProject = { ...state.sessionsByProject }
            let found = false

            for (const [projectId, sessions] of Object.entries(nextSessionsByProject)) {
                const index = sessions.findIndex((s) => s.id === sessionId)
                if (index !== -1) {
                    const nextSessions = [...sessions]
                    nextSessions[index] = { ...nextSessions[index], ...updates }
                    nextSessionsByProject[projectId] = nextSessions
                    found = true
                    break
                }
            }

            if (!found) return state
            return { sessionsByProject: nextSessionsByProject }
        }),

    removeSession: (projectId, sessionId) =>
        set((state) => {
            const current = state.sessionsByProject[projectId] || []
            const nextSessions = current.filter((s) => s.id !== sessionId)

            const nextActiveSessionIdByProject = { ...state.activeSessionIdByProject }
            if (nextActiveSessionIdByProject[projectId] === sessionId) {
                nextActiveSessionIdByProject[projectId] = nextSessions[0]?.id ?? null
            }

            return {
                sessionsByProject: {
                    ...state.sessionsByProject,
                    [projectId]: nextSessions
                },
                activeSessionIdByProject: nextActiveSessionIdByProject
            }
        }),

    setActiveSession: (projectId, sessionId) =>
        set((state) => ({
            activeSessionIdByProject: {
                ...state.activeSessionIdByProject,
                [projectId]: sessionId
            }
        }))
}))

export function resetTerminalStore() {
    useTerminalStore.setState({
        sessionsByProject: {},
        activeSessionIdByProject: {}
    })
}
