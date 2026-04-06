# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: verify.spec.ts >> F015 - Deployment state current vs stale
- Location: verify.spec.ts:427:1

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
  356 |   await pathInput.fill(projectDir)
  357 | 
  358 |   // Confirm
  359 |   await window.click('[data-testid="confirm-add-project"], button:has-text("Add"), button:has-text("Confirm"), button:has-text("Save")')
  360 | 
  361 |   // Project appears in list
  362 |   await expect(window.locator('text=Test Project')).toBeVisible({ timeout: 3000 })
  363 | 
  364 |   // Config updated on disk
  365 |   const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  366 |   const project = config.projects.find((p: any) => p.name === 'Test Project')
  367 |   expect(project).toBeTruthy()
  368 |   expect(project.path).toBe(projectDir)
  369 | 
  370 |   // Cleanup
  371 |   fs.rmSync(projectDir, { recursive: true, force: true })
  372 |   await app.close()
  373 | })
  374 | 
  375 | // ─── F014: Deploy a skill to a project ───────────────────────────────────────
  376 | 
  377 | test('F014 - Deploy skill to project', async () => {
  378 |   cleanSkilldeck()
  379 | 
  380 |   const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skilldeck-test-project-'))
  381 |   seedSkill('scope-killer', makeSkillContent('Scope Killer', 'Kills scope creep'))
  382 | 
  383 |   // Pre-seed a project in config
  384 |   const config = {
  385 |     libraryPath: LIBRARY_DIR,
  386 |     projects: [{
  387 |       id: 'test-project-1',
  388 |       name: 'Test Project',
  389 |       path: projectDir,
  390 |       skillsPath: '.claude/skills'
  391 |     }]
  392 |   }
  393 |   fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
  394 |   fs.writeFileSync(DEPLOYMENTS_PATH, JSON.stringify({}))
  395 | 
  396 |   const { app, window } = await launchApp()
  397 | 
  398 |   // Select the skill
  399 |   await window.click('[data-testid="skill-item"], [data-skill]')
  400 | 
  401 |   // Click Deploy
  402 |   await window.click('[data-testid="deploy-btn"], button:has-text("Deploy")')
  403 | 
  404 |   // Select project from dropdown/list
  405 |   await window.click('text=Test Project')
  406 | 
  407 |   // Confirm
  408 |   const confirmBtn = window.locator('[data-testid="confirm-deploy"], button:has-text("Deploy"), button:has-text("Confirm")')
  409 |   if (await confirmBtn.isVisible()) await confirmBtn.click()
  410 | 
  411 |   // File exists at project path
  412 |   const deployedPath = path.join(projectDir, '.claude', 'skills', 'scope-killer.md')
  413 |   await window.waitForTimeout(1000)
  414 |   expect(fs.existsSync(deployedPath)).toBe(true)
  415 | 
  416 |   // Deployment record exists
  417 |   const deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, 'utf8'))
  418 |   expect(deployments['test-project-1']).toBeTruthy()
  419 |   expect(deployments['test-project-1']['scope-killer']).toBeTruthy()
  420 | 
  421 |   fs.rmSync(projectDir, { recursive: true, force: true })
  422 |   await app.close()
  423 | })
  424 | 
  425 | // ─── F015: Deployment state current vs stale ─────────────────────────────────
  426 | 
  427 | test('F015 - Deployment state current vs stale', async () => {
  428 |   cleanSkilldeck()
  429 | 
  430 |   const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skilldeck-test-project-'))
  431 |   const skillContent = makeSkillContent('Scope Killer', 'Kills scope creep')
  432 |   seedSkill('scope-killer', skillContent)
  433 | 
  434 |   // Deploy manually
  435 |   const deployedDir = path.join(projectDir, '.claude', 'skills')
  436 |   fs.mkdirSync(deployedDir, { recursive: true })
  437 |   fs.writeFileSync(path.join(deployedDir, 'scope-killer.md'), skillContent)
  438 | 
  439 |   const hash = crypto.createHash('md5').update(skillContent).digest('hex')
  440 | 
  441 |   const config = {
  442 |     libraryPath: LIBRARY_DIR,
  443 |     projects: [{ id: 'proj-1', name: 'Test Project', path: projectDir, skillsPath: '.claude/skills' }]
  444 |   }
  445 |   const deployments = {
  446 |     'proj-1': {
  447 |       'scope-killer': { deployedAt: new Date().toISOString(), libraryHash: hash, currentHash: hash }
  448 |     }
  449 |   }
  450 |   fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
  451 |   fs.writeFileSync(DEPLOYMENTS_PATH, JSON.stringify(deployments, null, 2))
  452 | 
  453 |   const { app, window } = await launchApp()
  454 | 
  455 |   // Should show as Current
> 456 |   await expect(window.locator('[data-testid="status-current"], text=Current').first()).toBeVisible({ timeout: 3000 })
      |                                                                                        ^ Error: expect(locator).toBeVisible() failed
  457 | 
  458 |   // Now modify the library skill to make it stale
  459 |   const newContent = skillContent + '\n\n## New Section\nAdded content.'
  460 |   fs.writeFileSync(path.join(LIBRARY_DIR, 'scope-killer.md'), newContent)
  461 | 
  462 |   // Trigger refresh (click away and back, or wait for file watcher)
  463 |   await window.click('[data-nav="projects"], [data-testid="nav-projects"]')
  464 |   await window.click('[data-nav="library"], [data-testid="nav-library"]')
  465 | 
  466 |   // Should now show as Stale
  467 |   await expect(window.locator('[data-testid="status-stale"], text=Stale').first()).toBeVisible({ timeout: 3000 })
  468 | 
  469 |   fs.rmSync(projectDir, { recursive: true, force: true })
  470 |   await app.close()
  471 | })
  472 | 
```