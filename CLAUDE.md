# Skilldeck — Agent Project Bible

## What This Project Is

Skilldeck is a desktop application for managing AI agent skill files (SKILL.md, CLAUDE.md, AGENTS.md) across projects and tools. It solves three problems:

1. **Scatter** — skill files live in different places, copies diverge, starting a new project means rebuilding behavioral infrastructure from scratch
2. **Opacity** — no way to know which skills are active in a project, at what version, or whether they've drifted
3. **No verification** — no feedback mechanism to know if a skill file is actually changing agent behavior

Skilldeck is also a harness engineering experiment. It is being built by AI agents following harness methodology. The build process itself is the proof of concept.

## Rules Every Agent Must Follow

1. **Read before touching.** Before any coding session begins, read this file, `claude-progress.txt`, and `feature_list.json`. Do not skip this.
2. **One feature at a time. One feature, one commit.** Pick the highest-priority incomplete feature from `feature_list.json`. Complete it. Verify it passes with Playwright. Mark it passing. Commit. Then move to the next feature. The commit sequence for every feature is:
   ```bash
   # 1. Run the test — must pass before anything else
   npx playwright test verify.spec.ts --grep F00X

   # 2. Mark the feature passing
   node -e "const fs=require('fs');const f=JSON.parse(fs.readFileSync('feature_list.json','utf8'));const x=f.features.find(x=>x.id==='F00X');x.passes=true;x.notes='Verified with Playwright';fs.writeFileSync('feature_list.json',JSON.stringify(f,null,2));"

   # 3. Commit immediately — one feature per commit, no batching
   git add .
   git commit -m "feat(F00X): short description of what was built"
   ```
   Do not build two features and commit them together. Do not commit code that has no passing test. The git log is the audit trail — one commit per feature makes it readable and reversible.
3. **Never mark a feature as passing without verifying it.** Passing means: the feature works as a user would experience it — not that the code exists, not that it compiles, not that a unit test passed. **Verification protocol for UI features:** start the app, interact with the specific UI element described in the feature steps, observe the result. If you cannot run the app or interact with the UI, mark `passes: false` with note "NEEDS HUMAN VERIFICATION" — do NOT assume the UI works because the code looks correct. Code that exists but UI that does not respond is a FAILING feature.

   **The mandatory verification command before marking any feature passing:**
   ```bash
   npx playwright test verify.spec.ts --grep F001
   ```
   Replace F001 with the feature ID. If the test passes, you may mark the feature passing. If the test fails or errors, fix the issue first. If the feature has no test yet (F007, F010, F012, F013, F016, F017, F018), add a note "No automated test — requires human verification" and do not mark it passing without explicit human confirmation.
4. **Leave the environment clean at the end of every session.** Update `claude-progress.txt` with a session entry. The app must be in a working state — no broken code, no half-implemented features left uncommitted. If you started a feature and didn't finish it, revert the changes with `git checkout .` rather than leaving broken code in the working tree.
5. **Do not add features not in `feature_list.json`.** If you think something is missing, add a comment to `claude-progress.txt` under "Suggested additions" but do not implement it.
6. **Do not modify `feature_list.json` structure.** You may only update `passes` and `notes` fields. Never remove a feature. Never rewrite descriptions. **Always update feature_list.json using this Node command — never use string replace on JSON:**
```bash
node -e "const fs=require('fs');const f=JSON.parse(fs.readFileSync('feature_list.json','utf8'));const x=f.features.find(x=>x.id==='F001');x.passes=true;x.notes='notes here';fs.writeFileSync('feature_list.json',JSON.stringify(f,null,2));console.log('marked F001 passing');"
```
Replace `F001` with the actual feature ID. Replace the notes string as appropriate.
7. **Run `./init.sh` at the start of every session** to ensure the environment is in a working state before building. This works in Claude Code's bash environment on Windows. For manual PowerShell use, run `.\init.ps1` instead.
8. **If something is broken when you arrive, fix it before adding anything new.** A broken foundation makes everything built on top of it unreliable.
9. **If a Playwright test fails 3 times in a row on the same feature, stop.** Do not try a fourth approach. Write a blocker entry in `claude-progress.txt` with: what you tried all three times, the exact error output, your root cause hypothesis. Commit whatever is working. Then stop completely — do not move to the next feature. This rule is absolute and cannot be overridden by reasoning about "just one more approach."

## Stack

- **Runtime:** Electron 28+
- **Frontend:** React 18 + TypeScript
- **Build:** Vite
- **State:** Zustand
- **Styling:** Tailwind CSS
- **File I/O:** Node.js fs (via Electron main process)
- **IPC:** Electron contextBridge + ipcRenderer/ipcMain
- **CLI integration:** Node.js child_process (for Playground feature — Phase 2)
- **No backend. No cloud. No database.** Everything lives on the local filesystem.

## Testing Requirements

Every interactive UI element that corresponds to a feature in `feature_list.json` **must** have a `data-testid` attribute. This is not optional — the Playwright verification suite in `verify.spec.ts` depends on these selectors to test features programmatically.

Required `data-testid` values:
- Navigation: `nav-library`, `nav-projects`, `nav-settings`
- Views: `library-view`, `projects-view`, `settings-view`
- Library: `skill-item`, `new-skill-btn`, `skill-editor`, `save-btn`, `delete-skill`, `search-input`, `empty-state`
- Projects: `add-project-btn`, `project-name-input`, `project-path-input`, `confirm-add-project`
- Deployment: `deploy-btn`, `confirm-deploy`, `status-current`, `status-stale`

When building a component, add `data-testid` at the same time as the component — not after. Missing `data-testid` means the feature cannot be verified and cannot be marked passing.

## Repo Structure

```
skilldeck/
├── CLAUDE.md                  # This file — read first
├── claude-progress.txt        # Session log — read second
├── feature_list.json          # Ground truth for completion — read third
├── init.sh                    # Start the dev environment
├── package.json
├── vite.config.ts
├── electron/
│   ├── main.ts                # Electron main process
│   ├── preload.ts             # Context bridge
│   └── ipc/                   # IPC handlers (one file per domain)
│       ├── skills.ts
│       ├── projects.ts
│       └── filesystem.ts
├── src/
│   ├── main.tsx               # React entry
│   ├── App.tsx
│   ├── store/                 # Zustand stores (one per domain)
│   │   ├── skillsStore.ts
│   │   └── projectsStore.ts
│   ├── components/
│   │   ├── ui/                # Primitive UI components
│   │   ├── skills/            # Skill-domain components
│   │   └── projects/          # Project-domain components
│   ├── views/                 # Top-level route views
│   │   ├── LibraryView.tsx
│   │   ├── ProjectsView.tsx
│   │   └── SettingsView.tsx
│   └── types/
│       └── index.ts           # Shared TypeScript types
└── public/
```

## Data Model

### Skill File (on disk)
A skill file is a `.md` file with optional YAML frontmatter:
```
---
name: scope-killer
description: "..."
tags: [thinking, scoping]
---
# Content here
```

### Skilldeck Config (per user, stored at `~/.skilldeck/config.json`)
```json
{
  "libraryPath": "/Users/ali/.skilldeck/library",
  "projects": [
    {
      "id": "uuid",
      "name": "DataBridge",
      "path": "/Users/ali/projects/databridge",
      "skillsPath": ".claude/skills"
    }
  ]
}
```

### Deployment Record (stored at `~/.skilldeck/deployments.json`)
```json
{
  "projectId": {
    "skillName": {
      "deployedAt": "ISO timestamp",
      "libraryHash": "md5 of library version at deploy time",
      "currentHash": "md5 of deployed file now"
    }
  }
}
```

If `libraryHash !== currentHash`, the deployment is stale (file was modified after deploy).

## Design Aesthetic

Skilldeck is a developer tool. The aesthetic should be: **refined dark utility** — not flashy, not generic. Think Linear, Raycast, or Zed. Dark background, precise typography, tight spacing, subtle borders. Every pixel earns its place. No gradients for decoration. No rounded corners on everything. Information density over whitespace padding.

Primary color: a single muted accent (not blue — everyone uses blue). Consider slate + amber, or dark + warm white.

## Phase Boundaries

**Phase 1 (current):** Library + Projects + Deployment state. No AI calls. No Playground. No Decks. Just the file management foundation done properly.

**Phase 2:** Skill Playground (Claude Code CLI integration), A/B mode, Behavioral diff.

**Phase 3:** Deck system, Version history, Cross-agent translation.

Do not build Phase 2 or 3 features during Phase 1. If the urge arises, add to "Suggested additions" in `claude-progress.txt`.

## Autonomous Loop Protocol

When running autonomously (no human present), follow this loop exactly:

```
LOOP:
  1. Run ./init.sh
  2. Read claude-progress.txt
  3. Find next feature where passes = false in feature_list.json
  4. If none → all Phase 1 features pass → write final session entry → STOP
  5. Implement the feature
  6. Run: npx playwright test verify.spec.ts --grep F00X
  7. If test passes:
       - Mark feature passing in feature_list.json (Node command, not string replace)
       - Write session entry in claude-progress.txt
       - git add . && git commit -m "feat(F00X): description"
       - Go to LOOP
  8. If test fails:
       - Increment attempt counter for this feature
       - If attempt counter < 3: fix the issue, go to step 6
       - If attempt counter >= 3: STOP — write blocker entry in claude-progress.txt
         explaining exactly what was tried and what the error output was
```

**The stuck rule is absolute.** Three failed attempts on one feature = stop and surface the problem. Do not try a fourth approach. Do not move to the next feature. The human needs to unblock you — attempting more variations wastes context and makes the problem harder to diagnose.

**When stopping due to a blocker, the claude-progress.txt entry must include:**
- The feature ID and name
- All three approaches attempted (what you changed each time)
- The exact Playwright error output from the last attempt
- Your hypothesis about the root cause
- What you think needs to happen to unblock it