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
        profileId?: string
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

      // Project scanning
      scanAll: () => Promise<Skill[]>

      // Tool detection and sync
      detectTools: () => Promise<{ id: string; name: string; path: string }[]>
      syncToTools: (skillName: string, content: string, toolIds: string[]) => Promise<{ toolId: string; success: boolean; path: string }[]>

      // Target profiles
      listProfiles: () => Promise<{ id: string; name: string; format: string; targetDir: string; targetFile?: string }[]>
      deployProfile: (projectId: string, skillName: string, skillContent: string, profileId: string) => Promise<{ success: boolean; path: string; format: string }>
      undeployProfile: (projectId: string, skillName: string, profileId: string) => Promise<{ success: boolean }>
      deployPreview: (projectId: string, skillName: string, skillContent: string, profileId: string) => Promise<{
        needsPreview: boolean
        profileId: string
        format: string
        targetPath: string
        fileExists?: boolean
        existingContent?: string
        mergedContent?: string
        hasConflict?: boolean
        sectionAlreadyExists?: boolean
        skillName?: string
      }>
      migrateConfig: () => Promise<Config>

      // Bidirectional sync
      promoteToLibrary: (skillName: string, projectSkillPath: string) => Promise<{ success: boolean; libraryPath: string; hash: string }>

      // Version history
      listVersions: (skillName: string) => Promise<{ id: string; timestamp: string; hash: string }[]>
      readVersion: (skillName: string, versionId: string) => Promise<{ id: string; timestamp: string; hash: string; content: string }>
      saveVersion: (skillName: string, content: string) => Promise<{ id: string; timestamp: string; hash: string; content: string }>
      rollbackVersion: (skillName: string, versionId: string) => Promise<{ success: boolean; content: string }>

      // Git sync
      gitStatus: () => Promise<{ isGitRepo: boolean; libraryPath: string }>
      gitSync: () => Promise<{ success: boolean; results: { action: string; success: boolean; message?: string }[] }>

      // Semantic search
      searchSemantic: (query: string) => Promise<{ filename: string; name: string; description: string; score: number }[]>
    }
  }
}

export {}