export interface Skill {
  filename: string
  name: string
  description: string
  tags: string[]
  hash: string
  content: string
  source: string  // 'skilldeck' | 'claude-code' | 'agent-protocol' | 'codex' | 'project:<name>'
  sourcePath: string  // Full path where file was found
}

export interface Project {
  id: string
  name: string
  path: string
  skillsPath: string
}

export interface Config {
  libraryPath: string
  projects: Project[]
}

export interface DeploymentRecord {
  deployedAt: string
  libraryHash: string
  currentHash?: string
}

export type Deployments = Record<string, Record<string, DeploymentRecord>>