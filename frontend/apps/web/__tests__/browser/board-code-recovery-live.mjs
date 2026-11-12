import { loadPlaywright } from './playwright-runtime.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'vite-plus'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
const root = resolve('..')
const fixture = JSON.parse(
  await readFile(resolve(root, 'backend/target/board-code-live/fixture.json'), 'utf8'),
)
const host = JSON.parse(
  await readFile(resolve(root, 'backend/target/prebound-live/process.json'), 'utf8'),
)
const oldReal = JSON.parse(
  await readFile(resolve(root, 'backend/target/prebound-live/session.json'), 'utf8'),
)
const base = host.base,
  output = resolve('apps/web/__tests__/browser/artifacts/board-code-recovery')
await mkdir(output, { recursive: true })
const { chromium } = loadPlaywright()
const server = await createServer({
  configFile: false,
  root: resolve('apps/web'),
  plugins: [vue(), tailwindcss()],
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('/api'),
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: base, changeOrigin: true } },
  },
})
const errors = [],
  external = [],
  mutations = [],
  checks = []
let browser, page
try {
  await server.listen()
  browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(20000)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (request.url().includes('/api/') && !['GET', 'HEAD'].includes(request.method()))
      mutations.push({ method: request.method(), path: new URL(request.url()).pathname })
  })
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (/^https?:/.test(url) && new URL(url).hostname !== '127.0.0.1') {
      external.push(url)
      return route.abort()
    }
    return route.continue()
  })
  const api = async (method, path, data, expected = 200) => {
    const response = await page.request.fetch(base + '/api' + path, { method, data })
    assert.equal(response.status(), expected, `${path} ${await response.text()}`)
    if (response.headers()['content-type']?.includes('json')) return response.json()
  }
  const candidatePath = (entry) =>
    '/board/tasks/' + entry.task.id + '/code-proposals/' + entry.proposal.id
  for (const entry of [fixture.pending, fixture.readonly, fixture.stale])
    await api('GET', '/ai/conversations/' + entry.proposal.conversationId, undefined, 404)
  await api('GET', '/ai/conversations/' + oldReal.conversation.conversationId, undefined, 404)
  const actual = await api(
    'GET',
    '/board/tasks/' +
      oldReal.task.id +
      '/code-proposals/' +
      oldReal.proposalId +
      '?projectId=' +
      oldReal.projectId,
  )
  assert.equal(actual.status, 'APPLIED')
  assert.equal(actual.proposal.generation.id, oldReal.generationId)
  assert.equal(actual.result.afterHash, oldReal.applied.result.afterHash)
  checks.push(
    'After genuine production JVM restart the original real-model Chat session is absent (404), while its task-owned immutable generation/proposal and applied hash remain readable without reconnect or model calls',
  )
  await page.addInitScript(
    ({ fixture, oldReal }) => {
      localStorage.setItem(
        'eap.local-projects.v1',
        JSON.stringify([
          { id: fixture.projectId, label: 'Candidate restart recovery', intendedPath: '' },
          { id: oldReal.projectId, label: 'Original real model evidence', intendedPath: '' },
        ]),
      )
      localStorage.setItem('eap.selected-project.v1', fixture.projectId)
    },
    { fixture, oldReal },
  )
  await page.goto('http://127.0.0.1:5173/#board')
  await page.getByTestId('preview-board').waitFor()
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem(encodeURIComponent('/api') + '.eap.chat.history.v1'),
    ),
    null,
  )
  const openTask = async (entry) => {
    if (await page.getByTestId('board-close-detail').count())
      await page.getByTestId('board-close-detail').click()
    await page.getByRole('button').filter({ hasText: entry.task.title }).first().click()
    await page.getByTestId('board-tab-code').click()
    await page.getByTestId('board-code-refresh').click()
    await page.getByTestId('board-code-open').click()
    await page.getByTestId('board-code-review').waitFor()
    await page.getByTestId('proposal-status').waitFor()
  }
  await openTask(fixture.pending)
  await page.getByTestId('proposal-diff-monaco').waitFor({ state: 'visible' })
  const before = await readFile(
    resolve(fixture.workspace, fixture.pending.proposal.files[0].path),
    'utf8',
  )
  let saved = await api('GET', candidatePath(fixture.pending) + '?projectId=' + fixture.projectId)
  if (saved.status === 'PROPOSED') {
    assert.equal(before, fixture.pending.before)
    assert.equal(await page.getByTestId('proposal-apply').isDisabled(), true)
    await page.route(
      '**/code-proposals/' + fixture.pending.proposal.id + '/apply',
      async (route) => {
        const response = await route.fetch()
        assert.equal(response.status(), 200)
        await route.abort('failed')
      },
    )
    await page.getByTestId('proposal-application').getByRole('checkbox').check()
    await page.getByTestId('proposal-apply').click()
    await page.getByTestId('application-recorded').waitFor()
    await page.unroute('**/code-proposals/' + fixture.pending.proposal.id + '/apply')
  }
  saved = await api('GET', candidatePath(fixture.pending) + '?projectId=' + fixture.projectId)
  assert.equal(saved.status, 'APPLIED')
  assert.equal(
    await readFile(resolve(fixture.workspace, fixture.pending.proposal.files[0].path), 'utf8'),
    fixture.pending.after,
  )
  await page.screenshot({ path: resolve(output, 'task-recovered-applied.png'), fullPage: true })
  checks.push(
    'Fresh production App with no Chat history lists persistent task candidates, renders real Monaco Diff, requires explicit write confirmation and recovers a committed-but-lost apply response by reading the same proposal; exactly the declared fixture source changes',
  )
  await page.reload()
  await page.getByTestId('preview-board').waitFor()
  await openTask(fixture.pending)
  await page.getByTestId('application-recorded').waitFor()
  assert.equal(await page.getByTestId('proposal-apply').count(), 0)
  await api('POST', candidatePath(fixture.pending) + '/apply', {
    projectId: fixture.projectId,
    revision: fixture.pending.task.revision,
    confirmed: true,
  })
  checks.push(
    'Reload restores APPLIED and immutable evidence without Chat reconstruction or automatic write; explicit duplicate task apply replays the stored terminal result',
  )
  await openTask(fixture.readonly)
  assert.equal(
    await page.getByTestId('proposal-application').getByRole('checkbox').isDisabled(),
    true,
  )
  await api(
    'POST',
    candidatePath(fixture.readonly) + '/apply',
    { projectId: fixture.projectId, revision: fixture.readonly.task.revision, confirmed: true },
    403,
  )
  assert.equal(
    await readFile(resolve(fixture.workspace, fixture.readonly.proposal.files[0].path), 'utf8'),
    fixture.readonly.before,
  )
  checks.push(
    'Read-only candidate remains reviewable after restart, disables approval and is independently denied by the server with 403 without source changes',
  )
  await openTask(fixture.stale)
  let stale = await api('GET', candidatePath(fixture.stale) + '?projectId=' + fixture.projectId)
  if (stale.status === 'PROPOSED') {
    assert.equal(await page.getByTestId('proposal-apply').isDisabled(), true)
    await api(
      'POST',
      candidatePath(fixture.stale) + '/apply',
      { projectId: fixture.projectId, revision: fixture.stale.task.revision, confirmed: true },
      409,
    )
    await page.getByTestId('board-code-refuse').click()
    await page
      .getByRole('dialog', { name: '拒绝此源码候选', exact: true })
      .getByRole('button', { name: '拒绝此源码候选', exact: true })
      .click()
    await page.getByTestId('proposal-refused-review').waitFor()
  }
  stale = await api('GET', candidatePath(fixture.stale) + '?projectId=' + fixture.projectId)
  assert.equal(stale.status, 'REFUSED')
  assert.equal(
    await readFile(resolve(fixture.workspace, fixture.stale.proposal.files[0].path), 'utf8'),
    fixture.stale.before,
  )
  const afterRefuseTask = (
    await api('GET', '/board/tasks?projectId=' + fixture.projectId)
  ).items.find((task) => task.id === fixture.stale.task.id)
  assert.equal(afterRefuseTask.column, 'ready')
  assert.equal(afterRefuseTask.revision, fixture.stale.task.revision)
  await page.screenshot({ path: resolve(output, 'stale-refused.png'), fullPage: true })
  checks.push(
    'Stale original task revision is viewable but cannot apply; explicit confirmed refusal persists REFUSED without writing source or changing task acceptance/revision',
  )
  await api(
    'GET',
    '/board/tasks/' +
      fixture.readonly.task.id +
      '/code-proposals/' +
      fixture.pending.proposal.id +
      '?projectId=' +
      fixture.projectId,
    undefined,
    404,
  )
  await api('GET', candidatePath(fixture.pending) + '?projectId=wrong-project', undefined, 404)
  const mainResponse = await page.request.get(
    'http://127.0.0.1:8080/api' +
      candidatePath(fixture.pending) +
      '?projectId=' +
      fixture.projectId,
  )
  assert.equal(mainResponse.status(), 404)
  assert.equal(mutations.filter((item) => item.path.includes('/ai/conversations')).length, 0)
  assert.equal(mutations.filter((item) => item.path.endsWith('/apply')).length, 1)
  assert.deepEqual(errors, [])
  assert.deepEqual(external, [])
  checks.push(
    'Cross-task, cross-project and different bound workspace reads return 404; the browser makes no Chat/reconnect/model requests and issues only one explicitly confirmed application POST',
  )
  await writeFile(
    resolve(output, 'result.json'),
    JSON.stringify(
      {
        host: 'genuinely restarted production full-application jar',
        schema: 32,
        fixtureKind: fixture.fixtureKind,
        realModelEvidenceRetained: {
          taskId: oldReal.task.id,
          proposalId: oldReal.proposalId,
          afterHash: actual.result.afterHash,
        },
        checks,
        pageErrors: errors,
        externalRequests: external,
        browserMutations: mutations,
        projectId: fixture.projectId,
        taskIds: [fixture.pending.task.id, fixture.readonly.task.id, fixture.stale.task.id],
        proposalIds: [
          fixture.pending.proposal.id,
          fixture.readonly.proposal.id,
          fixture.stale.proposal.id,
        ],
        sourceChanges: {
          pending: 'exact declared after content',
          readonly: 'unchanged',
          stale: 'unchanged',
        },
        modelCalls: 0,
        chatSessionsRecreated: 0,
        userProductAcceptance: false,
      },
      null,
      2,
    ),
  )
  process.stdout.write(
    JSON.stringify({ passed: checks.length, pageErrors: errors.length, modelCalls: 0 }) + '\n',
  )
} catch (error) {
  await page?.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {})
  await writeFile(
    resolve(output, 'failure.json'),
    JSON.stringify(
      { message: error.message, checks, errors, external, mutations, url: page?.url() },
      null,
      2,
    ),
  )
  throw error
} finally {
  await browser?.close()
  await server.close()
}
