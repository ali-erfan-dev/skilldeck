# F027: Install Skills from Community Registry — Design

## Overview

A Browse tab in the Library view that allows users to discover and install community skills from the agent-skills.cc registry. Skilldeck wraps the existing npx skills ecosystem rather than building a new registry. Users can search by keyword, browse by category, preview skill content before installing, and handle name conflicts gracefully. Works offline with a clear message when internet is unavailable.

## Architecture

**Approach: Extend LibraryView in-place**

When `activeTab === 'browse'`, the right panel (normally the skill editor) becomes the Browse area. No new routes, no new Zustand store. A `useRegistry` hook encapsulates tab-local state.

**Layout (Browse tab active):**
- Left sidebar (w-72): tab bar, search input, category filter chips
- Right panel: card grid (default) or skill preview (when a card is selected)

**New files:**
- `src/hooks/useRegistry.ts` — hook for all registry state and actions
- `src/types/index.ts` — add `RegistrySkill` interface

**No changes to:** Zustand stores, IPC handlers, preload bridge. The existing `registry:search`, `registry:install`, `registry:ping` APIs are sufficient.

## RegistrySkill Type

Added to `src/types/index.ts`:

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

Replaces the current `any[]` return type for `registrySearch` in `window.d.ts`.

## useRegistry Hook

File: `src/hooks/useRegistry.ts`

**State:**
- `skills: RegistrySkill[]` — current search/category results
- `loading: boolean` — whether a search is in progress
- `online: boolean` — registry connectivity status
- `searchQuery: string` — current search text
- `selectedSkill: RegistrySkill | null` — skill being previewed
- `selectedCategory: string | null` — active category filter
- `categories: string[]` — available categories (from API or hardcoded fallback)
- `installing: string | null` — slug of skill currently installing
- `conflict: { skill: RegistrySkill; existingName: string } | null` — name collision state

**Actions:**
- `search(query)` — debounced 300ms, calls `window.api.registrySearch(query)`
- `selectCategory(cat)` — calls `window.api.registrySearch(cat)` with category as query
- `selectSkill(skill)` — sets `selectedSkill` for preview mode
- `clearSelection()` — returns to grid from preview
- `install(skill)` — checks local skills for name conflict, then calls `window.api.registryInstall(skill.url)`. On conflict, sets `conflict` state
- `resolveConflict(action: 'overwrite' | 'alias' | 'cancel')` — overwrites existing, installs with suffixed filename, or cancels

**Initialization:**
1. Call `registryPing` to check connectivity
2. If online, try fetching categories from API (`/v1/categories`). If that fails, use hardcoded fallback: `['thinking', 'coding', 'writing', 'planning', 'debugging', 'workflow', 'review', 'testing']`
3. Load initial set of skills (empty search query to show popular/trending)

## Browse Tab UI

### Category Chips (left sidebar, below search)
- Row of small filter chips with active state highlight
- "All" chip clears category filter
- `data-testid="registry-category-chip"` on each chip

### Card Grid (right panel, grid mode)
- Responsive grid (`grid-cols-2 lg:grid-cols-3`)
- Each card shows: name, truncated description, author, first 2-3 tags, download count if available
- Subtle hover state consistent with dark utility aesthetic
- `data-testid="registry-skill-card"` on each card
- Clicking a card enters preview mode

### Preview Panel (right panel, preview mode)
- Full skill content rendered as markdown
- Header: skill name, author, tags, install button
- Install button text: "Install" for new skills, "Reinstall" if already in library
- Back button returns to grid
- `data-testid="registry-install-btn"`, `data-testid="registry-back-btn"`

### Conflict Modal
- Triggered when installing a skill whose name matches an existing local skill
- Message: "A skill named X already exists in your library"
- Three buttons: Overwrite, Install as alias, Cancel
- `data-testid="registry-conflict-modal"`

### Offline State
- Centered message with icon: "No connection — community registry requires internet"
- `data-testid="registry-offline"`

### Loading State
- Skeleton cards or spinner while searching
- `data-testid="registry-loading"`

### Empty State
- No results: "No skills found for 'query'. Try different keywords."

## Data Flow

### Search Flow
1. User types in search → 300ms debounce → `useRegistry.search(query)` → `window.api.registrySearch(query)` → results populate grid
2. User clicks category chip → `useRegistry.selectCategory(cat)` → `window.api.registrySearch(cat)` → results filtered
3. Search + category: selecting category replaces query; typing in search clears category

### Install Flow
1. User clicks Install in preview → `useRegistry.install(skill)`
2. Hook checks local skills for name conflict via `skillStore.skills`
3. No conflict: `window.api.registryInstall(skill.url)` → on success, `skillStore.loadSkills()` → replace install button text with "Installed" (disabled, 2s) then revert
4. Conflict: set `conflict` state → show modal
5. Overwrite: delete existing skill, then install
6. Alias: install with suffixed filename (e.g., `scope-killer-community.md`)
7. Cancel: close modal, no action

### Offline Handling
- On mount: `registryPing` checks connectivity
- If offline: hide grid, show offline message
- If search/install fails with network error: set `online=false`, show offline message
- Already-installed skills remain accessible (local)

## Source Badge

Add `community` style to `SourceBadge.tsx` for skills installed from the registry. Color: amber/warm to distinguish from local sources. Skills installed from the registry get `source: 'community'` in their Skill object.

## Testing (Playwright)

All 8 verification steps from F027:

1. Open Library view — verify Browse tab is visible (`browse-tab`)
2. Click Browse tab — verify community skills are loaded (`registry-skill-card` elements appear)
3. Search for "scope" — verify relevant community skills appear
4. Verify each result shows name, description, source, and install button
5. Click Install on a skill — verify it appears in personal library (My Skills tab)
6. Verify installed skill has source badge indicating community origin
7. Disconnect from internet — verify Browse tab shows graceful offline message (`registry-offline`)
8. Verify already-installed skills show "Reinstall" option

**data-testid additions:**
- `browse-tab`, `registry-skill-card`, `registry-search` (existing), `registry-install-btn`, `registry-back-btn`, `registry-conflict-modal`, `registry-offline`, `registry-loading`, `registry-category-chip`

**Invariant surfaces touched:**
- `store.skills` — adding `community` source badge
- `types` — adding `RegistrySkill` interface
- `preload` — no changes needed (existing registry APIs sufficient)
- `discovery.scanner` — no changes (installed skills become visible via scan)