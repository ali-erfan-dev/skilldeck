import { test, _electron as electron } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const SKILLDECK_DIR = path.join(os.homedir(), '.skilldeck')
const LIBRARY_DIR = path.join(SKILLDECK_DIR, 'library')

test('debug - check app renders', async () => {
  if (fs.existsSync(SKILLDECK_DIR)) {
    fs.rmSync(SKILLDECK_DIR, { recursive: true, force: true })
  }
  fs.mkdirSync(LIBRARY_DIR, { recursive: true })
  fs.writeFileSync(path.join(LIBRARY_DIR, 'test-skill.md'), '---\nname: Test\n---\nContent')

  console.log('Library:', fs.readdirSync(LIBRARY_DIR))

  const app = await electron.launch({ args: ['.'], env: { NODE_ENV: 'test' } })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForTimeout(3000)

  const html = await window.content()
  console.log('HTML length:', html.length)
  console.log('HTML:', html.substring(0, 2000))

  const lv = await window.locator('[data-testid="library-view"]').count()
  const items = await window.locator('[data-testid="skill-item"]').count()
  console.log('LibraryView:', lv, 'SkillItems:', items)

  await window.screenshot({ path: 'debug.png' })
  await app.close()
})
