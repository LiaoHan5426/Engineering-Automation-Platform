import { loadPlaywright } from './playwright-runtime.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const { chromium, expect } = loadPlaywright()
const output = resolve('docs/evidence/frontend-batch/workspaces')
const browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
const results = []
try {
  for (const [phase, base] of [
    ['before', 'http://127.0.0.1:5187'],
    ['after', 'http://127.0.0.1:5186'],
  ])
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } }),
        page = await context.newPage(),
        errors = [],
        blocked = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.route('**/api/**', async (route) => {
        const r = route.request(),
          path = new URL(r.url()).pathname
        if (r.method() !== 'GET') {
          blocked.push({ path, method: r.method() })
          return route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              type: 'about:blank',
              title: 'Blocked',
              status: 409,
              code: 'AUDIT_WRITE_BLOCKED',
              detail: 'Explicit browser fixture prevents backend mutations',
            }),
          })
        }
        if (path === '/api/ai/conversations/one')
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              workspaceLabel: 'audit',
              memory: '',
              connectionId: null,
              model: '',
            }),
          })
        return route.continue()
      })
      await page.goto(base + '/#chat')
      await page.getByTestId('chat-composer').waitFor()
      await page
        .getByTestId('chat-composer')
        .locator('textarea')
        .first()
        .fill('bootstrap storage scope')
      const key = await page.evaluate(
        () =>
          Object.keys(localStorage).find((key) => key.endsWith('.eap.chat.history.v1')) ??
          '%2Fapi.eap.chat.history.v1',
      )
      await page.addInitScript((key) => {
        const context = {
          mode: 'chat',
          expert: 'general',
          instructions: '',
          reasoning: 'default',
          approval: 'review',
          files: [],
          prototypeVersionId: '',
          targetPath: '',
        }
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            items: [
              {
                id: 'one',
                title: 'Audit saved conversation',
                archived: false,
                updatedAt: '2026-11-01T00:00:00Z',
                draft: '',
                workspaceLabel: 'audit',
                memory: '',
                connectionId: null,
                model: '',
                context,
              },
            ],
            transcripts: { one: [] },
            scratch: { draft: 'Unsent scratch must survive history navigation', context },
          }),
        )
      }, key)
      await page.reload()
      const draft = page.getByTestId('chat-composer').locator('textarea').first()
      await expect(draft).toHaveValue('Unsent scratch must survive history navigation')
      if (width === 390) await page.getByTestId('open-sidebar').click()
      await page.getByRole('button', { name: 'Audit saved conversation', exact: false }).click()
      if (width === 390) await page.getByTestId('open-sidebar').click()
      await page.getByTestId('new-free-chat').click()
      await expect(page.getByTestId('chat-composer')).toBeVisible()
      const scratchRestored =
        (await draft.inputValue()) === 'Unsent scratch must survive history navigation'
      await page.screenshot({
        path: resolve(output, phase, `chat-scratch-${width}.png`),
        fullPage: true,
      })
      if (phase === 'after') expect(scratchRestored).toBe(true)
      await page.getByTestId('composer-add').click()
      await page.getByTestId('composer-cat-skills').click()
      await page.getByTestId('skill-open').click()
      await page.getByTestId('skill-dialog').waitFor()
      await page.screenshot({
        path: resolve(output, phase, `compose-dialog-${width}.png`),
        fullPage: true,
      })
      await page.keyboard.press('Escape')
      await page.getByTestId('skill-dialog').waitFor({ state: 'hidden' })
      const focusReturned = await draft.evaluate((node) => document.activeElement === node)
      if (phase === 'after') expect(focusReturned).toBe(true)
      results.push({
        phase,
        width,
        scratchRestored,
        focusReturned,
        pageErrors: errors,
        blockedWrites: blocked,
        boundary:
          'Seeded local browser snapshot and GET fixture; all non-GETs blocked; no provider calls or backend mutations.',
      })
      await context.close()
    }
} finally {
  await browser.close()
  await mkdir(output, { recursive: true })
  await writeFile(resolve(output, 'chat-results.json'), JSON.stringify(results, null, 2))
}
console.log(JSON.stringify(results, null, 2))
