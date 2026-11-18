import { loadPlaywright } from './playwright-runtime.mjs'
import { mkdir } from 'node:fs/promises'
const { chromium, expect } = loadPlaywright()
const phase = process.argv[2] || 'before'
const out = new URL('../../../../../docs/evidence/chat-model-context/', import.meta.url).pathname
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } })
    await page.route('**/api/**', (r) =>
      r.request().method() === 'GET' &&
      new URL(r.request().url()).pathname === '/api/ai/connections'
        ? r.fulfill({ json: { items: [] } })
        : r.fulfill({
            status: 503,
            json: { code: 'AUDIT_UNAVAILABLE', detail: 'Read-only browser fixture' },
          }),
    )
    await page.goto((process.env.EAP_SUMMARY_BASE || 'http://127.0.0.1:5197') + '/#chat')
    const draft = page.getByTestId('chat-composer').locator('textarea').first()
    await draft.fill('Keep this draft while configuring a connection')
    await page.getByTestId('model-picker').click()
    await page.getByTestId('model-setup-link').click()
    if (phase === 'before') {
      await page.getByTestId('model-connections').waitFor()
      expect(page.url()).toContain('#model-settings')
    } else {
      await page.getByRole('dialog').last().waitFor()
      expect(page.url()).toContain('#chat')
      await expect(draft).toHaveValue('Keep this draft while configuring a connection')
    }
    await page.screenshot({ path: `${out}/${phase}-${width}.png`, fullPage: true })
    if (phase === 'after') {
      const editor = page.getByTestId('connection-dialog')
      await editor.getByLabel('名称', { exact: true }).fill('Unsaved setup')
      await page.keyboard.press('Escape')
      const confirm = page.getByRole('dialog', { name: '放弃未保存的修改？' })
      await expect(confirm).toBeVisible()
      await confirm.getByRole('button', { name: '取消', exact: true }).click()
      await expect(editor.getByLabel('名称', { exact: true })).toHaveValue('Unsaved setup')
      await editor.getByRole('button', { name: '保存连接', exact: true }).click()
      await expect(editor.locator('.eap-feedback')).toBeVisible()
      await expect(editor.getByRole('button', { name: '保存连接', exact: true })).toBeEnabled()
      await page.keyboard.press('Escape')
      await confirm.getByRole('button', { name: '放弃修改', exact: true }).click()
      await expect(page.getByTestId('connection-dialog')).toHaveCount(0)
      await expect(draft).toHaveValue('Keep this draft while configuring a connection')
      expect(page.url()).toContain('#chat')
      await expect(page.getByTestId('model-picker')).toBeFocused()
      await page.getByTestId('model-picker').click()
      await page.getByTestId('model-setup-link').click()
      await editor.getByLabel('名称', { exact: true }).fill('Unsaved route edit')
      await page.evaluate(() => {
        location.hash = 'model-settings'
      })
      await expect(confirm).toBeVisible()
      expect(page.url()).toContain('#chat')
      await confirm.getByRole('button', { name: '取消', exact: true }).click()
      await expect(editor.getByLabel('名称', { exact: true })).toHaveValue('Unsaved route edit')
      await page.evaluate(() => {
        location.hash = 'model-settings'
      })
      await confirm.getByRole('button', { name: '放弃修改', exact: true }).click()
      await page.getByTestId('model-connections').waitFor()
      expect(page.url()).toContain('#model-settings')
      if (width === 390) await page.getByTestId('open-sidebar').click()
      await page.getByRole('button', { name: '返回来源会话', exact: true }).click()
      await expect(draft).toHaveValue('Keep this draft while configuring a connection')
    }
    process.stdout.write(JSON.stringify({ phase, width, url: page.url() }))
    process.stdout.write('\n')
    await page.close()
  }
} finally {
  await browser.close()
}
