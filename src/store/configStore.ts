import { create } from 'zustand'
import type { Config } from '../types'

interface ConfigState {
  config: Config | null
  initialized: boolean
  initializeConfig: () => Promise<void>
  updateConfig: (updates: Partial<Config>) => Promise<void>
  addProject: (project: { id: string; name: string; path: string; skillsPath: string; targetProfile?: string }) => Promise<void>
  updateProject: (id: string, updates: { name?: string; path?: string; skillsPath?: string; targetProfile?: string }) => Promise<void>
  removeProject: (id: string) => Promise<void>
  migrateProjects: () => Promise<void>
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: null,
  initialized: false,

  initializeConfig: async () => {
    try {
      if (!window.api) {
        console.error('window.api is not available - preload script may not have loaded')
        set({ initialized: true })
        return
      }
      // Run migration first — adds targetProfile to projects missing it
      if (window.api.migrateConfig) {
        const migrated = await window.api.migrateConfig()
        set({ config: migrated, initialized: true })
      } else {
        const config = await window.api.getConfig()
        set({ config, initialized: true })
      }
    } catch (err) {
      console.error('Failed to initialize config:', err)
      set({ initialized: true })
    }
  },

  updateConfig: async (updates) => {
    const { config } = get()
    if (!config) return
    const newConfig = { ...config, ...updates }
    await window.api.setConfig(newConfig)
    set({ config: newConfig })
  },

  addProject: async (project) => {
    const { config, updateConfig } = get()
    if (!config) return
    // Default targetProfile to 'claude-code' if not specified
    const projectWithProfile = {
      ...project,
      targetProfile: project.targetProfile || 'claude-code',
    }
    const projects = [...config.projects, projectWithProfile]
    await updateConfig({ projects })
  },

  removeProject: async (id) => {
    const { config, updateConfig } = get()
    if (!config) return
    const projects = config.projects.filter(p => p.id !== id)
    await updateConfig({ projects })
  },

  updateProject: async (id, updates) => {
    const { config, updateConfig } = get()
    if (!config) return
    const projects = config.projects.map(p =>
      p.id === id ? { ...p, ...updates } : p
    )
    await updateConfig({ projects })
  },

  migrateProjects: async () => {
    if (!window.api.migrateConfig) return
    const migrated = await window.api.migrateConfig()
    set({ config: migrated })
  },
}))