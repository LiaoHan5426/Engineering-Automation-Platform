import { loadPlaywright } from './playwright-runtime.mjs'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Run from the real repository's frontend directory. No dependency installation,
// source fixtures, package-script replacement or direct source write occurs here.
const [mode, manifestPath] = process.argv.slice(2)
const title = 'Fix first-open candidate file focus'
const designTitle = 'EAP candidate file focus'
const target = 'frontend/apps/web/src/components/SessionPanel.vue'
const json = async (path) => JSON.parse(await readFile(path, 'utf8'))
const save = (path, data) => writeFile(path, JSON.stringify(data, null, 2))
const digest = (value) => createHash('sha256').update(value).digest('hex')
async function api(backend, path, body, expected = 200) {
  const response = await fetch(backend + '/api' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  })
  const data = await response.json()
  assert.equal(response.status, expected, path + ': ' + JSON.stringify(data).slice(0, 4000))
  return data
}
async function setup(manifest) {
  const { backend, workspace, sourcePath, sourceBeforeHash } = await json(manifest)
  assert.equal(sourcePath, target)
  assert.equal(digest(await readFile(resolve(workspace, target))), sourceBeforeHash)
  const project = 'self-page-delivery'
  const node = (id, kind, props, children = []) => ({ id, kind, props, children })
  // This immutable reference records the existing interaction; it is not a new
  // feature prototype, nor evidence that a human accepted the resulting product.
  const criteria = [
    'Keep the existing candidate-file list and file detail interaction.',
    'Opening Diff for the second candidate before the changes panel mounts selects that file and consumes the pending focus request.',
    'Outside changes mode retain a pending target until switching to changes; repeated requests while mounted update selection.',
    'Preserve the unsent chat draft, existing imports, shared controls and all unrelated behavior.',
  ]
  const version = await api(backend, '/prototype-versions', {
    requestId: randomUUID(),
    sourceRef: 'builder-alpha',
    title: designTitle,
    acceptance: criteria,
    body: JSON.stringify({
      format: 'eap-prototype-v1',
      schema: {
        version: 1,
        title: designTitle,
        unknownMappings: [],
        grapesProject: {},
        root: node('page', 'page', {}, [
          node('heading', 'heading', { text: designTitle }),
          node('candidate-list', 'text', {
            text: 'Existing candidate list: first file, second file. Click the second file Diff to view that exact file.',
          }),
          node('focus-rule', 'text', { text: criteria.join('\n') }),
        ]),
      },
    }),
  })
  const task = await api(backend, '/board/tasks', {
    projectId: project,
    requestId: randomUUID(),
    title,
    sessionId: '',
    column: 'ready',
    goal: 'Repair the existing EAP first-open candidate Diff focus',
    acceptanceCriteria: criteria.join('\n'),
  })
  const linked = await api(backend, '/board/tasks/' + task.id + '/prototype', {
    projectId: project,
    revision: task.revision,
    versionId: version.id,
  })
  await save(resolve(dirname(manifest), 'inputs.json'), {
    project,
    taskId: task.id,
    revision: linked.revision,
    prototypeId: version.id,
    prototypeContentHash: version.contentHash,
    sourcePath,
    sourceBeforeHash,
    interactionInstructions: criteria.join('\n'),
  })
}
async function waitFor(load, pending, label) {
  for (let i = 0; i < 720; i++) {
    const value = await load()
    if (!pending(value)) return value
    await new Promise((done) => setTimeout(done, 500))
  }
  assert.fail('Timed out: ' + label)
}
async function deliver(manifest) {
  const { backend, workspace, task, proposal, sourcePath, sourceBeforeHash, provider } =
    await json(manifest)
  const out = dirname(manifest)
  const inputs = await json(resolve(out, 'inputs.json'))
  assert.equal(sourcePath, target)
  assert.equal(proposal.files.length, 1)
  assert.equal(proposal.files[0].path, target)
  assert.equal(digest(await readFile(resolve(workspace, target))), sourceBeforeHash)
  assert.notEqual(digest(proposal.files[0].content), sourceBeforeHash)
  assert.ok(Buffer.byteLength(proposal.files[0].content) <= 24000)
  const require = createRequire(resolve('package.json'))
  const { createServer } = await import(
    pathToFileURL(resolve(dirname(require.resolve('vite-plus/package.json')), 'dist/index.js')).href
  )
  const { default: vue } = await import(pathToFileURL(require.resolve('@vitejs/plugin-vue')).href)
  const { default: tailwind } = await import(
    pathToFileURL(require.resolve('@tailwindcss/vite')).href
  )
  const server = await createServer({
    configFile: false,
    root: resolve(workspace, 'frontend/apps/web'),
    cacheDir: resolve(out, 'vite-cache'),
    plugins: [vue(), tailwind()],
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify('/api'),
      'import.meta.env.VITE_API_SCOPE': JSON.stringify(backend + '/api'),
    },
    server: {
      host: '127.0.0.1',
      port: 5198,
      strictPort: true,
      proxy: { '/api': { target: backend, changeOrigin: true } },
    },
  })
  let browser, page
  const errors = [],
    external = []
  try {
    await server.listen()
    const { chromium } = loadPlaywright()
    browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.setDefaultTimeout(30000)
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/*', (route) => {
      const url = route.request().url()
      if (/^https?:/.test(url) && new URL(url).hostname !== '127.0.0.1') {
        external.push(url)
        return route.abort()
      }
      return route.continue()
    })
    const projectId = task.projectId ?? task.project
    const taskId = task.taskId ?? task.id
    assert.ok(projectId && taskId)
    const path = '/board/tasks/' + taskId
    const scope = '?projectId=' + encodeURIComponent(projectId)
    const candidate = path + '/code-proposals/' + proposal.id
    const get = (route) => api(backend, route + scope)
    const post = (route, body) => api(backend, route, { projectId, ...body })
    await page.addInitScript((projectId) => {
      localStorage.setItem(
        'eap.local-projects.v1',
        JSON.stringify([{ id: projectId, label: 'EAP self-page delivery', intendedPath: '' }]),
      )
      localStorage.setItem('eap.selected-project.v1', projectId)
    }, projectId)
    const url = server.resolvedUrls.local[0]
    await page.goto(url + '#board')
    const openTask = () => page.getByRole('button').filter({ hasText: title }).first().click()
    await openTask()
    await page.getByTestId('board-tab-code').click()
    await page.getByTestId('board-code-refresh').click()
    await page.getByTestId('board-code-open').click()
    await page.getByTestId('evidence-panel').waitFor()
    assert.equal(await page.getByTestId('evidence-file').count(), 1)
    assert.ok((await page.getByTestId('evidence-file').innerText()).includes(target))
    const apply = page.getByTestId('proposal-apply')
    assert.equal(await apply.isDisabled(), true)
    await page.getByTestId('proposal-diff').waitFor()
    await page.getByTestId('proposal-diff-loading').waitFor({ state: 'hidden' })
    await page.getByTestId('proposal-diff').scrollIntoViewIfNeeded()
    if (await page.getByTestId('proposal-diff-fallback').isVisible()) {
      assert.equal(await page.getByTestId('diff-after').textContent(), proposal.files[0].content)
    } else {
      assert.equal(
        await page.getByTestId('proposal-diff-monaco').getAttribute('aria-label'),
        target,
      )
      await page.getByTestId('proposal-diff-monaco').waitFor({ state: 'visible' })
    }
    const stateBefore = await get(candidate)
    assert.equal(stateBefore.status, 'PROPOSED')
    assert.equal(stateBefore.proposal.files.length, 1)
    assert.equal(stateBefore.proposal.files[0].path, target)
    assert.equal(digest(stateBefore.proposal.files[0].content), digest(proposal.files[0].content))
    assert.equal(digest(await readFile(resolve(workspace, target))), sourceBeforeHash)
    // Actual existing evidence panel shows the complete candidate. Capture both
    // layouts before granting the explicit write confirmation.
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      await page.getByTestId('evidence-panel').scrollIntoViewIfNeeded()
      await page.screenshot({ path: resolve(out, `self-candidate-${width}.png`), fullPage: true })
    }
    await page.getByTestId('proposal-application').getByRole('checkbox').check()
    const appliedResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(candidate + '/apply') && response.request().method() === 'POST',
    )
    await apply.click()
    assert.equal((await appliedResponse).status(), 200)
    const applied = await get(candidate)
    assert.equal(applied.status, 'APPLIED')
    assert.deepEqual(applied.result.written, [target])
    assert.equal(await readFile(resolve(workspace, target), 'utf8'), proposal.files[0].content)

    const runs = path + '/runs'
    const started = await post(runs, {
      revision: task.revision,
      requestId: randomUUID(),
      workspacePath: workspace,
    })
    const runId = started.execution.id
    const run = await waitFor(
      async () => (await get(runs)).items.find((item) => item.execution.id === runId),
      (item) => !item || ['QUEUED', 'RUNNING'].includes(item.execution.status),
      'read-only board run',
    )
    assert.equal(run.execution.status, 'SUCCEEDED', JSON.stringify(run).slice(-6000))
    const runPath = runs + '/' + runId
    const plan = await post(runPath + '/verification/plan', { workspacePath: workspace })
    assert.equal(resolve(plan.workspacePath), resolve(workspace))
    assert.deepEqual(
      plan.commands.map((command) => command.id),
      ['typecheck', 'test', 'build'],
    )
    assert.deepEqual(
      plan.commands.map((command) => command.command.slice(1)),
      [['exec', 'vue-tsc', '--build'], ['test', 'run'], ['build']],
    )
    for (const command of plan.commands)
      assert.equal(resolve(command.workingDirectory), resolve(workspace, 'frontend'))
    await post(runPath + '/verification', { workspacePath: workspace, planHash: plan.planHash })
    const { record: verification } = await waitFor(
      () => get(runPath + '/verification'),
      ({ record }) => !record || ['QUEUED', 'RUNNING'].includes(record.status),
      'real frontend typecheck/test/build',
    )
    await save(resolve(out, 'verification.json'), verification)
    assert.equal(
      verification.status,
      'PASSED',
      JSON.stringify({ status: verification.status, reason: verification.reason, checks: verification.checks }).slice(0, 12000),
    )
    assert.deepEqual(
      verification.checks.map((check) => [check.id, check.status, check.processTreeCleanup]),
      [
        ['typecheck', 'PASSED', true],
        ['test', 'PASSED', true],
        ['build', 'PASSED', true],
      ],
    )
    assert.deepEqual(verification.plan.source, verification.sourceAfter)
    assert.equal(
      verification.sourceAfter.files.find((file) => file.path === target)?.contentHash,
      digest(proposal.files[0].content),
    )

    await page.reload()
    await openTask()
    await page.getByTestId('board-tab-runs').click()
    await page.getByTestId('board-run-verification').click()
    await page.getByTestId('verification-delivery').click()
    await page.getByTestId('delivery-load-candidates').click()
    await page.getByTestId('delivery-select-candidate').click()
    assert.equal(await page.getByTestId('delivery-paths').inputValue(), target)
    const draft =
      'Existing candidate Diff focus: independent regression and full frontend checks verified; technical acceptance only.'
    await page.getByTestId('delivery-note-input').fill(draft)
    const submitted = page.waitForResponse(
      (response) =>
        response.url().endsWith(runPath + '/delivery') && response.request().method() === 'POST',
    )
    await page.getByTestId('delivery-submit').click()
    await page
      .getByRole('dialog', { name: '确认采集外部 / 人工源码修改', exact: true })
      .getByRole('button', { name: '提交源码证据', exact: true })
      .click()
    assert.equal((await submitted).status(), 200)
    const { record: delivery } = await get(runPath + '/delivery')
    await save(resolve(out, 'delivery.json'), delivery)
    assert.equal(delivery.source, 'CHAT_APPLIED_PREBOUND')
    assert.deepEqual(
      delivery.files.map((file) => [file.path, file.afterHash]),
      [[target, digest(proposal.files[0].content)]],
    )
    assert.equal(delivery.decision, null)
    assert.equal(delivery.note, draft)
    assert.equal(delivery.prototypeVersionId, inputs.prototypeId)
    const designBefore = await api(backend, '/prototype-versions/' + delivery.prototypeVersionId)
    assert.equal(designBefore.contentHash, inputs.prototypeContentHash)
    const previewUrl = url + '#board'
    const comment =
      'Technical browser acceptance of existing interaction regression; final user acceptance remains separate.'
    await page.getByTestId('delivery-preview-url').fill(previewUrl)
    await page.getByTestId('delivery-comment').fill(comment)
    await page.getByTestId('delivery-compare-prototype').click()
    const design = page.getByTestId('prototype-version-viewer')
    await design.getByRole('heading', { name: designTitle, exact: true }).waitFor()
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      await page.screenshot({
        path: resolve(out, `self-design-comparison-${width}.png`),
        fullPage: true,
      })
    }
    await design.locator('[data-eap-dialog-close]').click()
    assert.equal(await page.getByTestId('delivery-preview-url').inputValue(), previewUrl)
    assert.equal(await page.getByTestId('delivery-comment').inputValue(), comment)
    const designAfter = await api(backend, '/prototype-versions/' + delivery.prototypeVersionId)
    assert.equal(designAfter.body, designBefore.body)
    assert.equal(designAfter.contentHash, designBefore.contentHash)
    await page.getByTestId('delivery-criteria').check()
    const popupPromise = page.waitForEvent('popup')
    await page.getByTestId('delivery-open-preview').click()
    const popup = await popupPromise
    await popup.getByRole('button').filter({ hasText: title }).first().waitFor()
    await popup.close()
    await page.getByTestId('delivery-preview').check()
    const decided = page.waitForResponse(
      (response) =>
        response.url().endsWith(runPath + '/delivery/decision') &&
        response.request().method() === 'POST',
    )
    await page.getByTestId('delivery-accept').click()
    await page
      .getByRole('dialog', { name: '确认人工接受此交付', exact: true })
      .getByRole('button', { name: '接受交付', exact: true })
      .click()
    assert.equal((await decided).status(), 200)
    const { record: accepted } = await get(runPath + '/delivery')
    assert.equal(accepted.decision.decision, 'ACCEPT')
    assert.equal(accepted.prototypeVersionId, delivery.prototypeVersionId)
    assert.deepEqual(accepted.files, delivery.files)
    await page.reload()
    await openTask()
    await page.getByTestId('board-tab-runs').click()
    await page.getByTestId('board-run-delivery').click()
    await page.getByTestId('delivery-record').waitFor()
    assert.equal(
      await page.getByTestId('delivery-recorded-preview').getAttribute('href'),
      previewUrl,
    )
    assert.equal(await page.getByTestId('delivery-accept').count(), 0)
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      await page.screenshot({ path: resolve(out, `self-delivery-${width}.png`), fullPage: true })
    }
    assert.deepEqual(errors, [])
    assert.deepEqual(external, [])
    await save(resolve(out, 'validation.json'), {
      browser: await browser.version(),
      provider,
      proposalId: proposal.id,
      runId,
      verificationId: verification.id,
      deliveryId: delivery.id,
      prototypeVersionId: delivery.prototypeVersionId,
      prototypeContentHash: designAfter.contentHash,
      sourceBeforeHash,
      sourceAfterHash: digest(proposal.files[0].content),
      files: [target],
      checks: verification.checks.map((check) => [check.id, check.status]),
      decision: 'technical ACCEPT; final user acceptance remains separate',
      focusRegression:
        'Independent SessionPanel.test.ts checks first mount, deferred mode and repeated focus; no synthetic files inserted into real conversation.',
      immutablePrototypeComparisonRetainsDeliveryDraft: true,
    })
  } catch (error) {
    if (page && !page.isClosed()) {
      await page.screenshot({ path: resolve(out, 'self-delivery-failure.png'), fullPage: true })
      await writeFile(
        resolve(out, 'self-delivery-failure.txt'),
        await page.locator('body').innerText(),
      )
    }
    throw error
  } finally {
    try {
      await browser?.close()
    } finally {
      await server.close()
    }
  }
}
assert.ok(manifestPath, 'Usage: vp node self-page-delivery-live.mjs setup|deliver MANIFEST')
if (mode === 'setup') await setup(resolve(manifestPath))
else if (mode === 'deliver') await deliver(resolve(manifestPath))
else assert.fail('Unsupported mode: ' + mode)
