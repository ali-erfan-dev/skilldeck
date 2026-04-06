# F019: Scan Machine for All Skill Locations

**Feature ID:** F019
**Phase:** 2
**Category:** Discovery
**Date:** 2026-04-06

## Summary

Skilldeck scans known skill locations on the machine and shows all discovered skills in the library view with source badges indicating origin.

## Requirements

From feature_list.json:
- Scan on startup and via manual Scan button
- Locations: ~/.claude/skills/*/SKILL.md, ~/.claude/commands/*.md, ~/.agents/skills/*/SKILL.md, ~/.codex/skills/*/SKILL.md, ~/.skilldeck/library/*.md, and project skills paths
- Skills shown with source badge, not copied
- Handle duplicates (same skill in multiple locations)

## Design Decisions

1. **Duplicates:** Show all copies - each file appears as separate skill item with source badge
2. **Startup behavior:** Scan runs in background after app loads (non-blocking)
3. **Badge style:** Color-coded by source for easy visual scanning

## Data Model

### Skill Type Extension

```typescript
interface Skill {
  filename: string
  name: string
  description: string
  tags: string[]
  hash: string
  content: string
  source: SourceType
  sourcePath: string  // Full path where file was found
}

type SourceType =
  | 'skilldeck'
  | 'claude-code'
  | 'agent-protocol'
  | 'codex'
  | `project:${string}`
```

### Source Badge Colors

| Source | Tailwind Classes |
|--------|------------------|
| skilldeck | `bg-green-900/50 text-green-400` |
| claude-code | `bg-orange-900/50 text-orange-400` |
| agent-protocol | `bg-blue-900/50 text-blue-400` |
| codex | `bg-purple-900/50 text-purple-400` |
| project:* | `bg-gray-700/50 text-gray-300` |

## Architecture

### IPC Handler

Single `scan:all` handler returns all discovered skills:

```typescript
ipcMain.handle('scan:all', async () => {
  const results: ScannedSkill[] = []

  // 1. Skilldeck library
  results.push(...scanDirectory(config.libraryPath, 'skilldeck'))

  // 2. Claude Code skills
  results.push(...scanSkillDirs('~/.claude/skills', 'claude-code'))

  // 3. Claude Code commands
  results.push(...scanDirectory('~/.claude/commands', 'claude-code'))

  // 4. Agent Protocol
  results.push(...scanSkillDirs('~/.agents/skills', 'agent-protocol'))

  // 5. Codex
  results.push(...scanSkillDirs('~/.codex/skills', 'codex'))

  // 6. Registered projects
  for (const project of config.projects) {
    results.push(...scanDirectory(project.skillsPath, `project:${project.name}`))
  }

  return results
})
```

### Helper Functions

```typescript
// Scan flat directory for .md files
function scanDirectory(dir: string, source: SourceType): ScannedSkill[]

// Scan subdirectories for SKILL.md files
function scanSkillDirs(dir: string, source: SourceType): ScannedSkill[]
```

### Preload Bridge

```typescript
// Add to window.api
scanAll: () => ipcRenderer.invoke('scan:all')
```

## Frontend Changes

### skillStore

```typescript
interface SkillState {
  // Existing
  skills: Skill[]
  selectedSkill: Skill | null
  // ... other existing fields

  // New
  allSkills: Skill[]  // Library + scanned skills
  scanning: boolean

  // Modified
  loadAllSkills: () => Promise<void>  // Load library + scan
}
```

### LibraryView

- Add Scan button next to New Skill button
- Show source badge on each skill card
- Run background scan on mount
- Show loading state while scanning

### UI Layout

```
┌─────────────────────────────────────────────────────┐
│ [Search input]                                      │
├─────────────────────────────────────────────────────┤
│ Filter by tag    [Clear]                           │
│ [tag1] [tag2] [tag3]                               │
├─────────────────────────────────────────────────────┤
│ [+ New Skill] [🔄 Scan]                            │
├─────────────────────────────────────────────────────┤
│ Skill Name                     [source-badge]       │
│ Description...                                      │
│ [tags]                                              │
├─────────────────────────────────────────────────────┤
│ ...                                                 │
└─────────────────────────────────────────────────────┘
```

## Error Handling

- Missing directories: skip silently
- Unreadable files: log warning, continue
- Malformed frontmatter: use filename as name, empty description
- Permission errors: log and continue

## Testing

### Playwright Test

1. Create mock skill directories before app loads:
   - ~/.claude/skills/test-skill/SKILL.md
   - ~/.agents/skills/other-skill/SKILL.md
2. Launch app
3. Verify skills appear with correct source badges
4. Click Scan button
5. Verify scan refreshes results
6. Clean up test directories

### Test IDs

- `scan-btn` - Scan button
- `source-badge` - Source badge on skill card
- `scanning-indicator` - Loading spinner during scan

## Implementation Order

1. Update Skill type with source fields
2. Add scan helper functions in main.ts
3. Add scan:all IPC handler
4. Update preload.ts
5. Update skillStore with scan state
6. Update LibraryView with Scan button and badges
7. Add Playwright test

## Scope

**In scope:**
- Scanning all specified locations
- Displaying source badges
- Manual Scan button
- Background scan on startup

**Out of scope (future features):**
- Source filtering (F020)
- Cross-tool sync (F021)
- Divergence detection (F022)