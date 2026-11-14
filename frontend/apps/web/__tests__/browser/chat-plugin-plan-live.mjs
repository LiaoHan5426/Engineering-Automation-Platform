import { loadPlaywright } from './playwright-runtime.mjs'
import { mkdir } from 'node:fs/promises'
import {
  openPluginPlanFixture,
  assertPluginPlanState,
  answer,
  plan,
  conversationId,
  executionId,
} from './chat-plugin-plan-fixture.mjs'
const { chromium, expect } = loadPlaywright()
const root = new URL('../../../../../docs/evidence/', import.meta.url).pathname
for (const dir of ['chat-native-plan', 'dsh-plugin-context'])
  await mkdir(`${root}/${dir}`, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: 1000 },
      permissions: ['clipboard-read', 'clipboard-write'],
    })
    const capture = await openPluginPlanFixture(page, {
      base: process.env.EAP_PLUGIN_PLAN_BASE || 'http://127.0.0.1:5197',
      width,
    })
    await page.getByTestId('open-summary').click()
    const summaryPlan = page.getByTestId('summary-plan')
    await expect(summaryPlan).toBeVisible()
    for (const item of plan.items)
      await expect(summaryPlan.locator(`[data-plan-item="${item.id}"]`)).toContainText(item.content)
    await expect(summaryPlan.locator('[data-plan-item]')).toHaveCount(2)
    await expect(summaryPlan.locator('[data-plan-item]').nth(0)).toContainText(/已完成|Completed/i)
    await expect(summaryPlan.locator('[data-plan-item]').nth(1)).toContainText(/待处理|Pending/i)
    expect(
      capture.requests.some(
        (req) =>
          req.path === `/api/ai/conversations/${conversationId}/executions/${executionId}/plan` &&
          req.method === 'GET',
      ),
    ).toBe(true)
    await expect
      .poll(async () =>
        page.evaluate(
          ({ key, conversationId }) =>
            JSON.parse(localStorage.getItem(key)).transcripts[conversationId][0].plan?.snapshot
              ?.revision,
          { key: capture.key, conversationId },
        ),
      )
      .toBe(plan.revision)
    await assertPluginPlanState(page, expect, capture)
    await expect(page.locator('#nprogress')).toHaveCount(0)
    await page.screenshot({ path: `${root}/chat-native-plan/after-${width}.png`, fullPage: true })
    await page.getByTestId('close-summary').click()
    await expect(page.getByTestId('summary-rail')).toHaveCount(0)
    await page.getByText(answer, { exact: true }).click({ button: 'right' })
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    const bounds = await menu.boundingBox()
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(1000)
    const copy = menu.getByRole('menuitem')
    await expect(copy).toHaveCount(1)
    await expect(copy).toContainText(/复制|Copy/)
    const material = page.locator('[data-menu-material] > [aria-hidden="true"]').first()
    await expect
      .poll(() => material.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe('rgba(0, 0, 0, 0)')
    const surfaceColor = await material.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    )
    await page.screenshot({ path: `${root}/dsh-plugin-context/after-${width}.png`, fullPage: true })
    await copy.click()
    await expect(menu).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(answer)
    const more = page.getByTestId('message-actions')
    await expect(more).toBeVisible()
    await more.focus()
    await page.keyboard.press('Enter')
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(more).toBeFocused()
    await more.click()
    await expect(menu).toBeVisible()
    await page.getByTestId('chat-composer').locator('textarea').first().click()
    await expect(menu).toHaveCount(0)
    await assertPluginPlanState(page, expect, capture)
    process.stdout.write(
      JSON.stringify({
        width,
        revision: plan.revision,
        surfaceColor,
        menuBounds: bounds,
        copied: answer,
        keyboardEscapeFocus: true,
        outsideDismiss: true,
        errors: capture.errors,
        writes: capture.requests.filter((req) => req.method !== 'GET'),
      }),
    )
    process.stdout.write('\n')
    await page.close()
  }
} finally {
  await browser.close()
}
