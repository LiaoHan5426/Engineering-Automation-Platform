import { loadPlaywright } from './playwright-runtime.mjs'
import { mkdir } from 'node:fs/promises'
const { chromium, expect } = loadPlaywright()
const phase = process.argv[2] || 'before'
const out = new URL('../../../../../docs/evidence/chat-execution-summary/', import.meta.url)
  .pathname
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.route('**/api/**', async (route) => {
      const req = route.request()
      const path = new URL(req.url()).pathname
      if (req.method() !== 'GET')
        return route.fulfill({
          status: 409,
          json: { code: 'AUDIT_WRITE_BLOCKED', detail: 'Read-only capture' },
        })
      if (path === '/api/ai/conversations/one')
        return route.fulfill({
          json: { workspaceLabel: 'UI review fixture', memory: '', connectionId: null, model: '' },
        })
      return route.fulfill({
        status: 503,
        json: {
          code: 'AUDIT_UNAVAILABLE',
          detail: 'Read-only capture: external services unavailable',
        },
      })
    })
    await page.goto((process.env.EAP_SUMMARY_BASE || 'http://127.0.0.1:5197') + '/#chat')
    await page.getByTestId('chat-composer').waitFor()
    await page.getByTestId('chat-composer').locator('textarea').first().fill('Unsaved draft')
    const key = await page.evaluate(
      () =>
        Object.keys(localStorage).find((k) => k.endsWith('.eap.chat.history.v1')) ??
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
              title: 'Execution review',
              archived: false,
              updatedAt: '2026-11-14T10:00:00Z',
              draft: 'Draft stays with this conversation',
              workspaceLabel: 'UI review fixture',
              memory: '',
              connectionId: null,
              model: '',
              context,
            },
          ],
          transcripts: {
            one: [
              {
                role: 'assistant',
                text: 'Recorded response for execution summary review.',
                error: '',
                status: 'SUCCEEDED',
                executionId: '11111111-1111-4111-8111-111111111111',
                approval: '',
                verification: 'not_requested',
                toolEvents: [],
                artifactError: '',
                artifacts: [],
              },
            ],
          },
          scratch: { draft: 'Unsaved draft', context },
        }),
      )
    }, key)
    await page.reload()
    await page.getByTestId('chat-composer').waitFor()
    if (width === 390) await page.getByTestId('open-sidebar').click()
    await page.getByRole('button', { name: 'Execution review', exact: false }).click()
    await page.getByTestId('open-summary').click()
    await page.getByTestId('summary-rail').waitFor()
    if (phase === 'after') {
      await expect(page.getByTestId('summary-execution')).toContainText(
        '11111111-1111-4111-8111-111111111111',
      )
      await expect(page.getByTestId('summary-steps')).toHaveCount(0)
      await expect(page.getByTestId('chat-composer').locator('textarea').first()).toHaveValue(
        'Draft stays with this conversation',
      )
    }
    await page.screenshot({ path: `${out}/${phase}-${width}.png`, fullPage: true })
    if (phase === 'after') {
      await page.getByTestId('close-summary').click()
      if (width === 390) await page.getByTestId('open-sidebar').click()
      await page.getByTestId('new-free-chat').click()
      await page.getByTestId('open-summary').click()
      await expect(page.getByTestId('summary-execution-empty')).toBeVisible()
      await expect(page.getByTestId('summary-execution-id')).toHaveCount(0)
      await expect(page.getByTestId('chat-composer').locator('textarea').first()).toHaveValue(
        'Unsaved draft',
      )
    }
    expect(errors).toEqual([])
    process.stdout.write(
      JSON.stringify({
        phase,
        width,
        errors,
        text: await page.getByTestId('summary-rail').innerText(),
      }),
    )
    process.stdout.write('\n')
    await page.close()
  }
} finally {
  await browser.close()
}
