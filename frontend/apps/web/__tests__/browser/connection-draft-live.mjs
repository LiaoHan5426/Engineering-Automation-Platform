import { loadPlaywright } from './playwright-runtime.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const { chromium } = loadPlaywright()
const phase = process.env.EAP_DRAFT_PHASE || 'after'
assert.ok(['before', 'after'].includes(phase))
const output = new URL(`../../../../../docs/evidence/connection-draft/${phase}/`, import.meta.url)
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const results = []
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = [],
      writes = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('request', (request) => {
      if (request.url().includes('/api/') && !['GET', 'HEAD'].includes(request.method()))
        writes.push(request.url())
    })
    await page.goto(process.env.EAP_VISUAL_URL || 'http://127.0.0.1:5186')
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const opener = page.getByRole('button', { name: '新增连接', exact: true })
    await opener.click()
    const dialog = page.getByRole('dialog', { name: '新增连接', exact: true })
    await dialog.getByLabel('名称', { exact: true }).fill('未保存的连接草稿')
    await page.keyboard.press('Escape')
    if (phase === 'before') {
      await dialog.waitFor({ state: 'detached' })
    } else {
      const confirm = page.getByRole('dialog', { name: '放弃未保存的修改？' })
      await confirm.waitFor()
      assert.equal(
        await dialog.getByLabel('名称', { exact: true }).inputValue(),
        '未保存的连接草稿',
      )
    }
    await page.screenshot({ path: new URL(`${width}.png`, output).pathname })
    if (phase === 'after') {
      const confirm = page.getByRole('dialog', { name: '放弃未保存的修改？' })
      await confirm.getByRole('button', { name: '取消', exact: true }).click()
      await confirm.waitFor({ state: 'detached' })
      assert.equal(
        await dialog.getByLabel('名称', { exact: true }).inputValue(),
        '未保存的连接草稿',
      )
      // Header and backdrop take the same protected exit path.
      await dialog.getByRole('button', { name: '关闭', exact: true }).click()
      await confirm.waitFor()
      await page.keyboard.press('Escape')
      await confirm.waitFor({ state: 'detached' })
      await page.mouse.click(2, 2)
      await confirm.waitFor()
      await confirm.getByRole('button', { name: '放弃修改', exact: true }).click()
      await dialog.waitFor({ state: 'detached' })
      await opener.click()
      assert.equal(await dialog.getByLabel('名称', { exact: true }).inputValue(), '')
      // A clean form closes without an unnecessary prompt.
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'detached' })
      assert.equal(await confirm.count(), 0)
      assert.equal(await opener.evaluate((node) => node === document.activeElement), true)
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      )
    } else {
      await opener.click()
      assert.equal(await dialog.getByLabel('名称', { exact: true }).inputValue(), '')
    }
    assert.deepEqual(errors, [])
    assert.deepEqual(writes, [])
    results.push({
      width,
      height: 900,
      theme: 'default light',
      dirtyCloseProtected: phase === 'after',
      pageErrors: errors,
      writes,
    })
    await page.close()
  }
  writeFileSync(
    new URL('result.json', output),
    JSON.stringify(
      { phase, scenario: 'Add connection → enter name → Escape', mock: true, results },
      null,
      2,
    ) + '\n',
  )
} finally {
  await browser.close()
}
