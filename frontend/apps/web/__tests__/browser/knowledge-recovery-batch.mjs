import { loadPlaywright } from './playwright-runtime.mjs'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const { chromium } = loadPlaywright()
const browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
const out = fileURLToPath(
  new URL('../../../../../docs/evidence/frontend-batch/managers/', import.meta.url),
)
const results = []
try {
  for (const [version, port] of [
    ['before', 5187],
    ['after', 5186],
  ]) {
    await mkdir(resolve(out, version), { recursive: true })
    for (const width of [1440, 390]) {
      for (const scenario of [
        'knowledge-list-failure',
        'knowledge-created-read-failure',
        'knowledge-document-read-failure',
      ]) {
        const page = await browser.newPage({ viewport: { width, height: 950 } })
        const errors = []
        page.on('pageerror', (error) => errors.push(error.message))
        const base = {
          id: 'browser-accepted',
          name: 'Accepted knowledge base',
          description: '',
          documents: 0,
        }
        let accepted = false,
          readsAllowed = false,
          writes = 0
        await page.route('**/api/knowledge**', async (route) => {
          const url = new URL(route.request().url())
          if (!url.pathname.startsWith('/api/knowledge')) return route.continue()
          if (route.request().method() === 'POST') {
            ++writes
            accepted = true
            return route.fulfill({
              status: 200,
              json: { id: url.pathname.endsWith('/documents') ? 'accepted-document' : base.id },
            })
          }
          const fail =
            !readsAllowed &&
            (scenario === 'knowledge-list-failure' ||
              (accepted &&
                (scenario === 'knowledge-created-read-failure' ||
                  url.pathname.endsWith('/documents'))))
          if (fail)
            return route.fulfill({
              status: 503,
              json: { code: 'SERVICE_UNAVAILABLE', detail: 'Simulated knowledge read unavailable' },
            })
          return route.fulfill({
            status: 200,
            json: {
              items: url.pathname.endsWith('/documents')
                ? []
                : scenario === 'knowledge-document-read-failure' || accepted
                  ? [base]
                  : [],
            },
          })
        })
        await page.goto(`http://127.0.0.1:${port}/#knowledge`)
        await page.waitForLoadState('networkidle')
        if (scenario === 'knowledge-created-read-failure') {
          await page.getByRole('button', { name: '＋ 新建', exact: true }).click()
          await page.locator('.eap-dialog form input').first().fill(base.name)
          await page
            .locator('.eap-dialog')
            .getByRole('button', { name: '创建', exact: true })
            .click()
        } else if (scenario === 'knowledge-document-read-failure') {
          await page.locator('aside .manager-item').filter({ hasText: base.name }).click()
          await page.getByRole('button', { name: '＋ 录入文档', exact: true }).click()
          await page.locator('.eap-dialog form input').fill('Accepted document')
          await page.locator('.eap-dialog form textarea').fill('Accepted document content')
          await page.getByRole('button', { name: '保存文档', exact: true }).click()
        }
        await page
          .getByText('Simulated knowledge read unavailable', { exact: true })
          .first()
          .waitFor()
        await page.screenshot({
          path: resolve(out, version, `${scenario}-${width}.png`),
          fullPage: true,
        })
        if (version === 'after') {
          assert.equal(
            await page.getByText('还没有知识库，创建后即可录入业务知识。', { exact: true }).count(),
            0,
          )
          assert.equal(await page.locator('.eap-dialog form').count(), 0)
          if (accepted)
            await page
              .getByText(
                scenario === 'knowledge-created-read-failure'
                  ? '知识库已创建，列表或文档刷新失败。请重试读取，无需再次创建。'
                  : '文档已保存，列表或文档刷新失败。请重试读取，无需再次提交文档。',
                { exact: true },
              )
              .waitFor()
          readsAllowed = true
          await page.getByRole('button', { name: '重试', exact: true }).click()
          await page.waitForLoadState('networkidle')
          assert.equal(
            await page.getByText('Simulated knowledge read unavailable', { exact: true }).count(),
            0,
          )
          if (accepted)
            assert.equal(await page.locator('aside .manager-item[data-active=true]').count(), 1)
        } else if (accepted) assert.equal(await page.locator('.eap-dialog form').count(), 1)
        assert.equal(writes, scenario === 'knowledge-list-failure' ? 0 : 1)
        assert.deepEqual(errors, [])
        results.push({
          version,
          width,
          scenario,
          interceptedWrites: writes,
          backendWrites: 0,
          pageErrors: errors,
          simulated: 'All knowledge HTTP responses; reads fail after accepted POST, retry only GET',
        })
        await page.close()
      }
    }
  }
  await writeFile(resolve(out, 'knowledge-recovery-result.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
} finally {
  await browser.close()
}
