import assert from 'node:assert/strict'
import { loadPlaywright } from './playwright-runtime.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
const { chromium } = loadPlaywright()
const phase = process.env.EAP_BATCH_PHASE || 'after'
if (!['before', 'after'].includes(phase)) throw new Error('Invalid EAP_BATCH_PHASE')
const origin = process.env.EAP_VISUAL_URL || `http://127.0.0.1:${phase === 'before' ? 5187 : 5186}`
const output = new URL(`../../../../../docs/evidence/frontend-batch/${phase}/`, import.meta.url)
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const routes = [
  'chat',
  'work',
  'scenes',
  'expert-catalog',
  'experts',
  'model-settings',
  'appearance',
  'skills',
  'plugins',
  'rules',
  'knowledge',
  'databases',
  'capabilities',
  'board',
  'sql',
  'builder-alpha',
  'builder-beta',
]
const results = []
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    for (const route of routes) {
      const errors = []
      const onError = (error) => errors.push(error.message)
      page.on('pageerror', onError)
      await page.goto(`${origin}#${route}`)
      await page.locator('main').waitFor()
      await page.waitForTimeout(1200)
      await page.screenshot({ path: new URL(`${route}-${width}.png`, output).pathname })
      results.push({
        route,
        width,
        overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        errors,
        headings: await page.locator('h1,h2').allTextContents(),
      })
      page.off('pageerror', onError)
    }
    await page.close()
  }
  writeFileSync(new URL('inventory.json', output), JSON.stringify(results, null, 2) + '\n')
  assert.equal(results.length, 34)
  assert.deepEqual(
    results.filter((row) => row.overflow || row.errors.length),
    [],
  )
} finally {
  await browser.close()
}
