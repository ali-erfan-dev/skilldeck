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

let mainWindow: BrowserWindow | null = null

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.cjs')

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0f0f0f',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: preloadPath,
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