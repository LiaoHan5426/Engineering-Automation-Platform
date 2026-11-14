// Paired actual-app AFTER captures; read-only observations, no callable MCP/model.
import { loadPlaywright } from './playwright-runtime.mjs'
import { title } from './chat-core-fixture.mjs'
import { openServiceChatFixture, openServiceMcpFixture, assertChatCoreState, draft, server } from './chat-service-config-fixture.mjs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const { chromium, expect } = loadPlaywright()
const base = process.env.EAP_CHAT_SERVICE_BASE || 'http://127.0.0.1:5205'
const root = new URL('../../../../../docs/evidence/chat-service-config/', import.meta.url).pathname
const final = process.env.EAP_FINAL_CAPTURE === '1'
const capturePrefix = final ? 'after' : process.env.EAP_PROVISIONAL_CAPTURE === '1' ? 'pending-after' : null
await mkdir(root, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
const results = []
try {
 for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } })
  const chat = await openServiceChatFixture(page, { base, width })
  // Catalog service stays unavailable in this paired baseline scenario.
  await page.route('**/api/ai/speech/services', route => route.request().method() === 'GET' ? route.fulfill({ json: { services: [], limits: { maxAudioBytes: 4194304, maxWireBytes: 6291456, maxTextChars: 4000, maxTranscriptChars: 16000 } } }) : route.fallback())
  await page.reload()
  if (width === 390) await page.getByTestId('open-sidebar').click()
  await page.getByRole('button', { name: title, exact: false }).click()
  await expect(page.locator('.turn-assistant h1')).toHaveText('Review')
  await expect(page.locator('.turn-assistant table')).toContainText('Check')
  await expect(page.locator('.turn-assistant .katex').first()).toBeAttached()
  await page.getByTestId('message-actions').last().scrollIntoViewIfNeeded()
  await assertChatCoreState(page, expect, chat)
  const geometry = await page.evaluate(() => { const form = document.querySelector('[data-testid="chat-composer"]'), workbench = document.querySelector('.workbench'), send = document.querySelector('[data-testid="send-message"]'), model = document.querySelector('[data-testid="model-picker"]'); return { viewportHeight: innerHeight, documentHeight: document.documentElement.scrollHeight, windowScrollY: scrollY, composer: form.getBoundingClientRect().toJSON(), composerClientHeight: form.clientHeight, composerScrollHeight: form.scrollHeight, workbench: workbench.getBoundingClientRect().toJSON(), workbenchScrollTop: workbench.scrollTop, send: send.getBoundingClientRect().toJSON(), model: model.getBoundingClientRect().toJSON() } })
  expect(geometry.workbenchScrollTop).toBe(0)
  expect(geometry.composer.bottom).toBeLessThanOrEqual(geometry.workbench.bottom + 1)
  expect(geometry.send.bottom).toBeLessThanOrEqual(1000)
  expect(geometry.model.bottom).toBeLessThanOrEqual(1000)
  if (capturePrefix) await page.screenshot({ path: `${root}/${capturePrefix}-chat-${width}.png`, fullPage: true })
  await page.getByTestId('web-source-options').locator('summary').click()
  await expect(page.getByTestId('web-source-server')).toBeDisabled()
  await expect(page.getByTestId('chat-composer').locator('textarea').first()).toHaveValue(draft)
  await page.getByTestId('web-source-options').scrollIntoViewIfNeeded()
  await assertChatCoreState(page, expect, chat)
  if (capturePrefix) await page.screenshot({ path: `${root}/${capturePrefix}-chat-options-${width}.png`, fullPage: true })
  await page.close()
  const mcpPage = await browser.newPage({ viewport: { width, height: 1000 } })
  const mcp = await openServiceMcpFixture(mcpPage, { base })
  await mcpPage.getByRole('button', { name: '编辑', exact: true }).scrollIntoViewIfNeeded()
  if (capturePrefix) await mcpPage.screenshot({ path: `${root}/${capturePrefix}-mcp-${width}.png`, fullPage: true })
  await mcpPage.getByRole('button', { name: '编辑', exact: true }).click()
  const dialog = mcpPage.getByRole('dialog')
  await expect(dialog.getByPlaceholder('files')).toHaveValue(server.id)
  await expect(dialog.getByPlaceholder('文件服务器')).toHaveValue(server.name)
  await expect(mcpPage.getByTestId('mcp-transport')).toHaveValue(server.transport)
  await expect(dialog.getByPlaceholder('https://example.com/mcp')).toHaveValue(server.endpoint)
  if (capturePrefix) await mcpPage.screenshot({ path: `${root}/${capturePrefix}-mcp-editor-${width}.png`, fullPage: true })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(mcp.errors).toEqual([]); expect(mcp.blocked).toEqual([])
  results.push({ geometry, width, height: 1000, canonicalDisabledServerPreserved: true, chat, mcp })
  await mcpPage.close()
 }
} finally { await browser.close() }
const git = (...args) => execFileSync('git', ['-c', `safe.directory=${process.cwd()}`, ...args])
const files = [...new Set(git('ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'frontend').toString().split('\0').filter(path => path && !path.includes('/__tests__/')))].sort()
const manifest = []
for (const path of files) { try { manifest.push({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') }) } catch (error) { if (error.code !== 'ENOENT') throw error; manifest.push({ path, deleted: true }) } }
const provenance = { head: git('rev-parse', 'HEAD').toString().trim(), sourceTreeSha256: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'), trackedDiffSha256: createHash('sha256').update(git('diff', 'HEAD', '--', 'frontend')).digest('hex'), stagedDiffSha256: createHash('sha256').update(git('diff', '--cached')).digest('hex'), finalCaptures: final }
await writeFile(`${root}/after-source-manifest.json`, JSON.stringify({ ...provenance, files: manifest }, null, 2) + '\n')
await writeFile(`${root}/after-browser-results.json`, JSON.stringify({ provenance, results }, null, 2) + '\n')
console.log(JSON.stringify({ provenance, results }, null, 2))
