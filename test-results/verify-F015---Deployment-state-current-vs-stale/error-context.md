# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: verify.spec.ts >> F015 - Deployment state current vs stale
- Location: verify.spec.ts:429:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: [data-testid="status-current"], text=Current >> nth=0
Expected: visible
Error: Unexpected token "=" while parsing css selector "[data-testid="status-current"], text=Current". Did you mean to CSS.escape it?

Call log:
  - Expect "toBeVisible" with timeout 3000ms
  - waiting for [data-testid="status-current"], text=Current >> nth=0

```

# Test source

```ts
  358 |   await pathInput.fill(projectDir)
  359 | 
  360 |   // Confirm
  361 |   await window.click('[data-testid="confirm-add-project"], button:has-text("Add"), button:has-text("Confirm"), button:has-text("Save")')
  362 | 
  363 |   // Project appears in list
  364 |   await expect(window.locator('text=Test Project')).toBeVisible({ timeout: 3000 })
  365 | 
  366 |   // Config updated on disk
  367 |   const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  368 |   const project = config.projects.find((p: any) => p.name === 'Test Project')
  369 |   expect(project).toBeTruthy()
  370 |   expect(project.path).toBe(projectDir)
  371 | 
  372 |   // Cleanup
  373 |   fs.rmSync(projectDir, { recursive: true, force: true })
  374 |   await app.close()
  375 | })
  376 | 
  377 | // ─── F014: Deploy a skill to a project ───────────────────────────────────────
  378 | 
  379 | test('F014 - Deploy skill to project', async () => {
  380 |   cleanSkilldeck()
  381 | 
  382 |   const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skilldeck-test-project-'))
  383 |   seedSkill('scope-killer', makeSkillContent('Scope Killer', 'Kills scope creep'))
  384 | 
  385 |   // Pre-seed a project in config
  386 |   const config = {
  387 |     libraryPath: LIBRARY_DIR,
  388 |     projects: [{
  389 |       id: 'test-project-1',
  390 |       name: 'Test Project',
  391 |       path: projectDir,
  392 |       skillsPath: '.claude/skills'
  393 |     }]
  394 |   }
  395 |   fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
  396 |   fs.writeFileSync(DEPLOYMENTS_PATH, JSON.stringify({}))
  397 | 
  398 |   const { app, window } = await launchApp()
  399 | 
  400 |   // Select the skill
  401 |   await window.click('[data-testid="skill-item"], [data-skill]')
  402 | 
  403 |   // Click Deploy
  404 |   await window.click('[data-testid="deploy-btn"], button:has-text("Deploy")')
  405 | 
  406 |   // Select project from dropdown/list
  407 |   await window.click('text=Test Project')
  408 | 
  409 |   // Confirm
  410 |   const confirmBtn = window.locator('[data-testid="confirm-deploy"], button:has-text("Deploy"), button:has-text("Confirm")')
  411 |   if (await confirmBtn.isVisible()) await confirmBtn.click()
  412 | 
  413 |   // File exists at project path
  414 |   const deployedPath = path.join(projectDir, '.claude', 'skills', 'scope-killer.md')
  415 |   await window.waitForTimeout(1000)
  416 |   expect(fs.existsSync(deployedPath)).toBe(true)
  417 | 
  418 |   // Deployment record exists
  419 |   const deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, 'utf8'))
  420 |   expect(deployments['test-project-1']).toBeTruthy()
  421 |   expect(deployments['test-project-1']['scope-killer']).toBeTruthy()
  422 | 
  423 |   fs.rmSync(projectDir, { recursive: true, force: true })
  424 |   await app.close()
  425 | })
  426 | 
  427 | // ─── F015: Deployment state current vs stale ─────────────────────────────────
  428 | 
  429 | test('F015 - Deployment state current vs stale', async () => {
  430 |   cleanSkilldeck()
  431 | 
  432 |   const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skilldeck-test-project-'))
  433 |   const skillContent = makeSkillContent('Scope Killer', 'Kills scope creep')
  434 |   seedSkill('scope-killer', skillContent)
  435 | 
  436 |   // Deploy manually
  437 |   const deployedDir = path.join(projectDir, '.claude', 'skills')
  438 |   fs.mkdirSync(deployedDir, { recursive: true })
  439 |   fs.writeFileSync(path.join(deployedDir, 'scope-killer.md'), skillContent)
  440 | 
  441 |   const hash = crypto.createHash('md5').update(skillContent).digest('hex')
  442 | 
  443 |   const config = {
  444 |     libraryPath: LIBRARY_DIR,
  445 |     projects: [{ id: 'proj-1', name: 'Test Project', path: projectDir, skillsPath: '.claude/skills' }]
  446 |   }
  447 |   const deployments = {
  448 |     'proj-1': {
  449 |       'scope-killer': { deployedAt: new Date().toISOString(), libraryHash: hash, currentHash: hash }
  450 |     }
  451 |   }
  452 |   fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
  453 |   fs.writeFileSync(DEPLOYMENTS_PATH, JSON.stringify(deployments, null, 2))
  454 | 
  455 |   const { app, window } = await launchApp()
  456 | 
  457 |   // Should show as Current
> 458 |   await expect(window.locator('[data-testid="status-current"], text=Current').first()).toBeVisible({ timeout: 3000 })
      |                                                                                        ^ Error: expect(locator).toBeVisible() failed
  459 | 
  460 |   // Now modify the library skill to make it stale
  461 |   const newContent = skillContent + '\n\n## New Section\nAdded content.'
  462 |   fs.writeFileSync(path.join(LIBRARY_DIR, 'scope-killer.md'), newContent)
  463 | 
  464 |   // Trigger refresh (click away and back, or wait for file watcher)
  465 |   await window.click('[data-nav="projects"], [data-testid="nav-projects"]')
  466 |   await window.click('[data-nav="library"], [data-testid="nav-library"]')
  467 | 
  468 |   // Should now show as Stale
  469 |   await expect(window.locator('[data-testid="status-stale"], text=Stale').first()).toBeVisible({ timeout: 3000 })
  470 | 
  471 |   fs.rmSync(projectDir, { recursive: true, force: true })
  472 |   await app.close()
  473 | })
  474 | 
```