import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import crypto from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Lazy getters — app.getPath('home') must be called after app.whenReady()
const getSkilldeckDir = () => path.join(app.getPath('home'), '.skilldeck')
const getConfigPath = () => path.join(getSkilldeckDir(), 'config.json')
const getDeploymentsPath = () => path.join(getSkilldeckDir(), 'deployments.json')
const getLibraryPath = () => path.join(getSkilldeckDir(), 'library')

const DEFAULT_CONFIG = {
  libraryPath: path.join(app.getPath('home'), '.skilldeck', 'library'),
  projects: [],
}

interface Skill {
  filename: string
  name: string
  description: string
  tags: string[]
  hash: string
  content: string
  source: string
  sourcePath: string
  divergentLocations?: string[]
}

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0f0f0f',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // Dev mode: load Vite dev server
  // Test mode or production: load from built files
  const isDev = process.env.NODE_ENV === 'development'
  const isTest = process.env.NODE_ENV === 'test'

  if (isDev && !isTest) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

function ensureConfigExists() {
  if (!fs.existsSync(getSkilldeckDir())) {
    fs.mkdirSync(getSkilldeckDir(), { recursive: true })
  }
  if (!fs.existsSync(getConfigPath())) {
    fs.writeFileSync(getConfigPath(), JSON.stringify(DEFAULT_CONFIG, null, 2))
  }
  if (!fs.existsSync(getDeploymentsPath())) {
    fs.writeFileSync(getDeploymentsPath(), JSON.stringify({}, null, 2))
  }
  if (!fs.existsSync(getLibraryPath())) {
    fs.mkdirSync(getLibraryPath(), { recursive: true })
  }
}

function parseSkillFromContent(content: string, filename: string, source: string, sourcePath: string): Skill {
  let name = filename.replace('.md', '').replace('SKILL', '')
  let description = ''
  let tags: string[] = []

  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (frontmatterMatch) {
    const fm = frontmatterMatch[1]
    const nameMatch = fm.match(/^name:\s*["']?(.+?)["']?\s*$/m)
    const descMatch = fm.match(/^description:\s*["']?(.+?)["']?\s*$/m)
    const tagsMatch = fm.match(/^tags:\s*\[(.+)\]\s*$/m)

    if (nameMatch) name = nameMatch[1]
    if (descMatch) description = descMatch[1]
    if (tagsMatch) tags = tagsMatch[1].split(',').map(t => t.trim().replace(/["']/g, ''))
  }

  const hash = crypto.createHash('md5').update(content).digest('hex')

  return { filename, name, description, tags, hash, content, source, sourcePath }
}

function scanDirectory(dir: string, source: string): Skill[] {
  const results: Skill[] = []

  if (!fs.existsSync(dir)) {
    return results
  }

  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'))
    for (const filename of files) {
      const filePath = path.join(dir, filename)
      try {
        const content = fs.readFileSync(filePath, 'utf8')
        results.push(parseSkillFromContent(content, filename, source, filePath))
      } catch (err) {
        console.warn(`Failed to read ${filePath}:`, err)
      }
    }
  } catch (err) {
    console.warn(`Failed to scan directory ${dir}:`, err)
  }

  return results
}

function recursiveScanSkillDirs(dir: string, source: string): Skill[] {
  const results: Skill[] = []

  if (!fs.existsSync(dir)) {
    return results
  }

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...recursiveScanSkillDirs(fullPath, source))
      } else if (entry.isFile() && entry.name === 'SKILL.md') {
        try {
          const content = fs.readFileSync(fullPath, 'utf8')
          const skillDirName = path.basename(dir)
          console.log(`[Skilldeck] Found skill: ${skillDirName} at ${fullPath}`)
          results.push(parseSkillFromContent(content, `${skillDirName}.md`, source, fullPath))
        } catch (err) {
          console.warn(`Failed to read ${fullPath}:`, err)
        }
      }
    }
  } catch (err) {
    console.warn(`Failed to scan directory ${dir}:`, err)
  }

  return results
}

// IPC: Config
ipcMain.handle('config:get', () => {
  ensureConfigExists()
  return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'))
})

ipcMain.handle('config:set', (_event, config) => {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2))
  return true
})

// IPC: Library
ipcMain.handle('library:list', () => {
  ensureConfigExists()
  const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'))
  const libPath = config.libraryPath || getLibraryPath()

  if (!fs.existsSync(libPath)) {
    return []
  }

  const files = fs.readdirSync(libPath).filter(f => f.endsWith('.md'))
  return files.map(filename => {
    const filePath = path.join(libPath, filename)
    const content = fs.readFileSync(filePath, 'utf8')
    const hash = crypto.createHash('md5').update(content).digest('hex')

    // Parse frontmatter
    let name = filename.replace('.md', '')
    let description = ''
    let tags: string[] = []

    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (frontmatterMatch) {
      const fm = frontmatterMatch[1]
      const nameMatch = fm.match(/^name:\s*["']?(.+?)["']?\s*$/m)
      const descMatch = fm.match(/^description:\s*["']?(.+?)["']?\s*$/m)
      const tagsMatch = fm.match(/^tags:\s*\[(.+)\]\s*$/m)

      if (nameMatch) name = nameMatch[1]
      if (descMatch) description = descMatch[1]
      if (tagsMatch) tags = tagsMatch[1].split(',').map(t => t.trim().replace(/["']/g, ''))
    }

    return { filename, name, description, tags, hash, content }
  })
})

ipcMain.handle('library:read', (_event, filename: string) => {
  const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'))
  const libPath = config.libraryPath || getLibraryPath()
  const filePath = path.join(libPath, filename)
  return fs.readFileSync(filePath, 'utf8')
})

ipcMain.handle('library:write', (_event, filename: string, content: string) => {
  const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'))
  const libPath = config.libraryPath || getLibraryPath()
  // Ensure library directory exists
  if (!fs.existsSync(libPath)) {
    fs.mkdirSync(libPath, { recursive: true })
  }
  const filePath = path.join(libPath, filename)
  fs.writeFileSync(filePath, content)
  return true
})

ipcMain.handle('library:delete', (_event, filePathOrFilename: string) => {
  if (!filePathOrFilename) return false

  let targetPath = filePathOrFilename

  // If it's not an absolute path, assume it's a filename in the library
  if (!path.isAbsolute(filePathOrFilename)) {
    const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'))
    const libPath = config.libraryPath || getLibraryPath()
    targetPath = path.join(libPath, filePathOrFilename)
  }

  try {
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath)
      return true
    }
    console.error(`Skill file not found at ${targetPath}`)
    return false
  } catch (err) {
    console.error(`Failed to delete skill at ${targetPath}:`, err)
    return false
  }
})

// IPC: Deployments
ipcMain.handle('deployments:get', () => {
  ensureConfigExists()
  return JSON.parse(fs.readFileSync(getDeploymentsPath(), 'utf8'))
})

ipcMain.handle('deployments:set', (_event, data: object) => {
  fs.writeFileSync(getDeploymentsPath(), JSON.stringify(data, null, 2))
  return true
})

// IPC: File operations
ipcMain.handle('file:copy', (_event, src: string, dest: string) => {
  const destDir = path.dirname(dest)
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true })
  }
  fs.copyFileSync(src, dest)
  return true
})

ipcMain.handle('file:delete', (_event, path: string) => {
  fs.unlinkSync(path)
  return true
})

ipcMain.handle('file:exists', (_event, path: string) => {
  return fs.existsSync(path)
})

ipcMain.handle('file:read', (_event, path: string) => {
  return fs.readFileSync(path, 'utf8')
})

ipcMain.handle('file:write', (_event, path: string, content: string) => {
  fs.writeFileSync(path, content)
  return true
})

ipcMain.handle('file:hash', (_event, path: string) => {
  const content = fs.readFileSync(path, 'utf8')
  return crypto.createHash('md5').update(content).digest('hex')
})

// IPC: List built-in target profiles
ipcMain.handle('profiles:list', () => {
  return [
    { id: 'claude-code', name: 'Claude Code', format: 'skill-dir', targetDir: '.claude/skills' },
    { id: 'codex', name: 'Codex', format: 'skill-dir', targetDir: '.codex/skills' },
    { id: 'kiro', name: 'Kiro', format: 'skill-dir', targetDir: '.kiro/skills' },
    { id: 'amp', name: 'Amp', format: 'skill-dir', targetDir: '.amp/skills' },
    { id: 'agent-protocol', name: 'Agent Protocol', format: 'skill-dir', targetDir: '.agents/skills' },
    { id: 'windsurf', name: 'Windsurf', format: 'instructions-file', targetDir: '.', targetFile: '.windsurfrules' },
    { id: 'copilot', name: 'GitHub Copilot', format: 'instructions-file', targetDir: '.', targetFile: '.github/copilot-instructions.md' },
    { id: 'aider', name: 'Aider', format: 'instructions-file', targetDir: '.', targetFile: 'CONVENTIONS.md' },
    { id: 'opencode', name: 'OpenCode', format: 'instructions-file', targetDir: '.', targetFile: 'AGENTS.md' },
    { id: 'cursor-rules', name: 'Cursor Rules', format: 'rules-dir', targetDir: '.cursor/rules' },
  ]
})

// IPC: Deploy a skill to a project using a target profile
ipcMain.handle('deploy:profile', (_event, projectId: string, skillName: string, skillContent: string, profileId: string) => {
  const profiles: Record<string, { format: string; targetDir: string; targetFile?: string }> = {
    'claude-code': { format: 'skill-dir', targetDir: '.claude/skills' },
    'codex': { format: 'skill-dir', targetDir: '.codex/skills' },
    'kiro': { format: 'skill-dir', targetDir: '.kiro/skills' },
    'amp': { format: 'skill-dir', targetDir: '.amp/skills' },
    'agent-protocol': { format: 'skill-dir', targetDir: '.agents/skills' },
    'windsurf': { format: 'instructions-file', targetDir: '.', targetFile: '.windsurfrules' },
    'copilot': { format: 'instructions-file', targetDir: '.', targetFile: '.github/copilot-instructions.md' },
    'aider': { format: 'instructions-file', targetDir: '.', targetFile: 'CONVENTIONS.md' },
    'opencode': { format: 'instructions-file', targetDir: '.', targetFile: 'AGENTS.md' },
    'cursor-rules': { format: 'rules-dir', targetDir: '.cursor/rules' },
  }

  const profile = profiles[profileId]
  if (!profile) {
    throw new Error(`Unknown profile: ${profileId}`)
  }

  // Read config to find project path and deployment strategy
  ensureConfigExists()
  const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'))
  const project = (config.projects || []).find((p: any) => p.id === projectId)
  if (!project) {
    throw new Error(`Project not found: ${projectId}`)
  }

  const projectPath = project.path
  const deploymentStrategy = project.deploymentStrategy || 'copy'
  const useSymlink = deploymentStrategy === 'symlink' && profile.format === 'skill-dir'

  if (profile.format === 'skill-dir') {
    // Create <projectPath>/<targetDir>/<skillName>/SKILL.md
    const skillDir = path.join(projectPath, profile.targetDir, skillName)
    const skillPath = path.join(skillDir, 'SKILL.md')
    fs.mkdirSync(skillDir, { recursive: true })

    if (useSymlink) {
      // Create symlink from deployed location to library file
      const libPath = config.libraryPath || getLibraryPath()
      const sourcePath = path.join(libPath, `${skillName}.md`)
      // Remove existing file/symlink first
      if (fs.existsSync(skillPath)) {
        fs.unlinkSync(skillPath)
      }
      try {
        fs.symlinkSync(sourcePath, skillPath)
        return { success: true, path: skillPath, format: profile.format, symlink: true }
      } catch (err: any) {
        // Symlink failed (likely Windows privilege issue) — fall back to copy
        console.warn(`Symlink failed, falling back to copy: ${err.message}`)
        fs.writeFileSync(skillPath, skillContent)
        return { success: true, path: skillPath, format: profile.format, symlink: false, fallbackReason: 'symlink_privilege' }
      }
    } else {
      fs.writeFileSync(skillPath, skillContent)
      return { success: true, path: skillPath, format: profile.format, symlink: false }
    }
  }

  if (profile.format === 'instructions-file') {
    // Append/update a delimited section in <projectPath>/<targetDir>/<targetFile>
    const filePath = path.join(projectPath, profile.targetDir!, profile.targetFile!)
    const startMarker = `<!-- skilldeck:skill-start:${skillName} -->`
    const endMarker = `<!-- skilldeck:skill-end:${skillName} -->`
    // Strip frontmatter from content for instructions-file
    const body = skillContent.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim()
    const section = `${startMarker}\n${body}\n${endMarker}`

    // Ensure parent directory exists
    const parentDir = path.dirname(filePath)
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true })
    }

    let existing = ''
    if (fs.existsSync(filePath)) {
      existing = fs.readFileSync(filePath, 'utf8')
    }

    // Remove existing section if present, then append new
    const existingStartIdx = existing.indexOf(startMarker)
    let newContent: string
    if (existingStartIdx !== -1) {
      // Replace existing section
      const existingEndIdx = existing.indexOf(endMarker, existingStartIdx)
      if (existingEndIdx !== -1) {
        const afterEnd = existingEndIdx + endMarker.length
        let cutEnd = afterEnd
        if (existing[cutEnd] === '\n') cutEnd++
        const before = existing.slice(0, existingStartIdx).trimEnd()
        const after = existing.slice(cutEnd).trimStart()
        newContent = before.length > 0 ? `${before}\n\n${section}\n` : `${section}\n`
        if (after.length > 0) {
          // Preserve content after the section
          newContent = `${before.length > 0 ? before + '\n\n' : ''}${section}\n${after.startsWith('\n') ? '' : '\n'}${after}`
        }
      } else {
        newContent = existing + '\n' + section + '\n'
      }
    } else {
      newContent = existing.trim().length > 0 ? `${existing.trim()}\n\n${section}\n` : `${section}\n`
    }

    fs.writeFileSync(filePath, newContent)
    return { success: true, path: filePath, format: profile.format }
  }

  if (profile.format === 'rules-dir') {
    // Create <projectPath>/<targetDir>/<skillName>.mdc with YAML frontmatter
    const rulesDir = path.join(projectPath, profile.targetDir)
    const rulePath = path.join(rulesDir, `${skillName}.mdc`)
    fs.mkdirSync(rulesDir, { recursive: true })
    const body = skillContent.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim()
    const mdcContent = `---\ndescription: ${skillName}\nglobs:\n---\n${body}\n`
    fs.writeFileSync(rulePath, mdcContent)
    return { success: true, path: rulePath, format: profile.format }
  }

  throw new Error(`Unknown format: ${profile.format}`)
})

// IPC: Undeploy a skill from a project using a target profile
ipcMain.handle('undeploy:profile', (_event, projectId: string, skillName: string, profileId: string) => {
  const profiles: Record<string, { format: string; targetDir: string; targetFile?: string }> = {
    'claude-code': { format: 'skill-dir', targetDir: '.claude/skills' },
    'codex': { format: 'skill-dir', targetDir: '.codex/skills' },
    'kiro': { format: 'skill-dir', targetDir: '.kiro/skills' },
    'amp': { format: 'skill-dir', targetDir: '.amp/skills' },
    'agent-protocol': { format: 'skill-dir', targetDir: '.agents/skills' },
    'windsurf': { format: 'instructions-file', targetDir: '.', targetFile: '.windsurfrules' },
    'copilot': { format: 'instructions-file', targetDir: '.', targetFile: '.github/copilot-instructions.md' },
    'aider': { format: 'instructions-file', targetDir: '.', targetFile: 'CONVENTIONS.md' },
    'opencode': { format: 'instructions-file', targetDir: '.', targetFile: 'AGENTS.md' },
    'cursor-rules': { format: 'rules-dir', targetDir: '.cursor/rules' },
  }

  const profile = profiles[profileId]
  if (!profile) {
    throw new Error(`Unknown profile: ${profileId}`)
  }

  ensureConfigExists()
  const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'))
  const project = (config.projects || []).find((p: any) => p.id === projectId)
  if (!project) {
    throw new Error(`Project not found: ${projectId}`)
  }

  const projectPath = project.path

  if (profile.format === 'skill-dir') {
    // Delete <projectPath>/<targetDir>/<skillName>/SKILL.md and dir if empty
    const skillDir = path.join(projectPath, profile.targetDir, skillName)
    const skillPath = path.join(skillDir, 'SKILL.md')
    if (fs.existsSync(skillPath)) {
      fs.unlinkSync(skillPath)
    }
    // Remove empty dir
    if (fs.existsSync(skillDir) && fs.readdirSync(skillDir).length === 0) {
      fs.rmSync(skillDir, { recursive: true })
    }
    return { success: true }
  }

  if (profile.format === 'instructions-file') {
    // Remove delimited section from <projectPath>/<targetDir>/<targetFile>
    const filePath = path.join(projectPath, profile.targetDir!, profile.targetFile!)
    if (!fs.existsSync(filePath)) return { success: true }

    const content = fs.readFileSync(filePath, 'utf8')
    const startMarker = `<!-- skilldeck:skill-start:${skillName} -->`
    const endMarker = `<!-- skilldeck:skill-end:${skillName} -->`
    const startIdx = content.indexOf(startMarker)
    if (startIdx === -1) return { success: true } // Section not found, already removed

    const endIdx = content.indexOf(endMarker, startIdx)
    if (endIdx === -1) return { success: true }

    const afterEnd = endIdx + endMarker.length
    let cutEnd = afterEnd
    if (content[cutEnd] === '\n') cutEnd++

    let newContent = content.slice(0, startIdx) + content.slice(cutEnd)
    newContent = newContent.trim()
    if (newContent.length === 0) {
      fs.unlinkSync(filePath)
    } else {
      fs.writeFileSync(filePath, newContent + '\n')
    }
    return { success: true }
  }

  if (profile.format === 'rules-dir') {
    // Delete <projectPath>/<targetDir>/<skillName>.mdc
    const rulePath = path.join(projectPath, profile.targetDir, `${skillName}.mdc`)
    if (fs.existsSync(rulePath)) {
      fs.unlinkSync(rulePath)
    }
    return { success: true }
  }

  throw new Error(`Unknown format: ${profile.format}`)
})

// IPC: Migrate config — add targetProfile to projects missing it
ipcMain.handle('config:migrate', () => {
  ensureConfigExists()
  const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'))
  let changed = false

  if (config.projects) {
    for (const project of config.projects) {
      if (!project.targetProfile) {
        // Infer profile from skillsPath, default to claude-code
        if (project.skillsPath && project.skillsPath.includes('codex')) {
          project.targetProfile = 'codex'
        } else if (project.skillsPath && project.skillsPath.includes('.agents')) {
          project.targetProfile = 'agent-protocol'
        } else if (project.skillsPath && project.skillsPath.includes('.kiro')) {
          project.targetProfile = 'kiro'
        } else if (project.skillsPath && project.skillsPath.includes('.amp')) {
          project.targetProfile = 'amp'
        } else {
          project.targetProfile = 'claude-code'
        }
        changed = true
      }
    }
  }

  if (changed) {
    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2))
  }
  return config
})

// IPC: Preview deployment — shows what the target file will look like after deploy (no write)
ipcMain.handle('deploy:preview', (_event, projectId: string, skillName: string, skillContent: string, profileId: string) => {
  const profiles: Record<string, { format: string; targetDir: string; targetFile?: string }> = {
    'claude-code': { format: 'skill-dir', targetDir: '.claude/skills' },
    'codex': { format: 'skill-dir', targetDir: '.codex/skills' },
    'kiro': { format: 'skill-dir', targetDir: '.kiro/skills' },
    'amp': { format: 'skill-dir', targetDir: '.amp/skills' },
    'agent-protocol': { format: 'skill-dir', targetDir: '.agents/skills' },
    'windsurf': { format: 'instructions-file', targetDir: '.', targetFile: '.windsurfrules' },
    'copilot': { format: 'instructions-file', targetDir: '.', targetFile: '.github/copilot-instructions.md' },
    'aider': { format: 'instructions-file', targetDir: '.', targetFile: 'CONVENTIONS.md' },
    'opencode': { format: 'instructions-file', targetDir: '.', targetFile: 'AGENTS.md' },
    'cursor-rules': { format: 'rules-dir', targetDir: '.cursor/rules' },
  }

  const profile = profiles[profileId]
  if (!profile) {
    throw new Error(`Unknown profile: ${profileId}`)
  }

  ensureConfigExists()
  const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'))
  const project = (config.projects || []).find((p: any) => p.id === projectId)
  if (!project) {
    throw new Error(`Project not found: ${projectId}`)
  }

  const projectPath = project.path

  // For skill-dir and rules-dir, no preview needed (they create new files)
  if (profile.format === 'skill-dir' || profile.format === 'rules-dir') {
    return {
      needsPreview: false,
      profileId,
      format: profile.format,
      targetPath: profile.format === 'skill-dir'
        ? `${projectPath}/${profile.targetDir}/${skillName}/SKILL.md`
        : `${projectPath}/${profile.targetDir}/${skillName}.mdc`,
    }
  }

  // For instructions-file, generate preview
  const filePath = path.join(projectPath, profile.targetDir!, profile.targetFile!)
  const startMarker = `<!-- skilldeck:skill-start:${skillName} -->`
  const endMarker = `<!-- skilldeck:skill-end:${skillName} -->`
  const body = skillContent.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim()
  const section = `${startMarker}\n${body}\n${endMarker}`

  let existingContent = ''
  let fileExists = false

  if (fs.existsSync(filePath)) {
    existingContent = fs.readFileSync(filePath, 'utf8')
    fileExists = true
  }

  // Check if section already exists
  const sectionAlreadyExists = existingContent.includes(startMarker)

  // Compute merged content
  let mergedContent: string
  if (existingContent.trim().length === 0) {
    mergedContent = `${section}\n`
  } else if (sectionAlreadyExists) {
    // Replace existing section
    const existingStartIdx = existingContent.indexOf(startMarker)
    const existingEndIdx = existingContent.indexOf(endMarker, existingStartIdx)
    if (existingEndIdx !== -1) {
      const afterEnd = existingEndIdx + endMarker.length
      let cutEnd = afterEnd
      if (existingContent[cutEnd] === '\n') cutEnd++
      const before = existingContent.slice(0, existingStartIdx).trimEnd()
      const after = existingContent.slice(cutEnd).trimStart()
      mergedContent = before.length > 0 ? `${before}\n\n${section}\n` : `${section}\n`
      if (after.length > 0) {
        mergedContent = `${before.length > 0 ? before + '\n\n' : ''}${section}\n${after.startsWith('\n') ? '' : '\n'}${after}`
      }
    } else {
      mergedContent = `${existingContent.trim()}\n\n${section}\n`
    }
  } else {
    mergedContent = `${existingContent.trim()}\n\n${section}\n`
  }

  // Detect conflicts: check if skill content keywords overlap with existing non-skilldeck content
  const existingNonSkilldeck = existingContent
    .replace(/<!-- skilldeck:skill-start:\S+ -->[\s\S]*?<!-- skilldeck:skill-end:\S+ -->/g, '')
    .trim()

  const hasConflict = existingNonSkilldeck.length > 0 && existingNonSkilldeck.toLowerCase().includes(body.toLowerCase().split('\n')[0].toLowerCase().substring(0, 40))

  return {
    needsPreview: true,
    profileId,
    format: profile.format,
    targetPath: filePath,
    fileExists,
    existingContent,
    mergedContent,
    hasConflict,
    sectionAlreadyExists,
    skillName,
  }
})

// IPC: Version history — list versions for a skill
ipcMain.handle('versions:list', (_event, skillName: string) => {
  const versionsDir = path.join(getSkilldeckDir(), 'versions', skillName)
  if (!fs.existsSync(versionsDir)) {
    return []
  }

  const versions: { id: string; timestamp: string; hash: string }[] = []
  const entries = fs.readdirSync(versionsDir).filter(f => f.endsWith('.json')).sort().reverse()
  for (const entry of entries) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(versionsDir, entry), 'utf8'))
      versions.push(data)
    } catch { /* skip malformed */ }
  }

  // Cap at 20 versions — prune oldest
  if (versions.length > 20) {
    const toDelete = entries.slice(20)
    for (const f of toDelete) {
      fs.unlinkSync(path.join(versionsDir, f))
    }
    versions.splice(20)
  }

  return versions
})

// IPC: Version history — read a specific version
ipcMain.handle('versions:read', (_event, skillName: string, versionId: string) => {
  const versionPath = path.join(getSkilldeckDir(), 'versions', skillName, `${versionId}.json`)
  if (!fs.existsSync(versionPath)) {
    throw new Error(`Version ${versionId} not found for skill ${skillName}`)
  }
  return JSON.parse(fs.readFileSync(versionPath, 'utf8'))
})

// IPC: Version history — save a version snapshot
ipcMain.handle('versions:save', (_event, skillName: string, content: string) => {
  const versionsDir = path.join(getSkilldeckDir(), 'versions', skillName)
  if (!fs.existsSync(versionsDir)) {
    fs.mkdirSync(versionsDir, { recursive: true })
  }

  const id = `v${Date.now()}`
  const hash = crypto.createHash('md5').update(content).digest('hex')
  const version = {
    id,
    timestamp: new Date().toISOString(),
    hash,
    content,
  }

  fs.writeFileSync(path.join(versionsDir, `${id}.json`), JSON.stringify(version, null, 2))

  // Prune to 20 versions
  const entries = fs.readdirSync(versionsDir).filter(f => f.endsWith('.json')).sort()
  if (entries.length > 20) {
    const toDelete = entries.slice(0, entries.length - 20)
    for (const f of toDelete) {
      fs.unlinkSync(path.join(versionsDir, f))
    }
  }

  return version
})

// IPC: Version history — rollback to a specific version
ipcMain.handle('versions:rollback', (_event, skillName: string, versionId: string) => {
  const versionPath = path.join(getSkilldeckDir(), 'versions', skillName, `${versionId}.json`)
  if (!fs.existsSync(versionPath)) {
    throw new Error(`Version ${versionId} not found for skill ${skillName}`)
  }

  const version = JSON.parse(fs.readFileSync(versionPath, 'utf8'))

  // Save current as a new version first (for audit trail)
  const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'))
  const libPath = config.libraryPath || getLibraryPath()
  const currentPath = path.join(libPath, `${skillName}.md`)

  if (fs.existsSync(currentPath)) {
    const currentContent = fs.readFileSync(currentPath, 'utf8')
    const currentHash = crypto.createHash('md5').update(currentContent).digest('hex')
    const currentVersion = {
      id: `v${Date.now()}`,
      timestamp: new Date().toISOString(),
      hash: currentHash,
      content: currentContent,
    }
    const versionsDir = path.join(getSkilldeckDir(), 'versions', skillName)
    fs.writeFileSync(path.join(versionsDir, `${currentVersion.id}.json`), JSON.stringify(currentVersion, null, 2))
  }

  // Write the rollback version as current
  fs.writeFileSync(currentPath, version.content)

  return { success: true, content: version.content }
})

// IPC: Promote project version of a skill back to library
ipcMain.handle('promote:to-library', (_event, skillName: string, projectSkillPath: string) => {
  ensureConfigExists()
  const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'))
  const libPath = config.libraryPath || getLibraryPath()

  if (!fs.existsSync(projectSkillPath)) {
    throw new Error(`Project skill file not found: ${projectSkillPath}`)
  }

  const content = fs.readFileSync(projectSkillPath, 'utf8')
  const libFilePath = path.join(libPath, `${skillName}.md`)

  if (!fs.existsSync(libFilePath)) {
    throw new Error(`Library skill file not found: ${libFilePath}`)
  }

  // Write the project version to the library
  fs.writeFileSync(libFilePath, content)

  // Compute new hash
  const hash = crypto.createHash('md5').update(content).digest('hex')

  // Update deployment records — find all deployments of this skill and update hashes
  const deploymentsPath = getDeploymentsPath()
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'))
  for (const [_projectId, projectDeps] of Object.entries(deployments)) {
    const deps = projectDeps as Record<string, { libraryHash: string; currentHash?: string }>
    if (deps[skillName]) {
      deps[skillName].libraryHash = hash
      deps[skillName].currentHash = hash
    }
  }
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2))

  return { success: true, libraryPath: libFilePath, hash }
})

// IPC: Community registry — search for skills
ipcMain.handle('registry:search', async (_event, query: string, options?: { sort?: string; page?: number; tags?: string }) => {
  // Search the SkillsHub registry
  try {
    const https = require('https')
    const sort = options?.sort || 'downloads'
    const page = options?.page || 1
    const tags = options?.tags

    return new Promise((resolve) => {
      const params = new URLSearchParams({ q: query || '', limit: '50', sort, page: String(page) })
      if (tags) params.set('tags', tags)
      const url = `https://skillshub.wtf/api/v1/skills/search?${params.toString()}`

      https.get(url, { timeout: 10000 }, (res: any) => {
        let data = ''
        res.on('data', (chunk: any) => { data += chunk })
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data)
            // Map SkillsHub response to RegistrySkill shape
            const skills = (parsed.data || []).map((s: any) => ({
              id: s.id,
              name: s.name,
              slug: s.slug,
              description: s.description || '',
              author: s.owner?.username || s.repo?.githubOwner || '',
              tags: s.tags || [],
              url: `https://skillshub.wtf/${s.repo?.githubOwner || s.owner?.username}/${s.repo?.githubRepoName || 'repo'}/${s.slug}?format=md`,
              downloads: s.repo?.downloadCount,
              stars: s.repo?.starCount,
              version: undefined,
            }))
            resolve({ skills, total: parsed.total || 0, hasMore: parsed.hasMore || false })
          } catch {
            resolve({ skills: [], total: 0, hasMore: false })
          }
        })
      }).on('error', () => {
        resolve({ skills: [], total: 0, hasMore: false })
      }).on('timeout', () => {
        resolve({ skills: [], total: 0, hasMore: false })
      })
    })
  } catch {
    return { skills: [], total: 0, hasMore: false }
  }
})

// IPC: Community registry — install a skill
ipcMain.handle('registry:install', async (_event, skillUrl: string) => {
  ensureConfigExists()
  const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'))
  const libPath = config.libraryPath || getLibraryPath()

  try {
    const https = require('https')
    const http = require('http')
    const client = skillUrl.startsWith('https') ? https : http

    return new Promise((resolve) => {
      client.get(skillUrl, { timeout: 15000 }, (res: any) => {
        let data = ''
        res.on('data', (chunk: any) => { data += chunk })
        res.on('end', () => {
          try {
            // Try to parse as JSON (some registries return skill metadata)
            // If it's raw markdown, save it directly
            if (data.trim().startsWith('{')) {
              const parsed = JSON.parse(data)
              const content = parsed.content || parsed.body || parsed.markdown || data
              const filename = parsed.slug ? `${parsed.slug}.md` : `skill-${Date.now()}.md`
              const filePath = path.join(libPath, filename)
              fs.writeFileSync(filePath, content)
              resolve({ success: true, path: filePath, name: parsed.name || filename })
            } else {
              // Raw markdown content
              const nameMatch = data.match(/^name:\s*["']?(.+?)["']?\s*$/m)
              const name = nameMatch ? nameMatch[1].replace(/[^a-zA-Z0-9-]/g, '-') : `skill-${Date.now()}`
              const filename = `${name}.md`
              const filePath = path.join(libPath, filename)
              fs.writeFileSync(filePath, data)
              resolve({ success: true, path: filePath, name })
            }
          } catch {
            // Save raw content as-is
            const filename = `skill-${Date.now()}.md`
            const filePath = path.join(libPath, filename)
            fs.writeFileSync(filePath, data)
            resolve({ success: true, path: filePath, name: filename })
          }
        })
      }).on('error', (err: any) => {
        resolve({ success: false, error: err.message })
      }).on('timeout', () => {
        resolve({ success: false, error: 'Request timed out' })
      })
    })
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// IPC: Community registry — check connectivity
ipcMain.handle('registry:ping', async () => {
  try {
    const https = require('https')
    return new Promise((resolve) => {
      https.get('https://skillshub.wtf/api/v1/health', { timeout: 5000 }, (res: any) => {
        resolve({ online: res.statusCode === 200 })
      }).on('error', () => {
        resolve({ online: false })
      }).on('timeout', () => {
        resolve({ online: false })
      })
    })
  } catch {
    return { online: false }
  }
})

// IPC: Semantic search — generate embeddings and search
ipcMain.handle('search:semantic', async (_event, query: string) => {
  ensureConfigExists()
  const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'))
  const libPath = config.libraryPath || getLibraryPath()

  if (!fs.existsSync(libPath)) {
    return []
  }

  // Read all skill files
  const files = fs.readdirSync(libPath).filter(f => f.endsWith('.md'))
  const skills: { filename: string; name: string; description: string; content: string; score: number }[] = []

  for (const filename of files) {
    const filePath = path.join(libPath, filename)
    const content = fs.readFileSync(filePath, 'utf8')
    let name = filename.replace('.md', '')
    let description = ''
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (fmMatch) {
      const fm = fmMatch[1]
      const nameMatch = fm.match(/^name:\s*["']?(.+?)["']?\s*$/m)
      const descMatch = fm.match(/^description:\s*["']?(.+?)["']?\s*$/m)
      if (nameMatch) name = nameMatch[1]
      if (descMatch) description = descMatch[1]
    }

    // Simple TF-IDF style scoring for semantic relevance
    const queryLower = query.toLowerCase()
    const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2)
    const nameLower = name.toLowerCase()
    const descLower = description.toLowerCase()
    const bodyLower = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').toLowerCase()

    let score = 0
    for (const term of queryTerms) {
      // Name match (highest weight)
      if (nameLower.includes(term)) score += 10
      // Description match
      if (descLower.includes(term)) score += 5
      // Body match
      const bodyMatches = (bodyLower.match(new RegExp(term, 'g')) || []).length
      score += Math.min(bodyMatches, 5)
    }

    // Bonus for exact phrase match in name or description
    if (nameLower.includes(queryLower) || descLower.includes(queryLower)) {
      score += 15
    }

    skills.push({ filename, name, description, content, score })
  }

  // Sort by score descending, filter out zero scores
  skills.sort((a, b) => b.score - a.score)
  return skills.filter(s => s.score > 0).map(s => ({
    filename: s.filename,
    name: s.name,
    description: s.description,
    score: s.score,
  }))
})

// IPC: Git sync — check if library is a git repo
ipcMain.handle('git:status', () => {
  ensureConfigExists()
  const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'))
  const libPath = config.libraryPath || getLibraryPath()
  const gitDir = path.join(libPath, '.git')
  return { isGitRepo: fs.existsSync(gitDir), libraryPath: libPath }
})

// IPC: Git sync — pull and push
const { execSync } = require('child_process')

ipcMain.handle('git:sync', () => {
  ensureConfigExists()
  const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'))
  const libPath = config.libraryPath || getLibraryPath()
  const gitDir = path.join(libPath, '.git')

  if (!fs.existsSync(gitDir)) {
    return { success: false, error: 'Library is not a Git repository' }
  }

  const results: { action: string; success: boolean; message?: string }[] = []

  // Pull
  try {
    const pullOutput = execSync('git pull', { cwd: libPath, encoding: 'utf8', timeout: 30000 })
    results.push({ action: 'pull', success: true, message: pullOutput.trim() })
  } catch (err: any) {
    const msg = err.stderr?.toString().trim() || err.message
    if (msg.includes('merge conflict') || msg.includes('CONFLICT')) {
      results.push({ action: 'pull', success: false, message: 'Merge conflict detected' })
    } else if (msg.includes('not a git repository') || msg.includes('ENOENT')) {
      results.push({ action: 'pull', success: false, message: 'Git not available or not a repo' })
    } else {
      results.push({ action: 'pull', success: false, message: msg.substring(0, 200) })
    }
  }

  // Push
  try {
    const pushOutput = execSync('git push', { cwd: libPath, encoding: 'utf8', timeout: 30000 })
    results.push({ action: 'push', success: true, message: pushOutput.trim() })
  } catch (err: any) {
    const msg = err.stderr?.toString().trim() || err.message
    if (msg.includes('no upstream') || msg.includes('has no upstream')) {
      // Try push -u origin main
      try {
        const pushOutput2 = execSync('git push -u origin main', { cwd: libPath, encoding: 'utf8', timeout: 30000 })
        results.push({ action: 'push', success: true, message: pushOutput2.trim() })
      } catch (err2: any) {
        results.push({ action: 'push', success: false, message: err2.stderr?.toString().trim().substring(0, 200) || err2.message })
      }
    } else {
      results.push({ action: 'push', success: false, message: msg.substring(0, 200) })
    }
  }

  return { success: results.every(r => r.success), results }
})

// IPC: Directory picker
ipcMain.handle('dialog:openDirectory', async () => {
  const { dialog } = await import('electron')
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory'],
  })
  return result.filePaths[0] || null
})

// IPC: Ensure directory exists
ipcMain.handle('dir:ensure', (_event, dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
  return true
})

// IPC: Scan all skill locations
ipcMain.handle('scan:all', () => {
  ensureConfigExists()
  const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'))
  const homedir = app.getPath('home')
  const results: Skill[] = []
  console.log(`[Skilldeck] Starting full skill scan... Home: ${homedir}`)

  // 1. Skilldeck library
  const libPath = config.libraryPath || getLibraryPath()
  console.log(`[Skilldeck] Scanning library: ${libPath}`)
  results.push(...scanDirectory(libPath, 'skilldeck'))

  // 2. Claude Code skills (~/.claude/skills/*/SKILL.md)
  const claudeSkillsDir = path.join(homedir, '.claude', 'skills')
  results.push(...recursiveScanSkillDirs(claudeSkillsDir, 'claude-code'))

  // 2b. Claude Code plugin skills (~/.claude/plugins/*/skills/*/SKILL.md)
  const claudePluginsDir = path.join(homedir, '.claude', 'plugins')
  results.push(...recursiveScanSkillDirs(claudePluginsDir, 'claude-plugin'))

  // 3. Claude Code commands (~/.claude/commands/*.md)
  const claudeCommandsDir = path.join(homedir, '.claude', 'commands')
  results.push(...scanDirectory(claudeCommandsDir, 'claude-code-cmd'))

  // 4. Claude Code system skills (~/.claude/skills/.system/*/SKILL.md)
  const claudeSystemDir = path.join(homedir, '.claude', 'skills', '.system')
  results.push(...recursiveScanSkillDirs(claudeSystemDir, 'claude-code-system'))

  // 5. Agent Protocol (~/.agents/skills/*/SKILL.md)
  const agentsDir = path.join(homedir, '.agents', 'skills')
  results.push(...recursiveScanSkillDirs(agentsDir, 'agent-protocol'))

  // 6. Codex (~/.codex/skills/*/SKILL.md)
  const codexDir = path.join(homedir, '.codex', 'skills')
  results.push(...recursiveScanSkillDirs(codexDir, 'codex'))

  // 7. Codex system (~/.codex/skills/.system/*/SKILL.md)
  const codexSystemDir = path.join(homedir, '.codex', 'skills', '.system')
  results.push(...recursiveScanSkillDirs(codexSystemDir, 'codex-system'))

  // 8. Kiro (~/.kiro/skills/*/SKILL.md)
  const kiroDir = path.join(homedir, '.kiro', 'skills')
  results.push(...recursiveScanSkillDirs(kiroDir, 'kiro'))

  // 9. Amp (~/.amp/skills/*/SKILL.md)
  const ampDir = path.join(homedir, '.amp', 'skills')
  results.push(...recursiveScanSkillDirs(ampDir, 'amp'))

  // 10. Gemini (~/.gemini/skills/*/SKILL.md)
  const geminiDir = path.join(homedir, '.gemini', 'skills')
  results.push(...recursiveScanSkillDirs(geminiDir, 'gemini'))

  // 11. Registered projects
  if (config.projects) {
    for (const project of config.projects) {
      const projectPath = path.join(project.path, project.skillsPath)
      results.push(...scanDirectory(projectPath, `project:${project.name}`))
    }
  }

  // Detect divergence: group skills by name and check for hash differences
  const skillsByName: Record<string, Skill[]> = {}
  for (const skill of results) {
    const name = skill.filename.replace(/\.md$/, '')
    if (!skillsByName[name]) {
      skillsByName[name] = []
    }
    skillsByName[name].push(skill)
  }

  // Mark skills with divergent locations
  for (const [_name, skills] of Object.entries(skillsByName)) {
    if (skills.length > 1) {
      // Get unique hashes
      const uniqueHashes = new Set(skills.map(s => s.hash))
      if (uniqueHashes.size > 1) {
        // Divergence detected - mark each skill with locations that have different content
        for (const skill of skills) {
          const divergentLocations = skills
            .filter(s => s.hash !== skill.hash)
            .map(s => s.source)
          if (divergentLocations.length > 0) {
            skill.divergentLocations = [...new Set(divergentLocations)]
          }
        }
      }
    }
  }

  return results
})

// IPC: Detect available tool directories
ipcMain.handle('tools:detect', () => {
  const homedir = app.getPath('home')
  const tools: { id: string; name: string; path: string }[] = []

  // Check each tool's skills directory
  const toolDirs = [
    { id: 'claude-code', name: 'Claude Code', dir: path.join(homedir, '.claude', 'skills') },
    { id: 'codex', name: 'Codex', dir: path.join(homedir, '.codex', 'skills') },
    { id: 'agent-protocol', name: 'Agent Protocol', dir: path.join(homedir, '.agents', 'skills') },
    { id: 'kiro', name: 'Kiro', dir: path.join(homedir, '.kiro', 'skills') },
    { id: 'amp', name: 'Amp', dir: path.join(homedir, '.amp', 'skills') },
    { id: 'gemini', name: 'Gemini', dir: path.join(homedir, '.gemini', 'skills') },
  ]

  for (const tool of toolDirs) {
    if (fs.existsSync(tool.dir)) {
      tools.push({ id: tool.id, name: tool.name, path: tool.dir })
    }
  }

  return tools
})

// IPC: Sync skill to tool directories
ipcMain.handle('tools:sync', (_event, skillName: string, content: string, toolIds: string[]) => {
  console.log('tools:sync called - skillName:', skillName, 'toolIds:', toolIds, 'content preview:', content.substring(0, 50))
  const homedir = app.getPath('home')
  const results: { toolId: string; success: boolean; path: string }[] = []

  const toolPaths: Record<string, string> = {
    'claude-code': path.join(homedir, '.claude', 'skills'),
    'codex': path.join(homedir, '.codex', 'skills'),
    'agent-protocol': path.join(homedir, '.agents', 'skills'),
    'kiro': path.join(homedir, '.kiro', 'skills'),
    'amp': path.join(homedir, '.amp', 'skills'),
    'gemini': path.join(homedir, '.gemini', 'skills'),
  }

  for (const toolId of toolIds) {
    const toolDir = toolPaths[toolId]
    if (!toolDir) {
      console.log('[tools:sync] Unknown toolId:', toolId)
      continue
    }

    // Create skill directory and write SKILL.md
    const skillDir = path.join(toolDir, skillName)
    const skillPath = path.join(skillDir, 'SKILL.md')

    console.log(`[tools:sync] skillName=${skillName} toolId=${toolId} path=${skillPath}`)
    console.log(`[tools:sync] content preview: ${content.substring(0, 50)}...`)

    try {
      if (!fs.existsSync(skillDir)) {
        fs.mkdirSync(skillDir, { recursive: true })
      }
      fs.writeFileSync(skillPath, content)
      console.log('[tools:sync] Synced successfully to:', skillPath)
      results.push({ toolId, success: true, path: skillPath })
    } catch (err) {
      console.error(`Failed to sync to ${toolId}:`, err)
      results.push({ toolId, success: false, path: skillPath })
    }
  }

  console.log('tools:sync results:', results)
  return results
})

app.whenReady().then(() => {
  ensureConfigExists()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})