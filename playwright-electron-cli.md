---
name: playwright-electron-cli
description: "Use this skill when you need to verify, test, or interact with the Skilldeck Electron app programmatically. Triggers: before marking any feature as passing in feature_list.json, when a UI feature needs end-to-end verification, when debugging why a button or interaction isn't working, or any time you need to observe what the running app actually does rather than what the code says it should do."
tags: [testing, verification, electron, playwright]
---

# Playwright Electron CLI — Skilldeck Verification

This skill governs how to use Playwright to verify Skilldeck features end-to-end.
CLI-based. Token-efficient. No MCP server. No accessibility tree dumped into context.

## Core Rule

**Never mark a feature as passing in feature_list.json without running the corresponding test.**

The test is the only acceptable evidence that a feature works. Code that compiles is not evidence. Code that looks correct is not evidence. A passing Playwright test is evidence.

---

## Setup (run once per environment)

```bash
# Install Playwright and Electron support
npm install -D @playwright/test playwright

# Verify installation
npx playwright --version
```

No browser binaries needed — Playwright drives the Electron app directly via its built-in Chromium.

---

## Running Verification Tests

### Verify a single feature before marking it passing

```bash
npx playwright test verify.spec.ts --grep F005
```

Replace `F005` with the feature ID from `feature_list.json`. Always run this before marking passes: true.

### Verify all Phase 1 features

```bash
npx playwright test verify.spec.ts
```

Run this at the end of a session to confirm nothing regressed.

### Run with visible output (useful for debugging)

```bash
npx playwright test verify.spec.ts --reporter=list
```

### Run a single test and keep the browser open on failure

```bash
npx playwright test verify.spec.ts --grep F005 --headed
```

Note: `--headed` shows the Electron window during the test. Useful for seeing exactly what's happening when a test fails.

---

## Reading Test Output

A passing test looks like:
```
✓ F005 - Create new skill (1.2s)
```

A failing test looks like:
```
✗ F005 - Create new skill (3.1s)

  Error: Locator.click: Target closed
  at verify.spec.ts:87
```

Common failure reasons and what they mean:

| Error | Likely cause |
|-------|-------------|
| `Locator not found` | `data-testid` attribute missing from component |
| `Target closed` | App crashed or window closed unexpectedly |
| `Timeout waiting for selector` | Feature not implemented or component not rendering |
| `Expected X to be Y` | Feature implemented but logic is wrong |
| `ENOENT` on file path | File write didn't happen — IPC handler broken |

---

## The data-testid Contract

Every interactive element in Skilldeck **must** have a `data-testid` matching this list.
If a test fails with "Locator not found", the first thing to check is whether the component has the right `data-testid`.

### Required data-testid values

**Navigation**
- `nav-library` — Library nav item
- `nav-projects` — Projects nav item
- `nav-settings` — Settings nav item

**Views**
- `library-view` — Library view container
- `projects-view` — Projects view container
- `settings-view` — Settings view container

**Library**
- `skill-item` — Each skill in the list (one per skill)
- `new-skill-btn` — Create new skill button
- `skill-editor` — Editor textarea/contenteditable
- `save-btn` — Save button (if not auto-save)
- `delete-skill` — Delete action in context menu or button
- `search-input` — Search input field
- `empty-state` — Empty state message when no skills

**Projects**
- `add-project-btn` — Add Project button
- `project-name-input` — Project name field in add form
- `project-path-input` — Project path field in add form
- `confirm-add-project` — Confirm/submit button in add form

**Deployment**
- `deploy-btn` — Deploy button on a skill
- `confirm-deploy` — Confirm button in deploy flow
- `status-current` — "Current" status indicator on deployed skill
- `status-stale` — "Stale" status indicator on deployed skill

### How to add data-testid in React

```tsx
// Correct — testid on the element the test will interact with
<button data-testid="new-skill-btn" onClick={handleNewSkill}>
  New Skill
</button>

// Correct — testid on the container for list items
<div data-testid="skill-item" key={skill.id} onClick={() => openSkill(skill)}>
  {skill.name}
</div>

// Wrong — missing testid, test will fail with "Locator not found"
<button onClick={handleNewSkill}>New Skill</button>
```

Add `data-testid` at the same time you build the component. Do not defer it.

---

## Workflow: Feature → Test → Commit

This is the only acceptable sequence:

```
1. Implement the feature
2. Run the Playwright test: npx playwright test verify.spec.ts --grep F00X
3. If test fails → fix the issue, go to step 2
4. If test passes → mark feature passing in feature_list.json
5. Commit immediately: git commit -m "feat(F00X): description"
6. Never batch multiple features into one commit
7. Never commit before the test passes
```

### The exact commit sequence after a passing test

```bash
# Mark passing
node -e "const fs=require('fs');const f=JSON.parse(fs.readFileSync('feature_list.json','utf8'));const x=f.features.find(x=>x.id==='F005');x.passes=true;x.notes='Verified with Playwright — npx playwright test verify.spec.ts --grep F005';fs.writeFileSync('feature_list.json',JSON.stringify(f,null,2));console.log('Marked F005 passing');"

# Commit — one feature, one commit
git add .
git commit -m "feat(F005): create new skill — button creates .md file in library"
```

Commit message format: `feat(F00X): what the user can now do`
Not: `feat: add skill creation logic` — too vague, doesn't reference the feature ID
Not: `feat(F005,F006,F007): multiple features` — never batch commits

---

## When Tests Don't Exist Yet

Some features in feature_list.json don't have a corresponding test in verify.spec.ts (F007, F010, F012, F013, F016, F017, F018). For these:

1. Do NOT mark them passing without human verification
2. Add note: `"notes": "NEEDS HUMAN VERIFICATION — no automated test yet"`
3. Add the test to verify.spec.ts following the existing patterns, then run it

When adding a new test, follow this structure:

```typescript
test('F00X - Feature name', async () => {
  // 1. Set up filesystem state (cleanSkilldeck, seedSkill, etc.)
  // 2. Launch app
  const { app, window } = await launchApp()
  // 3. Interact with UI using data-testid selectors
  await window.click('[data-testid="..."]')
  // 4. Assert UI state
  await expect(window.locator('[data-testid="..."]')).toBeVisible()
  // 5. Assert filesystem state (the real source of truth)
  expect(fs.existsSync(somePath)).toBe(true)
  // 6. Close
  await app.close()
})
```

Always assert both UI state AND filesystem state. A feature that updates the UI but doesn't persist to disk is broken.

---

## Debugging a Failing Test

When a test fails, work through this sequence:

```bash
# 1. Run with headed mode to see what the app looks like
npx playwright test verify.spec.ts --grep F005 --headed

# 2. Check if the app starts at all
npm run dev
# (manually verify the window opens)

# 3. Check if the data-testid exists in the rendered DOM
# In the app's DevTools console (Ctrl+Shift+I in the app):
document.querySelectorAll('[data-testid]')

# 4. Check if the IPC handler is registered (for features that write to disk)
# In electron/main.ts or electron/ipc/*.ts — verify the ipcMain.handle exists

# 5. Check the test-results directory for screenshots
ls test-results/
```

The most common root causes in order of frequency:
1. Missing `data-testid` on the component
2. IPC handler not registered in main process
3. Zustand store action not connected to the UI
4. File write happening in renderer process instead of main process (security violation in Electron)

---

## Important: Electron IPC Architecture

Skilldeck uses Electron's contextBridge pattern. File system operations **must** go through IPC:

```
Renderer (React) → ipcRenderer.invoke('skill:create') → Main Process → fs.writeFile
```

If a button click does nothing (like the bug that triggered this skill), the most likely cause is one of:
- The IPC channel name in the renderer doesn't match the handler name in main
- The `contextBridge.exposeInMainWorld` call is missing the method
- The handler exists but has a silent error (wrap in try/catch and log)

Check this path first before debugging the React component.