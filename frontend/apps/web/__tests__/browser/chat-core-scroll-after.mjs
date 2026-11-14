import { loadPlaywright } from './playwright-runtime.mjs'
import { openChatCoreFixture, graph, conversationId, title } from './chat-core-fixture.mjs'
import { writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const sourceHash = createHash('sha256').update(await readFile(new URL('../../src/features/chat/ChatWorkspace.vue', import.meta.url))).digest('hex')
const startedAt = new Date().toISOString()
const consoleTrace = []
const { chromium, expect } = loadPlaywright()
const browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.on('console', msg => { if (msg.text().includes('[feed-trace]')) { consoleTrace.push(msg.text()); console.log(msg.text()) } })
const root = new URL('../../../../../docs/evidence/chat-core-refactor/', import.meta.url).pathname
try {
 const capture = await openChatCoreFixture(page, { base: 'http://127.0.0.1:5203', width: 1440 })
 const hostile = structuredClone(graph)
 const hostileSource = '<img src="https://invalid.example/x" onerror="window.__xss=1"><script>window.__xss=2</script>\n\n[unsafe](javascript:alert(1))\n\n![remote](https://invalid.example/y)'
 hostile.nodes[1].content = hostileSource; hostile.nodes[1].response.answer = hostileSource; hostile.operations[0].response.answer = hostileSource
 await page.route(`**/api/ai/conversations/${conversationId}/graph`, route => route.request().method() === 'GET' ? route.fulfill({ json: hostile }) : route.fallback())
 await page.reload(); await page.getByRole('button', { name: title, exact: false }).click()
 const rich = page.locator('.turn-assistant .eap-rich-text')
 await expect(rich).toContainText('<img')
 await expect(rich.locator('img,script,iframe,a[href^="javascript:"]')).toHaveCount(0)
 expect(await page.evaluate(() => window.__xss)).toBeUndefined()
 expect(capture.blocked).toEqual([])
 const many = structuredClone(graph); many.nodes = []; many.operations = []
 let parentId = null
 for (let i = 0; i < 60; i++) {
  const id = `d7020000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`
  const role = i % 2 === 0 ? 'user' : 'assistant'
  const content = `History row ${i}\n\n` + 'Readable content line.\n'.repeat(4) + (i === 59 ? '\n```mermaid\ngraph LR; A-->B\n```' : '')
  many.nodes.push({ id, parentId, role, content, executionId: null, operationId: graph.nodes[0].operationId, status: 'SUCCEEDED', response: null }); parentId = id
 }
 await page.route(`**/api/ai/conversations/${conversationId}/graph`, route => route.request().method() === 'GET' ? route.fulfill({ json: many }) : route.fallback())
 await page.reload(); await page.getByRole('button', { name: title, exact: false }).click()
 await expect(page.locator('.chat-log > li')).toHaveCount(40)
 await page.waitForTimeout(300) // Settle initial Markdown presentation before measuring history.
 const feed = page.getByTestId('chat-feed')
 await feed.evaluate(el => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')) })
 await expect(page.getByTestId('return-bottom')).toHaveCount(0)
 await page.locator('.chat-log > li').last().getByRole('button', { name: /渲染图表|Render diagram/ }).click()
 await expect(page.locator('.chat-log > li').last().locator('.eap-rich-text__diagram svg')).toBeVisible()
 await expect.poll(() => feed.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(2)
 await feed.evaluate(el => { el.scrollTop = 500; el.dispatchEvent(new Event('scroll')) })
 await expect(page.getByTestId('return-bottom')).toBeVisible()
 const readAnchor = () => feed.evaluate(el => { const row = [...el.querySelectorAll('.chat-log > li')].find(n => n.getBoundingClientRect().bottom > el.getBoundingClientRect().top); return { text: row?.textContent, offset: row?.getBoundingClientRect().top - el.getBoundingClientRect().top } })
 const pausedBefore = await readAnchor()
 await page.locator('.chat-log > li').last().locator('summary').evaluate(el => el.click())
 await page.waitForTimeout(150) // Settle the real source-detail expansion and ResizeObserver.
 const pausedAfter = await readAnchor()
 expect(pausedAfter.text).toBe(pausedBefore.text)
 expect(Math.abs(pausedAfter.offset - pausedBefore.offset)).toBeLessThan(3)
 await feed.evaluate(el => {
   window.__feedTrace = []
   const sample = event => { const row = [...el.querySelectorAll('.chat-log > li')].find(n => n.textContent.startsWith('History row 20')); window.__feedTrace.push({ event, time: performance.now(), top: el.scrollTop, height: el.scrollHeight, anchorOffset: row?.getBoundingClientRect().top - el.getBoundingClientRect().top, count: el.querySelectorAll('.chat-log > li').length }) }
   el.addEventListener('scroll', () => sample('native-scroll'))
   new ResizeObserver(() => sample('log-resize')).observe(el.querySelector('.chat-log'))
   sample('before-prepend')
 })
 // Real infinite-scroll start edge; capture the visible anchor before its event.
 const before = await feed.evaluate(el => { el.scrollTop = 50; const row = [...el.querySelectorAll('.chat-log > li')].find(n => n.getBoundingClientRect().bottom > el.getBoundingClientRect().top); const anchor = { id: row?.dataset.messageId, text: row?.textContent, offset: row?.getBoundingClientRect().top - el.getBoundingClientRect().top }; return anchor })
 await expect(page.locator('.chat-log > li')).toHaveCount(60)
 await page.waitForTimeout(300) // RichText's 80ms presentation debounce and resize observation.
 const firstVisibleAfter = await readAnchor()
 const after = await feed.evaluate((el, id) => { const row = [...el.querySelectorAll('.chat-log > li')].find(n => n.dataset.messageId === id); return { id: row?.dataset.messageId, text: row?.textContent, offset: row?.getBoundingClientRect().top - el.getBoundingClientRect().top } }, before.id)
 const feedTrace = await page.evaluate(() => window.__feedTrace)
 console.log('ANCHORS', JSON.stringify({ before, after }))
 const prependRetainsReadingAnchor = after.text === before.text && Math.abs(after.offset - before.offset) < 3
 await page.getByTestId('return-bottom').click()
 await expect.poll(() => feed.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(2)
 expect(capture.errors).toEqual([]); expect(capture.blocked).toEqual([])
 await writeFile(`${root}/after-scroll-results.json`, JSON.stringify({ sourceHash, startedAt, consoleTrace, fixture: '60 valid linear graph nodes, same actual app', pauseAndReturn: true, bottomFollowDuringMermaidGrowth: true, pausedSourceExpansionPreservesAnchor: true, pausedBefore, pausedAfter, hostileMarkupSanitized: true, prependRetainsReadingAnchor, offsetDrift: Math.abs(after.offset - before.offset), before, after, firstVisibleAfter, feedTrace, ...capture }, null, 2) + '\n')
 expect(prependRetainsReadingAnchor).toBe(true)
 console.log('PASS sanitization, scroll pause/return and prepend preservation')
} finally { await browser.close() }
