# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: verify.spec.ts >> F004b - Library shows empty state when no skills
- Location: verify.spec.ts:198:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: [data-testid="empty-state"], text=No skills yet, text=Add your first skill
Expected: visible
Error: Unexpected token "=" while parsing css selector "[data-testid="empty-state"], text=No skills yet, text=Add your first skill". Did you mean to CSS.escape it?

Call log:
  - Expect "toBeVisible" with timeout 3000ms
  - waiting for [data-testid="empty-state"], text=No skills yet, text=Add your first skill

```

# Test source

```ts
  104 |   expect(title.length).toBeGreaterThan(0)
  105 | 
  106 |   // Check console for errors
  107 |   const errors: string[] = []
  108 |   window.on('console', msg => {
  109 |     if (msg.type() === 'error') errors.push(msg.text())
  110 |   })
  111 | 
  112 |   // Small wait to catch any immediate errors
  113 |   await window.waitForTimeout(1000)
  114 |   expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0)
  115 | 
  116 |   await app.close()
  117 | })
  118 | 
  119 | // ─── F002: Config initializes on first run ───────────────────────────────────
  120 | 
  121 | test('F002 - Config initializes on first run', async () => {
  122 |   cleanSkilldeck()
  123 | 
  124 |   const { app } = await launchApp()
  125 |   await new Promise(r => setTimeout(r, 1500)) // wait for init
  126 | 
  127 |   // ~/.skilldeck/ created
  128 |   expect(fs.existsSync(SKILLDECK_DIR)).toBe(true)
  129 | 
  130 |   // config.json created and valid
  131 |   expect(fs.existsSync(CONFIG_PATH)).toBe(true)
  132 |   const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  133 |   expect(config).toHaveProperty('libraryPath')
  134 |   expect(config).toHaveProperty('projects')
  135 |   expect(Array.isArray(config.projects)).toBe(true)
  136 | 
  137 |   // library/ created
  138 |   expect(fs.existsSync(LIBRARY_DIR)).toBe(true)
  139 | 
  140 |   // deployments.json created
  141 |   expect(fs.existsSync(DEPLOYMENTS_PATH)).toBe(true)
  142 |   const deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, 'utf8'))
  143 |   expect(typeof deployments).toBe('object')
  144 | 
  145 |   await app.close()
  146 | })
  147 | 
  148 | // ─── F003: Navigation ────────────────────────────────────────────────────────
  149 | 
  150 | test('F003 - Three-panel navigation works', async () => {
  151 |   const { app, window } = await launchApp()
  152 | 
  153 |   // Wait for React to render
  154 |   await window.waitForSelector('[data-testid="library-view"]', { timeout: 10000 })
  155 | 
  156 |   // Library is default view
  157 |   await expect(window.locator('[data-view="library"], [data-testid="library-view"]')).toBeVisible()
  158 | 
  159 |   // Navigate to Projects
  160 |   await window.click('[data-nav="projects"], [data-testid="nav-projects"]')
  161 |   await expect(window.locator('[data-view="projects"], [data-testid="projects-view"]')).toBeVisible()
  162 | 
  163 |   // Navigate to Settings
  164 |   await window.click('[data-nav="settings"], [data-testid="nav-settings"]')
  165 |   await expect(window.locator('[data-view="settings"], [data-testid="settings-view"]')).toBeVisible()
  166 | 
  167 |   // Back to Library
  168 |   await window.click('[data-nav="library"], [data-testid="nav-library"]')
  169 |   await expect(window.locator('[data-view="library"], [data-testid="library-view"]')).toBeVisible()
  170 | 
  171 |   await app.close()
  172 | })
  173 | 
  174 | // ─── F004: Library shows skill files ─────────────────────────────────────────
  175 | 
  176 | test('F004 - Library view shows all skill files', async () => {
  177 |   cleanSkilldeck()
  178 |   seedSkill('scope-killer', makeSkillContent('Scope Killer', 'Kills scope creep', ['thinking', 'scoping']))
  179 |   seedSkill('ship-or-kill', makeSkillContent('Ship or Kill Gate', 'Forces shipping decisions', ['process']))
  180 |   seedSkill('context-guard', makeSkillContent('Context Switch Guard', 'Protects deep work', ['focus']))
  181 | 
  182 |   const { app, window } = await launchApp()
  183 | 
  184 |   // Navigate to library (should be default)
  185 |   await window.waitForSelector('[data-testid="skill-item"], [data-skill]', { timeout: 5000 })
  186 | 
  187 |   const skillItems = await window.locator('[data-testid="skill-item"], [data-skill]').count()
  188 |   expect(skillItems).toBe(3)
  189 | 
  190 |   // Names visible
  191 |   await expect(window.locator('text=Scope Killer')).toBeVisible()
  192 |   await expect(window.locator('text=Ship or Kill Gate')).toBeVisible()
  193 |   await expect(window.locator('text=Context Switch Guard')).toBeVisible()
  194 | 
  195 |   await app.close()
  196 | })
  197 | 
  198 | test('F004b - Library shows empty state when no skills', async () => {
  199 |   cleanSkilldeck()
  200 |   const { app, window } = await launchApp()
  201 | 
  202 |   // Empty state message should be visible
  203 |   const emptyState = window.locator('[data-testid="empty-state"], text=No skills yet, text=Add your first skill')
> 204 |   await expect(emptyState).toBeVisible({ timeout: 3000 })
      |                            ^ Error: expect(locator).toBeVisible() failed
  205 | 
  206 |   await app.close()
  207 | })
  208 | 
  209 | // ─── F005: Create new skill ───────────────────────────────────────────────────
  210 | 
  211 | test('F005 - Create new skill', async () => {
  212 |   cleanSkilldeck()
  213 |   const { app, window } = await launchApp()
  214 | 
  215 |   // Click new skill button
  216 |   await window.click('[data-testid="new-skill-btn"], button:has-text("New Skill"), button:has-text("+ New")')
  217 | 
  218 |   // A new skill appears in the list
  219 |   await window.waitForSelector('[data-testid="skill-item"], [data-skill]', { timeout: 3000 })
  220 |   const skillItems = await window.locator('[data-testid="skill-item"], [data-skill]').count()
  221 |   expect(skillItems).toBeGreaterThan(0)
  222 | 
  223 |   // File exists on disk
  224 |   const files = fs.readdirSync(LIBRARY_DIR).filter(f => f.endsWith('.md'))
  225 |   expect(files.length).toBeGreaterThan(0)
  226 | 
  227 |   // File has valid frontmatter
  228 |   const content = fs.readFileSync(path.join(LIBRARY_DIR, files[0]), 'utf8')
  229 |   expect(content).toContain('---')
  230 |   expect(content).toContain('name:')
  231 | 
  232 |   await app.close()
  233 | })
  234 | 
  235 | // ─── F006: Edit skill — content saves to disk ────────────────────────────────
  236 | 
  237 | test('F006 - Edit skill content saves to disk', async () => {
  238 |   cleanSkilldeck()
  239 |   seedSkill('test-skill', makeSkillContent('Test Skill', 'Original description'))
  240 | 
  241 |   const { app, window } = await launchApp()
  242 | 
  243 |   // Click the skill to open editor
  244 |   await window.click('[data-testid="skill-item"], [data-skill]')
  245 | 
  246 |   // Find the editor textarea/contenteditable
  247 |   const editor = window.locator('[data-testid="skill-editor"], textarea[data-role="editor"], .skill-editor')
  248 |   await expect(editor).toBeVisible({ timeout: 3000 })
  249 | 
  250 |   // Clear and type new content
  251 |   await editor.click({ clickCount: 3 }) // select all
  252 |   await editor.fill('# Updated Content\n\nThis is new content.')
  253 | 
  254 |   // Save (look for save button or auto-save)
  255 |   const saveBtn = window.locator('[data-testid="save-btn"], button:has-text("Save")')
  256 |   if (await saveBtn.isVisible()) {
  257 |     await saveBtn.click()
  258 |   } else {
  259 |     // Auto-save — wait a moment
  260 |     await window.waitForTimeout(1500)
  261 |   }
  262 | 
  263 |   // Verify file on disk changed
  264 |   const content = fs.readFileSync(path.join(LIBRARY_DIR, 'test-skill.md'), 'utf8')
  265 |   expect(content).toContain('Updated Content')
  266 | 
  267 |   await app.close()
  268 | })
  269 | 
  270 | // ─── F008: Delete skill ───────────────────────────────────────────────────────
  271 | 
  272 | test('F008 - Delete skill with confirmation', async () => {
  273 |   cleanSkilldeck()
  274 |   seedSkill('delete-me', makeSkillContent('Delete Me', 'This skill will be deleted'))
  275 | 
  276 |   const { app, window } = await launchApp()
  277 | 
  278 |   await window.waitForSelector('[data-testid="skill-item"], [data-skill]', { timeout: 3000 })
  279 | 
  280 |   // Right-click or find delete button
  281 |   const skillItem = window.locator('[data-testid="skill-item"], [data-skill]').first()
  282 |   await skillItem.click({ button: 'right' })
  283 | 
  284 |   // Click delete in context menu, or find delete button
  285 |   const deleteBtn = window.locator('[data-testid="delete-skill"], button:has-text("Delete"), text=Delete')
  286 |   await expect(deleteBtn).toBeVisible({ timeout: 2000 })
  287 |   await deleteBtn.click()
  288 | 
  289 |   // Confirmation dialog
  290 |   const confirmBtn = window.locator('[data-testid="confirm-delete"], button:has-text("Confirm"), button:has-text("Delete"), button:has-text("Yes")')
  291 |   await expect(confirmBtn).toBeVisible({ timeout: 2000 })
  292 |   await confirmBtn.click()
  293 | 
  294 |   // Skill gone from list
  295 |   await window.waitForTimeout(500)
  296 |   const skillItems = await window.locator('[data-testid="skill-item"], [data-skill]').count()
  297 |   expect(skillItems).toBe(0)
  298 | 
  299 |   // File deleted from disk
  300 |   expect(fs.existsSync(path.join(LIBRARY_DIR, 'delete-me.md'))).toBe(false)
  301 | 
  302 |   await app.close()
  303 | })
  304 | 
```