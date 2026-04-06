# F019: Scan Machine for All Skill Locations

**Date:** 2026-04-06
**Feature ID:** F019
**Phase:** 2

## Summary

On startup and via a manual Scan button, Skilldeck scans all known skill locations on the machine and shows discovered skills in the library view with source badges. Skills found outside `~/.skilldeck/library/` are shown but not copied — the source badge indicates origin.

## Data Model

### Skill Type Changes

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

type SourceType = 'skilldeck' | 'claude-code' | 'agent-protocol' | 'codex' | string  // string for `project:ProjectName`
```

### Source Values

| Source | Location Pattern | Badge Color |
|--------|-----------------|-------------|
| `skilldeck` | `~/.skilldeck/library/*.md` | green |
| `claude-code` | `~/.claude/skills/*/SKILL.md` or `~/.claude/commands/*.md` | orange |
| `agent-protocol` | `~/.agents/skills/*/SKILL.md` | blue |
| `codex` | `~/.codex/skills/*/SKILL.md` | purple |
| `project:ProjectName` | `[project.path]/[project.skillsPath]/*.md` | gray |

### Badge Color Classes

```
skilldeck:     bg-green-900/50 text-green-400
claude-code:   bg-orange-900/50 text-orange-400
agent-protocol: bg-blue-900/50 text-blue-400
codex:         bg-purple-900/50 text-purple-400
project:*:     bg-gray-700/50 text-gray-300
```

## Locations Scanned

1. **Skilldeck library** - `config.libraryPath` (default: `~/.skilldeck/library/`)
   - Flat `.md` files
   
2. **Claude Code skills** - `~/.claude/skills/*/SKILL.md`
   - Subdirectories with `SKILL.md` file
   
3. **Claude Code commands** - `~/.claude/commands/*.md`
   - Flat `.md` files
   
4. **Agent Protocol** - `~/.agents/skills/*/SKILL.md`
   - Subdirectories with `SKILL.md` file
   
5. **Codex** - `~/.codex/skills/*/SKILL.md`
   - Subdirectories with `SKILL.md` file
   
6. **Registered projects** - For each project in `config.projects`:
   - `[project.path]/[project.skillsPath]/*.md`
   - Source value: `project:[project.name]`

## IPC Handler

### scan:all

Returns all discovered skills from all locations.

```typescript
ipcMain.handle('scan:all', async () => {
  const config = getConfig()
  const homedir = app.getPath('home')
  const results: ScannedSkill[] = []
  
  // 1. Skilldeck library
  results.push(...scanDirectory(config.libraryPath, 'skilldeck'))
  
  // 2. Claude Code skills
  results.push(...scanSkillDirs(path.join(homedir, '.claude/skills'), 'claude-code'))
  
  // 3. Claude Code commands
  results.push(...scanDirectory(path.join(homedir, '.claude/commands'), 'claude-code'))
  
  // 4. Agent Protocol
  results.push(...scanSkillDirs(path.join(homedir, '.agents/skills'), 'agent-protocol'))
  
  // 5. Codex
  results.push(...scanSkillDirs(path.join(homedir, '.codex/skills'), 'codex'))
  
  // 6. Registered projects
  for (const project of config.projects) {
    const projectPath = path.join(project.path, project.skillsPath)
    results.push(...scanDirectory(projectPath, `project:${project.name}`))
  }
  
  return results
})
```

### Helper Functions

```typescript
// Scan flat directory for .md files
function scanDirectory(dir: string, source: string): ScannedSkill[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(filename => parseSkill(path.join(dir, filename), source))
}

// Scan subdirectories for SKILL.md files
function scanSkillDirs(dir: string, source: string): ScannedSkill[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(dir, d.name, 'SKILL.md'))
    .filter(f => fs.existsSync(f))
    .map(f => parseSkill(f, source))
}
```

### Preload Additions

```typescript
scanAll: () => ipcRenderer.invoke('scan:all')
```

## Frontend Changes

### skillStore.ts

```typescript
interface SkillState {
  // ... existing fields
  allSkills: Skill[]  // Combined library + scan results
  scanning: boolean
  
  // ... existing methods
  loadAllSkills: () => Promise<void>  // Library + scan
}
```

### LibraryView.tsx

- Add `data-testid="scan-btn"` button next to New Skill button
- Run `loadAllSkills()` on mount (background)
- Show loading spinner during scan
- Render source badge on each skill card

### UI Layout

```
┌─────────────────────────────────────────────────────┐
│ [Search input]                                      │
├─────────────────────────────────────────────────────┤
│ Filter by tag    [Clear]                           │
│ [tag1] [tag2] [tag3]                               │
├─────────────────────────────────────────────────────┤
│ [+ New Skill] [🔄 Scan]                             │
├─────────────────────────────────────────────────────┤
│ Skill Name                     [source-badge]       │
│ Description...                                      │
│ [tags]                                              │
├─────────────────────────────────────────────────────┤
│ ...                                                 │
└─────────────────────────────────────────────────────┘
```

## Error Handling

- **Missing directory:** Skip silently, return empty array
- **Permission denied:** Log warning, continue scanning other locations
- **Invalid file content:** Use filename as name, empty description
- **Malformed frontmatter:** Parse what's possible, don't crash

## Performance

- Scan runs asynchronously, doesn't block UI
- No caching - fresh disk read each time
- Scan button shows loading state during operation

## Test Strategy

Playwright test:

1. Create mock skill directories before app loads:
   - `~/.claude/skills/test-skill/SKILL.md`
   - `~/.agents/skills/agent-skill/SKILL.md`
   - `~/.skilldeck/library/library-skill.md`
   
2. Launch app
   
3. Verify:
   - All 3 skills appear in library
   - Each shows correct source badge
   - Badge colors match expected

4. Click Scan button
   - Verify scan completes
   - Add a new skill file
   - Click Scan again
   - Verify new skill appears

## Duplicate Handling

When same skill name exists in multiple locations:
- Show all copies as separate list items
- Each has its own source badge
- User can see full picture of what's on their machine

## Scope

This feature:
- ✅ Scans all locations
- ✅ Shows source badges
- ✅ Manual Scan button
- ✅ Background scan on startup

Out of scope (future features):
- ❌ Source filter UI (F020)
- ❌ Deploy to multiple locations (F021)
- ❌ Divergence detection (F022)