// Actual user wheel input proves composer-local access; no scrollIntoView fallback.
import { loadPlaywright } from './playwright-runtime.mjs'
import { openServiceChatFixture } from './chat-service-config-fixture.mjs'
import { title } from './chat-core-fixture.mjs'
import { writeFile } from 'node:fs/promises'
const { chromium, expect } = loadPlaywright()
const base = process.env.EAP_CHAT_SERVICE_BASE || 'http://127.0.0.1:5205'
const root = new URL('../../../../../docs/evidence/chat-service-config/', import.meta.url).pathname
const browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
const results = []
try {
 const page = await browser.newPage({ viewport: { width: 390, height: 1000 } })
 const capture = await openServiceChatFixture(page, { base, width: 390 })
 await page.route('**/api/ai/speech/services', route => route.request().method() === 'GET' ? route.fulfill({ json: { services: [], limits: { maxAudioBytes: 4194304, maxWireBytes: 6291456, maxTextChars: 4000, maxTranscriptChars: 16000 } } }) : route.fallback())
 await page.reload(); await page.getByTestId('open-sidebar').click(); await page.getByRole('button', { name: title, exact: false }).click()
 const form = page.getByTestId('chat-composer')
 const snapshot = () => page.evaluate(() => {
  const q = selector => document.querySelector(selector), form = q('[data-testid="chat-composer"]'), workbench = q('.workbench'), send = q('[data-testid="send-message"]'), model = q('[data-testid="model-picker"]')
  const modelRect = model.getBoundingClientRect(), hit = document.elementFromPoint(modelRect.x + modelRect.width / 2, modelRect.y + modelRect.height / 2)
  return { composer: form.getBoundingClientRect().toJSON(), composerTop: form.scrollTop, client: form.clientHeight, content: form.scrollHeight, send: send.getBoundingClientRect().toJSON(), sendDisabledByFixture: send.disabled, model: modelRect.toJSON(), modelPointerHit: hit === model || model.contains(hit), workbenchTop: workbench.scrollTop, windowTop: scrollY, shortcut: q('[data-testid="dsh-context-menu-host"]').getBoundingClientRect().toJSON() }
 })
 for (const state of ['collapsed', 'web-expanded', 'speech-expanded']) {
  if (state === 'web-expanded') await page.getByTestId('web-source-options').locator('summary').click()
  if (state === 'speech-expanded') { await page.getByTestId('web-source-options').locator('summary').click(); await page.getByTestId('speech-controls').locator('xpath=ancestor::details[1]').locator('summary').click() }
  const before = await snapshot(), box = await form.boundingBox()
  await page.mouse.move(box.x + box.width - 7, box.y + 24); await page.mouse.wheel(0, 1000)
  await expect.poll(async () => { const g = await snapshot(); return g.send.bottom <= g.composer.bottom && g.model.bottom <= g.composer.bottom }).toBe(true)
  const after = await snapshot()
  expect(after.workbenchTop).toBe(0); expect(after.windowTop).toBe(0); expect(after.shortcut.top).toBeGreaterThanOrEqual(0)
  expect(after.send.top).toBeGreaterThanOrEqual(after.composer.top); expect(after.model.top).toBeGreaterThanOrEqual(after.composer.top); expect(after.modelPointerHit).toBe(true)
  await page.getByTestId('model-picker').focus(); await expect(page.getByTestId('model-picker')).toBeFocused()
  await page.screenshot({ path: `${root}/after-reachable-${state}-390.png`, fullPage: true })
  await page.getByTestId('model-picker').click(); await page.keyboard.press('Escape')
  expect((await snapshot()).workbenchTop).toBe(0)
  results.push({ state, input: 'actual Playwright mouse wheel inside composer padding', modelFocusedAndClicked: true, before, after })
 }
 expect(capture.errors).toEqual([]); expect(capture.blocked).toEqual([])
 await writeFile(`${root}/after-composer-accessibility.json`, JSON.stringify({ results, errors: capture.errors, blocked: capture.blocked }, null, 2) + '\n')
 console.log(JSON.stringify(results, null, 2))
} finally { await browser.close() }
