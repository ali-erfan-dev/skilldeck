import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (config: object) => ipcRenderer.invoke('config:set', config),

  // Library
  listSkills: () => ipcRenderer.invoke('library:list'),
  readSkill: (filename: string) => ipcRenderer.invoke('library:read', filename),
  writeSkill: (filename: string, content: string) => ipcRenderer.invoke('library:write', filename, content),
  deleteSkill: (filename: string) => ipcRenderer.invoke('library:delete', filename),

  // Deployments
  getDeployments: () => ipcRenderer.invoke('deployments:get'),
  setDeployments: (data: object) => ipcRenderer.invoke('deployments:set', data),

  // File operations
  copyFile: (src: string, dest: string) => ipcRenderer.invoke('file:copy', src, dest),
  deleteFile: (path: string) => ipcRenderer.invoke('file:delete', path),
  fileExists: (path: string) => ipcRenderer.invoke('file:exists', path),
  readFile: (path: string) => ipcRenderer.invoke('file:read', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('file:write', path, content),
  fileHash: (path: string) => ipcRenderer.invoke('file:hash', path),
  ensureDir: (path: string) => ipcRenderer.invoke('dir:ensure', path),

  // Dialog
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),

  // Project scanning
  scanAll: () => ipcRenderer.invoke('scan:all'),

  // Tool sync
  detectTools: () => ipcRenderer.invoke('tools:detect'),
  syncToTools: (skillName: string, content: string, toolIds: string[]) => ipcRenderer.invoke('tools:sync', skillName, content, toolIds),

  // Target profiles
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  deployProfile: (projectId: string, skillName: string, skillContent: string, profileId: string) => ipcRenderer.invoke('deploy:profile', projectId, skillName, skillContent, profileId),
  undeployProfile: (projectId: string, skillName: string, profileId: string) => ipcRenderer.invoke('undeploy:profile', projectId, skillName, profileId),
  migrateConfig: () => ipcRenderer.invoke('config:migrate'),
  deployPreview: (projectId: string, skillName: string, skillContent: string, profileId: string) => ipcRenderer.invoke('deploy:preview', projectId, skillName, skillContent, profileId),
})