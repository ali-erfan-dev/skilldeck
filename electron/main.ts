import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import crypto from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SKILLDECK_DIR = path.join(app.getPath('home'), '.skilldeck')
const CONFIG_PATH = path.join(SKILLDECK_DIR, 'config.json')
const DEPLOYMENTS_PATH = path.join(SKILLDECK_DIR, 'deployments.json')
const LIBRARY_PATH = path.join(SKILLDECK_DIR, 'library')

const DEFAULT_CONFIG = {
  libraryPath: LIBRARY_PATH,
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
  if (!fs.existsSync(SKILLDECK_DIR)) {
    fs.mkdirSync(SKILLDECK_DIR, { recursive: true })
  }
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2))
  }
  if (!fs.existsSync(DEPLOYMENTS_PATH)) {
    fs.writeFileSync(DEPLOYMENTS_PATH, JSON.stringify({}, null, 2))
  }
  if (!fs.existsSync(LIBRARY_PATH)) {
    fs.mkdirSync(LIBRARY_PATH, { recursive: true })
  }
}

function parseSkillFromContent(content: string, filename: string, source: string, sourcePath: string): Skill {
  let name = filename.replace('.md', '').replace('SKILL', '')
  let description = ''
  let tags: string[] = []

  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
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

function scanSkillDirs(dir: string, source: string): Skill[] {
  const results: Skill[] = []

  if (!fs.existsSync(dir)) {
    return results
  }

  try {
    const subdirs = fs.readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)

    for (const subdir of subdirs) {
      const skillPath = path.join(dir, subdir, 'SKILL.md')
      if (fs.existsSync(skillPath)) {
        try {
          const content = fs.readFileSync(skillPath, 'utf8')
          results.push(parseSkillFromContent(content, `${subdir}.md`, source, skillPath))
        } catch (err) {
          console.warn(`Failed to read ${skillPath}:`, err)
        }
      }
    }
  } catch (err) {
    console.warn(`Failed to scan skill directories ${dir}:`, err)
  }

  return results
}

// IPC: Config
ipcMain.handle('config:get', () => {
  ensureConfigExists()
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
})

ipcMain.handle('config:set', (_event, config) => {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
  return true
})

// IPC: Library
ipcMain.handle('library:list', () => {
  ensureConfigExists()
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  const libPath = config.libraryPath || LIBRARY_PATH

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

    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
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
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  const libPath = config.libraryPath || LIBRARY_PATH
  const filePath = path.join(libPath, filename)
  return fs.readFileSync(filePath, 'utf8')
})

ipcMain.handle('library:write', (_event, filename: string, content: string) => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  const libPath = config.libraryPath || LIBRARY_PATH
  // Ensure library directory exists
  if (!fs.existsSync(libPath)) {
    fs.mkdirSync(libPath, { recursive: true })
  }
  const filePath = path.join(libPath, filename)
  fs.writeFileSync(filePath, content)
  return true
})

ipcMain.handle('library:delete', (_event, filename: string) => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  const libPath = config.libraryPath || LIBRARY_PATH
  const filePath = path.join(libPath, filename)
  fs.unlinkSync(filePath)
  return true
})

// IPC: Deployments
ipcMain.handle('deployments:get', () => {
  ensureConfigExists()
  return JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, 'utf8'))
})

ipcMain.handle('deployments:set', (_event, data: object) => {
  fs.writeFileSync(DEPLOYMENTS_PATH, JSON.stringify(data, null, 2))
  return true
})

// IPC: File operations
ipcMain.handle('file:copy', (_event, src: string, dest: string) => {
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
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  const homedir = app.getPath('home')
  const results: Skill[] = []

  // 1. Skilldeck library
  const libPath = config.libraryPath || LIBRARY_PATH
  results.push(...scanDirectory(libPath, 'skilldeck'))

  // 2. Claude Code skills (~/.claude/skills/*/SKILL.md)
  const claudeSkillsDir = path.join(homedir, '.claude', 'skills')
  results.push(...scanSkillDirs(claudeSkillsDir, 'claude-code'))

  // 3. Claude Code commands (~/.claude/commands/*.md)
  const claudeCommandsDir = path.join(homedir, '.claude', 'commands')
  results.push(...scanDirectory(claudeCommandsDir, 'claude-code-cmd'))

  // 4. Claude Code system skills (~/.claude/skills/.system/*/SKILL.md)
  const claudeSystemDir = path.join(homedir, '.claude', 'skills', '.system')
  results.push(...scanSkillDirs(claudeSystemDir, 'claude-code-system'))

  // 5. Agent Protocol (~/.agents/skills/*/SKILL.md)
  const agentsDir = path.join(homedir, '.agents', 'skills')
  results.push(...scanSkillDirs(agentsDir, 'agent-protocol'))

  // 6. Codex (~/.codex/skills/*/SKILL.md)
  const codexDir = path.join(homedir, '.codex', 'skills')
  results.push(...scanSkillDirs(codexDir, 'codex'))

  // 7. Codex system (~/.codex/skills/.system/*/SKILL.md)
  const codexSystemDir = path.join(homedir, '.codex', 'skills', '.system')
  results.push(...scanSkillDirs(codexSystemDir, 'codex-system'))

  // 8. Kiro (~/.kiro/skills/*/SKILL.md)
  const kiroDir = path.join(homedir, '.kiro', 'skills')
  results.push(...scanSkillDirs(kiroDir, 'kiro'))

  // 9. Amp (~/.amp/skills/*/SKILL.md)
  const ampDir = path.join(homedir, '.amp', 'skills')
  results.push(...scanSkillDirs(ampDir, 'amp'))

  // 10. Gemini (~/.gemini/skills/*/SKILL.md)
  const geminiDir = path.join(homedir, '.gemini', 'skills')
  results.push(...scanSkillDirs(geminiDir, 'gemini'))

  // 11. Registered projects
  if (config.projects) {
    for (const project of config.projects) {
      const projectPath = path.join(project.path, project.skillsPath)
      results.push(...scanDirectory(projectPath, `project:${project.name}`))
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
    if (!toolDir) continue

    // Create skill directory and write SKILL.md
    const skillDir = path.join(toolDir, skillName)
    const skillPath = path.join(skillDir, 'SKILL.md')

    try {
      if (!fs.existsSync(skillDir)) {
        fs.mkdirSync(skillDir, { recursive: true })
      }
      fs.writeFileSync(skillPath, content)
      results.push({ toolId, success: true, path: skillPath })
    } catch (err) {
      console.error(`Failed to sync to ${toolId}:`, err)
      results.push({ toolId, success: false, path: skillPath })
    }
  }

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