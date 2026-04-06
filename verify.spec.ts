/**
 * verify.spec.ts
 * 
 * Playwright end-to-end verification for Skilldeck Phase 1 features.
 * 
 * This is the enforcement layer. Agents run this BEFORE marking any feature
 * as passing in feature_list.json. If a test fails, the feature does not pass.
 * 
 * Usage:
 *   npx playwright test verify.spec.ts
 *   npx playwright test verify.spec.ts --grep "F001"
 * 
 * Requirements:
 *   npm install -D @playwright/test playwright electron-playwright-helpers
 * 
 * The app must be buildable with: npm run build
 * Playwright will launch it via electron directly.
 */

import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'

// ─── Helpers ────────────────────────────────────────────────────────────────

const SKILLDECK_DIR = path.join(os.homedir(), '.skilldeck')
const LIBRARY_DIR = path.join(SKILLDECK_DIR, 'library')
const CONFIG_PATH = path.join(SKILLDECK_DIR, 'config.json')
const DEPLOYMENTS_PATH = path.join(SKILLDECK_DIR, 'deployments.json')

function cleanSkilldeck() {
  if (fs.existsSync(SKILLDECK_DIR)) {
    fs.rmSync(SKILLDECK_DIR, { recursive: true, force: true })
  }
}

function seedSkill(name: string, content: string) {
  fs.mkdirSync(LIBRARY_DIR, { recursive: true })
  fs.writeFileSync(path.join(LIBRARY_DIR, `${name}.md`), content)
}

function makeSkillContent(name: string, description: string, tags: string[] = []) {
  return `---
name: ${name}
description: ${description}
tags: [${tags.join(', ')}]
---

# ${name}

${description}
`
}

async function launchApp(): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, NODE_ENV: 'test' }
  })

  // Capture main process stdout
  app.process().stdout?.on('data', data => {
    console.log('Main stdout:', data.toString())
  })
  app.process().stderr?.on('data', data => {
    console.log('Main stderr:', data.toString())
  })

  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  // Capture console errors
  window.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('Console error:', msg.text())
    }
  })

  // Wait for React to render the app
  await window.waitForSelector('[data-testid="nav-library"], [data-nav="library"]', { timeout: 10000 })
  // Wait for the library view to finish loading
  await window.waitForTimeout(1500)
  return { app, window }
}

// ─── F001: App launches ──────────────────────────────────────────────────────

test('F001 - App launches without errors', async () => {
  const { app, window } = await launchApp()

  // Window opened
  expect(window).toBeTruthy()

  // No fatal error screen
  const bodyText = await window.textContent('body')
  expect(bodyText).not.toContain('Cannot read')
  expect(bodyText).not.toContain('Uncaught Error')

  // Title exists
  const title = await window.title()
  expect(title.length).toBeGreaterThan(0)

  // Check console for errors
  const errors: string[] = []
  window.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  // Small wait to catch any immediate errors
  await window.waitForTimeout(1000)
  expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0)

  await app.close()
})

// ─── F002: Config initializes on first run ───────────────────────────────────

test('F002 - Config initializes on first run', async () => {
  cleanSkilldeck()

  const { app } = await launchApp()
  await new Promise(r => setTimeout(r, 1500)) // wait for init

  // ~/.skilldeck/ created
  expect(fs.existsSync(SKILLDECK_DIR)).toBe(true)

  // config.json created and valid
  expect(fs.existsSync(CONFIG_PATH)).toBe(true)
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  expect(config).toHaveProperty('libraryPath')
  expect(config).toHaveProperty('projects')
  expect(Array.isArray(config.projects)).toBe(true)

  // library/ created
  expect(fs.existsSync(LIBRARY_DIR)).toBe(true)

  // deployments.json created
  expect(fs.existsSync(DEPLOYMENTS_PATH)).toBe(true)
  const deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, 'utf8'))
  expect(typeof deployments).toBe('object')

  await app.close()
})

// ─── F003: Navigation ────────────────────────────────────────────────────────

test('F003 - Three-panel navigation works', async () => {
  const { app, window } = await launchApp()

  // Wait for React to render
  await window.waitForSelector('[data-testid="library-view"]', { timeout: 10000 })

  // Library is default view
  await expect(window.locator('[data-view="library"], [data-testid="library-view"]')).toBeVisible()

  // Navigate to Projects
  await window.click('[data-nav="projects"], [data-testid="nav-projects"]')
  await expect(window.locator('[data-view="projects"], [data-testid="projects-view"]')).toBeVisible()

  // Navigate to Settings
  await window.click('[data-nav="settings"], [data-testid="nav-settings"]')
  await expect(window.locator('[data-view="settings"], [data-testid="settings-view"]')).toBeVisible()

  // Back to Library
  await window.click('[data-nav="library"], [data-testid="nav-library"]')
  await expect(window.locator('[data-view="library"], [data-testid="library-view"]')).toBeVisible()

  await app.close()
})

// ─── F004: Library shows skill files ─────────────────────────────────────────

test('F004 - Library view shows all skill files', async () => {
  cleanSkilldeck()
  seedSkill('scope-killer', makeSkillContent('Scope Killer', 'Kills scope creep', ['thinking', 'scoping']))
  seedSkill('ship-or-kill', makeSkillContent('Ship or Kill Gate', 'Forces shipping decisions', ['process']))
  seedSkill('context-guard', makeSkillContent('Context Switch Guard', 'Protects deep work', ['focus']))

  const { app, window } = await launchApp()

  // Navigate to library (should be default)
  await window.waitForSelector('[data-testid="skill-item"], [data-skill]', { timeout: 5000 })

  const skillItems = await window.locator('[data-testid="skill-item"], [data-skill]').count()
  expect(skillItems).toBe(3)

  // Names visible
  await expect(window.locator('text=Scope Killer')).toBeVisible()
  await expect(window.locator('text=Ship or Kill Gate')).toBeVisible()
  await expect(window.locator('text=Context Switch Guard')).toBeVisible()

  await app.close()
})

test('F004b - Library shows empty state when no skills', async () => {
  cleanSkilldeck()
  const { app, window } = await launchApp()

  // Empty state message should be visible
  const emptyState = window.locator('[data-testid="empty-state"]')
  await expect(emptyState).toBeVisible({ timeout: 3000 })
  await expect(emptyState).toContainText('No skills yet')

  await app.close()
})

// ─── F005: Create new skill ───────────────────────────────────────────────────

test('F005 - Create new skill', async () => {
  cleanSkilldeck()
  const { app, window } = await launchApp()

  // Click new skill button
  await window.click('[data-testid="new-skill-btn"], button:has-text("New Skill"), button:has-text("+ New")')

  // A new skill appears in the list
  await window.waitForSelector('[data-testid="skill-item"], [data-skill]', { timeout: 3000 })
  const skillItems = await window.locator('[data-testid="skill-item"], [data-skill]').count()
  expect(skillItems).toBeGreaterThan(0)

  // File exists on disk
  const files = fs.readdirSync(LIBRARY_DIR).filter(f => f.endsWith('.md'))
  expect(files.length).toBeGreaterThan(0)

  // File has valid frontmatter
  const content = fs.readFileSync(path.join(LIBRARY_DIR, files[0]), 'utf8')
  expect(content).toContain('---')
  expect(content).toContain('name:')

  await app.close()
})

// ─── F006: Edit skill — content saves to disk ────────────────────────────────

test('F006 - Edit skill content saves to disk', async () => {
  cleanSkilldeck()
  seedSkill('test-skill', makeSkillContent('Test Skill', 'Original description'))

  const { app, window } = await launchApp()

  // Click the skill to open editor
  await window.click('[data-testid="skill-item"], [data-skill]')

  // Wait for editor to be visible
  await window.waitForSelector('[data-testid="skill-editor"]', { timeout: 3000 })

  // Find the textarea inside the skill editor
  const textarea = window.locator('[data-testid="skill-editor"] textarea')
  await expect(textarea).toBeVisible({ timeout: 3000 })

  // Clear and type new content
  await textarea.fill('# Updated Content\n\nThis is new content.')

  // Save
  const saveBtn = window.locator('[data-testid="save-btn"]')
  await saveBtn.click()

  // Verify file on disk changed
  await window.waitForTimeout(500)
  const content = fs.readFileSync(path.join(LIBRARY_DIR, 'test-skill.md'), 'utf8')
  expect(content).toContain('Updated Content')

  await app.close()
})

// ─── F007: Edit skill — frontmatter fields editable ───────────────────────────

test('F007 - Edit frontmatter fields (name, description, tags)', async () => {
  cleanSkilldeck()
  seedSkill('frontmatter-test', makeSkillContent('Original Name', 'Original description', ['original-tag']))

  const { app, window } = await launchApp()

  // Click the skill to open editor
  await window.click('[data-testid="skill-item"], [data-skill]')

  // Wait for editor to be visible
  await window.waitForSelector('[data-testid="skill-editor"]', { timeout: 3000 })

  // Edit name field
  const nameInput = window.locator('[data-testid="skill-editor"] input[type="text"]').first()
  await nameInput.fill('Updated Name')

  // Edit description field (second text input in metadata section)
  const descInput = window.locator('[data-testid="skill-editor"] input[type="text"]').nth(1)
  await descInput.fill('Updated description')

  // Add a new tag
  const tagInput = window.locator('[data-testid="skill-editor"] input[placeholder*="Add tag"], input[placeholder*="tag"]').last()
  await tagInput.fill('new-tag')
  await tagInput.press('Enter')

  // Save
  const saveBtn = window.locator('[data-testid="save-btn"]')
  await saveBtn.click()

  // Wait for save to complete
  await window.waitForTimeout(500)

  // Verify file on disk has updated frontmatter
  const content = fs.readFileSync(path.join(LIBRARY_DIR, 'frontmatter-test.md'), 'utf8')
  expect(content).toContain('name: "Updated Name"')
  expect(content).toContain('description: "Updated description"')
  expect(content).toContain('new-tag')

  // Close app and reopen to verify persistence
  await app.close()

  const { app: app2, window: window2 } = await launchApp()
  await window2.click('[data-testid="skill-item"], [data-skill]')
  await window2.waitForSelector('[data-testid="skill-editor"]', { timeout: 3000 })

  // Verify the fields show the updated values
  const nameInput2 = window2.locator('[data-testid="skill-editor"] input[type="text"]').first()
  const descInput2 = window2.locator('[data-testid="skill-editor"] input[type="text"]').nth(1)

  await expect(nameInput2).toHaveValue('Updated Name')
  await expect(descInput2).toHaveValue('Updated description')

  // Verify tag is visible in editor
  await expect(window2.locator('[data-testid="skill-editor"]').locator('text=new-tag')).toBeVisible()

  await app2.close()
})

// ─── F008: Delete skill ───────────────────────────────────────────────────────

test('F008 - Delete skill with confirmation', async () => {
  cleanSkilldeck()
  seedSkill('delete-me', makeSkillContent('Delete Me', 'This skill will be deleted'))

  const { app, window } = await launchApp()

  await window.waitForSelector('[data-testid="skill-item"]', { timeout: 3000 })

  // Click on skill to select it and show editor with delete button
  const skillItem = window.locator('[data-testid="skill-item"]').first()
  await skillItem.click()

  // Wait for editor to show, then find and click delete button
  await window.waitForSelector('[data-testid="skill-editor"]', { timeout: 2000 })

  // Click the Delete button in the editor
  const deleteBtn = window.locator('[data-testid="delete-btn"]')
  await expect(deleteBtn).toBeVisible({ timeout: 2000 })
  await deleteBtn.click()

  // Confirmation dialog - click the Delete button in the modal
  const confirmBtn = window.locator('[data-testid="delete-skill"]')
  await expect(confirmBtn).toBeVisible({ timeout: 2000 })
  await confirmBtn.click()

  // Skill gone from list
  await window.waitForTimeout(500)
  const skillItems = await window.locator('[data-testid="skill-item"]').count()
  expect(skillItems).toBe(0)

  // File deleted from disk
  expect(fs.existsSync(path.join(LIBRARY_DIR, 'delete-me.md'))).toBe(false)

  await app.close()
})

// ─── F009: Search skills ──────────────────────────────────────────────────────

test('F009 - Search filters skill list', async () => {
  cleanSkilldeck()
  seedSkill('scope-killer', makeSkillContent('Scope Killer', 'Kills scope creep'))
  seedSkill('ship-gate', makeSkillContent('Ship Gate', 'Forces shipping'))
  seedSkill('context-guard', makeSkillContent('Context Guard', 'Protects focus'))

  const { app, window } = await launchApp()

  await window.waitForSelector('[data-testid="skill-item"], [data-skill]', { timeout: 3000 })

  // Type in search
  const search = window.locator('[data-testid="search-input"], input[type="search"], input[placeholder*="Search"]')
  await search.fill('scope')

  // Only matching skill visible
  await expect(window.locator('text=Scope Killer')).toBeVisible()
  const visibleItems = await window.locator('[data-testid="skill-item"], [data-skill]').count()
  expect(visibleItems).toBe(1)

  // Clear search
  await search.fill('')
  const allItems = await window.locator('[data-testid="skill-item"], [data-skill]').count()
  expect(allItems).toBe(3)

  await app.close()
})

// ─── F010: Filter skills by tag ────────────────────────────────────────────────

test('F010 - Filter skills by tag', async () => {
  cleanSkilldeck()
  seedSkill('skill-a', makeSkillContent('Skill A', 'First skill', ['thinking', 'scoping']))
  seedSkill('skill-b', makeSkillContent('Skill B', 'Second skill', ['process', 'shipping']))
  seedSkill('skill-c', makeSkillContent('Skill C', 'Third skill', ['thinking', 'focus']))

  const { app, window } = await launchApp()

  // Wait for skills to load
  await window.waitForSelector('[data-testid="skill-item"]', { timeout: 5000 })

  // Wait for tag filters to appear (they appear when skills have tags)
  await window.waitForSelector('[data-testid="tag-filters"]', { timeout: 5000 })

  // Verify all three skills are visible
  let count = await window.locator('[data-testid="skill-item"]').count()
  expect(count).toBe(3)

  // Click on a tag to filter
  await window.click('[data-testid="tag-filter-thinking"]')
  await window.waitForTimeout(500)

  // Should show only skills with 'thinking' tag (Skill A and Skill C)
  count = await window.locator('[data-testid="skill-item"]').count()
  expect(count).toBe(2)

  // Click another tag (OR logic - shows skills matching either tag)
  await window.click('[data-testid="tag-filter-process"]')
  await window.waitForTimeout(500)

  // Should show skills with 'thinking' OR 'process' (A, B, C)
  count = await window.locator('[data-testid="skill-item"]').count()
  expect(count).toBe(3)

  // Clear filter
  await window.click('[data-testid="clear-tags-btn"]')
  await window.waitForTimeout(500)

  // All skills visible again
  count = await window.locator('[data-testid="skill-item"]').count()
  expect(count).toBe(3)

  await app.close()
})

// ─── F011: Register a project ─────────────────────────────────────────────────

test('F011 - Register a project', async () => {
  cleanSkilldeck()

  // Create a temp directory to register as a project
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skilldeck-test-project-'))

  const { app, window } = await launchApp()

  // Navigate to Projects
  await window.click('[data-testid="nav-projects"]')

  // Wait for projects view to be visible
  await window.waitForSelector('[data-testid="projects-view"]', { timeout: 5000 })

  // Click Add Project button
  await window.click('[data-testid="add-project-btn"]')

  // Wait for modal to appear
  await window.waitForTimeout(500)

  // Fill in project name
  await window.fill('[data-testid="project-name-input"]', 'Test Project')

  // Fill in path
  await window.fill('[data-testid="project-path-input"]', projectDir)

  // Click Add Project button in modal
  await window.click('[data-testid="confirm-add-project"]')

  // Project appears in list
  await expect(window.locator('text=Test Project')).toBeVisible({ timeout: 3000 })

  // Config updated on disk
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  const project = config.projects.find((p: any) => p.name === 'Test Project')
  expect(project).toBeTruthy()
  expect(project.path).toBe(projectDir)

  // Cleanup
  fs.rmSync(projectDir, { recursive: true, force: true })
  await app.close()
})

// ─── F012: Remove a project ──────────────────────────────────────────────────

test('F012 - Remove a project', async () => {
  cleanSkilldeck()

  // Create a temp directory to register as a project
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skilldeck-test-project-'))

  // Ensure skilldeck directory exists
  fs.mkdirSync(SKILLDECK_DIR, { recursive: true })

  // Pre-seed a project in config
  const config = {
    libraryPath: LIBRARY_DIR,
    projects: [{
      id: 'test-project-1',
      name: 'Test Project',
      path: projectDir,
      skillsPath: '.claude/skills'
    }]
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))

  // Add a deployment record
  const deployments = {
    'test-project-1': {
      'some-skill': { deployedAt: new Date().toISOString(), libraryHash: 'abc123', currentHash: 'abc123' }
    }
  }
  fs.writeFileSync(DEPLOYMENTS_PATH, JSON.stringify(deployments, null, 2))

  const { app, window } = await launchApp()

  // Navigate to Projects
  await window.click('[data-testid="nav-projects"]')
  await window.waitForSelector('[data-testid="projects-view"]', { timeout: 5000 })

  // Wait for project to appear
  await window.waitForTimeout(1000)

  // Verify project is visible
  await expect(window.locator('text=Test Project')).toBeVisible({ timeout: 5000 })

  // Click Remove button (use text selector since testid includes dynamic ID)
  await window.click('button:has-text("Remove")')
  await window.waitForTimeout(500)

  // Confirmation dialog appears
  await expect(window.locator('text=Remove Project?')).toBeVisible({ timeout: 3000 })

  // Click Remove in dialog (use text selector for reliability)
  await window.click('button:has-text("Remove") >> nth=1')

  // Project no longer appears in list
  await window.waitForTimeout(300)
  await expect(window.locator('text=Test Project')).not.toBeVisible()

  // Config no longer contains the project
  const updatedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  expect(updatedConfig.projects.length).toBe(0)

  // Deployments still contains the record
  const updatedDeployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, 'utf8'))
  expect(updatedDeployments['test-project-1']).toBeTruthy()

  // Cleanup
  fs.rmSync(projectDir, { recursive: true, force: true })
  await app.close()
})

// ─── F013: Configure skills path per project ─────────────────────────────────

test('F013 - Configure skills path per project', async () => {
  cleanSkilldeck()

  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skilldeck-test-project-'))
  fs.mkdirSync(SKILLDECK_DIR, { recursive: true })

  // Pre-seed a project in config
  const config = {
    libraryPath: LIBRARY_DIR,
    projects: [{
      id: 'test-project-1',
      name: 'Test Project',
      path: projectDir,
      skillsPath: '.claude/skills'
    }]
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))

  const { app, window } = await launchApp()

  // Navigate to Projects
  await window.click('[data-testid="nav-projects"]')
  await window.waitForSelector('[data-testid="projects-view"]', { timeout: 5000 })

  // Wait for project to load
  await window.waitForTimeout(500)

  // Click Edit button
  await window.click('[data-testid^="edit-project-btn-"]')
  await window.waitForTimeout(500)

  // Edit modal appears
  await expect(window.locator('text=Edit Project')).toBeVisible({ timeout: 2000 })

  // Change skills path
  const skillsInput = window.locator('[data-testid="skills-path-input"]')
  await skillsInput.fill('.skilldeck/skills')

  // Save
  await window.click('[data-testid="confirm-edit-project"]')
  await window.waitForTimeout(300)

  // Verify updated path shows in UI
  await expect(window.locator('text=.skilldeck/skills')).toBeVisible({ timeout: 3000 })

  // Verify config updated on disk
  const updatedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  expect(updatedConfig.projects[0].skillsPath).toBe('.skilldeck/skills')

  // Cleanup
  fs.rmSync(projectDir, { recursive: true, force: true })
  await app.close()
})

// ─── F014: Deploy a skill to a project ───────────────────────────────────────

test('F014 - Deploy skill to project', async () => {
  cleanSkilldeck()

  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skilldeck-test-project-'))
  seedSkill('scope-killer', makeSkillContent('Scope Killer', 'Kills scope creep'))

  // Pre-seed a project in config
  const config = {
    libraryPath: LIBRARY_DIR,
    projects: [{
      id: 'test-project-1',
      name: 'Test Project',
      path: projectDir,
      skillsPath: '.claude/skills'
    }]
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
  fs.writeFileSync(DEPLOYMENTS_PATH, JSON.stringify({}))

  const { app, window } = await launchApp()

  // Select the skill
  await window.click('[data-testid="skill-item"], [data-skill]')

  // Click Deploy
  await window.click('[data-testid="deploy-btn"], button:has-text("Deploy")')

  // Select project from dropdown/list
  await window.click('text=Test Project')

  // Confirm
  const confirmBtn = window.locator('[data-testid="confirm-deploy"], button:has-text("Deploy"), button:has-text("Confirm")')
  if (await confirmBtn.isVisible()) await confirmBtn.click()

  // File exists at project path
  const deployedPath = path.join(projectDir, '.claude', 'skills', 'scope-killer.md')
  await window.waitForTimeout(1000)
  expect(fs.existsSync(deployedPath)).toBe(true)

  // Deployment record exists
  const deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, 'utf8'))
  expect(deployments['test-project-1']).toBeTruthy()
  expect(deployments['test-project-1']['scope-killer']).toBeTruthy()

  fs.rmSync(projectDir, { recursive: true, force: true })
  await app.close()
})

// ─── F015: Deployment state current vs stale ─────────────────────────────────

test('F015 - Deployment state current vs stale', async () => {
  cleanSkilldeck()

  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skilldeck-test-project-'))
  const skillContent = makeSkillContent('Scope Killer', 'Kills scope creep')
  seedSkill('scope-killer', skillContent)

  // Deploy manually
  const deployedDir = path.join(projectDir, '.claude', 'skills')
  fs.mkdirSync(deployedDir, { recursive: true })
  fs.writeFileSync(path.join(deployedDir, 'scope-killer.md'), skillContent)

  const hash = crypto.createHash('md5').update(skillContent).digest('hex')

  const config = {
    libraryPath: LIBRARY_DIR,
    projects: [{ id: 'proj-1', name: 'Test Project', path: projectDir, skillsPath: '.claude/skills' }]
  }
  const deployments = {
    'proj-1': {
      'scope-killer': { deployedAt: new Date().toISOString(), libraryHash: hash, currentHash: hash }
    }
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
  fs.writeFileSync(DEPLOYMENTS_PATH, JSON.stringify(deployments, null, 2))

  const { app, window } = await launchApp()

  // Should show as Current
  await expect(window.locator('[data-testid="status-current"], text=Current').first()).toBeVisible({ timeout: 3000 })

  // Now modify the library skill to make it stale
  const newContent = skillContent + '\n\n## New Section\nAdded content.'
  fs.writeFileSync(path.join(LIBRARY_DIR, 'scope-killer.md'), newContent)

  // Trigger refresh (click away and back, or wait for file watcher)
  await window.click('[data-nav="projects"], [data-testid="nav-projects"]')
  await window.click('[data-nav="library"], [data-testid="nav-library"]')

  // Should now show as Stale
  await expect(window.locator('[data-testid="status-stale"], text=Stale').first()).toBeVisible({ timeout: 3000 })

  fs.rmSync(projectDir, { recursive: true, force: true })
  await app.close()
})
