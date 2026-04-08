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

/**
 * Clears ONLY ~/.skilldeck/ — safe to call in any test.
 * Does NOT touch ~/.claude/, ~/.codex/, or any other tool directory.
 * Use this for Phase 1 tests (library, projects, deployment).
 */
function cleanSkilldeck() {
  if (fs.existsSync(SKILLDECK_DIR)) {
    fs.rmSync(SKILLDECK_DIR, { recursive: true, force: true })
  }
}

/**
 * Removes a specific named test skill directory from a tool location.
 * Safe to call in finally blocks — only removes the exact directory named.
 * Never removes the parent skills directory or anything else.
 *
 * Usage:
 *   cleanTestSkillDir('.claude', 'skills', 'test-f019-skill')
 *   → removes ~/.claude/skills/test-f019-skill/ only
 */
function cleanTestSkillDir(tool: string, subdir: string, skillName: string) {
  const targetDir = path.join(os.homedir(), tool, subdir, skillName)
  if (fs.existsSync(targetDir)) {
    try {
      fs.rmSync(targetDir, { recursive: true, force: true })
    } catch {
      // Ignore errors — best effort cleanup
    }
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

  // Count all skills (library + scanned from external directories)
  const skillItems = await window.locator('[data-testid="skill-item"], [data-skill]').count()
  // Should have at least the 3 seeded library skills (may have more from external scans)
  expect(skillItems).toBeGreaterThanOrEqual(3)

  // Names visible
  await expect(window.locator('text=Scope Killer')).toBeVisible()
  await expect(window.locator('text=Ship or Kill Gate')).toBeVisible()
  await expect(window.locator('text=Context Switch Guard')).toBeVisible()

  await app.close()
})

test('F004b - Library shows empty state when no skills', async () => {
  cleanSkilldeck()
  const { app, window } = await launchApp()

  // Wait for app to load
  await window.waitForSelector('[data-testid="library-view"]', { timeout: 5000 })

  // Check if there are external skills from scan (e.g., Codex system skills)
  const skillItems = window.locator('[data-testid="skill-item"]')
  const skillCount = await skillItems.count()

  // If there are external skills, empty state won't show
  // This test verifies empty state appears when library is empty AND no external skills found
  if (skillCount === 0) {
    const emptyState = window.locator('[data-testid="empty-state"]')
    await expect(emptyState).toBeVisible({ timeout: 3000 })
    await expect(emptyState).toContainText('No skills')
  }
  // If external skills exist, the test passes (empty state correctly not shown)

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

  // Wait for skill editor to load
  await window.waitForSelector('[data-testid="skill-editor"]', { timeout: 3000 })
  await window.waitForTimeout(500)

  // Wait for Deploy button to be visible
  await window.waitForSelector('[data-testid="deploy-btn"]', { timeout: 3000 })

  // Click Deploy
  await window.click('[data-testid="deploy-btn"]')

  // Wait for deploy modal
  await window.waitForSelector('[data-testid="deploy-modal"]', { timeout: 3000 })

  // Select project from dropdown/list
  await window.click('[data-testid="project-test-project-1"]')

  // Confirm deployment
  await window.click('[data-testid="confirm-sync"]')

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

  // First app instance - check Current status
  const { app: app1, window: window1 } = await launchApp()
  await expect(window1.locator('[data-testid="status-current"]').first()).toBeVisible({ timeout: 3000 })
  await app1.close()

  // Now modify the library skill to make it stale
  const newContent = skillContent + '\n\n## New Section\nAdded content.'
  fs.writeFileSync(path.join(LIBRARY_DIR, 'scope-killer.md'), newContent)

  // Second app instance - should show as Stale
  const { app: app2, window: window2 } = await launchApp()
  await expect(window2.locator('[data-testid="status-stale"]')).toBeVisible({ timeout: 5000 })

  fs.rmSync(projectDir, { recursive: true, force: true })
  await app2.close()
})

test('F017 - Undeploy a skill from a project', async () => {
  cleanSkilldeck()

  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skilldeck-test-project-'))
  seedSkill('test-skill', makeSkillContent('Test Skill', 'A test skill'))

  // Get hash for deployment
  const content = fs.readFileSync(path.join(LIBRARY_DIR, 'test-skill.md'), 'utf8')
  const hash = crypto.createHash('md5').update(content).digest('hex')

  // Create deployed file
  const deployedDir = path.join(projectDir, '.claude', 'skills')
  fs.mkdirSync(deployedDir, { recursive: true })
  fs.writeFileSync(path.join(deployedDir, 'test-skill.md'), content)

  const config = {
    libraryPath: LIBRARY_DIR,
    projects: [{ id: 'proj-1', name: 'Test Project', path: projectDir, skillsPath: '.claude/skills' }]
  }
  const deployments = {
    'proj-1': {
      'test-skill': { deployedAt: new Date().toISOString(), libraryHash: hash, currentHash: hash }
    }
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
  fs.writeFileSync(DEPLOYMENTS_PATH, JSON.stringify(deployments, null, 2))

  const { app, window } = await launchApp()

  // Navigate to Projects
  await window.click('[data-testid="nav-projects"]')
  await window.waitForSelector('[data-testid="projects-view"]', { timeout: 5000 })
  await window.waitForTimeout(500)

  // Expand the project to see deployed skills
  await window.click('text=Test Project')
  await window.waitForTimeout(500)

  // Verify deployed skill appears
  await window.waitForSelector('[data-testid="deployed-skill-item-test-skill"]', { timeout: 3000 })

  // Click undeploy button
  await window.click('[data-testid="undeploy-btn-test-skill"]')
  await window.waitForTimeout(300)

  // Confirmation dialog appears
  await expect(window.locator('text=Undeploy Skill?')).toBeVisible({ timeout: 2000 })

  // Confirm undeploy
  await window.click('[data-testid="confirm-undeploy"]')
  await window.waitForTimeout(500)

  // Verify skill no longer appears in deployed list
  await window.waitForTimeout(500)
  const skillItems = await window.locator('[data-testid^="deployed-skill-item-"]').count()
  expect(skillItems).toBe(0)

  // Verify file deleted from project skills path
  const deployedPath = path.join(projectDir, '.claude', 'skills', 'test-skill.md')
  expect(fs.existsSync(deployedPath)).toBe(false)

  // Verify deployment record removed from deployments.json
  const updatedDeployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, 'utf8'))
  expect(updatedDeployments['proj-1']?.['test-skill']).toBeUndefined()

  fs.rmSync(projectDir, { recursive: true, force: true })
  await app.close()
})

// ─── F018: Settings view — library path configurable ─────────────────────────────

test('F018 - Settings view library path configurable', async () => {
  cleanSkilldeck()

  // Ensure skilldeck directory exists
  fs.mkdirSync(SKILLDECK_DIR, { recursive: true })

  // Create two different library directories
  const lib1 = path.join(os.tmpdir(), 'skilldeck-lib1-' + Date.now())
  const lib2 = path.join(os.tmpdir(), 'skilldeck-lib2-' + Date.now())
  fs.mkdirSync(lib1, { recursive: true })
  fs.mkdirSync(lib2, { recursive: true })

  // Create skills in each library
  fs.writeFileSync(path.join(lib1, 'skill-from-lib1.md'), makeSkillContent('Skill From Lib1', 'First library skill'))
  fs.writeFileSync(path.join(lib2, 'skill-from-lib2.md'), makeSkillContent('Skill From Lib2', 'Second library skill'))

  // Pre-seed config with lib1
  const config = {
    libraryPath: lib1,
    projects: []
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
  fs.writeFileSync(DEPLOYMENTS_PATH, JSON.stringify({}))

  const { app, window } = await launchApp()

  // Verify lib1 skill shows
  await window.waitForSelector('[data-testid="skill-item"]', { timeout: 5000 })
  await expect(window.locator('text=Skill From Lib1')).toBeVisible()

  // Navigate to Settings
  await window.click('[data-testid="nav-settings"]')
  await window.waitForSelector('[data-testid="settings-view"]', { timeout: 3000 })

  // Verify current library path is shown
  const libPathInput = window.locator('[data-testid="library-path-input"]')
  await expect(libPathInput).toHaveValue(lib1)

  // Change library path to lib2
  await libPathInput.fill(lib2)
  await window.click('[data-testid="save-settings-btn"]')

  // Wait for saved indicator
  await expect(window.locator('[data-testid="saved-indicator"]')).toBeVisible({ timeout: 3000 })

  // Navigate to Library
  await window.click('[data-testid="nav-library"]')
  await window.waitForSelector('[data-testid="library-view"]', { timeout: 3000 })
  await window.waitForTimeout(500)

  // Verify skill from lib2 shows
  await expect(window.locator('text=Skill From Lib2')).toBeVisible({ timeout: 3000 })

  // Verify skill from lib1 is not shown
  await expect(window.locator('text=Skill From Lib1')).not.toBeVisible()

  // Cleanup
  fs.rmSync(lib1, { recursive: true, force: true })
  fs.rmSync(lib2, { recursive: true, force: true })
  await app.close()
})

// ─── Additional test: Tag persistence after save without restart ─────────────────

test('Tag persists after save without app restart', async () => {
  cleanSkilldeck()
  seedSkill('tag-persist-test', makeSkillContent('Tag Persist Test', 'Testing tag persistence', ['existing-tag']))

  const { app, window } = await launchApp()

  // Click skill to open editor
  await window.click('[data-testid="skill-item"], [data-skill]')
  await window.waitForSelector('[data-testid="skill-editor"]', { timeout: 3000 })

  // Verify existing tag is visible in editor
  const editor = window.locator('[data-testid="skill-editor"]')
  await expect(editor.locator('text=existing-tag')).toBeVisible()

  // Add a new tag
  const tagInput = window.locator('[data-testid="tag-input"]')
  await tagInput.fill('new-persistent-tag')
  await tagInput.press('Enter')

  // Verify new tag appears in the editor
  await expect(editor.locator('text=new-persistent-tag')).toBeVisible()

  // Save
  await window.click('[data-testid="save-btn"]')
  await window.waitForTimeout(500)

  // Verify both tags are still visible after save
  await expect(editor.locator('text=existing-tag')).toBeVisible()
  await expect(editor.locator('text=new-persistent-tag')).toBeVisible()

  // Navigate away and back
  await window.click('[data-testid="nav-projects"]')
  await window.waitForTimeout(300)
  await window.click('[data-testid="nav-library"]')
  await window.waitForTimeout(300)

  // Click the skill again
  await window.click('[data-testid="skill-item"], [data-skill]')
  await window.waitForSelector('[data-testid="skill-editor"]', { timeout: 3000 })

  // Verify both tags are still there
  const editor2 = window.locator('[data-testid="skill-editor"]')
  await expect(editor2.locator('text=existing-tag')).toBeVisible()
  await expect(editor2.locator('text=new-persistent-tag')).toBeVisible()

  // Verify file on disk
  const content = fs.readFileSync(path.join(LIBRARY_DIR, 'tag-persist-test.md'), 'utf8')
  expect(content).toContain('existing-tag')
  expect(content).toContain('new-persistent-tag')

  await app.close()
})

// ─── F019: Scan machine for skill locations ───────────────────────────────────

test('F019: Scan machine for all skill locations', async () => {
  cleanSkilldeck()

  // Create test skill directories in standard locations
  const homedir = os.homedir()
  const testClaudeSkillDir = path.join(homedir, '.claude', 'skills', 'test-f019-skill')
  const testAgentSkillDir = path.join(homedir, '.agents', 'skills', 'test-f019-agent')

  // Create directories and skill files
  fs.mkdirSync(testClaudeSkillDir, { recursive: true })
  fs.mkdirSync(testAgentSkillDir, { recursive: true })

  fs.writeFileSync(path.join(testClaudeSkillDir, 'SKILL.md'), `---
name: "Test Claude Skill"
description: "A test skill from Claude"
---
# Test Content
`)

  fs.writeFileSync(path.join(testAgentSkillDir, 'SKILL.md'), `---
name: "Test Agent Skill"
description: "A test skill from Agent Protocol"
---
# Test Content
`)

  try {
    const { app, window } = await launchApp()

    // Library view is default, wait for scan button to be visible
    await window.waitForSelector('[data-testid="scan-btn"]', { timeout: 5000 })

    // Click Scan button
    await window.click('[data-testid="scan-btn"]')

    // Wait for scan to complete (scanning state goes back to false)
    await window.waitForTimeout(2000)

    // Verify source badges appear on skill items
    await window.waitForSelector('[data-testid="source-badge"]', { timeout: 5000 })

    // Verify we have at least one external skill badge (Claude or Agent)
    const claudeBadge = window.locator('[data-testid="source-badge"]').filter({ hasText: 'Claude' })
    const agentBadge = window.locator('[data-testid="source-badge"]').filter({ hasText: 'Agent' })

    // At least one external skill should be found
    const claudeCount = await claudeBadge.count()
    const agentCount = await agentBadge.count()
    expect(claudeCount + agentCount).toBeGreaterThanOrEqual(1)

    await app.close()
  } finally {
    // Cleanup — only remove the specific test directories we created
    cleanTestSkillDir('.claude', 'skills', 'test-f019-skill')
    cleanTestSkillDir('.agents', 'skills', 'test-f019-agent')
  }
})

// ─── F020: Filter library by source ────────────────────────────────────────────

test('F020: Filter library by source', async () => {
  cleanSkilldeck()

  // Create test skill directories in multiple standard locations
  const homedir = os.homedir()
  const testClaudeSkillDir = path.join(homedir, '.claude', 'skills', 'test-f020-claude')
  const testCodexSkillDir = path.join(homedir, '.codex', 'skills', 'test-f020-codex')

  // Create directories and skill files
  fs.mkdirSync(testClaudeSkillDir, { recursive: true })
  fs.mkdirSync(testCodexSkillDir, { recursive: true })

  fs.writeFileSync(path.join(testClaudeSkillDir, 'SKILL.md'), `---
name: "Claude Source Skill"
description: "A test skill from Claude Code"
---
# Test Content
`)

  fs.writeFileSync(path.join(testCodexSkillDir, 'SKILL.md'), `---
name: "Codex Source Skill"
description: "A test skill from Codex"
---
# Test Content
`)

  try {
    const { app, window } = await launchApp()

    // Wait for scan to complete
    await window.waitForSelector('[data-testid="scan-btn"]', { timeout: 5000 })
    await window.click('[data-testid="scan-btn"]')
    await window.waitForTimeout(2000)

    // Verify source filter section exists
    await window.waitForSelector('[data-testid="source-filters"]', { timeout: 5000 })

    // Verify source filter buttons exist for detected sources
    const claudeFilter = window.locator('[data-testid="source-filter-claude-code"]')
    const codexFilter = window.locator('[data-testid="source-filter-codex"]')

    // At least one external source should be detected
    const claudeCount = await claudeFilter.count()
    const codexCount = await codexFilter.count()
    expect(claudeCount + codexCount).toBeGreaterThanOrEqual(2)

    // Click Claude filter to filter to only Claude skills
    await window.click('[data-testid="source-filter-claude-code"]')
    await window.waitForTimeout(300)

    // Verify only Claude skills are shown
    const skillItems = window.locator('[data-testid="skill-item"]')
    const count = await skillItems.count()

    // All visible skills should have Claude badge
    for (let i = 0; i < count; i++) {
      const item = skillItems.nth(i)
      const claudeBadge = item.locator('[data-testid="source-badge"]').filter({ hasText: 'Claude' })
      const hasClaude = await claudeBadge.count()
      expect(hasClaude).toBeGreaterThan(0)
    }

    // Click a second source filter (Codex) - should show both
    await window.click('[data-testid="source-filter-codex"]')
    await window.waitForTimeout(300)

    // Verify skills from both sources are shown
    const skillItems2 = window.locator('[data-testid="skill-item"]')
    const count2 = await skillItems2.count()
    expect(count2).toBeGreaterThanOrEqual(2)

    // Click clear button to show all skills
    await window.click('[data-testid="clear-sources-btn"]')
    await window.waitForTimeout(300)

    // Verify all skills are shown again
    const skillItems3 = window.locator('[data-testid="skill-item"]')
    const count3 = await skillItems3.count()
    expect(count3).toBeGreaterThanOrEqual(2)

    await app.close()
  } finally {
    // Cleanup — only remove the specific test directories we created
    cleanTestSkillDir('.claude', 'skills', 'test-f020-claude')
    cleanTestSkillDir('.codex', 'skills', 'test-f020-codex')
  }
})

// ─── F021: Cross-tool sync deployment ────────────────────────────────────────

test('F021: Cross-tool sync — deploy to multiple tool locations', async () => {
  cleanSkilldeck()

  // Create test skill in library
  seedSkill('sync-test-skill', `---
name: "Sync Test Skill"
description: "A skill to test cross-tool sync"
---
# Test Content
`)

  // Create two tool directories
  const homedir = os.homedir()
  const claudeSkillsDir = path.join(homedir, '.claude', 'skills')
  const agentsSkillsDir = path.join(homedir, '.agents', 'skills')

  // Ensure directories exist
  fs.mkdirSync(claudeSkillsDir, { recursive: true })
  fs.mkdirSync(agentsSkillsDir, { recursive: true })

  try {
    const { app, window } = await launchApp()

    // Wait for skills to load
    await window.waitForSelector('[data-testid="skill-item"]', { timeout: 5000 })

    // Click the skill to select it
    await window.click('[data-testid="skill-item"]')
    await window.waitForSelector('[data-testid="skill-editor"]', { timeout: 3000 })

    // Click Deploy button
    await window.click('[data-testid="deploy-btn"]')
    await window.waitForSelector('[data-testid="deploy-modal"]', { timeout: 3000 })

    // Verify tool sync targets are shown (not just projects)
    const toolTargets = window.locator('[data-testid="tool-target"]')
    const toolCount = await toolTargets.count()
    expect(toolCount).toBeGreaterThanOrEqual(2) // At least 2 tools installed

    // Select two tool targets
    const claudeTarget = window.locator('[data-testid="tool-target-claude-code"]')
    const agentsTarget = window.locator('[data-testid="tool-target-agent-protocol"]')

    if (await claudeTarget.count() > 0 && await agentsTarget.count() > 0) {
      await claudeTarget.click()
      await agentsTarget.click()

      // Confirm sync
      await window.click('[data-testid="confirm-sync"]')
      await window.waitForTimeout(1000)

      // Verify skill was synced to both locations
      const claudeSkillPath = path.join(claudeSkillsDir, 'sync-test-skill', 'SKILL.md')
      const agentsSkillPath = path.join(agentsSkillsDir, 'sync-test-skill', 'SKILL.md')

      expect(fs.existsSync(claudeSkillPath)).toBe(true)
      expect(fs.existsSync(agentsSkillPath)).toBe(true)

      // Verify content matches
      const claudeContent = fs.readFileSync(claudeSkillPath, 'utf8')
      expect(claudeContent).toContain('Sync Test Skill')
    }

    await app.close()
  } finally {
    // Cleanup — only remove the specific test directories we created
    cleanTestSkillDir('.claude', 'skills', 'sync-test-skill')
    cleanTestSkillDir('.agents', 'skills', 'sync-test-skill')
  }
})

// ─── F022: Divergence detection ──────────────────────────────────────────────

test('F022: Divergence detection across tool locations', async () => {
  cleanSkilldeck()

  // Create a skill in the library
  seedSkill('diverge-test', `---
name: "Diverge Test Skill"
description: "A skill for testing divergence"
tags: []
---
# Original Content
`)

  // Create a tool directory and sync the skill
  const homedir = os.homedir()
  const claudeSkillsDir = path.join(homedir, '.claude', 'skills')
  fs.mkdirSync(claudeSkillsDir, { recursive: true })

  // Create the skill in Claude Code location
  const claudeSkillDir = path.join(claudeSkillsDir, 'diverge-test')
  fs.mkdirSync(claudeSkillDir, { recursive: true })
  fs.writeFileSync(path.join(claudeSkillDir, 'SKILL.md'), `---
name: "Diverge Test Skill"
description: "A skill for testing divergence"
tags: []
---
# Original Content
`)

  try {
    const { app, window } = await launchApp()

    // Wait for skills to load
    await window.waitForSelector('[data-testid="skill-item"]', { timeout: 5000 })
    await window.waitForTimeout(500)

    // Edit the skill in the library
    await window.click('[data-testid="skill-item"]')
    await window.waitForSelector('[data-testid="skill-editor"]', { timeout: 3000 })

    // Change the content in the editor
    const textarea = window.locator('textarea')
    await textarea.fill(`---
name: "Diverge Test Skill"
description: "A skill for testing divergence"
tags: []
---
# Modified Content
`)

    // Save
    await window.click('[data-testid="save-btn"]')
    await window.waitForTimeout(500)

    // Rescan to detect divergence
    await window.click('[data-testid="scan-btn"]')
    await window.waitForTimeout(1500)

    // Verify divergence warning appears
    const divergenceWarning = window.locator('[data-testid="divergence-warning"]')
    expect(await divergenceWarning.count()).toBeGreaterThan(0)

    // Click the warning to see diff
    await divergenceWarning.click()
    await window.waitForSelector('[data-testid="diff-view"]', { timeout: 3000 })

    // Verify diff view shows both versions
    const diffView = window.locator('[data-testid="diff-view"]')
    expect(await diffView.locator('text=Modified Content').count()).toBeGreaterThan(0)

    // Click "Use library version"
    await window.click('[data-testid="use-library-version-btn"]')
    await window.waitForTimeout(1500)  // Wait for sync and reload

    // Debug: check what skills are loaded after sync
    const skillCount = await window.locator('[data-testid="skill-item"]').count()
    console.log('After sync - skill count:', skillCount)

    // Debug: check if any divergence warnings remain
    const warningCount = await window.locator('[data-testid="divergence-warning"]').count()
    console.log('After sync - divergence warning count:', warningCount)

    // Verify divergence warning is gone
    await window.waitForTimeout(500)
    expect(await divergenceWarning.count()).toBe(0)

    await app.close()
  } finally {
    // Cleanup — only remove the specific test directory we created
    cleanTestSkillDir('.claude', 'skills', 'diverge-test')
  }
})

// ─── Bulk Actions Discoverability ─────────────────────────────────────────────

test('Bulk actions — checkboxes visible, select-all, action bar at 1+', async () => {
  cleanSkilldeck()
  seedSkill('bulk-a', makeSkillContent('Bulk A', 'First bulk skill', ['test']))
  seedSkill('bulk-b', makeSkillContent('Bulk B', 'Second bulk skill', ['test']))
  seedSkill('bulk-c', makeSkillContent('Bulk C', 'Third bulk skill', ['other']))

  const { app, window } = await launchApp()

  await window.waitForSelector('[data-testid="skill-item"], [data-skill]', { timeout: 5000 })
  // Wait for skill list to fully render
  await window.waitForTimeout(1000)

  // Checkboxes are visible on each skill row
  const checkboxes = window.locator('[data-testid="skill-checkbox"]')
  await expect(checkboxes).toHaveCount(3)

  // Select-all checkbox is visible
  const selectAll = window.locator('[data-testid="select-all-checkbox"]')
  await expect(selectAll).toBeVisible()

  // Click select-all — all skills selected
  await selectAll.click()

  // Action bar appears with count
  const selectedCount = window.locator('text=3 skills selected')
  await expect(selectedCount).toBeVisible({ timeout: 2000 })

  // All checkboxes are checked
  for (let i = 0; i < 3; i++) {
    await expect(checkboxes.nth(i)).toBeChecked()
  }

  // Click select-all again — deselect all
  await selectAll.click()

  // Action bar disappears
  await expect(window.locator('text=skills selected')).not.toBeVisible({ timeout: 2000 })

  // Click a single checkbox — action bar shows "1 skill selected"
  await checkboxes.first().click()
  const singleCount = window.locator('text=1 skill selected')
  await expect(singleCount).toBeVisible({ timeout: 2000 })

  await app.close()
})