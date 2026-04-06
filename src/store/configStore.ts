import { create } from 'zustand'
import type { Config } from '../types'

interface ConfigState {
  config: Config | null
  initialized: boolean
  initializeConfig: () => Promise<void>
  updateConfig: (updates: Partial<Config>) => Promise<void>
  addProject: (project: { id: string; name: string; path: string; skillsPath: string }) => Promise<void>
  removeProject: (id: string) => Promise<void>
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
      const config = await window.api.getConfig()
      set({ config, initialized: true })
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
    const projects = [...config.projects, project]
    await updateConfig({ projects })
  },

  removeProject: async (id) => {
    const { config, updateConfig } = get()
    if (!config) return
    const projects = config.projects.filter(p => p.id !== id)
    await updateConfig({ projects })
  },
}))