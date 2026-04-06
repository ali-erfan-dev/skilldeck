import { create } from 'zustand'

interface DeploymentRecord {
  deployedAt: string
  libraryHash: string
  currentHash: string
}

interface DeploymentState {
  deployments: Record<string, Record<string, DeploymentRecord>>
  loadDeployments: () => Promise<void>
  getDeploymentStatus: (projectId: string, skillName: string) => Promise<'current' | 'stale' | 'none'>
}

export const useDeploymentStore = create<DeploymentState>((set, get) => ({
  deployments: {},

  loadDeployments: async () => {
    try {
      const data = await window.api.getDeployments()
      set({ deployments: data as Record<string, Record<string, DeploymentRecord>> })
    } catch (err) {
      console.error('Failed to load deployments:', err)
    }
  },

  getDeploymentStatus: async (projectId: string, skillName: string) => {
    const { deployments } = get()
    const projectDeployments = deployments[projectId]
    if (!projectDeployments || !projectDeployments[skillName]) {
      return 'none'
    }

    const record = projectDeployments[skillName]
    const libraryHash = record.libraryHash

    // Get current hash from library file
    try {
      const config = await window.api.getConfig()
      const libraryPath = config.libraryPath
      const currentHash = await window.api.fileHash(`${libraryPath}/${skillName}.md`)
      return currentHash === libraryHash ? 'current' : 'stale'
    } catch {
      return 'stale'
    }
  },
}))