// Opt-in acceptance against the test-only socket host. No intercepted API responses or product fault endpoints.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile, access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createServer } from 'vite-plus'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const { values } = parseArgs({ options: { session: { type: 'string' } } })
assert.ok(values.session)
const session = resolve(values.session)
const input = JSON.parse(await readFile(resolve(session, 'browser-input.json'), 'utf8'))
assert.equal(input.session, session)
assert.match(input.base, /^http:\/\/127\.0\.0\.1:\d+$/)
const { chromium } = createRequire(import.meta.url)(process.env.EAP_PLAYWRIGHT_MODULE)
const server = await createServer({
  configFile: false,
  root: resolve(input.frontend, 'apps/web'),
  plugins: [vue(), tailwindcss()],
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('/api'),
    'import.meta.env.VITE_USE_MOCK': JSON.stringify('false'),
  },
  server: {
    host: '127.0.0.1',
    port: 5187,
    strictPort: true,
    proxy: { '/api': { target: input.base, changeOrigin: true } },
  },
})
let browser
const checks = [],
  errors = [],
  reviews = []
const route = '/api/cli-programs/git/operations/git-status/executions'
const endpoint = route + '/' + input.executionId
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
async function handshake(request, reply) {
  await writeFile(resolve(session, request), 'owned-process-review')
  for (let i = 0; i < 600; i++) {
    try {
      await access(resolve(session, reply))
      return
    } catch {
      await wait(50)
    }
  }
  throw new Error('OS review handshake timeout: ' + reply)
}
try {
  await server.listen()
  browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  page.setDefaultTimeout(15000)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (request.url().endsWith('/resolve-unknown') && request.method() === 'POST')
      reviews.push(request.postDataJSON())
  })
  const button = (suffix) => page.getByTestId('trusted-git-status-' + suffix)
  const api = async (method, path, body, expected) => {
    const response = await page.request.fetch('http://127.0.0.1:5187' + path, {
      method,
      data: body,
      headers: { 'Content-Type': 'application/json' },
    })
    assert.equal(response.status(), expected, await response.text())
    return response.json()
  }
  await page.goto('http://127.0.0.1:5187/__tests__/browser/fixtures/tool-unknown/index.html')
  await button('unknown').waitFor()
  assert.equal(await button('invoke').isDisabled(), true)
  assert.equal(await page.getByTestId('trusted-git-diff-invoke').isEnabled(), true)
  const original = await api('GET', endpoint, undefined, 200)
  await api('POST', route, { requestId: crypto.randomUUID() }, 409)
  await api('GET', endpoint.replace('git-status', 'git-diff'), undefined, 404)
  checks.push('restart UNKNOWN blocks only the same operation; cross-operation detail denied')

  await button('process-inspect').click()
  const observation = button('process-observation')
  await observation.waitFor()
  if (input.realGit) {
    assert.doesNotMatch(await observation.innerText(), /身份匹配，进程仍存活/)
    assert.match(await observation.innerText(), /当前未找到该 PID/)
    assert.deepEqual(await api('GET', endpoint, undefined, 200), original)
    assert.equal(await button('invoke').isDisabled(), true)
    assert.equal(await button('review-open').isDisabled(), true)
    assert.equal(reviews.length, 0)
    await page.screenshot({ path: resolve(session, 'real-git-unknown.png'), fullPage: true })
    checks.push(
      'actual Git was abnormally terminated before host crash; persisted UNKNOWN does not infer an exit result',
    )
    await handshake('verify-git-stopped.request', 'tree-stopped.json')
    checks.push(
      'exact owned Git tree audit confirms stopped; missing PID still does not attest or close',
    )
  } else {
    assert.ok((await observation.innerText()).match(/身份匹配，进程仍存活/g).length >= 2)
    assert.deepEqual(await api('GET', endpoint, undefined, 200), original)
    assert.equal(await button('review-open').isDisabled(), true)
    await page.screenshot({ path: resolve(session, 'parent-and-child-alive.png'), fullPage: true })
    checks.push(
      'real OS parent and child match; inspection preserves UNKNOWN and manual confirmation',
    )

    await handshake('stop-parent.request', 'parent-stopped.json')
    await button('process-inspect').click()
    await observation.getByText('当前未找到该 PID', { exact: false }).first().waitFor()
    assert.match(
      await observation.innerText(),
      new RegExp('已观察的子进程 · 身份匹配，进程仍存活 · PID ' + input.childPid),
    )
    assert.equal(await button('invoke').isDisabled(), true)
    assert.equal(await button('review-open').isDisabled(), true)
    await page.screenshot({
      path: resolve(session, 'parent-exited-child-alive.png'),
      fullPage: true,
    })
    checks.push('parent exit leaves captured child alive; no automatic release')

    await handshake('stop-child.request', 'tree-stopped.json')
    await button('process-inspect').click()
    await page.waitForFunction(() => {
      const text = document.querySelector(
        '[data-testid="trusted-git-status-process-observation"]',
      )?.textContent
      return text?.includes('当前未找到该 PID') && !text.includes('身份匹配，进程仍存活')
    })
    assert.equal(await button('review-open').isDisabled(), true)
    assert.equal(reviews.length, 0)
    checks.push('verified owned tree stopped; observation still does not attest or close')
  }

  const note = input.realGit
    ? 'Real Git fault acceptance: verified the owned Git process and its captured helper tree stopped by exact PID, start time and executable after forced abnormal termination. Automated review, not product user acceptance.'
    : 'Controlled acceptance harness: verified captured parent, owned Java child and captured helper processes stopped by exact PID, start time and executable. Automated review fixture, not product user acceptance.'
  await button('review-note').fill(note)
  assert.equal(await button('review-open').isDisabled(), true)
  await button('review-checked').check()
  await button('review-open').click()
  const dialog = page.getByRole('dialog', { name: '关闭这条 UNKNOWN 的启动阻塞' })
  await dialog.waitFor()
  assert.equal(reviews.length, 0)
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 960 })
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      true,
    )
    await page.screenshot({
      path: resolve(session, 'review-confirm-' + width + '.png'),
      fullPage: true,
    })
  }
  await dialog.getByRole('button', { name: '保存核对并关闭阻塞', exact: true }).click()
  await button('summary').filter({ hasText: '人工关闭（结果仍未知）' }).waitFor()
  assert.equal(reviews.length, 1)
  assert.equal(reviews[0].note, note)
  assert.equal(await button('invoke').isEnabled(), true)
  const closed = await api('GET', endpoint, undefined, 200)
  assert.equal(closed.status, 'CLOSED_UNKNOWN')
  assert.equal(closed.resolution.operator, 'local-operator')
  assert.equal(closed.resolution.note, note)
  assert.ok(closed.resolution.resolvedAt)
  for (const [key, value] of Object.entries(original)) {
    if (!['status', 'resolution'].includes(key))
      assert.deepEqual(closed[key], value, 'preserved field ' + key)
  }
  assert.deepEqual(await api('POST', endpoint + '/resolve-unknown', reviews[0], 200), closed)
  await api(
    'POST',
    endpoint + '/resolve-unknown',
    { ...reviews[0], requestId: crypto.randomUUID() },
    409,
  )
  assert.deepEqual(await api('POST', route, { requestId: input.requestId }, 202), closed)
  assert.deepEqual(await api('POST', endpoint + '/cancel', undefined, 200), closed)
  checks.push(
    'notes + attestation + second confirmation persist closure; original evidence and idempotency preserved',
  )

  await page.reload()
  await button('summary').filter({ hasText: '人工关闭（结果仍未知）' }).waitFor()
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.screenshot({ path: resolve(session, 'closed-reloaded.png'), fullPage: true })
  await button('invoke').click()
  await button('summary').filter({ hasText: '执行成功' }).waitFor()
  const newId = await button('summary').locator('code').innerText()
  assert.notEqual(newId, input.executionId)
  const recovered = await api('GET', route + '/' + newId, undefined, 200)
  assert.equal(recovered.status, 'SUCCEEDED')
  if (input.realGit) {
    assert.match(recovered.stdout, /file-0-/)
    assert.equal(recovered.truncated, true)
  }
  assert.deepEqual(await api('GET', endpoint, undefined, 200), closed)
  const historical = page
    .getByTestId('trusted-git-status-history')
    .locator('li')
    .filter({ hasText: input.executionId })
  await historical.locator('summary').click()
  await button('history-open-' + input.executionId).click()
  await button('summary').filter({ hasText: input.executionId }).waitFor()
  await button('process-inspect').click()
  await observation.waitFor()
  assert.equal(await button('review-open').count(), 0)
  const savedEvidence = button('execution-evidence')
  await savedEvidence.locator('summary').click()
  assert.match(await savedEvidence.innerText(), /processPid/)
  assert.match(await savedEvidence.innerText(), /步骤状态不表示当前进程仍在运行/)
  if (input.realGit) assert.match(await savedEvidence.innerText(), /status/)
  assert.equal(reviews.length, 1)
  await page.screenshot({ path: resolve(session, 'closed-history-reopened.png'), fullPage: true })
  checks.push(
    'historical closure reopens through real scoped GET; captured identity review remains available',
  )
  checks.push(
    'reload restores audit; explicit new request executes actual Git without changing the closed record',
  )
  assert.deepEqual(errors, [])
  await writeFile(
    resolve(session, 'browser-result.json'),
    JSON.stringify({ passed: checks.length, checks, errors }, null, 2),
  )
} catch (error) {
  await writeFile(
    resolve(session, 'browser-result.json'),
    JSON.stringify({ checks, errors, failure: String(error) }, null, 2),
  )
  throw error
} finally {
  await browser?.close()
  await server.close()
}
