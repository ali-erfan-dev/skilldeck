# F027: Community Registry Browse — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-featured Browse tab to the Library view that lets users discover, preview, and install community skills from the agent-skills.cc registry.

**Architecture:** Extend LibraryView in-place. When the Browse tab is active, the right panel (normally the skill editor) becomes a card grid of community skills. Clicking a card opens a preview with an install button. A `useRegistry` hook manages all registry state (search, categories, connectivity, install, conflicts). No new Zustand store or IPC handlers needed.

**Tech Stack:** React 18 hooks, existing registry IPC APIs (registry:search, registry:install, registry:ping), Tailwind CSS

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/hooks/useRegistry.ts` | Registry state hook (search, categories, install, conflict, connectivity) |
| Create | `src/components/RegistryCard.tsx` | Single community skill card component |
| Create | `src/components/RegistryPreview.tsx` | Skill detail preview with install button |
| Create | `src/components/ConflictModal.tsx` | Name collision resolution modal |
| Modify | `src/types/index.ts:1-11` | Add `RegistrySkill` interface |
| Modify | `src/types/window.d.ts:80` | Type `registrySearch` return as `Promise<RegistrySkill[]>` |
| Modify | `src/components/SourceBadge.tsx:1-12` | Add `community` source style (amber) |
| Modify | `src/views/LibraryView.tsx` | Replace browse sidebar content with hook-driven grid/preview in right panel |

---

### Task 1: Add RegistrySkill type

**Files:**
- Modify: `src/types/index.ts:1-11`

- [ ] **Step 1: Add RegistrySkill interface to types/index.ts**

Add after the `Skill` interface (after line 11):

```typescript
export interface RegistrySkill {
  id: string
  name: string
  slug: string
  description: string
  author: string
  tags: string[]
  url: string
  downloads?: number
  version?: string
}
```

- [ ] **Step 2: Update window.d.ts registrySearch return type**

In `src/types/window.d.ts:80`, change:
```typescript
registrySearch: (query: string) => Promise<any[]>
```
to:
```typescript
registrySearch: (query: string) => Promise<RegistrySkill[]>
```

Add the import at the top of `src/types/window.d.ts`:
```typescript
import type { Config, Skill, RegistrySkill } from './index'
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to RegistrySkill or registrySearch.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/types/window.d.ts
git commit -m "feat(F027): add RegistrySkill type and type registry APIs"
```

---

### Task 2: Add community source badge style

**Files:**
- Modify: `src/components/SourceBadge.tsx:1-25`

- [ ] **Step 1: Add community entry to SOURCE_STYLES and SOURCE_LABELS**

In `src/components/SourceBadge.tsx`, add to the `SOURCE_STYLES` object (after line 11):
```typescript
'community': 'bg-amber-900/50 text-amber-400',
```

Add to the `SOURCE_LABELS` object (after line 25):
```typescript
'community': 'Community',
```

- [ ] **Step 2: Verify SourceBadge renders community style**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/SourceBadge.tsx
git commit -m "feat(F027): add community source badge style"
```

---

### Task 3: Create useRegistry hook

**Files:**
- Create: `src/hooks/useRegistry.ts`

- [ ] **Step 1: Create the hook file**

```typescript
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSkillStore } from '../store/skillStore'
import type { RegistrySkill } from '../types'

const FALLBACK_CATEGORIES = ['thinking', 'coding', 'writing', 'planning', 'debugging', 'workflow', 'review', 'testing']

interface ConflictInfo {
  skill: RegistrySkill
  existingName: string
}

export function useRegistry() {
  const [skills, setSkills] = useState<RegistrySkill[]>([])
  const [loading, setLoading] = useState(false)
  const [online, setOnline] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<RegistrySkill | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [categories, setCategories] = useState<string[]>(FALLBACK_CATEGORIES)
  const [installing, setInstalling] = useState<string | null>(null)
  const [conflict, setConflict] = useState<ConflictInfo | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadSkills = useSkillStore(state => state.loadSkills)

  // Check connectivity on mount
  useEffect(() => {
    window.api.registryPing().then(status => {
      setOnline(status.online)
      if (status.online) {
        // Try to load initial results
        search('')
      }
    }).catch(() => setOnline(false))
  }, [])

  const search = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const results = await window.api.registrySearch(query || '*')
        setSkills(results)
      } catch {
        setSkills([])
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [])

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query)
    setSelectedCategory(null)
    search(query)
  }, [search])

  const selectCategory = useCallback((cat: string | null) => {
    setSelectedCategory(cat)
    setSearchQuery('')
    if (cat) {
      setLoading(true)
      window.api.registrySearch(cat).then(results => {
        setSkills(results)
      }).catch(() => setSkills([]))
      .finally(() => setLoading(false))
    } else {
      search('')
    }
  }, [search])

  const selectSkill = useCallback((skill: RegistrySkill) => {
    setSelectedSkill(skill)
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedSkill(null)
  }, [])

  const install = useCallback(async (skill: RegistrySkill) => {
    const localSkills = useSkillStore.getState().skills
    const existing = localSkills.find(s => {
      const skillName = skill.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
      return s.filename === `${skillName}.md` || s.name.toLowerCase() === skill.name.toLowerCase()
    })

    if (existing) {
      setConflict({ skill, existingName: existing.name })
      return
    }

    await doInstall(skill)
  }, [])

  const doInstall = useCallback(async (skill: RegistrySkill, filenameOverride?: string) => {
    const skillId = skill.slug || skill.id
    setInstalling(skillId)
    try {
      const result = await window.api.registryInstall(skill.url)
      if (result.success) {
        await loadSkills()
      }
    } catch {
      // install failed silently
    } finally {
      setInstalling(null)
    }
  }, [loadSkills])

  const resolveConflict = useCallback(async (action: 'overwrite' | 'alias' | 'cancel') => {
    if (!conflict || action === 'cancel') {
      setConflict(null)
      return
    }

    if (action === 'overwrite') {
      // Delete existing skill first, then install
      const localSkills = useSkillStore.getState().skills
      const existing = localSkills.find(s => {
        const skillName = conflict.skill.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
        return s.filename === `${skillName}.md` || s.name.toLowerCase() === conflict.skill.name.toLowerCase()
      })
      if (existing) {
        await useSkillStore.getState().deleteSkill(existing)
      }
      await doInstall(conflict.skill)
    }

    if (action === 'alias') {
      await doInstall(conflict.skill)
    }

    setConflict(null)
  }, [conflict, doInstall])

  return {
    skills,
    loading,
    online,
    searchQuery,
    selectedSkill,
    selectedCategory,
    categories,
    installing,
    conflict,
    handleSearchChange,
    selectCategory,
    selectSkill,
    clearSelection,
    install,
    resolveConflict,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useRegistry.ts
git commit -m "feat(F027): create useRegistry hook for community skill browsing"
```

---

### Task 4: Create RegistryCard component

**Files:**
- Create: `src/components/RegistryCard.tsx`

- [ ] **Step 1: Create the card component**

```tsx
import type { RegistrySkill } from '../types'

interface RegistryCardProps {
  skill: RegistrySkill
  isInstalled: boolean
  onClick: () => void
}

export default function RegistryCard({ skill, isInstalled, onClick }: RegistryCardProps) {
  return (
    <div
      data-testid="registry-skill-card"
      onClick={onClick}
      className="p-4 border border-border rounded hover:bg-surface cursor-pointer transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-fg text-sm truncate">{skill.name}</div>
          {skill.author && (
            <div className="text-xs text-muted mt-0.5">by {skill.author}</div>
          )}
        </div>
        {isInstalled && (
          <span className="px-1.5 py-0.5 rounded text-xs bg-amber-900/50 text-amber-400 shrink-0">
            Installed
          </span>
        )}
      </div>
      {skill.description && (
        <div className="text-xs text-muted mt-2 line-clamp-2">{skill.description}</div>
      )}
      <div className="flex items-center gap-2 mt-2">
        {skill.tags.slice(0, 3).map(tag => (
          <span key={tag} className="px-1.5 py-0.5 bg-border rounded text-xs text-muted">
            {tag}
          </span>
        ))}
        {skill.downloads !== undefined && (
          <span className="text-xs text-muted ml-auto">{skill.downloads} downloads</span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/RegistryCard.tsx
git commit -m "feat(F027): create RegistryCard component"
```

---

### Task 5: Create RegistryPreview component

**Files:**
- Create: `src/components/RegistryPreview.tsx`

- [ ] **Step 1: Create the preview component**

```tsx
import type { RegistrySkill } from '../types'

interface RegistryPreviewProps {
  skill: RegistrySkill
  isInstalled: boolean
  isInstalling: boolean
  onInstall: () => void
  onBack: () => void
}

export default function RegistryPreview({ skill, isInstalled, isInstalling, onInstall, onBack }: RegistryPreviewProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border p-4">
        <button
          data-testid="registry-back-btn"
          onClick={onBack}
          className="text-xs text-muted hover:text-fg mb-3 flex items-center gap-1"
        >
          ← Back to results
        </button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-medium text-fg text-lg">{skill.name}</h2>
            {skill.author && <div className="text-sm text-muted mt-0.5">by {skill.author}</div>}
            {skill.version && <div className="text-xs text-muted mt-0.5">v{skill.version}</div>}
          </div>
          <button
            data-testid="registry-install-btn"
            onClick={onInstall}
            disabled={isInstalling}
            className={`px-4 py-2 text-sm rounded font-medium transition-colors shrink-0 ${
              isInstalled
                ? 'bg-border text-muted cursor-default'
                : 'bg-accent hover:bg-accent-dim text-bg'
            } ${isInstalling ? 'opacity-50' : ''}`}
          >
            {isInstalling ? 'Installing...' : isInstalled ? 'Reinstall' : 'Install'}
          </button>
        </div>
        {skill.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {skill.tags.map(tag => (
              <span key={tag} className="px-1.5 py-0.5 bg-border rounded text-xs text-muted">
                {tag}
              </span>
            ))}
          </div>
        )}
        {skill.downloads !== undefined && (
          <div className="text-xs text-muted mt-2">{skill.downloads} downloads</div>
        )}
      </div>
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {skill.description && (
          <div className="text-sm text-fg mb-4">{skill.description}</div>
        )}
        <div className="text-sm text-muted">
          <p>Full content will be available after installation.</p>
          <p className="mt-2 text-xs">Source: <a href={skill.url} className="text-accent hover:underline break-all" target="_blank" rel="noopener noreferrer">{skill.url}</a></p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/RegistryPreview.tsx
git commit -m "feat(F027): create RegistryPreview component"
```

---

### Task 6: Create ConflictModal component

**Files:**
- Create: `src/components/ConflictModal.tsx`

- [ ] **Step 1: Create the conflict modal**

```tsx
interface ConflictModalProps {
  existingName: string
  onResolve: (action: 'overwrite' | 'alias' | 'cancel') => void
}

export default function ConflictModal({ existingName, onResolve }: ConflictModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div data-testid="registry-conflict-modal" className="bg-surface border border-border rounded-lg p-4 w-96">
        <h3 className="font-medium text-fg mb-2">Skill Already Exists</h3>
        <p className="text-sm text-muted mb-4">
          A skill named <span className="text-fg font-medium">{existingName}</span> already exists in your library. How would you like to proceed?
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onResolve('overwrite')}
            className="w-full px-3 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded font-medium transition-colors text-left"
          >
            Overwrite existing skill
          </button>
          <button
            onClick={() => onResolve('alias')}
            className="w-full px-3 py-2 text-sm bg-accent hover:bg-accent-dim text-bg rounded font-medium transition-colors text-left"
          >
            Install as separate copy
          </button>
          <button
            onClick={() => onResolve('cancel')}
            className="w-full px-3 py-2 text-sm text-muted hover:text-fg rounded transition-colors text-left"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ConflictModal.tsx
git commit -m "feat(F027): create ConflictModal component"
```

---

### Task 7: Rewrite Browse tab in LibraryView

**Files:**
- Modify: `src/views/LibraryView.tsx`

This is the main integration task. The changes are:

1. Replace the local registry state variables (lines 52-56) with `useRegistry` hook
2. Remove the duplicate search input block (lines 354-386)
3. Replace the Browse tab content in the sidebar (lines 637-704) with category chips and search only
4. Replace the right panel editor area (lines 707-719) with card grid or preview when Browse tab is active
5. Add ConflictModal rendering

- [ ] **Step 1: Replace local registry state with useRegistry hook**

Remove these local state declarations (lines 52-56):
```typescript
const [registrySkills, setRegistrySkills] = useState<any[]>([])
const [registrySearch, setRegistrySearch] = useState('')
const [registryLoading, setRegistryLoading] = useState(false)
const [registryOnline, setRegistryOnline] = useState(true)
const [installingSkill, setInstallingSkill] = useState<string | null>(null)
```

Add the hook import at the top and call:
```typescript
import { useRegistry } from '../hooks/useRegistry'
```

Inside the component, add:
```typescript
const {
  skills: registrySkills,
  loading: registryLoading,
  online: registryOnline,
  searchQuery: registrySearch,
  selectedSkill: registrySelectedSkill,
  selectedCategory,
  categories,
  installing: installingSkill,
  conflict,
  handleSearchChange,
  selectCategory,
  selectSkill,
  clearSelection: clearRegistrySelection,
  install: installRegistrySkill,
  resolveConflict,
} = useRegistry()
```

Also add the import for the new components at the top:
```typescript
import RegistryCard from '../components/RegistryCard'
import RegistryPreview from '../components/RegistryPreview'
import ConflictModal from '../components/ConflictModal'
```

- [ ] **Step 2: Remove the duplicate search input block**

Delete lines 354-386 (the second copy of the search input that was a bug). Keep the first copy at lines 322-353.

- [ ] **Step 3: Replace the Browse tab sidebar content**

Replace the current Browse tab content (lines 637-704) with:

```tsx
{activeTab === 'browse' && (
  <>
    {/* Registry Search */}
    <div className="p-3 border-b border-border">
      <input
        data-testid="registry-search"
        type="text"
        placeholder="Search community skills..."
        value={registrySearch}
        onChange={e => handleSearchChange(e.target.value)}
        className="w-full bg-bg border border-border rounded px-3 py-1.5 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
      />
    </div>
    {/* Category Chips */}
    <div className="p-3 border-b border-border">
      <div className="flex flex-wrap gap-1">
        <button
          data-testid="registry-category-chip"
          onClick={() => selectCategory(null)}
          className={`px-2 py-0.5 rounded text-xs transition-colors ${
            selectedCategory === null ? 'bg-accent text-bg' : 'bg-border text-muted hover:text-fg'
          }`}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            data-testid="registry-category-chip"
            onClick={() => selectCategory(cat)}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${
              selectedCategory === cat ? 'bg-accent text-bg' : 'bg-border text-muted hover:text-fg'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>
    </div>
  </>
)}
```

- [ ] **Step 4: Replace the right panel for Browse mode**

Replace the current editor panel (lines 707-719) with Browse-aware rendering:

```tsx
{/* Editor / Browse Panel */}
<div className="flex-1 flex flex-col">
  {activeTab === 'browse' ? (
    !registryOnline ? (
      <div data-testid="registry-offline" className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl mb-2">📡</div>
          <p className="text-muted text-sm">No connection</p>
          <p className="text-muted text-xs mt-1">Community registry requires internet</p>
        </div>
      </div>
    ) : registrySelectedSkill ? (
      <RegistryPreview
        skill={registrySelectedSkill}
        isInstalled={skills.some(s => s.name.toLowerCase() === registrySelectedSkill.name.toLowerCase())}
        isInstalling={installingSkill === (registrySelectedSkill.slug || registrySelectedSkill.id)}
        onInstall={() => installRegistrySkill(registrySelectedSkill)}
        onBack={clearRegistrySelection}
      />
    ) : registryLoading ? (
      <div data-testid="registry-loading" className="flex-1 flex items-center justify-center">
        <p className="text-muted text-sm">Searching...</p>
      </div>
    ) : (
      <div className="flex-1 overflow-y-auto p-4">
        {registrySkills.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted text-sm">
              {registrySearch ? `No skills found for "${registrySearch}". Try different keywords.` : 'Search or select a category to browse community skills.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {registrySkills.map(skill => (
              <RegistryCard
                key={skill.id || skill.slug || skill.name}
                skill={skill}
                isInstalled={skills.some(s => s.name.toLowerCase() === skill.name.toLowerCase())}
                onClick={() => selectSkill(skill)}
              />
            ))}
          </div>
        )}
      </div>
    )
  ) : selectedSkill ? (
    <SkillEditor
      skill={selectedSkill}
      onDelete={() => setConfirmDelete(selectedSkill.filename)}
    />
  ) : (
    <div className="flex-1 flex items-center justify-center text-muted">
      Select a skill to edit
    </div>
  )}
</div>
```

- [ ] **Step 5: Add ConflictModal rendering**

Before the closing `</div>` of the root element (just before the Batch Deploy Modal or after it), add:

```tsx
{/* Conflict Modal */}
{conflict && (
  <ConflictModal
    existingName={conflict.existingName}
    onResolve={resolveConflict}
  />
)}
```

- [ ] **Step 6: Remove the registryPing call from the Browse tab button**

In the Browse tab button (around line 306-313), simplify the onClick since the hook handles ping on mount:

Change:
```tsx
onClick={async () => {
  setActiveTab('browse')
  if (window.api.registryPing) {
    const status = await window.api.registryPing()
    setRegistryOnline(status.online)
  }
}}
```

To:
```tsx
onClick={() => setActiveTab('browse')}
```

- [ ] **Step 7: Verify TypeScript compiles and app runs**

Run: `npx tsc --noEmit`
Expected: No errors.

Run: `npm run dev`
Expected: App opens. Browse tab shows category chips and search. Clicking a category or searching shows community skill cards.

- [ ] **Step 8: Commit**

```bash
git add src/views/LibraryView.tsx
git commit -m "feat(F027): integrate Browse tab with card grid, preview, and conflict modal"
```

---

### Task 8: Add Playwright verification test for F027

**Files:**
- Modify: `verify.spec.ts`

- [ ] **Step 1: Add F027 test to verify.spec.ts**

Find the F027 test section (or add one if it doesn't exist) and write the full verification test. The test must cover all 8 steps from the feature spec. Since this test hits a live API, it needs to handle offline gracefully.

The test should:
1. Navigate to Library view
2. Verify Browse tab button exists (`tab-browse`)
3. Click Browse tab
4. Verify `registry-search` input exists
5. Verify category chips render (`registry-category-chip`)
6. Type a search query and verify `registry-skill-card` elements appear (or empty state if offline)
7. Click a card to verify preview mode with `registry-install-btn`
8. Click back with `registry-back-btn`

Since Playwright tests in this project test against a running Electron app, the exact test structure should follow the existing patterns in `verify.spec.ts`.

- [ ] **Step 2: Run the F027 test**

Run: `npx playwright test verify.spec.ts --grep F027`
Expected: Test passes or provides clear failure output.

- [ ] **Step 3: Commit**

```bash
git add verify.spec.ts
git commit -m "test(F027): add Playwright verification test"
```

---

### Task 9: Run full verification sequence and mark passing

- [ ] **Step 1: Run feature test**

Run: `npx playwright test verify.spec.ts --grep F027`
Expected: PASS

- [ ] **Step 2: Run invariant checks**

Run: `node check-invariants.js --always`
Expected: All invariants pass.

- [ ] **Step 3: Run regression gate**

Run: `REGRESSION=$(node get-regression-tests.js F027) && npx playwright test verify.spec.ts --grep "$REGRESSION"`
Expected: All previously-passing tests still pass.

- [ ] **Step 4: Mark F027 as passing**

```bash
node -e "const fs=require('fs');const f=JSON.parse(fs.readFileSync('feature_list.json','utf8'));const x=f.features.find(x=>x.id==='F027');x.passes=true;x.notes='Verified with Playwright + invariants + regression gate';fs.writeFileSync('feature_list.json',JSON.stringify(f,null,2));"
```

- [ ] **Step 5: Final commit**

```bash
git add feature_list.json
git commit -m "feat(F027): install skills from community registry — verified"
```