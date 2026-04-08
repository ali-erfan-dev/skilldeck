#!/usr/bin/env node

/**
 * get-regression-tests.js
 *
 * Derives which previously-passing Playwright tests need to re-run
 * based on what files the agent just changed.
 *
 * Usage:
 *   node get-regression-tests.js F011
 *   → outputs a grep pattern for npx playwright test
 *
 * How it works:
 * 1. Gets the list of files changed since last commit (git diff)
 * 2. Matches changed files against the surfaces map in system-contract.json
 * 3. Finds all features that share those surfaces
 * 4. Filters to only features that are currently passing (passes: true)
 * 5. Returns them as a grep pattern for Playwright
 *
 * Example output:
 *   F004|F005|F006|F009|F011
 *
 * Use in commit sequence:
 *   REGRESSION=$(node get-regression-tests.js F011)
 *   npx playwright test verify.spec.ts --grep "$REGRESSION"
 */

const fs = require('fs')
const { execSync } = require('child_process')

const contract = JSON.parse(fs.readFileSync('system-contract.json', 'utf8'))
const featureList = JSON.parse(fs.readFileSync('feature_list.json', 'utf8'))

const newFeatureId = process.argv[2]

if (!newFeatureId) {
  console.error('Usage: node get-regression-tests.js <feature-id>')
  console.error('Example: node get-regression-tests.js F011')
  process.exit(1)
}

// 1. Get changed files since last commit
let changedFiles = []
try {
  const output = execSync('git diff --name-only HEAD', { encoding: 'utf8' })
  changedFiles = output.trim().split('\n').filter(Boolean)
} catch (e) {
  // No commits yet — treat all source files as changed
  changedFiles = ['electron/main.ts', 'electron/preload.ts', 'src/store/skillsStore.ts']
}

if (changedFiles.length === 0) {
  // Nothing changed — no regression needed beyond the new feature itself
  console.log(newFeatureId)
  process.exit(0)
}

// 2. Find which surfaces are touched by the changed files
const touchedSurfaces = new Set()
const allSurfaces = { ...contract.surfaces, ...contract.phase_2_surfaces }

for (const [surfaceName, surface] of Object.entries(allSurfaces)) {
  for (const changedFile of changedFiles) {
    if (surface.files.some(f => changedFile.includes(f) || f.includes(changedFile))) {
      touchedSurfaces.add(surfaceName)
    }
  }
}

// 3. Find all features affected by those surfaces
const affectedFeatureIds = new Set()
affectedFeatureIds.add(newFeatureId) // always include the new feature itself

for (const surfaceName of touchedSurfaces) {
  const surface = allSurfaces[surfaceName]
  if (surface && surface.affected_features) {
    surface.affected_features.forEach(id => affectedFeatureIds.add(id))
  }
}

// 4. Filter to only currently-passing features (don't re-run features that are already failing)
const passingFeatureIds = new Set(
  featureList.features
    .filter(f => f.passes === true)
    .map(f => f.id)
)

// Always run smoke tests (F001, F002, F003) if they're passing
;['F001', 'F002', 'F003'].forEach(id => {
  if (passingFeatureIds.has(id)) affectedFeatureIds.add(id)
})

const toRun = [...affectedFeatureIds].filter(id =>
  id === newFeatureId || passingFeatureIds.has(id)
)

// 5. Output as grep pattern
if (toRun.length === 0) {
  console.log(newFeatureId)
} else {
  console.log(toRun.join('|'))
}

// Debug output to stderr (doesn't affect the grep pattern on stdout)
process.stderr.write(`\nRegression analysis for ${newFeatureId}:\n`)
process.stderr.write(`  Changed files: ${changedFiles.join(', ')}\n`)
process.stderr.write(`  Touched surfaces: ${[...touchedSurfaces].join(', ') || 'none'}\n`)
process.stderr.write(`  Tests to run: ${toRun.join(', ')}\n\n`)
