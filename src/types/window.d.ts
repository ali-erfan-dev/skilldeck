import type { Config } from './index'
import type { Skill } from './index'

declare global {
  interface Window {
    api: {
      // Config
      getConfig: () => Promise<Config>
      setConfig: (config: Config) => Promise<void>

      // Library
      listSkills: () => Promise<Skill[]>
      readSkill: (filename: string) => Promise<string>
      writeSkill: (filename: string, content: string) => Promise<void>
      deleteSkill: (filename: string) => Promise<void>

      // Deployments
      getDeployments: () => Promise<Record<string, Record<string, {
        deployedAt: string
        libraryHash: string
        currentHash?: string
      }>>>
      setDeployments: (data: object) => Promise<void>

      // File operations
      copyFile: (src: string, dest: string) => Promise<void>
      deleteFile: (path: string) => Promise<void>
      fileExists: (path: string) => Promise<boolean>
      readFile: (path: string) => Promise<string>
      writeFile: (path: string, content: string) => Promise<void>
      fileHash: (path: string) => Promise<string>
      ensureDir: (path: string) => Promise<void>

      // Dialog
      openDirectory: () => Promise<string | null>
    }
  }
}

export {}