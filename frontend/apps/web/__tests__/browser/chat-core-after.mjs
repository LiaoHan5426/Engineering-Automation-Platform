// Actual candidate app; HTTP fixture only. Never executes a backend write/model.
import { loadPlaywright } from './playwright-runtime.mjs'
import { openChatCoreFixture, assertChatCoreState, answer, draft, graph, conversationId } from './chat-core-fixture.mjs'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const { chromium, expect } = loadPlaywright()
const root = new URL('../../../../../docs/evidence/chat-core-refactor/', import.meta.url).pathname
await mkdir(root, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
const results = []
const layoutSnapshot = page => page.evaluate(() => {
 const measure = el => el ? { tag: el.tagName, class: el.className, testId: el.dataset?.testid, rect: el.getBoundingClientRect().toJSON(), clientHeight: el.clientHeight, offsetHeight: el.offsetHeight, scrollHeight: el.scrollHeight, scrollTop: el.scrollTop, overflowY: getComputedStyle(el).overflowY, display: getComputedStyle(el).display, minHeight: getComputedStyle(el).minHeight } : null
 const composer = document.querySelector('[data-testid="chat-composer"]')
 const ancestors = []; for (let el = composer; el; el = el.parentElement) ancestors.push(measure(el))
 return { viewport: { width: innerWidth, height: innerHeight }, windowScrollY: scrollY, documentHeight: document.documentElement.scrollHeight, bodyHeight: document.body.scrollHeight, composer: measure(composer), send: measure(document.querySelector('[data-testid="send-message"]')), model: measure(document.querySelector('[data-testid="model-picker"]')), feed: measure(document.querySelector('[data-testid="chat-feed"]')), log: measure(document.querySelector('.chat-log')), ancestors }
})
try {
 for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 1000 }, acceptDownloads: true })
  page.on('console', msg => { if (['error', 'warning'].includes(msg.type())) console.error('BROWSER', msg.type(), msg.text()) })
  console.log('START', width)
  await page.addInitScript(() => { window.__copies = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__copies.push(text) } } }) })
  const capture = await openChatCoreFixture(page, { base: 'http://127.0.0.1:5203', width })
  const body = page.locator('.turn-assistant .chat-message-body')
  await expect(body.locator('h1')).toHaveText('Review')
  await expect(body.locator('strong')).toHaveText('Ready')
  await expect(body.locator('table')).toContainText('Check')
  await expect(body.locator('.katex').first()).toBeVisible()
  await expect(body.locator('.hljs-keyword')).toHaveText('const')
  await expect(body.locator('.eap-rich-text__diagram')).toHaveCount(0)
  if (process.env.EAP_FINAL_CAPTURE === '1') {
    await page.getByTestId('chat-feed').evaluate(el => { const body = el.querySelector('.turn-assistant .chat-message-body'); el.scrollTop += body.getBoundingClientRect().top - el.getBoundingClientRect().top })
    await page.screenshot({ path: `${root}/after-richtext-${width}.png`, fullPage: true })
  }
  const code = body.locator('.eap-rich-text__code').first()
  await code.getByRole('button').first().click()
  expect(await page.evaluate(() => window.__copies.at(-1))).toBe('const count = 2\n')
  await body.getByTestId('copy-message').click()
  expect(await page.evaluate(() => window.__copies.at(-1))).toBe(answer)
  await body.getByRole('button', { name: /渲染图表|Render diagram/ }).click()
  let mermaidFailure = null
  try { await expect(body.locator('.eap-rich-text__diagram svg')).toBeVisible(); await expect(body.locator('.eap-rich-text__diagram svg')).toContainText('A'); await expect(body.locator('.eap-rich-text__diagram svg')).toContainText('B') } catch (error) { mermaidFailure = { error: error.message, statuses: await body.getByRole('status').allTextContents() } }
  if (!mermaidFailure) expect(await body.locator('.eap-rich-text__diagram').evaluate(el => ({ forbidden: el.querySelectorAll('script,foreignObject,image,a,style,use').length, events: [...el.querySelectorAll('*')].flatMap(n => [...n.attributes]).filter(a => /^on|^(href|xlink:href|src|style)$/.test(a.name)).length }))).toEqual({ forbidden: 0, events: 0 })
  const composer = page.getByTestId('chat-composer').locator('textarea').first()
  await composer.fill(draft); await composer.press('End'); await composer.press('Shift+Enter')
  await expect(composer).toHaveValue(draft + '\n')
  await composer.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, bubbles: true })
  await expect(composer).toHaveValue(draft + '\n')
  expect(capture.blocked).toEqual([])
  await composer.fill(draft)
  await assertChatCoreState(page, expect, capture)
  await expect(page.locator('#nprogress')).toHaveCount(0)
  await page.getByTestId('message-actions').last().scrollIntoViewIfNeeded()
  const geometryBefore = await layoutSnapshot(page)
  if (process.env.EAP_FINAL_CAPTURE === '1') await page.screenshot({ path: `${root}/after-${width}.png`, fullPage: true })
  const actions = page.getByTestId('message-actions').last()
  await actions.focus(); await page.keyboard.press('Enter')
  await expect(page.getByRole('menu')).toBeVisible()
  if (process.env.EAP_FINAL_CAPTURE === '1') await page.screenshot({ path: `${root}/after-actions-${width}.png`, fullPage: true })
  const menuText = await page.getByRole('menu').innerText()
  const menuBox = await page.getByRole('menu').boundingBox()
  expect(menuBox.x).toBeGreaterThanOrEqual(0); expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width + 1)
  await page.keyboard.press('Escape'); await expect(page.getByRole('menu')).toHaveCount(0); await expect(actions).toBeFocused()
  await actions.click()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: /下载|Download/ }).click()
  const download = await downloadEvent
  const text = await readFile(await download.path(), 'utf8')
  expect(text).toBe(answer)
  await composer.focus(); await assertChatCoreState(page, expect, capture)
  await page.getByTestId('send-message').scrollIntoViewIfNeeded()
  const geometryAfter = await layoutSnapshot(page)
  const sendRect = await page.getByTestId('send-message').boundingBox()
  expect(sendRect.y + sendRect.height).toBeLessThanOrEqual(1000)
  if (process.env.EAP_FINAL_CAPTURE === '1') await page.screenshot({ path: `${root}/after-composer-${width}.png`, fullPage: true })
  await page.keyboard.press('Control+/'); await expect(page.getByRole('dialog')).toBeVisible()
  const shortcutDialogText = await page.getByRole('dialog').innerText()
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0)
  await composer.fill('Guarded Enter probe')
  await composer.press('Enter')
  await expect.poll(() => capture.blocked.length).toBe(1)
  expect(capture.blocked[0]).toEqual({ method: 'POST', path: `/api/ai/conversations/${conversationId}/messages` })
  const normalEnterGuarded = true
  results.push({ initialLayoutFits: geometryBefore.composer.rect.bottom <= geometryBefore.ancestors.find(el => el.class === 'workbench').rect.bottom + 1 && geometryBefore.send.rect.bottom <= 1000 && geometryBefore.model.rect.bottom <= 1000, geometryBefore, geometryAfter, normalEnterGuarded, shortcutDialogText, width, height: 1000, markdownCodeMathTable: true, manualMermaid: !mermaidFailure, sanitizedSvg: mermaidFailure ? 'unverified' : true, mermaidFailure, wholeAndCodeClipboardHandler: true, shiftEnterAndIME: true, actionMenuEscapeFocus: true, menuText, download: { filename: download.suggestedFilename(), exactText: true }, ...capture })
  await page.close()
 }
} finally { await browser.close() }
const git = (...args) => execFileSync('git', ['-c', `safe.directory=${process.cwd()}`, ...args])
const sourceFiles = [...new Set(git('ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'frontend').toString().split('\0').filter(path => path && !path.includes('/__tests__/')))].sort()
const sourceManifest = []
for (const path of sourceFiles) {
 try { sourceManifest.push({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') }) }
 catch (error) { if (error.code !== 'ENOENT') throw error; sourceManifest.push({ path, deleted: true }) }
}
const sourceTreeSha256 = createHash('sha256').update(JSON.stringify(sourceManifest)).digest('hex')
await writeFile(`${root}/after-source-manifest.json`, JSON.stringify({ sourceTreeSha256, files: sourceManifest }, null, 2) + '\n')
const provenance = { sourceTreeSha256, head: git('rev-parse', 'HEAD').toString().trim(), trackedDiffSha256: createHash('sha256').update(git('diff', 'HEAD', '--', 'frontend')).digest('hex'), stagedDiffSha256: createHash('sha256').update(git('diff', '--cached')).digest('hex'), finalCaptures: process.env.EAP_FINAL_CAPTURE === '1' && results.every(result => result.manualMermaid && result.sanitizedSvg === true && result.initialLayoutFits) }
await writeFile(`${root}/after-browser-results.json`, JSON.stringify({ provenance, results }, null, 2) + '\n')
console.log(JSON.stringify({ provenance, results }, null, 2))
