// Opt-in acceptance against real HTTP/JDBC. Optional test proxy drops one actual committed review response.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile, appendFile, access } from 'node:fs/promises'
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
let droppedReviewResponse = false
let droppedCancelResponse = false
const server = await createServer({
  configFile: false,
  root: resolve(input.frontend, 'apps/web'),
  plugins: [vue(), tailwindcss()],
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('/api'),
  },
  server: {
    host: '127.0.0.1',
    port: 5187,
    strictPort: true,
    proxy: {
      '/api': {
        target: input.base,
        changeOrigin: true,
        selfHandleResponse: true,
        configure(proxy) {
          proxy.on('proxyRes', (upstream, request, response) => {
            if (request.method === 'POST' && request.url?.endsWith('/resolve-unknown')) {
              const observed = []
              upstream.on('data', (chunk) => observed.push(chunk))
              upstream.on('end', () => {
                void appendFile(
                  resolve(session, 'review-http-responses.jsonl'),
                  JSON.stringify({
                    status: upstream.statusCode,
                    body: Buffer.concat(observed).toString('utf8'),
                  }) + '\n',
                ).catch(() => {})
              })
            }
            const path =
              '/api/cli-programs/git/operations/' +
              input.operation +
              '/executions/' +
              input.executionId
            const kind =
              input.dropCancelResponse && !droppedCancelResponse && request.url === path + '/cancel'
                ? 'cancel'
                : input.dropReviewResponse &&
                    !droppedReviewResponse &&
                    request.url === path + '/resolve-unknown'
                  ? 'review'
                  : null
            if (kind && upstream.statusCode === 200 && request.method === 'POST') {
              if (kind === 'cancel') droppedCancelResponse = true
              else droppedReviewResponse = true
              const chunks = []
              upstream.on('data', (chunk) => chunks.push(chunk))
              upstream.on('error', () => response.destroy())
              upstream.on('end', () => {
                // The real backend has committed and returned; drop transport only, never manufacture a DTO.
                void writeFile(
                  resolve(session, 'dropped-' + kind + '-response.json'),
                  JSON.stringify({
                    status: upstream.statusCode,
                    body: Buffer.concat(chunks).toString('utf8'),
                  }),
                ).then(
                  () => {
                    // Flush actual headers first; Chromium may retry an empty stale-socket reset.
                    // Interrupt the declared body in transit to exercise network failure without replay.
                    response.writeHead(upstream.statusCode, {
                      'content-type': upstream.headers['content-type'],
                      'content-length': Buffer.concat(chunks).length,
                      connection: 'close',
                    })
                    response.flushHeaders()
                    setTimeout(() => response.destroy(), 25)
                  },
                  () => response.destroy(),
                )
              })
              return
            }
            response.writeHead(upstream.statusCode ?? 502, upstream.headers)
            upstream.on('error', () => response.destroy())
            upstream.pipe(response)
          })
        },
      },
    },
  },
})
let browser, page
const checks = [],
  errors = [],
  reviews = [],
  cancellations = []
const operation = input.operation ?? 'git-status'
assert.ok(['git-status', 'git-diff'].includes(operation))
const otherOperation = operation === 'git-diff' ? 'git-status' : 'git-diff'
const operationLabel = operation === 'git-diff' ? 'Git · 读取未暂存差异' : 'Git · 读取工作区状态'
const route = '/api/cli-programs/git/operations/' + operation + '/executions'
const endpoint = route + '/' + input.executionId
const expectedReviewPosts = input.databaseReview === 'db-review-before' ? 2 : 1
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
  page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  page.setDefaultTimeout(15000)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (request.url().endsWith('/resolve-unknown') && request.method() === 'POST')
      reviews.push(request.postDataJSON())
    if (request.url().endsWith('/cancel') && request.method() === 'POST')
      cancellations.push(request.url())
  })
  const button = (suffix) => page.getByTestId('trusted-' + operation + '-' + suffix)
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
  if (input.phase === 'cancel') {
    await button('summary').filter({ hasText: '执行中' }).waitFor()
    const original = await api('GET', endpoint, undefined, 200)
    assert.equal(original.status, 'RUNNING')
    assert.equal(original.cancelRequested, false)
    await button('cancel').click()
    await button('network').waitFor()
    const dropped = JSON.parse(
      await readFile(resolve(session, 'dropped-cancel-response.json'), 'utf8'),
    )
    assert.equal(dropped.status, 200)
    const persisted = JSON.parse(dropped.body)
    assert.equal(persisted.status, 'CANCELLING')
    assert.equal(persisted.cancelRequested, true)
    assert.equal(persisted.exitCode, null)
    assert.equal(persisted.exitEvidence, null)
    assert.deepEqual(await api('GET', endpoint, undefined, 200), persisted)
    checks.push(
      'real cancel commits CANCELLING and cancellation intent before its HTTP body is interrupted',
    )
    assert.equal(await button('cancel').isDisabled(), true)
    assert.equal(await button('invoke').isDisabled(), true)
    assert.equal(await button('cancelled').count(), 0)
    await wait(1200)
    assert.equal(cancellations.length, 1)
    assert.equal(reviews.length, 0)
    checks.push(
      'uncertain cancellation blocks another cancel and start; no automatic cancellation retry or false terminal',
    )
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 960 })
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        true,
      )
      await page.screenshot({
        path: resolve(session, 'cancel-response-lost-' + width + '.png'),
        fullPage: true,
      })
    }
    await button('recheck').click()
    await button('cancelling').waitFor()
    assert.equal(await button('network').count(), 0)
    assert.equal(await button('cancel').isDisabled(), true)
    assert.equal(await button('invoke').isDisabled(), true)
    assert.equal(cancellations.length, 1)
    assert.deepEqual(await api('GET', endpoint, undefined, 200), persisted)
    checks.push(
      'explicit query restores CANCELLING without resending cancel or inventing process exit',
    )
    await page.setViewportSize({ width: 1440, height: 960 })
    await page.screenshot({ path: resolve(session, 'cancel-rechecked.png'), fullPage: true })
    assert.deepEqual(errors, [])
    await writeFile(
      resolve(session, 'cancel-browser-result.json'),
      JSON.stringify(
        {
          passed: checks.length,
          checks,
          errors,
          cancellationPosts: cancellations.length,
        },
        null,
        2,
      ),
    )
  } else if (input.phase === 'committed') {
    await button('summary').filter({ hasText: '执行成功' }).waitFor()
    const committed = await api('GET', endpoint, undefined, 200)
    assert.equal(committed.status, 'SUCCEEDED')
    assert.equal(await button('unknown').count(), 0)
    assert.equal(await button('review-open').count(), 0)
    await api(
      'POST',
      endpoint + '/resolve-unknown',
      {
        requestId: crypto.randomUUID(),
        note: 'Committed result is not an unknown outcome',
        processTreeStopped: true,
      },
      409,
    )
    checks.push(
      'real commit followed by connection loss preserves SUCCEEDED and rejects UNKNOWN closure',
    )
    await button('recheck').click()
    await button('summary').filter({ hasText: input.executionId }).waitFor()
    assert.deepEqual(await api('POST', route, { requestId: input.requestId }, 202), committed)
    checks.push(
      'explicit query and the original request recover the exact committed result without replay',
    )
    await button('invoke').click()
    await page.waitForFunction(
      ({ operation, originalId }) => {
        const text = document.querySelector(
          '[data-testid="trusted-' + operation + '-summary"]',
        )?.textContent
        return text?.includes('执行成功') && !text.includes(originalId)
      },
      { operation, originalId: input.executionId },
    )
    assert.deepEqual(await api('GET', endpoint, undefined, 200), committed)
    assert.equal(reviews.length, 0)
    checks.push('a new explicit request succeeds and keeps the original committed evidence')
    await page.screenshot({ path: resolve(session, 'database-committed.png'), fullPage: true })
    assert.deepEqual(errors, [])
    await writeFile(
      resolve(session, 'browser-result.json'),
      JSON.stringify({ passed: checks.length, checks, errors }, null, 2),
    )
  } else {
    await button('unknown').waitFor()
    assert.equal(await button('invoke').isDisabled(), true)
    await page.waitForFunction(
      (id) => {
        const element = document.querySelector('[data-testid="' + id + '"]')
        return element instanceof HTMLButtonElement && !element.disabled
      },
      'trusted-' + otherOperation + '-invoke',
    )
    const original = await api('GET', endpoint, undefined, 200)
    if (original.cancelRequested) {
      await button('cancel-unconfirmed').waitFor()
      assert.equal(await button('cancelled').count(), 0)
      checks.push(
        'persisted cancellation intent remains visible without claiming confirmed cancellation',
      )
    }
    await api('POST', route, { requestId: crypto.randomUUID() }, 409)
    await api('GET', endpoint.replace(operation, otherOperation), undefined, 404)
    await api(
      'POST',
      endpoint.replace(operation, otherOperation) + '/resolve-unknown',
      {
        requestId: crypto.randomUUID(),
        note: 'Wrong operation must never close this execution',
        processTreeStopped: true,
      },
      404,
    )
    await api(
      'POST',
      endpoint + '/resolve-unknown',
      {
        requestId: crypto.randomUUID(),
        note: 'Fixture has not confirmed the process tree',
        processTreeStopped: false,
      },
      400,
    )
    assert.deepEqual(await api('GET', endpoint, undefined, 200), original)
    checks.push(
      'restart UNKNOWN blocks only the same operation; cross-operation detail and incomplete attestation denied',
    )

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
        'actual Git exited before host crash; persisted UNKNOWN does not infer an uncommitted result',
      )
      await handshake('verify-git-stopped.request', 'tree-stopped.json')
      checks.push(
        'exact owned Git tree audit confirms stopped; missing PID still does not attest or close',
      )
    } else {
      assert.ok((await observation.innerText()).match(/身份匹配，进程仍存活/g).length >= 2)
      assert.deepEqual(await api('GET', endpoint, undefined, 200), original)
      assert.equal(await button('review-open').isDisabled(), true)
      await page.screenshot({
        path: resolve(session, 'parent-and-child-alive.png'),
        fullPage: true,
      })
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
      await page.waitForFunction((op) => {
        const text = document.querySelector(
          '[data-testid="trusted-' + op + '-process-observation"]',
        )?.textContent
        return text?.includes('当前未找到该 PID') && !text.includes('身份匹配，进程仍存活')
      }, operation)
      assert.equal(await button('review-open').isDisabled(), true)
      assert.equal(reviews.length, 0)
      checks.push('verified owned tree stopped; observation still does not attest or close')
    }

    if (input.environmentFault) {
      const draft = 'Retained review input while execution authorization is unavailable'
      await button('review-note').fill(draft)
      await handshake('invalidate-environment.request', 'environment-invalid.json')
      await button('recheck').click()
      const reason =
        input.environmentFault === 'workspace-loss' ? 'AUTHORIZED_ROOT_MISSING' : 'BINARY_MISSING'
      await button('readiness').filter({ hasText: reason }).waitFor()
      await button('environment').waitFor()
      assert.equal(await button('invoke').isDisabled(), true)
      assert.equal(await button('review-note').inputValue(), draft)
      if (input.environmentFault === 'workspace-loss') {
        assert.equal(await button('review-open').isDisabled(), true)
        await api('GET', endpoint, undefined, 403)
        await api('POST', route, { requestId: crypto.randomUUID() }, 403)
        await api(
          'POST',
          endpoint + '/resolve-unknown',
          {
            requestId: crypto.randomUUID(),
            note: 'Unauthorized workspace cannot be reviewed',
            processTreeStopped: true,
          },
          403,
        )
      } else {
        assert.deepEqual(await api('GET', endpoint, undefined, 200), original)
        assert.equal(await button('network').count(), 0)
      }
      await page.setViewportSize({ width: 390, height: 960 })
      await page.screenshot({
        path: resolve(session, 'environment-unavailable-390.png'),
        fullPage: true,
      })
      await handshake('environment-observed.request', 'environment-observed.json')
      checks.push(
        'actual authorization loss exposes current recovery guidance and preserves UNKNOWN plus review input',
      )
      if (input.environmentFault === 'workspace-loss') {
        await handshake('restore-environment.request', 'environment-restored.json')
        await button('recheck').click()
        await button('readiness').filter({ hasText: 'TOOL_EXECUTION_BLOCKED' }).waitFor()
        assert.equal(await button('environment').count(), 0)
        assert.equal(await button('review-note').inputValue(), draft)
        assert.deepEqual(await api('GET', endpoint, undefined, 200), original)
        checks.push(
          'restoring the original workspace and querying resumes review without replay or evidence changes',
        )
      }
    }

    const note = input.realGit
      ? 'Real Git interruption acceptance: verified the owned Git process and its captured helper tree stopped by exact PID, start time and executable. Automated review, not product user acceptance.'
      : 'Controlled acceptance harness: verified captured parent, owned Java child and captured helper processes stopped by exact PID, start time and executable. Automated review fixture, not product user acceptance.'
    await button('review-note').fill(note)
    assert.equal(await button('review-open').isDisabled(), true)
    await button('review-checked').check()
    await button('review-open').click()
    const dialog = page.getByRole('dialog', { name: '关闭这条 UNKNOWN 的启动阻塞' })
    await dialog.waitFor()
    assert.ok((await dialog.innerText()).includes(operationLabel))
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
    if (input.dropReviewResponse) {
      await button('network').waitFor()
      const transport = JSON.parse(
        await readFile(resolve(session, 'dropped-review-response.json'), 'utf8'),
      )
      assert.equal(transport.status, 200)
      assert.equal(JSON.parse(transport.body).status, 'CLOSED_UNKNOWN')
      assert.equal((await api('GET', endpoint, undefined, 200)).status, 'CLOSED_UNKNOWN')
      assert.equal(await button('invoke').isDisabled(), true)
      assert.equal(await button('review-open').isDisabled(), true)
      assert.equal(await button('review-note').isDisabled(), true)
      await wait(1200)
      assert.equal(reviews.length, 1)
      await page.screenshot({ path: resolve(session, 'review-response-lost.png'), fullPage: true })
      await button('recheck').click()
      checks.push(
        'committed review response lost: UI blocks resubmission, does not retry, explicit query restores audit',
      )
    }
    if (input.databaseReview) {
      await button('network').waitFor()
      await button('environment').filter({ hasText: '尚不能确认本次写入是否保存' }).waitFor()
      assert.equal(reviews.length, 1)
      assert.equal(await button('review-open').isDisabled(), true)
      const actual = await api('GET', endpoint, undefined, 200)
      assert.equal(
        actual.status,
        input.databaseReview === 'db-review-before' ? 'UNKNOWN' : 'CLOSED_UNKNOWN',
      )
      await page.screenshot({
        path: resolve(session, 'database-review-unconfirmed.png'),
        fullPage: true,
      })
      await wait(1200)
      assert.equal(reviews.length, 1)
      await button('recheck').click()
      if (input.databaseReview === 'db-review-before') {
        await button('unknown').waitFor()
        await page.waitForFunction(
          (op) =>
            !document.querySelector('[data-testid="trusted-' + op + '-review-open"]')?.disabled,
          operation,
        )
        await button('review-open').click()
        await dialog.waitFor()
        await dialog.getByRole('button', { name: '保存核对并关闭阻塞', exact: true }).click()
        await button('summary').filter({ hasText: '人工关闭（结果仍未知）' }).waitFor()
        assert.deepEqual(reviews[1], reviews[0])
      }
      checks.push(
        'real database disconnect during review preserves the request; query distinguishes rollback from committed audit',
      )
    }
    await button('summary').filter({ hasText: '人工关闭（结果仍未知）' }).waitFor()
    if (input.environmentFault === 'binding-loss') {
      assert.equal(await button('invoke').isDisabled(), true)
      await api('POST', route, { requestId: crypto.randomUUID() }, 409)
      await handshake('restore-environment.request', 'environment-restored.json')
      await button('recheck').click()
      await button('readiness').filter({ hasText: 'READY' }).waitFor()
      checks.push(
        'manual closure does not restore executable authorization; only binding repair and explicit query enable a new start',
      )
    }
    assert.equal(reviews.length, expectedReviewPosts)
    assert.equal(reviews[0].note, note)
    assert.equal(await button('invoke').isEnabled(), true)
    const closed = await api('GET', endpoint, undefined, 200)
    assert.equal(closed.status, 'CLOSED_UNKNOWN')
    assert.equal(closed.resolution.operator, 'local-operator')
    assert.equal(closed.resolution.note, note)
    if (original.cancelRequested) await button('cancel-unconfirmed').waitFor()
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
      if (operation === 'git-diff') {
        assert.match(recovered.stdout, /diff --git/)
        assert.match(recovered.stdout, /\+diff-recovery-marker/)
        assert.doesNotMatch(recovered.stdout, /staged-only-diff-marker|untracked-diff-marker/)
      } else assert.match(recovered.stdout, /file-0-/)
      assert.equal(recovered.truncated, true)
    }
    assert.deepEqual(await api('GET', endpoint, undefined, 200), closed)
    const historical = page
      .getByTestId('trusted-' + operation + '-history')
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
    if (input.realGit) assert.ok((await savedEvidence.innerText()).includes(operation.substring(4)))
    assert.equal(reviews.length, expectedReviewPosts)
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
  }
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: resolve(session, 'failure.png'), fullPage: true })
    await writeFile(resolve(session, 'failure.txt'), await page.locator('body').innerText())
  }
  await writeFile(
    resolve(session, 'browser-result.json'),
    JSON.stringify({ checks, errors, failure: String(error) }, null, 2),
  )
  throw error
} finally {
  await browser?.close()
  await server.close()
}
