import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { createServer } from 'vite-plus'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const repository = resolve('..')
const sessionPath = resolve(repository, 'backend/target/prebound-live/session.json')
const session = JSON.parse(await readFile(sessionPath, 'utf8'))
const host = JSON.parse(
  await readFile(resolve(repository, 'backend/target/prebound-live/process.json'), 'utf8'),
)
const workspace = resolve(host.workspace),
  base = host.base
const output = resolve('apps/web/__tests__/browser/artifacts/prebound-page-delivery')
await mkdir(output, { recursive: true })
const proposal = session.final.proposal
const target = proposal.files[0].path
const { chromium } = createRequire(import.meta.url)(process.env.EAP_PLAYWRIGHT_MODULE)
const server = await createServer({
  configFile: false,
  root: resolve(workspace, 'frontend/apps/web'),
  plugins: [vue(), tailwindcss()],
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('/api'),
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    fs: { allow: [workspace, repository] },
    proxy: { '/api': { target: base, changeOrigin: true } },
  },
})
const errors = [],
  external = [],
  mutations = [],
  checks = []
let browser, page
const digest = (content) => createHash('sha256').update(content).digest('hex')
const persist = () => writeFile(sessionPath, JSON.stringify(session, null, 2))
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
  const api = async (method, path, data, status = 200) => {
    const response = await page.request.fetch(base + '/api' + path, {
      method,
      data,
      timeout: 90000,
    })
    assert.equal(response.status(), status, `${method} ${path}: ${await response.text()}`)
    return response.json()
  }
  const conversation = session.conversation,
    cid = conversation.conversationId
  await page.addInitScript(
    ({ session }) => {
      if (sessionStorage.getItem('prebound-browser-initialized')) return
      const conversation = session.conversation,
        id = conversation.conversationId
      localStorage.setItem(
        'eap.local-projects.v1',
        JSON.stringify([
          { id: session.projectId, label: 'PREBOUND page delivery', intendedPath: '' },
        ]),
      )
      localStorage.setItem('eap.selected-project.v1', session.projectId)
      localStorage.setItem(
        encodeURIComponent('/api') + '.eap.chat.history.v1',
        JSON.stringify({
          version: 1,
          activeId: id,
          items: [
            {
              id,
              title: 'Real PREBOUND page candidate',
              draft: '',
              archived: false,
              updatedAt: new Date().toISOString(),
              workspaceLabel: conversation.workspaceLabel,
              memory: conversation.memory,
              connectionId: conversation.connectionId,
              model: conversation.model,
              context: session.context,
            },
          ],
          transcripts: {
            [id]: [
              {
                role: 'assistant',
                text: session.final.answer,
                error: '',
                status: session.final.status,
                approval: '',
                verification: 'not_requested',
                toolEvents: [],
                artifactError: '',
                artifacts: [],
                proposal: session.final.proposal,
                model: conversation.model,
              },
            ],
          },
        }),
      )
      sessionStorage.setItem('prebound-browser-initialized', 'true')
    },
    { session },
  )
  await page.goto('http://127.0.0.1:5173/#chat')
  await page.getByTestId('proposal-application').waitFor()
  const applicationPath = '/ai/conversations/' + cid + '/proposals/' + proposal.id
  const original = await api('GET', applicationPath)
  if (original.status !== 'APPLIED') {
    assert.equal(original.status, 'PROPOSED')
    assert.equal(digest(await readFile(resolve(workspace, target))), session.beforeHash)
    await page.getByTestId('proposal-application').getByRole('checkbox').check()
    const applied = page.waitForResponse(
      (response) =>
        response.url().includes(applicationPath + '/apply') &&
        response.request().method() === 'POST',
    )
    await page.getByTestId('proposal-apply').click()
    assert.equal((await applied).status(), 200)
  }
  await page.getByTestId('application-identities').waitFor()
  assert.equal(await readFile(resolve(workspace, target), 'utf8'), proposal.files[0].content)
  session.applied = await api('GET', applicationPath)
  assert.equal(session.applied.status, 'APPLIED')
  assert.equal(session.applied.result.afterHash, digest(proposal.files[0].content))
  assert.deepEqual(
    await api('POST', applicationPath + '/apply', { confirmed: true }),
    session.applied.result,
  )
  await persist()
  await page.getByTestId('generation-prebound').waitFor()
  await page.getByTestId('generation-record').locator('summary').click()
  await page.getByTestId('generation-next-step').waitFor()
  await page.screenshot({ path: resolve(output, 'applied-generation.png'), fullPage: true })
  checks.push(
    'Real configured provider candidate retains committed PREBOUND task/prototype; production App review applies exactly the single candidate, duplicate apply returns persisted evidence, new page renders binding and next independent gates',
  )
  process.stdout.write('Applied real candidate and inspected production page\n')

  const taskId = session.task.id,
    project = session.projectId
  const runsPath = '/board/tasks/' + taskId + '/runs'
  if (!session.runRequestId) {
    session.runRequestId = crypto.randomUUID()
    await persist()
  }
  if (!session.run) {
    session.run = await api('POST', runsPath, {
      projectId: project,
      revision: session.task.revision,
      requestId: session.runRequestId,
      workspacePath: workspace,
    })
    await persist()
  }
  let run = session.run
  for (let i = 0; i < 150; i++) {
    const runs = await api('GET', runsPath + '?projectId=' + encodeURIComponent(project))
    run = runs.items.find((item) => item.execution.id === session.run.execution.id)
    if (['SUCCEEDED', 'FAILED', 'UNKNOWN'].includes(run.execution.status)) break
    await new Promise((done) => setTimeout(done, 200))
  }
  assert.equal(run.execution.status, 'SUCCEEDED', JSON.stringify(run))
  session.run = run
  await persist()
  const runPath = runsPath + '/' + run.execution.id
  let verification = await api(
    'GET',
    runPath + '/verification?projectId=' + encodeURIComponent(project),
  )
  if (!verification.record) {
    const plan = await api('POST', runPath + '/verification/plan', {
      projectId: project,
      workspacePath: workspace,
    })
    session.plan = plan
    await persist()
    verification.record = await api('POST', runPath + '/verification', {
      projectId: project,
      workspacePath: workspace,
      planHash: plan.planHash,
    })
  }
  process.stdout.write('Started formal independent typecheck/test/build\n')
  for (let i = 0; i < 240 && ['QUEUED', 'RUNNING'].includes(verification.record.status); i++) {
    await new Promise((done) => setTimeout(done, 1000))
    verification = await api(
      'GET',
      runPath + '/verification?projectId=' + encodeURIComponent(project),
    )
  }
  session.verification = verification.record
  await persist()
  assert.equal(
    verification.record.status,
    'PASSED',
    JSON.stringify(verification.record).slice(0, 12000),
  )
  assert.deepEqual(
    verification.record.checks.map((check) => [
      check.id,
      check.status,
      check.exitCode,
      check.processTreeCleanup,
    ]),
    [
      ['typecheck', 'PASSED', 0, true],
      ['test', 'PASSED', 0, true],
      ['build', 'PASSED', 0, true],
    ],
  )
  assert.deepEqual(verification.record.plan.source, verification.record.sourceAfter)
  checks.push(
    'Real Git Run and application-owned independent native typecheck/test/build finish PASSED with process cleanup and unchanged bounded source snapshots',
  )
  process.stdout.write('Formal independent checks passed\n')

  await page.evaluate(() => {
    location.hash = 'board'
  })
  await page.getByTestId('preview-board').waitFor()
  await page.getByRole('button').filter({ hasText: session.task.title }).first().click()
  await page.getByTestId('board-tab-runs').click()
  await page.getByTestId('board-run-record').waitFor()
  await page.getByTestId('board-run-delivery').click()
  const dialog = page.getByTestId('board-delivery-dialog')
  await dialog.waitFor()
  let delivery = await api('GET', runPath + '/delivery?projectId=' + encodeURIComponent(project))
  if (!delivery.record) {
    await page.getByTestId('delivery-load-candidates').click()
    const catalog = await api(
      'GET',
      runPath + '/delivery/applications?projectId=' + encodeURIComponent(project),
    )
    assert.equal(catalog.items.length, 1)
    assert.equal(catalog.items[0].proposalId, proposal.id)
    await page.getByTestId('delivery-select-candidate').click()
    assert.equal(await page.getByTestId('delivery-conversation-id').inputValue(), cid)
    assert.equal(await page.getByTestId('delivery-proposal-id').inputValue(), proposal.id)
    assert.equal(await page.getByTestId('delivery-paths').inputValue(), target)
    await page
      .getByTestId('delivery-note-input')
      .fill(
        'Automated technical chain verification using a real model candidate; this is not user product acceptance.',
      )
    const submitted = page.waitForResponse(
      (response) =>
        response.url().endsWith(runPath + '/delivery') && response.request().method() === 'POST',
      { timeout: 90000 },
    )
    await page.getByTestId('delivery-submit').click()
    await page
      .getByRole('dialog', { name: '确认采集外部 / 人工源码修改', exact: true })
      .getByRole('button', { name: '提交源码证据', exact: true })
      .click()
    assert.equal((await submitted).status(), 200)
    await page.getByTestId('delivery-record').waitFor()
    delivery = await api('GET', runPath + '/delivery?projectId=' + encodeURIComponent(project))
  }
  session.delivery = delivery.record
  await persist()
  assert.equal(delivery.record.source, 'CHAT_APPLIED_PREBOUND')
  assert.equal(delivery.record.applicationEvidence.proposalId, proposal.id)
  assert.equal(delivery.record.files[0].afterHash, session.applied.result.afterHash)
  await page.screenshot({ path: resolve(output, 'delivery-awaiting-decision.png'), fullPage: true })
  checks.push(
    'Production board reads exact applied PREBOUND catalog, explicitly selects server evidence, submits real single-source delivery and transitions to acceptance with the original task revision and candidate hash',
  )
  if (!delivery.record.decision) {
    await api(
      'POST',
      runPath + '/delivery/decision',
      {
        projectId: project,
        revision: delivery.record.submittedRevision,
        requestId: crypto.randomUUID(),
        deliveryId: delivery.record.id,
        decision: 'ACCEPT',
        criteriaConfirmed: false,
        previewConfirmed: false,
        comment: 'Missing statements must be rejected',
      },
      400,
    )
    assert.equal(
      (await api('GET', runPath + '/delivery?projectId=' + encodeURIComponent(project))).record
        .decision,
      null,
    )
    await page.getByTestId('delivery-criteria').check()
    await page.getByTestId('delivery-preview').check()
    await page
      .getByTestId('delivery-comment')
      .fill(
        'Automated technical ACCEPT: source diff, actual generation panel and independent checks reviewed. This is not human user product acceptance.',
      )
    const decided = page.waitForResponse(
      (response) =>
        response.url().endsWith(runPath + '/delivery/decision') &&
        response.request().method() === 'POST',
      { timeout: 90000 },
    )
    await page.getByTestId('delivery-accept').click()
    await page
      .getByRole('dialog', { name: '确认人工接受此交付', exact: true })
      .getByRole('button', { name: '接受交付', exact: true })
      .click()
    assert.equal((await decided).status(), 200)
    delivery = await api('GET', runPath + '/delivery?projectId=' + encodeURIComponent(project))
  }
  assert.equal(delivery.record.decision.decision, 'ACCEPT')
  const decision = delivery.record.decision
  const decisionRequest = {
    projectId: project,
    revision: delivery.record.submittedRevision,
    requestId: decision.requestId,
    deliveryId: delivery.record.id,
    decision: 'ACCEPT',
    criteriaConfirmed: true,
    previewConfirmed: true,
    comment: decision.comment,
  }
  assert.deepEqual(
    await api('POST', runPath + '/delivery/decision', decisionRequest),
    delivery.record,
  )
  await api(
    'POST',
    runPath + '/delivery/decision',
    {
      ...decisionRequest,
      requestId: crypto.randomUUID(),
      decision: 'REJECT',
      comment: 'A second decision must conflict',
    },
    409,
  )
  const finalTasks = await api('GET', '/board/tasks?projectId=' + encodeURIComponent(project))
  assert.equal(finalTasks.items.find((task) => task.id === taskId).column, 'done')
  session.delivery = delivery.record
  await persist()
  await page.reload()
  await page.getByTestId('preview-board').waitFor()
  await page.getByRole('button').filter({ hasText: session.task.title }).first().click()
  await page.getByTestId('board-tab-runs').click()
  await page.getByTestId('board-run-record').waitFor()
  await page.getByTestId('board-run-delivery').click()
  await page.getByTestId('delivery-record').waitFor()
  assert.equal(await page.getByTestId('delivery-accept').count(), 0)
  await page.screenshot({ path: resolve(output, 'delivery-decided.png'), fullPage: true })
  assert.equal(digest(await readFile(resolve(workspace, target))), session.applied.result.afterHash)
  checks.push(
    'Explicit production decision form requires criteria and preview statements, records one technical ACCEPT and done task, replays idempotently, rejects a second decision, and restores read-only evidence after reload; user product acceptance remains separate',
  )
  assert.deepEqual(errors, [])
  assert.deepEqual(external, [])
  assert.equal(mutations.filter((item) => item.path.endsWith('/messages')).length, 0)
  await writeFile(
    resolve(output, 'result.json'),
    JSON.stringify(
      {
        schema: 32,
        host: 'production full-application jar and actual development database',
        workspace: 'isolated repository checkout under backend/target',
        model: conversation.model,
        modelSeconds: session.modelSeconds,
        modelRequestCount: 1,
        checks,
        pageErrors: errors,
        externalRequests: external,
        browserMutations: mutations,
        taskId,
        projectId: project,
        taskRevision: session.task.revision,
        prototypeVersionId: session.prototype.id,
        conversationId: cid,
        generationId: proposal.generation.id,
        proposalId: proposal.id,
        targetPath: target,
        baseHash: session.beforeHash,
        appliedAfterHash: session.applied.result.afterHash,
        runId: run.execution.id,
        verificationId: verification.record.id,
        verificationChecks: verification.record.checks.map(
          ({ id, status, exitCode, processTreeCleanup }) => ({
            id,
            status,
            exitCode,
            processTreeCleanup,
          }),
        ),
        deliveryId: delivery.record.id,
        deliverySource: delivery.record.source,
        userProductAcceptance: false,
        decision: delivery.record.decision,
      },
      null,
      2,
    ),
  )
  process.stdout.write(
    JSON.stringify({
      passed: checks.length,
      taskId,
      deliveryId: delivery.record.id,
      awaitingDecision: !delivery.record.decision,
    }) + '\n',
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
