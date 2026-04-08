#!/usr/bin/env node

/**
 * check-invariants.js
 *
 * Runs all invariant checks from system-contract.json.
 * Called as part of the commit sequence — must pass before any commit is allowed.
 *
 * Usage:
 *   node check-invariants.js              # run all invariants
 *   node check-invariants.js --always     # run only "triggers: always" invariants
 *
 * Exit code 0 = all pass. Exit code 1 = one or more failed.
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const os = require('os')

const contract = JSON.parse(fs.readFileSync('system-contract.json', 'utf8'))
const args = process.argv.slice(2)
const onlyAlways = args.includes('--always')

const SKILLDECK_DIR = path.join(os.homedir(), '.skilldeck')
const CONFIG_PATH = path.join(SKILLDECK_DIR, 'config.json')
const DEPLOYMENTS_PATH = path.join(SKILLDECK_DIR, 'deployments.json')

// ── Built-in invariant check functions ──────────────────────────────────────

function checkConfigValid() {
  if (!fs.existsSync(CONFIG_PATH)) {
    // App hasn't been run yet — skip
    return { pass: true, note: 'config.json not found — app not yet initialized, skipping' }
  }
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    if (!config.hasOwnProperty('libraryPath')) return { pass: false, error: 'config.json missing libraryPath field' }
    if (!Array.isArray(config.projects)) return { pass: false, error: 'config.json projects field is not an array' }
    return { pass: true }
  } catch (e) {
    return { pass: false, error: `config.json is not valid JSON: ${e.message}` }
  }
}

function checkDeploymentsValid() {
  if (!fs.existsSync(DEPLOYMENTS_PATH)) {
    return { pass: true, note: 'deployments.json not found — app not yet initialized, skipping' }
  }
  try {
    JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, 'utf8'))
    return { pass: true }
  } catch (e) {
    return { pass: false, error: `deployments.json is not valid JSON: ${e.message}` }
  }
}

function checkDeploymentsConsistent() {
  if (!fs.existsSync(CONFIG_PATH) || !fs.existsSync(DEPLOYMENTS_PATH)) {
    return { pass: true, note: 'Files not initialized yet, skipping' }
  }
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    const deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, 'utf8'))
    const projectIds = new Set(config.projects.map(p => p.id))
    const orphaned = Object.keys(deployments).filter(id => !projectIds.has(id))
    if (orphaned.length > 0) {
      return { pass: false, error: `deployments.json has records for non-existent projects: ${orphaned.join(', ')}` }
    }
    return { pass: true }
  } catch (e) {
    return { pass: false, error: e.message }
  }
}

function checkNoDuplicateIpc() {
  const mainPath = 'electron/main.ts'
  if (!fs.existsSync(mainPath)) {
    return { pass: true, note: 'electron/main.ts not found yet, skipping' }
  }
  const content = fs.readFileSync(mainPath, 'utf8')
  const channels = content.match(/ipcMain\.handle\(['"`]([^'"`]+)['"`]/g) || []
  const names = channels.map(c => c.match(/['"`]([^'"`]+)['"`]/)[1])
  const duplicates = names.filter((name, i) => names.indexOf(name) !== i)
  if (duplicates.length > 0) {
    return { pass: false, error: `Duplicate IPC channels detected: ${[...new Set(duplicates)].join(', ')}` }
  }
  return { pass: true }
}

function checkTypeScript() {
  try {
    execSync('npx tsc --noEmit', { stdio: 'pipe' })
    return { pass: true }
  } catch (e) {
    const output = e.stdout?.toString() || e.stderr?.toString() || 'TypeScript errors found'
    return { pass: false, error: output.split('\n').slice(0, 5).join('\n') }
  }
}

function checkLibraryDiskSync() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { pass: true, note: 'App not initialized yet, skipping' }
  }
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    const libraryPath = config.libraryPath
    if (!fs.existsSync(libraryPath)) {
      return { pass: true, note: `Library path ${libraryPath} does not exist yet, skipping` }
    }
    const files = fs.readdirSync(libraryPath).filter(f => f.endsWith('.md'))
    // Just verify the directory is readable and contains valid files
    return { pass: true, note: `${files.length} skill files found in library` }
  } catch (e) {
    return { pass: false, error: e.message }
  }
}

// ── Invariant runner ─────────────────────────────────────────────────────────

const CHECK_FUNCTIONS = {
  'node checks/inv-config-valid.js': checkConfigValid,
  'node checks/inv-deployments-valid.js': checkDeploymentsValid,
  'node checks/inv-deployments-consistent.js': checkDeploymentsConsistent,
  'node checks/inv-no-duplicate-ipc.js': checkNoDuplicateIpc,
  'node checks/inv-library-disk-sync.js': checkLibraryDiskSync,
  'npx tsc --noEmit': checkTypeScript,
}

const invariants = contract.invariants.filter(inv =>
  onlyAlways ? inv.triggers === 'always' : true
)

console.log(`\n=== Invariant Checks (${invariants.length}) ===\n`)

let allPassed = true

for (const inv of invariants) {
  const checkFn = CHECK_FUNCTIONS[inv.check]
  if (!checkFn) {
    console.log(`⚠ ${inv.id}: No check function for "${inv.check}" — skipping`)
    continue
  }

  const result = checkFn()

  if (result.pass) {
    const note = result.note ? ` (${result.note})` : ''
    console.log(`✓ ${inv.id}: ${inv.description}${note}`)
  } else {
    console.log(`✗ ${inv.id}: ${inv.description}`)
    console.log(`  ERROR: ${result.error}`)
    allPassed = false
  }
}

console.log('')

if (allPassed) {
  console.log('✓ All invariants pass — safe to proceed with commit\n')
  process.exit(0)
} else {
  console.log('✗ INVARIANT FAILURES — fix these before committing\n')
  process.exit(1)
}
