#!/bin/bash

# Skilldeck — Dev Environment Init
# Works in Claude Code on Windows (Git Bash / WSL environment)
# Also runnable manually in Git Bash
# For PowerShell manual use: run init.ps1 instead

echo "=== Skilldeck Init ==="
echo ""

# 1. Verify we're in the right directory
if [ ! -f "CLAUDE.md" ]; then
  echo "ERROR: CLAUDE.md not found. Are you in the skilldeck root directory?"
  exit 1
fi
echo "✓ In correct directory: $(pwd)"

# 2. Check Node version
if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js not found. Install Node 18+ from https://nodejs.org"
  exit 1
fi
echo "✓ Node: $(node --version)"

# 3. Check npm
echo "✓ npm: $(npm --version)"

# 4. Check git — initialize if not already a repo
if ! command -v git &> /dev/null; then
  echo "ERROR: git not found. Install git before proceeding."
  exit 1
fi

if [ ! -d ".git" ]; then
  echo "→ No git repo found. Initializing..."
  git init
  git add .
  git commit -m "harness: initialize project harness"
  echo "✓ Git repo initialized with harness files committed"
else
  echo "✓ Git repo present"
  # Show last commit so agent knows where things stand
  echo "  Last commit: $(git log --oneline -1)"
  # Warn if there are uncommitted changes from a previous session
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "⚠ WARNING: Uncommitted changes detected from previous session."
    echo "  Either commit them (if a feature is complete and tested)"
    echo "  or revert them: git checkout ."
    echo "  Do NOT build on top of uncommitted broken code."
  fi
fi

# 4. Only install deps if package.json exists
if [ ! -f "package.json" ]; then
  echo "⚠ package.json not found — project not scaffolded yet."
  echo "  First session should scaffold the Electron + React + Vite project."
  echo "  See F001 in feature_list.json."
  echo ""
  echo "=== Feature Status ==="
  node -e "
    const f = require('./feature_list.json');
    const total = f.features.length;
    const passing = f.features.filter(x => x.passes).length;
    console.log('Phase 1 features: ' + passing + ' / ' + total + ' passing');
  "
  echo ""
  echo "=== Next Feature ==="
  node -e "
    const f = require('./feature_list.json');
    const next = f.features.find(x => !x.passes);
    if (next) {
      console.log('ID:          ' + next.id);
      console.log('Name:        ' + next.name);
      console.log('Description: ' + next.description);
    }
  "
  echo ""
  echo "=== Init Complete ==="
  echo "No package.json yet. Scaffold the project first (see F001)."
  exit 0
fi

# 5. Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
  echo "→ node_modules missing, running npm install..."
  npm install
else
  echo "✓ node_modules present"
fi

# 6. Check TypeScript compiles (only if tsconfig exists)
if [ -f "tsconfig.json" ]; then
  echo "→ Checking TypeScript..."
  if npx tsc --noEmit 2>/dev/null; then
    echo "✓ TypeScript: no errors"
  else
    echo "⚠ TypeScript: errors found (check before proceeding)"
  fi
else
  echo "⚠ tsconfig.json not found — skipping TypeScript check"
fi

# 7. Report feature status
echo ""
echo "=== Feature Status ==="
node -e "
  const f = require('./feature_list.json');
  const total = f.features.length;
  const passing = f.features.filter(x => x.passes).length;
  console.log('Phase 1 features: ' + passing + ' / ' + total + ' passing');
"

# 8. Show next feature to work on
echo ""
echo "=== Next Feature ==="
node -e "
  const f = require('./feature_list.json');
  const next = f.features.find(x => !x.passes);
  if (next) {
    console.log('ID:          ' + next.id);
    console.log('Name:        ' + next.name);
    console.log('Description: ' + next.description);
  } else {
    console.log('ALL PHASE 1 FEATURES PASSING. Move to Phase 2.');
  }
"

echo ""
echo "=== Init Complete ==="
echo "Read claude-progress.txt for context on the last session."
echo "Then begin work on the feature shown above."
echo ""
echo "To verify a feature before marking it passing:"
echo "  npx playwright test verify.spec.ts --grep F001"
echo "  (replace F001 with the actual feature ID)"
echo ""
echo "To run all verification tests:"
echo "  npx playwright test verify.spec.ts"
echo ""
echo "To mark a feature as passing (only after verify passes):"
echo "  node -e \"const fs=require('fs');const f=JSON.parse(fs.readFileSync('feature_list.json','utf8'));const x=f.features.find(x=>x.id==='F001');x.passes=true;x.notes='notes';fs.writeFileSync('feature_list.json',JSON.stringify(f,null,2));console.log('done');\""
echo "  (replace F001 with the actual feature ID)"
echo ""
