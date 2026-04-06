# Skilldeck Harness Package

This directory contains the harness initializer for the Skilldeck project.
These files must be copied into the root of the Skilldeck repo before any coding begins.

## Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project bible. Every agent reads this first. Stack, rules, structure, data model, design direction. |
| `feature_list.json` | Ground truth for Phase 1 completion. 18 features. Agents update `passes` and `notes` only. |
| `claude-progress.txt` | Cross-session memory. Every session reads this on arrival, writes to it on departure. |
| `init.sh` | Dev environment startup. Run at the start of every session. Verifies env, reports feature status, shows next feature. |

## How to start the first coding session (Windows)

```powershell
# 1. You already have the repo — you're in it
cd C:\projects\personal\skilldeck

# 2. Copy harness files into repo root
# (unzip skilldeck-harness.zip and copy contents here)

# 3. Allow PowerShell scripts to run (one-time, run as Administrator if needed)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# 4. Initial commit
git add .
git commit -m "harness: initialize project harness"

# 5. Start first coding session
.\init.ps1
```

## Agent session protocol

Every session follows this sequence without exception:

1. `Get-Content CLAUDE.md` — understand the project
2. `Get-Content claude-progress.txt` — understand what happened last session
3. `Get-Content feature_list.json` — see what's passing and what's next
4. `.\init.ps1` — verify environment health
5. Work on the next incomplete feature end-to-end
6. Verify it passes manually
7. Update `feature_list.json` — set `passes: true` and add notes
8. Update `claude-progress.txt` — write session entry
9. `git add . && git commit -m "feat: [description]"`

## Phase boundaries

**Phase 1 (this harness):** Foundation — Library, Projects, Deployment state. 18 features.
**Phase 2:** Skill Playground, A/B mode, Behavioral diff.
**Phase 3:** Deck system, Version history, Cross-agent translation.

Do not build Phase 2 or 3 features during Phase 1.
