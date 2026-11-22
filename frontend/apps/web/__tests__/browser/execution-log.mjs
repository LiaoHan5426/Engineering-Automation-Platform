import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadPlaywright } from './playwright-runtime.mjs'

const require = createRequire(resolve('frontend/package.json'))
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)
const { default: vue } = await import(pathToFileURL(require.resolve('@vitejs/plugin-vue')).href)
const { chromium } = loadPlaywright()
const entry = `import { createApp, h, ref } from 'vue';
import Dialog from '/apps/web/src/features/chat/ExecutionLogDialog.vue';
import { i18n } from '/apps/web/src/lib/i18n.ts';
import '@eap/ui/styles.css';
createApp({setup(){ const open=ref(false); return ()=>h('main', [h('button', {id:'open', onClick:()=>open.value=true}, '执行记录'), open.value ? h(Dialog,{conversationId:'conversation-browser', executionId:'execution-browser', onClose:()=>open.value=false}) : null]) }}).use(i18n).mount('#app');`
const server = await createServer({
  configFile: false,
  cacheDir: resolve('frontend/apps/web/__tests__/browser/.cache/execution-log'),
  root: resolve('frontend'),
  plugins: [
    vue(),
    {
      name: 'execution-log-browser-harness',
      resolveId(id) {
        if (id === '/execution-harness.ts') return resolve('frontend/apps/web/execution-harness.ts')
      },
      load(id) {
        if (id.replaceAll('\\', '/').toLowerCase() === resolve('frontend/apps/web/execution-harness.ts').replaceAll('\\', '/').toLowerCase()) return entry
      },
      configureServer(host) {
        host.middlewares.use(async (req, res, next) => {
          if (req.url !== '/execution-harness') return next()
          res.setHeader('Content-Type', 'text/html')
          res.end(
            await host.transformIndexHtml(
              '/execution-harness',
              '<html><body><div id="app"></div><script type="module" src="/execution-harness.ts"></script></body></html>',
            ),
          )
        })
      },
    },
  ],
  server: { host: '127.0.0.1', port: 5198, strictPort: true },
})
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => console.error('Page error:', error.message))
  let reads = 0
  await page.route(
    '**/ai/conversations/conversation-browser/executions/execution-browser/snapshot?*',
    async (route) => {
      reads++
      if (reads === 2)
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: '暂时无法读取', code: 'UNAVAILABLE' }),
        })
      await route.fulfill({
        json: {
          conversationId: 'conversation-browser',
          executionId: 'execution-browser',
          status: 'UNKNOWN',
          complete: false,
          latestSequence: 1,
          events: [
            {
              eventId: '1',
              sequence: 1,
              type: 'status',
              occurredAt: '2026-11-22T15:00:00Z',
              text: '浏览器只读证据',
              status: 'RUNNING',
            },
          ],
        },
      })
    },
  )
  await page.goto('http://127.0.0.1:5198/execution-harness')
  await page.locator('#open').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByText('浏览器只读证据').waitFor()
  assert.match(await dialog.innerText(), /结果未确认/)
  await page.getByTestId('execution-log-refresh').click()
  await page.getByTestId('execution-log-error').waitFor()
  assert.match(await dialog.innerText(), /浏览器只读证据/)
  await page.getByTestId('execution-log-refresh').click()
  await page.getByTestId('execution-log-error').waitFor({ state: 'detached' })
  assert.equal(reads, 3)
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'execution-log-refresh')
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  assert.equal(await page.locator('#open').evaluate((el) => el === document.activeElement), true)
  console.log(
    'PASS: 390px dialog open, read, refresh failure, retained evidence, retry, Escape and focus return; HTTP fixture only.',
  )
} finally {
  await browser?.close()
  await server.close()
}
