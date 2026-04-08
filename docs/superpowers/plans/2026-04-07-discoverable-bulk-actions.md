# Discoverable Bulk Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make skill multi-select and bulk actions (delete, deploy) discoverable by adding always-visible checkboxes and a select-all header, instead of relying on hidden Ctrl+Click.

**Architecture:** Modify `LibraryView.tsx` and `skillStore.ts`. Add a `selectAllSkills` action to the store (matching existing patterns), then update the view with always-visible checkboxes, a select-all header, and the action bar at 1+ selected.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Playwright for E2E tests

---

### Task 1: Add `selectAllSkills` action to the skill store

**Files:**
- Modify: `src/store/skillStore.ts`

- [ ] **Step 1: Add `selectAllSkills` to the SkillState interface**

In `src/store/skillStore.ts`, add `selectAllSkills` to the `SkillState` interface (after `clearSelection` on line 18):

```typescript
selectAllSkills: () => void
```

- [ ] **Step 2: Implement `selectAllSkills` in the store**

In the store implementation (after `clearSelection: () => set({ selectedSkillIds: [] })` on line 145), add:

```typescript
selectAllSkills: () => {
  const { skills, searchQuery, selectedTags, selectedSources } = get()
  const filtered = skills.filter(skill => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!skill.name.toLowerCase().includes(q) && !skill.description.toLowerCase().includes(q) && !skill.filename.toLowerCase().includes(q)) return false
    }
    if (selectedTags.length > 0) {
      if (!selectedTags.some(tag => skill.tags.includes(tag))) return false
    }
    if (selectedSources.length > 0) {
      const skillSource = skill.source || 'skilldeck'
      if (!selectedSources.includes(skillSource)) return false
    }
    return true
  })
  set({ selectedSkillIds: filtered.map(s => `${s.source}:${s.filename}`) })
},
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/store/skillStore.ts
git commit -m "feat: add selectAllSkills action to skill store"
```

---

### Task 2: Add select-all checkbox header and always-visible skill checkboxes

**Files:**
- Modify: `src/views/LibraryView.tsx`

- [ ] **Step 0: Add `selectAllSkills` to the store destructuring**

In the `useSkillStore()` destructuring block (around line 40-53), add `selectAllSkills` after `clearSelection`:

```tsx
    clearSelection,
    selectAllSkills,
    getSelectedSkills,
```

- [ ] **Step 1: Add select-all header row above the skill list**

In `LibraryView.tsx`, add a header row inside the `<div className="flex-1 overflow-y-auto relative">` block, just before the `{filteredSkills.length === 0 ? ...}` conditional. This row contains a "Select all" checkbox and a label showing the selection count.

Insert this block between the closing `</div>` of the buttons bar (line ~320) and the `<div className="flex-1 overflow-y-auto relative">` opening:

```tsx
{/* Select All Header */}
{filteredSkills.length > 0 && (
  <div className="px-3 py-1.5 border-b border-border/50 flex items-center gap-3 bg-bg/50">
    <input
      type="checkbox"
      data-testid="select-all-checkbox"
      checked={selectedSkillIds.length > 0 && selectedSkillIds.length === filteredSkills.length}
      ref={(el) => { if (el) el.indeterminate = selectedSkillIds.length > 0 && selectedSkillIds.length < filteredSkills.length }}
      onChange={() => {
        if (selectedSkillIds.length === filteredSkills.length) {
          clearSelection()
        } else {
          selectAllSkills()
        }
      }}
      className="w-4 h-4 rounded border-border accent-accent cursor-pointer"
    />
    <span className="text-xs text-muted">
      {selectedSkillIds.length > 0 ? `${selectedSkillIds.length} of ${filteredSkills.length} selected` : `${filteredSkills.length} skills`}
    </span>
  </div>
)}
```

- [ ] **Step 2: Make skill row checkboxes always visible with proper data-testid**

In the skill row rendering (inside `filteredSkills.map`), update the checkbox `<div>` to include `data-testid="skill-checkbox"` and change the onClick on the row itself so that clicking anywhere on the row toggles the editor selection (not bulk selection), while clicking the checkbox toggles bulk selection.

Replace the current checkbox div (the `<div>` with `w-4 h-4 rounded border`) with:

```tsx
<input
  type="checkbox"
  data-testid="skill-checkbox"
  checked={selectedSkillIds.includes(`${skill.source}:${skill.filename}`)}
  onChange={(e) => {
    e.stopPropagation()
    toggleSkillSelection(skill, true)
  }}
  onClick={(e) => e.stopPropagation()}
  className="w-4 h-4 rounded border-border accent-accent cursor-pointer shrink-0"
/>
```

- [ ] **Step 3: Simplify the row onClick handler**

The current row onClick has Ctrl+Click logic. Simplify it so that clicking the row always selects for editing (not bulk selection), since the checkbox handles bulk selection now.

Replace the current `onClick` on the skill item `<div>`:

```tsx
onClick={(e) => {
  const multi = e.ctrlKey || e.metaKey
  if (multi) {
    e.stopPropagation()
    toggleSkillSelection(skill, true)
  } else {
    selectSkill(skill)
    toggleSkillSelection(skill, false)
  }
}}
```

with:

```tsx
onClick={() => {
  selectSkill(skill)
}}
```

- [ ] **Step 4: Update row highlight logic**

The current row uses both `selectedSkill?.filename === skill.filename` (editor highlight) and `selectedSkillIds.includes(...)` (bulk highlight). Since we now have checkboxes, simplify: the row is highlighted for editing if it's the selected skill, and the checkbox shows bulk selection. Update the className to only use the editor selection for background:

```tsx
className={`px-3 py-2 cursor-pointer border-b border-border/50 flex items-center gap-3 ${
  selectedSkill?.filename === skill.filename && selectedSkill?.source === skill.source
    ? 'bg-border'
    : 'hover:bg-surface'
}`}
```

- [ ] **Step 5: Show action bar at 1+ instead of 2+**

Change the condition from `selectedSkillIds.length > 1` to `selectedSkillIds.length > 0`:

```tsx
{selectedSkillIds.length > 0 && (
```

Also update the count text to handle singular/plural:

```tsx
<div className="text-sm text-fg font-medium">
  {selectedSkillIds.length} skill{selectedSkillIds.length !== 1 ? 's' : ''} selected
</div>
```

- [ ] **Step 6: Verify the app builds**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/views/LibraryView.tsx
git commit -m "feat: add discoverable bulk actions with checkboxes and select-all header"
```

---

### Task 3: Add Playwright test for bulk actions discoverability

**Files:**
- Modify: `verify.spec.ts`

- [ ] **Step 1: Write the test for checkbox visibility and select-all**

Add a new test block at the end of `verify.spec.ts` (before the final closing bracket). This test seeds 3 skills, verifies checkboxes are visible, selects all via the select-all checkbox, verifies the action bar appears, and tests deselect-all.

```typescript
// ─── Bulk Actions Discoverability ─────────────────────────────────────────────

test('Bulk actions — checkboxes visible, select-all, action bar at 1+', async () => {
  cleanSkilldeck()
  seedSkill('bulk-a', makeSkillContent('Bulk A', 'First bulk skill', ['test']))
  seedSkill('bulk-b', makeSkillContent('Bulk B', 'Second bulk skill', ['test']))
  seedSkill('bulk-c', makeSkillContent('Bulk C', 'Third bulk skill', ['other']))

  const { app, window } = await launchApp()

  await window.waitForSelector('[data-testid="skill-item"]', { timeout: 3000 })

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
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx playwright test verify.spec.ts --grep "Bulk actions"`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add verify.spec.ts
git commit -m "test: add Playwright test for bulk actions discoverability"
```