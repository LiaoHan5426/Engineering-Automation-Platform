import { loadPlaywright } from './playwright-runtime.mjs'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Real Chromium, existing app servers, explicitly simulated HTTP failures/latency.
const { chromium } = loadPlaywright()
const browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
const results = []
const out = resolve('docs/evidence/frontend-batch/managers')
try {
  for (const [version, port] of [
    ['before', 5187],
    ['after', 5186],
  ]) {
    await mkdir(resolve(out, version), { recursive: true })
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 950 } })
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      const shot = (name) =>
        page.screenshot({ path: resolve(out, version, `${name}-${width}.png`), fullPage: true })
      const go = async (hash) => {
        await page.goto(`http://127.0.0.1:${port}/#${hash}`)
        await page.waitForLoadState('networkidle')
      }
      await go('knowledge')
      const create = page.getByRole('button', { name: '＋ 新建', exact: true })
      await create.click()
      await page.locator('.eap-dialog form input').first().fill('Unsaved knowledge base')
      await page.locator('.eap-dialog').getByRole('button', { name: '取消', exact: true }).click()
      await shot('knowledge-close-draft')
      if (version === 'after') {
        await page.locator('.eap-confirm').waitFor()
        await page.getByRole('button', { name: '继续编辑', exact: true }).click()
        assert.equal(
          await page.locator('.eap-dialog form input').first().inputValue(),
          'Unsaved knowledge base',
        )
        await page.locator('.eap-dialog').getByRole('button', { name: '取消', exact: true }).click()
        await page
          .locator('.eap-confirm')
          .getByRole('button', { name: '放弃修改', exact: true })
          .click()
        await create.click()
        assert.equal(await page.locator('.eap-dialog form input').first().inputValue(), '')
        await page.locator('.eap-dialog').getByRole('button', { name: '取消', exact: true }).click()
      } else assert.equal(await page.locator('.eap-confirm').count(), 0)
      let failDatabase = true
      await page.route('**/api/databases', async (route) => {
        if (failDatabase && route.request().method() === 'GET')
          await route.fulfill({
            status: 503,
            json: { code: 'SERVICE_UNAVAILABLE', detail: 'Simulated catalog unavailable' },
          })
        else await route.continue()
      })
      await go('databases')
      await page.getByText('Simulated catalog unavailable', { exact: true }).first().waitFor()
      await shot('database-load-failure')
      if (version === 'after') {
        assert.equal(
          await page.getByText('暂无资料。可登记脱敏表结构和索引，不需要提供连接凭据。').count(),
          0,
        )
        failDatabase = false
        await page.getByRole('button', { name: '重试', exact: true }).click()
        await page.waitForLoadState('networkidle')
        assert.equal(
          await page.getByText('Simulated catalog unavailable', { exact: true }).count(),
          0,
        )
      }
      await page.unroute('**/api/databases')
      let failExpert = true
      await page.route('**/api/experts', async (route) => {
        if (route.request().method() === 'GET') {
          if (failExpert)
            await route.fulfill({
              status: 503,
              json: { code: 'SERVICE_UNAVAILABLE', detail: 'Simulated expert unavailable' },
            })
          else await route.continue()
        } else await route.continue()
      })
      await go('experts?view=new&mode=agent')
      await page
        .locator('.expert-editor')
        .getByText('Simulated expert unavailable', { exact: true })
        .waitFor({ timeout: 1500 })
        .catch(() => {})
      await shot('expert-load-failure')
      failExpert = false
      if (version === 'after') {
        await page
          .locator('.expert-editor')
          .getByRole('button', { name: '重试', exact: true })
          .click()
        await page.getByTestId('expert-agent-goal').waitFor()
      } else {
        await go('experts?view=new&mode=agent')
        await page.getByTestId('expert-agent-goal').waitFor()
      }
      const inspector = page.locator('input[placeholder=sql-reviewer]')
      if (!(await inspector.isVisible()))
        await page.getByRole('button', { name: '属性', exact: true }).click()
      await inspector.fill('batch-lock-reviewer')
      const name = page
        .locator('.expert-config-section label')
        .filter({ hasText: '名称' })
        .locator('input')
      await name.fill('Batch save lock reviewer')
      const drawer = page.locator('.eap-drawer')
      if (await drawer.count()) await drawer.locator('[data-eap-dialog-close]').click()
      let release
      const gate = new Promise((done) => {
        release = done
      })
      await page.route('**/api/experts', async (route) => {
        if (route.request().method() === 'POST') {
          await gate
          await route.fulfill({ status: 200, json: { saved: true } })
        } else await route.continue()
      })
      await page.getByRole('button', { name: '保存草稿', exact: true }).click()
      await page.getByRole('button', { name: '处理中…', exact: true }).waitFor()
      assert.equal(await page.getByTestId('expert-agent-goal').isDisabled(), version === 'after')
      await shot('expert-save-busy')
      release()
      await page.waitForLoadState('networkidle')
      assert.deepEqual(errors, [])
      results.push({
        version,
        width,
        checks: [
          'knowledge draft close',
          'database failed load/retry',
          'expert failed load/retry',
          'expert save lock',
        ],
        pageErrors: errors,
        simulated: 'HTTP failures, POST save response and latency; no backend writes',
      })
      await page.close()
    }
  }
  await writeFile(resolve(out, 'result.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
} finally {
  await browser.close()
}
