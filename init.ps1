# Skilldeck — Dev Environment Init
# Run this at the start of every agent session before touching any code.
# Usage: .\init.ps1

Write-Host "=== Skilldeck Init ===" -ForegroundColor Cyan
Write-Host ""

# 1. Verify we're in the right directory
if (-not (Test-Path "CLAUDE.md")) {
  Write-Host "ERROR: CLAUDE.md not found. Are you in the skilldeck root directory?" -ForegroundColor Red
  exit 1
}
Write-Host "✓ In correct directory: $(Get-Location)" -ForegroundColor Green

# 2. Check Node version
try {
  $nodeVersion = node --version 2>&1
  Write-Host "✓ Node: $nodeVersion" -ForegroundColor Green
} catch {
  Write-Host "ERROR: Node.js not found. Install Node 18+ from https://nodejs.org" -ForegroundColor Red
  exit 1
}

# 3. Check npm
$npmVersion = npm --version 2>&1
Write-Host "✓ npm: $npmVersion" -ForegroundColor Green

# 4. Install dependencies if node_modules is missing
if (-not (Test-Path "node_modules")) {
  Write-Host "→ node_modules missing, running npm install..." -ForegroundColor Yellow
  npm install
} else {
  Write-Host "✓ node_modules present" -ForegroundColor Green
}

# 5. Check TypeScript compiles
Write-Host "→ Checking TypeScript..." -ForegroundColor Yellow
$tsResult = npx tsc --noEmit 2>&1
if ($LASTEXITCODE -eq 0) {
  Write-Host "✓ TypeScript: no errors" -ForegroundColor Green
} else {
  Write-Host "⚠ TypeScript: errors found (check before proceeding)" -ForegroundColor Yellow
  Write-Host $tsResult
}

# 6. Report feature status
Write-Host ""
Write-Host "=== Feature Status ===" -ForegroundColor Cyan
$features = Get-Content "feature_list.json" | ConvertFrom-Json
$total = $features.features.Count
$passing = ($features.features | Where-Object { $_.passes -eq $true }).Count
Write-Host "Phase 1 features: $passing / $total passing" -ForegroundColor White

# 7. Show next feature to work on
Write-Host ""
Write-Host "=== Next Feature ===" -ForegroundColor Cyan
$next = $features.features | Where-Object { $_.passes -eq $false } | Select-Object -First 1
if ($next) {
  Write-Host "ID:          $($next.id)" -ForegroundColor White
  Write-Host "Name:        $($next.name)" -ForegroundColor White
  Write-Host "Description: $($next.description)" -ForegroundColor White
} else {
  Write-Host "ALL PHASE 1 FEATURES PASSING. Move to Phase 2." -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Init Complete ===" -ForegroundColor Cyan
Write-Host "Read claude-progress.txt for context on the last session."
Write-Host "Then begin work on the feature shown above."
Write-Host ""
