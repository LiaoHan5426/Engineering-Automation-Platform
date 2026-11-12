import { loadPlaywright } from './playwright-runtime.mjs'
// Native current display plus explicit Chromium scale overrides. This does not change Windows DPI.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = loadPlaywright()
const output = resolve('apps/web/__tests__/browser/artifacts/editor-workbench/display')
await mkdir(output, { recursive: true })
const checks = []
for (const scale of [null, 1.25, 1.5]) {
  const browser = await chromium.launch({
    executablePath: process.env.EAP_CHROMIUM,
    headless: false,
    args: ['--start-maximized', ...(scale ? ['--force-device-scale-factor=' + scale] : [])],
  })
  try {
    const context = await browser.newContext({ viewport: null })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.route('**/api/**', (route) =>
      ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())
        ? route.continue()
        : route.fulfill({ status: 409, body: 'READ_ONLY_DISPLAY_QA' }),
    )
    await page.goto('http://127.0.0.1:5173/#experts?view=config&expert=sql-expert')
    await page.locator('.workflow-node').first().waitFor()
    await page.getByRole('button', { name: '查看全图', exact: true }).click()
    await page.getByRole('button', { name: '配置节点', exact: true }).first().click()
    await page.getByLabel('显示名称', { exact: true }).waitFor()
    const metrics = await page.evaluate(() => ({
      dpr: devicePixelRatio,
      width: innerWidth,
      height: innerHeight,
      visualScale: visualViewport.scale,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    }))
    assert.equal(metrics.overflow, false)
    assert.equal(metrics.visualScale, 1)
    if (scale) assert.equal(metrics.dpr, scale)
    assert.deepEqual(errors, [])
    const label = scale ? 'chromium-scale-' + scale : 'native-current'
    await page.screenshot({ path: resolve(output, label + '.png') })
    checks.push({
      label,
      metrics,
      errors,
      boundary: scale
        ? 'Chromium device-scale override, not Windows OS scale acceptance'
        : 'Current native display, read-only existing expert',
    })
  } finally {
    await browser.close()
  }
}
await writeFile(
  resolve(output, 'result.json'),
  JSON.stringify({ result: 'passed', checks }, null, 2),
)
console.log(JSON.stringify({ result: 'passed', checks }))
