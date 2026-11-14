// Run against the untouched 35ff91a app, never against the candidate implementation.
import { loadPlaywright } from './playwright-runtime.mjs'
import { mkdir } from 'node:fs/promises'
import {
  openPluginPlanFixture,
  assertPluginPlanState,
  answer,
} from './chat-plugin-plan-fixture.mjs'
const { chromium, expect } = loadPlaywright()
const root = new URL('../../../../../docs/evidence/', import.meta.url).pathname
for (const dir of ['chat-native-plan', 'dsh-plugin-context'])
  await mkdir(`${root}/${dir}`, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } })
    const capture = await openPluginPlanFixture(page, {
      base: process.env.EAP_PLUGIN_PLAN_BASE || 'http://127.0.0.1:5201',
      width,
    })
    await page.getByTestId('open-summary').click()
    await page.getByTestId('summary-rail').waitFor()
    await assertPluginPlanState(page, expect, capture)
    await expect(page.locator('#nprogress')).toHaveCount(0)
    await expect(page.getByText('Inspect current implementation', { exact: true })).toHaveCount(0)
    await page.screenshot({ path: `${root}/chat-native-plan/before-${width}.png`, fullPage: true })
    const summary = await page.getByTestId('summary-rail').innerText()
    await page.getByTestId('close-summary').click()
    await expect(page.getByTestId('summary-rail')).toHaveCount(0)
    await page.getByText(answer, { exact: true }).click({ button: 'right' })
    // Native browser context menus are not included in page screenshots. No app menu exists here.
    await expect(page.getByRole('menu')).toHaveCount(0)
    await assertPluginPlanState(page, expect, capture)
    await page.screenshot({
      path: `${root}/dsh-plugin-context/before-${width}.png`,
      fullPage: true,
    })
    process.stdout.write(
      JSON.stringify({
        width,
        summary,
        errors: capture.errors,
        requests: capture.requests,
        appMenus: 0,
        draftPreserved: true,
      }),
    )
    process.stdout.write('\n')
    await page.close()
  }
} finally {
  await browser.close()
}
