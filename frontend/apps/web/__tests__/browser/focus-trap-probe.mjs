// Real application + separately running HTTP Mock; no model calls or saved connections.
import { loadPlaywright } from './playwright-runtime.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const { chromium } = loadPlaywright()
const phase = process.env.EAP_FOCUS_PHASE || 'after'
assert.ok(['before', 'after'].includes(phase))
const output = new URL(`../../../../../docs/evidence/dialog-focus/${phase}/`, import.meta.url)
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const results = []
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(process.env.EAP_VISUAL_URL || 'http://127.0.0.1:5186')
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const opener = page.getByRole('button', { name: '新增连接', exact: true })
    await opener.click()
    const dialog = page.getByRole('dialog', { name: '新增连接', exact: true })
    await dialog.waitFor()
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'dialog')
    await page.keyboard.press('Shift+Tab')
    const inside = await dialog.evaluate((node) => node.contains(document.activeElement))
    assert.equal(inside, phase === 'after', 'initial Shift+Tab stays inside only after fix')
    await page.screenshot({ path: new URL(`${width}.png`, output).pathname })
    if (phase === 'after') {
      assert.equal(
        await dialog
          .getByRole('button', { name: '保存连接' })
          .evaluate((node) => node === document.activeElement),
        true,
      )
      await page.keyboard.press('Tab')
      assert.equal(
        await dialog
          .getByRole('button', { name: '关闭', exact: true })
          .evaluate((node) => node === document.activeElement),
        true,
      )
      for (let i = 0; i < 24; i++) {
        await page.keyboard.press(i < 12 ? 'Tab' : 'Shift+Tab')
        assert.equal(await dialog.evaluate((node) => node.contains(document.activeElement)), true)
      }
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'detached' })
      assert.equal(await opener.evaluate((node) => node === document.activeElement), true)
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      )
    }
    assert.deepEqual(errors, [])
    results.push({
      width,
      height: 900,
      theme: 'default light',
      initialReverseTabContained: inside,
      pageErrors: errors,
    })
    await page.close()
  }
  writeFileSync(
    new URL('result.json', output),
    JSON.stringify(
      { phase, scenario: 'Settings → Add connection → initial Shift+Tab', mock: true, results },
      null,
      2,
    ) + '\n',
  )
} finally {
  await browser.close()
}
