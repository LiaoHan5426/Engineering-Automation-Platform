import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'vite-plus'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const root = resolve('..')
const launch = JSON.parse(
  await readFile(resolve(root, 'backend/target/session-optimization/current-live.json'), 'utf8'),
)
const host = JSON.parse(await readFile(resolve(launch.session, 'host.json'), 'utf8'))
const target = 'http://127.0.0.1:' + host.port
const output = resolve('apps/web/__tests__/browser/artifacts/conversation-optimization')
await mkdir(output, { recursive: true })
const { chromium } = createRequire(import.meta.url)(process.env.EAP_PLAYWRIGHT_MODULE)
const server = await createServer({
  configFile: false,
  root: resolve('apps/web'),
  plugins: [vue(), tailwindcss()],
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('/api'),
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: { '/api': { target, changeOrigin: true }, '/qa': { target, changeOrigin: true } },
  },
})
const errors = [],
  external = [],
  checks = []
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
  const url = server.resolvedUrls.local[0]
  for (const language of ['zh-CN', 'en-US']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    page.setDefaultTimeout(20000)
    const requests = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/'))
        requests.push(new URL(request.url()).pathname)
    })
    await page.route('**/*', (route) => {
      const address = route.request().url()
      if (/^https?:/.test(address) && new URL(address).hostname !== '127.0.0.1') {
        external.push(address)
        return route.abort()
      }
      return route.continue()
    })
    await page.request.post(url + 'qa/conversation-recovery/expire', { data: {} })
    await context.addInitScript(
      ({ host, language }) => {
        if (localStorage.getItem('eap.recovery-seeded')) return
        localStorage.setItem(
          encodeURIComponent('/api') + '.eap.chat.history.v1',
          JSON.stringify({
            version: 1,
            activeId: host.conversationId,
            items: [
              {
                id: host.conversationId,
                title: 'Conversation recovery verification',
                draft: 'Verify this preserved draft once.',
                archived: false,
                workspaceLabel: host.workspaceLabel,
                memory: '',
                connectionId: host.connectionId,
                model: host.model,
              },
            ],
            transcripts: { [host.conversationId]: [] },
          }),
        )
        localStorage.setItem('eap.locale', language)
        localStorage.setItem('eap.recovery-seeded', 'true')
      },
      { host, language },
    )
    await page.goto(url + '#chat')
    await page.addScriptTag({
      type: 'module',
      url: '/__tests__/browser/conversationOptimizationProbe.ts',
    })
    await page.waitForFunction(() => typeof window.__conversationLanguage === 'function')
    await page.evaluate((language) => window.__conversationLanguage(language), language)
    await page.getByTestId('reconnect-session').waitFor()
    await page.getByTestId('reconnect-session').click()
    await page.locator('.eap-confirm__actions button').first().click()
    await page.getByTestId('turn-context-budget').waitFor()
    assert.equal(requests.filter((path) => path.endsWith('/reconnect')).length, 1)
    assert.equal(requests.filter((path) => path.endsWith('/connection')).length, 0)
    assert.equal(requests.filter((path) => path.endsWith('/messages')).length, 1)
    assert.equal(await page.getByTestId('reconnect-session').count(), 0)
    const budget = page.getByTestId('turn-context-budget')
    assert.equal(await budget.getAttribute('open'), null)
    assert.equal(await page.getByTestId('turn-artifacts').getAttribute('open'), null)
    assert.ok(!(await page.locator('body').innerText()).includes('COMPRESSION_NOT_ENABLED'))
    await page.getByTestId('open-changes').click()
    await page.getByTestId('verification-result').waitFor()
    const visible = await page.locator('body').innerText()
    assert.ok(!visible.includes('verification ='))
    assert.ok(!visible.includes('eap.runtime.verification.enabled=false'))
    assert.ok(!visible.includes('ai-trace'))
    assert.match(
      await page.getByTestId('verification-result').innerText(),
      language === 'zh-CN' ? /尚未运行检查/ : /Checks have not run yet/,
    )
    assert.equal(await page.getByTestId('delivery-preview-link').count(), 1)
    await page.screenshot({ path: resolve(output, 'chat-' + language + '-1440.png') })
    const persisted = await page.evaluate(() =>
      JSON.parse(localStorage.getItem(encodeURIComponent('/api') + '.eap.chat.history.v1')),
    )
    assert.equal(persisted.transcripts[host.conversationId].length, 2)
    assert.equal(persisted.items[0].draft, '')
    assert.ok(!('errorMessage' in persisted.transcripts[host.conversationId][1]))
    // Reload without reseeding: the actual saved transcript survives and sends no new request.
    await page.reload()
    await page.addScriptTag({
      type: 'module',
      url: '/__tests__/browser/conversationOptimizationProbe.ts',
    })
    await page.waitForFunction(() => typeof window.__conversationLanguage === 'function')
    await page.evaluate((language) => window.__conversationLanguage(language), language)
    await budget.waitFor()
    assert.equal(requests.filter((path) => path.endsWith('/messages')).length, 1)
    // The storage snapshot, source expansion and responsive layout are independently observable.
    await budget.locator('summary').click()
    assert.ok((await budget.innerText()).includes('COMPRESSION_NOT_ENABLED'))
    for (const width of [900, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.screenshot({ path: resolve(output, 'chat-' + language + '-' + width + '.png') })
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
      assert.equal(overflow, false)
    }
    const evidence = await (
      await page.request.get(
        url + 'qa/conversation-recovery/evidence?conversationId=' + host.conversationId,
      )
    ).json()
    checks.push({
      language,
      requests,
      persistedTurns: persisted.transcripts[host.conversationId].length,
      viewports: [1440, 900, 390],
      ...evidence,
    })
    await context.close()
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(external, [])
  assert.equal(checks.at(-1).providerCalls, 2)
  await writeFile(
    resolve(output, 'browser-result.json'),
    JSON.stringify(
      {
        kind: 'Production Vue UI and runtime client against isolated full application',
        checks,
        errors,
        external,
        userProductAcceptance: false,
      },
      null,
      2,
    ),
  )
  process.stdout.write(
    JSON.stringify({
      passedLanguageGroups: checks.length,
      providerCalls: 2,
      externalModelCalls: 0,
    }) + String.fromCharCode(10),
  )
} catch (error) {
  await writeFile(
    resolve(output, 'browser-failure.json'),
    JSON.stringify({ message: String(error), errors, external }, null, 2),
  )
  throw error
} finally {
  await browser?.close()
  await server.close()
}
