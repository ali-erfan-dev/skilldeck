export interface Skill {
  filename: string
  name: string
  description: string
  tags: string[]
  hash: string
  content: string
  source: string  // 'skilldeck' | 'claude-code' | 'agent-protocol' | 'codex' | 'project:<name>'
  sourcePath: string  // Full path where file was found
  divergentLocations?: string[]  // Tool locations where content differs from library
}

export interface RegistrySkill {
  id: string
  name: string
  slug: string
  description: string
  author: string
  tags: string[]
  url: string
  downloads?: number
  stars?: number
  version?: string
}

export interface TargetProfile {
  id: string           // 'claude-code' | 'codex' | 'cursor-rules' | 'windsurf' | etc.
  name: string         // Display name
  format: 'skill-dir' | 'instructions-file' | 'rules-dir'
  targetDir: string    // Relative path within project, e.g. '.claude/skills', '.cursor/rules'
  targetFile?: string  // For instructions-file format: filename, e.g. 'AGENTS.md', '.windsurfrules'
}

export interface Project {
  id: string
  name: string
  path: string
  skillsPath: string          // Kept for backward compatibility / migration
  targetProfile?: string      // Profile ID — new projects default to 'claude-code'
  deploymentStrategy?: 'copy' | 'symlink'  // Default: copy. Symlink eliminates drift.
}

export interface Config {
  libraryPath: string
  projects: Project[]
}

export interface DeploymentRecord {
  deployedAt: string
  libraryHash: string
  currentHash?: string
  profileId?: string  // Which target profile was used for this deployment
}

export type Deployments = Record<string, Record<string, DeploymentRecord>>

export interface SyncRecord {
  skillName: string  // Without .md extension
  toolId: string     // 'claude-code', 'codex', 'agent-protocol', etc.
  syncedAt: string
  libraryHash: string
}

export type SyncRecords = Record<string, SyncRecord[]>  // skillName -> SyncRecord[]

// ─── Built-in Target Profiles ──────────────────────────────────────────────

export const BUILTIN_PROFILES: TargetProfile[] = [
  // skill-dir profiles: <targetDir>/<skillName>/SKILL.md
  { id: 'claude-code', name: 'Claude Code', format: 'skill-dir', targetDir: '.claude/skills' },
  { id: 'codex', name: 'Codex', format: 'skill-dir', targetDir: '.codex/skills' },
  { id: 'kiro', name: 'Kiro', format: 'skill-dir', targetDir: '.kiro/skills' },
  { id: 'amp', name: 'Amp', format: 'skill-dir', targetDir: '.amp/skills' },
  { id: 'agent-protocol', name: 'Agent Protocol', format: 'skill-dir', targetDir: '.agents/skills' },
  // instructions-file profiles: delimited section appended to targetFile
  { id: 'windsurf', name: 'Windsurf', format: 'instructions-file', targetDir: '.', targetFile: '.windsurfrules' },
  { id: 'copilot', name: 'GitHub Copilot', format: 'instructions-file', targetDir: '.', targetFile: '.github/copilot-instructions.md' },
  { id: 'aider', name: 'Aider', format: 'instructions-file', targetDir: '.', targetFile: 'CONVENTIONS.md' },
  { id: 'opencode', name: 'OpenCode', format: 'instructions-file', targetDir: '.', targetFile: 'AGENTS.md' },
  // rules-dir profiles: <targetDir>/<skillName>.mdc
  { id: 'cursor-rules', name: 'Cursor Rules', format: 'rules-dir', targetDir: '.cursor/rules' },
]

export function getProfileById(id: string): TargetProfile | undefined {
  return BUILTIN_PROFILES.find(p => p.id === id)
}

/**
 * Format skill content for a target profile.
 * - skill-dir: raw content (unchanged)
 * - instructions-file: wrapped in delimiters
 * - rules-dir: wrapped in MDC frontmatter
 */
export function formatSkillForProfile(skillName: string, content: string, profile: TargetProfile): string {
  if (profile.format === 'skill-dir') {
    return content
  }
  if (profile.format === 'instructions-file') {
    const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim()
    return `<!-- skilldeck:skill-start:${skillName} -->\n${body}\n<!-- skilldeck:skill-end:${skillName} -->`
  }
  if (profile.format === 'rules-dir') {
    const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim()
    return `---\ndescription: ${skillName}\nglobs:\n---\n${body}\n`
  }
  return content
}

/**
 * Compute the deployment path for a skill given a project and profile.
 */
export function getDeployPath(projectPath: string, profile: TargetProfile, skillName: string): string {
  if (profile.format === 'skill-dir') {
    // <projectPath>/<targetDir>/<skillName>/SKILL.md
    return `${projectPath}/${profile.targetDir}/${skillName}/SKILL.md`
  }
  if (profile.format === 'instructions-file') {
    // <projectPath>/<targetDir>/<targetFile>
    return `${projectPath}/${profile.targetDir}/${profile.targetFile}`
  }
  if (profile.format === 'rules-dir') {
    // <projectPath>/<targetDir>/<skillName>.mdc
    return `${projectPath}/${profile.targetDir}/${skillName}.mdc`
  }
  return `${projectPath}/${profile.targetDir}/${skillName}.md`
}

/**
 * Remove a skill's section from an instructions-file.
 * Returns the file content with the skilldeck section removed.
 */
export function removeSkillSection(fileContent: string, skillName: string): string {
  const startMarker = `<!-- skilldeck:skill-start:${skillName} -->`
  const endMarker = `<!-- skilldeck:skill-end:${skillName} -->`
  const startIdx = fileContent.indexOf(startMarker)
  if (startIdx === -1) return fileContent
  const endIdx = fileContent.indexOf(endMarker, startIdx)
  if (endIdx === -1) return fileContent
  // Remove from start marker to end of end marker line
  const afterEnd = endIdx + endMarker.length
  // Trim trailing newline if present
  let cutEnd = afterEnd
  if (fileContent[cutEnd] === '\n') cutEnd++
  return (fileContent.slice(0, startIdx) + fileContent.slice(cutEnd)).trim() + '\n'
}

/**
 * Check if a skill section already exists in an instructions-file.
 */
export function skillSectionExists(fileContent: string, skillName: string): boolean {
  return fileContent.includes(`<!-- skilldeck:skill-start:${skillName} -->`)
}

/**
 * Insert or replace a skill section in an instructions-file.
 */
export function upsertSkillSection(fileContent: string, skillName: string, sectionContent: string): string {
  // If section already exists, remove it first
  let content = skillSectionExists(fileContent, skillName)
    ? removeSkillSection(fileContent, skillName)
    : fileContent
  // Append the new section
  const trimmed = content.trim()
  return trimmed.length > 0 ? `${trimmed}\n\n${sectionContent}\n` : `${sectionContent}\n`
}