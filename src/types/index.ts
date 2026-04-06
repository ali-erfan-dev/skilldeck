export interface Skill {
  filename: string
  name: string
  description: string
  tags: string[]
  hash: string
  content: string
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