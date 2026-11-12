import { loadPlaywright } from './playwright-runtime.mjs'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { cp, mkdir, readFile, readdir, realpath, symlink, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const [mode, input] = process.argv.slice(2)
const json = async (path) => JSON.parse(await readFile(path, 'utf8'))
const save = (path, value) => writeFile(path, JSON.stringify(value, null, 2))
const digest = (content) => createHash('sha256').update(content).digest('hex')

async function api(backend, path, body, expected = 200) {
  const response = await fetch(backend + '/api' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json()
  assert.equal(response.status, expected, path + ': ' + JSON.stringify(data).slice(0, 2000))
  return data
}

async function prepare(workspace) {
  const project = resolve(workspace, 'frontend')
  const src = resolve(project, 'src')
  await mkdir(src, { recursive: true })
  await save(resolve(project, 'package.json'), {
    name: 'route-resource-fixture',
    private: true,
    type: 'module',
    dependencies: { vue: '3.5.44' },
    devDependencies: {
      '@vitejs/plugin-vue': '6.0.10',
      vite: 'npm:@voidzero-dev/vite-plus-core@1.5.1',
      'vite-plus': '1.5.1',
      'vue-tsc': '3.3.14',
      typescript: '6.0.3',
    },
  })
  await save(resolve(project, 'tsconfig.json'), {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      resolveJsonModule: true,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: ['vite/client'],
    },
    include: ['src/**/*.ts', 'src/**/*.vue'],
  })
  await writeFile(
    resolve(project, 'vite.config.ts'),
    [
      "import { defineConfig } from 'vite-plus'",
      "import vue from '@vitejs/plugin-vue'",
      'export default defineConfig({ plugins: [vue()] })',
      '',
    ].join('\n'),
  )
  await writeFile(
    resolve(project, 'index.html'),
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Delivery review</title></head><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>',
  )
  await writeFile(
    resolve(src, 'main.ts'),
    [
      "import { createApp, h, ref } from 'vue'",
      "import { pages } from './routePages'",
      'const route = ref(location.hash)',
      "addEventListener('hashchange', () => { route.value = location.hash })",
      "createApp({ render: () => h('main', [h('nav', { style: 'display:flex;gap:24px;padding:16px' }, [h('a', { href: '#/' }, 'Overview'), h('a', { href: '#/detail' }, 'Detail')]), h(pages[route.value === '#/detail' ? 'detail' : 'overview'])]) }).mount('#app')",
      '',
    ].join('\n'),
  )
  await writeFile(
    resolve(project, 'routes.test.ts'),
    [
      "import { expect, it } from 'vite-plus/test'",
      "import { pages } from './src/routePages'",
      "import copy from './src/copy.json'",
      "it('delivers a separate detail route and the selected JSON text', () => { expect(pages.detail).not.toBe(pages.overview); expect(copy.title).toBe('Delivery detail') })",
      '',
    ].join('\n'),
  )
  await writeFile(resolve(workspace, '.gitignore'), 'node_modules/\ndist/\n*.tsbuildinfo\n')
  const files = [
    [
      'routePages.ts',
      "import Overview from './OverviewPage.vue'\nexport const pages = { overview: Overview, detail: Overview }\n",
      "import { defineAsyncComponent, h } from 'vue'\nimport Overview from './OverviewPage.vue'\nconst Detail = defineAsyncComponent({ loader: () => import('./DetailPage.vue'), delay: 0, loadingComponent: { render: () => h('p', { role: 'status' }, 'Loading detail…') }, errorComponent: { render: () => h('p', { role: 'alert' }, 'Detail could not load. Return to overview or reload.') } })\nexport const pages = { overview: Overview, detail: Detail }\n",
    ],
    [
      'OverviewPage.vue',
      '<template><h1>Overview baseline</h1></template>\n',
      '<template><h1>Delivery overview</h1></template>\n',
    ],
    [
      'DetailPage.vue',
      '<template><h1>Detail baseline</h1></template>\n',
      '<script setup lang="ts">\nimport copy from "./copy.json"\nimport "./detail.css"\n</script>\n<template><article class="detail"><h1>{{ copy.title }}</h1><p>{{ copy.description }}</p></article></template>\n',
    ],
    [
      'detail.css',
      '.detail { color: black; }\n',
      '@import "./palette.css";\n.detail { color: var(--review-ink); padding: 16px; }\n',
    ],
    [
      'palette.css',
      ':root { --review-ink: black; }\n',
      ':root { --review-ink: rgb(24, 72, 96); }\n',
    ],
    [
      'copy.json',
      '{"title":"Detail baseline","description":"Old text"}\n',
      '{"title":"Delivery detail","description":"Bound source and verification evidence."}\n',
    ],
  ]
  for (const [name, before] of files) await writeFile(resolve(src, name), before)
  await save(resolve(dirname(workspace), 'answer.json'), {
    summary: 'Eager overview and bounded lazy detail with shared style and copy',
    files: files.map(([name, , content]) => ({ path: 'frontend/src/' + name, content })),
  })
  const run = (bin, args, cwd) => execFileSync(bin, args, { cwd, stdio: 'inherit', timeout: 90000 })
  if (process.env.EAP_ROUTE_DEPENDENCIES) {
    // Reuse installed tools, never source/output from an earlier delivery.
    const dependencies = resolve(process.env.EAP_ROUTE_DEPENDENCIES)
    const manifest = await json(resolve(project, 'package.json'))
    for (const [name, version] of Object.entries({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    })) {
      const installed = await json(resolve(dependencies, name, 'package.json'))
      assert.equal(
        installed.version,
        version.startsWith('npm:') ? version.slice(version.lastIndexOf('@') + 1) : version,
      )
    }
    async function copyTools(source, destination) {
      await mkdir(destination, { recursive: true })
      for (const entry of await readdir(source, { withFileTypes: true })) {
        const from = resolve(source, entry.name),
          to = resolve(destination, entry.name)
        if (entry.isSymbolicLink())
          await symlink(await realpath(from), to, process.platform === 'win32' ? 'junction' : 'dir')
        else if (entry.isDirectory()) await copyTools(from, to)
        else await cp(from, to)
      }
    }
    await copyTools(dependencies, resolve(project, 'node_modules'))
  } else
    run(
      process.env.EAP_ROUTE_VP || 'vp',
      [
        'install',
        process.env.EAP_ROUTE_OFFLINE === 'true' ? '--offline' : '--prefer-offline',
        '--ignore-scripts',
        '--registry=https://registry.npmjs.org',
      ],
      project,
    )
  run('git', ['init', '-q'], workspace)
  run('git', ['add', '.'], workspace)
  run(
    'git',
    [
      '-c',
      'user.name=EAP Route Fixture',
      '-c',
      'user.email=route-fixture@example.invalid',
      '-c',
      'commit.gpgSign=false',
      'commit',
      '-qm',
      'Isolated route baseline',
    ],
    workspace,
  )
}

async function setup(manifest) {
  const { backend } = await json(manifest)
  const project = 'route-resource-delivery'
  const node = (id, kind, props, children = []) => ({ id, kind, props, children })
  const version = await api(backend, '/prototype-versions', {
    requestId: randomUUID(),
    sourceRef: 'builder-alpha',
    title: 'Delivery overview and detail',
    acceptance: ['Both routes are navigable', 'Detail shows local copy and styling'],
    body: JSON.stringify({
      format: 'eap-prototype-v1',
      schema: {
        version: 1,
        title: 'Delivery overview and detail',
        unknownMappings: [],
        grapesProject: {},
        root: node('page', 'page', {}, [
          node('overview', 'heading', { text: 'Delivery overview' }),
          node('detail', 'text', { text: 'Open detail to review delivery evidence.' }),
        ]),
      },
    }),
  })
  const task = await api(backend, '/board/tasks', {
    projectId: project,
    requestId: randomUUID(),
    title: 'Review two delivered routes',
    sessionId: '',
    column: 'ready',
    goal: 'Deliver overview and detail',
    acceptanceCriteria: 'Both routes work and detail uses its CSS and JSON.',
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
    answer: await json(resolve(dirname(manifest), 'answer.json')),
  })
}

async function deliver(manifest) {
  const { backend, workspace, task, proposal, provider } = await json(manifest)
  const out = dirname(manifest)
  const require = createRequire(resolve('package.json'))
  const { createServer, preview } = await import(
    pathToFileURL(resolve(dirname(require.resolve('vite-plus/package.json')), 'dist/index.js')).href
  )
  const { default: vue } = await import(pathToFileURL(require.resolve('@vitejs/plugin-vue')).href)
  const { default: tailwind } = await import(
    pathToFileURL(require.resolve('@tailwindcss/vite')).href
  )
  const { chromium } = loadPlaywright()
  const server = await createServer({
    configFile: false,
    root: resolve('apps/web'),
    cacheDir: resolve(out, 'vite-cache'),
    plugins: [vue(), tailwind()],
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify('/api'),
      'import.meta.env.VITE_API_SCOPE': JSON.stringify(backend + '/api'),
    },
    server: {
      host: '127.0.0.1',
      port: 5192,
      strictPort: true,
      proxy: { '/api': { target: backend, changeOrigin: true } },
    },
  })
  let browser, built, page
  try {
    await server.listen()
    browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
    page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    const projectId = task.projectId
    const path = '/board/tasks/' + task.taskId
    const scope = '?projectId=' + encodeURIComponent(projectId)
    const candidate = path + '/code-proposals/' + proposal.id
    const get = (route) => api(backend, route + scope)
    const post = (route, body, status) => api(backend, route, { projectId, ...body }, status)
    await page.addInitScript((projectId) => {
      localStorage.setItem(
        'eap.local-projects.v1',
        JSON.stringify([{ id: projectId, label: 'Route delivery', intendedPath: '' }]),
      )
      localStorage.setItem('eap.selected-project.v1', projectId)
    }, projectId)
    await page.goto(server.resolvedUrls.local[0] + '#board')
    const openTask = () =>
      page.getByRole('button').filter({ hasText: 'Review two delivered routes' }).first().click()
    await openTask()
    await page.getByTestId('board-tab-code').click()
    await page.getByTestId('board-code-refresh').click()
    await page.getByTestId('board-code-open').click()
    await page.getByTestId('evidence-panel').waitFor()
    assert.equal(await page.getByTestId('evidence-file').count(), 6)
    await page.getByText('查看文件依赖', { exact: true }).click()
    const edges = page.getByTestId('proposal-dependencies')
    assert.equal(await edges.locator('li').count(), 5)
    assert.match(await edges.innerText(), /detail\.css.*palette\.css/)
    await edges.getByText('按需加载', { exact: true }).waitFor()
    await edges.scrollIntoViewIfNeeded()
    await page.screenshot({ path: resolve(out, 'route-dependencies.png') })
    const apply = page.getByTestId('proposal-apply')
    assert.equal(await apply.isDisabled(), true)
    await page.getByTestId('proposal-application').getByRole('checkbox').check()
    const applied = page.waitForResponse((response) =>
      response.url().endsWith(candidate + '/apply'),
    )
    await apply.click()
    assert.equal((await applied).status(), 200)
    const paths = proposal.files.map((file) => file.path)
    const state = await get(candidate)
    assert.equal(state.status, 'APPLIED')
    assert.deepEqual(state.result.written, paths)
    for (const file of proposal.files)
      assert.equal(await readFile(resolve(workspace, file.path), 'utf8'), file.content)

    const runs = path + '/runs'
    const started = await post(runs, {
      revision: task.revision,
      requestId: randomUUID(),
      workspacePath: workspace,
    })
    const runId = started.execution.id
    const waitFor = async (load, pending) => {
      for (let i = 0; i < 100; i++) {
        const value = await load()
        if (!pending(value)) return value
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      assert.fail('Timed out waiting for durable operation')
    }
    const run = await waitFor(
      async () => (await get(runs)).items.find((item) => item.execution.id === runId),
      (item) => !item || ['QUEUED', 'RUNNING'].includes(item.execution.status),
    )
    assert.equal(run.execution.status, 'SUCCEEDED', JSON.stringify(run).slice(0, 3000))
    const runPath = runs + '/' + runId
    const plan = await post(runPath + '/verification/plan', { workspacePath: workspace })
    await post(runPath + '/verification', { workspacePath: workspace, planHash: plan.planHash })
    const { record: verification } = await waitFor(
      () => get(runPath + '/verification'),
      ({ record }) => !record || ['QUEUED', 'RUNNING'].includes(record.status),
    )
    assert.equal(verification.status, 'PASSED', JSON.stringify(verification).slice(-6000))
    assert.deepEqual(
      verification.checks.map((check) => [check.id, check.status, check.processTreeCleanup]),
      [
        ['typecheck', 'PASSED', true],
        ['test', 'PASSED', true],
        ['build', 'PASSED', true],
      ],
    )
    assert.deepEqual(verification.plan.source, verification.sourceAfter)
    for (const file of proposal.files) {
      assert.equal(
        verification.sourceAfter.files.find((entry) => entry.path === file.path).contentHash,
        digest(file.content),
      )
    }

    built = await preview({
      configFile: false,
      root: resolve(workspace, 'frontend'),
      preview: { host: '127.0.0.1', port: 5193, strictPort: true },
    })
    const result = await browser.newPage({ viewport: { width: 390, height: 844 } })
    result.on('pageerror', (error) => pageErrors.push(error.message))
    const chunks = (await readdir(resolve(workspace, 'frontend/dist/assets'))).filter((name) =>
      /^DetailPage-.*\.js$/.test(name),
    )
    assert.equal(chunks.length, 1)
    const chunk = '/assets/' + chunks[0]
    let requested = 0
    let release
    const gate = new Promise((done) => {
      release = done
    })
    await result.route('**' + chunk, async (intercept) => {
      requested++
      await gate
      await intercept.continue()
    })
    await result.goto(built.resolvedUrls.local[0])
    await result.getByRole('heading', { name: 'Delivery overview' }).waitFor()
    assert.equal(requested, 0, 'detail chunk must not load on the overview route')
    for (const link of await result.locator('a[href]').all()) {
      assert.ok(
        ['#/', '#/detail'].includes(await link.getAttribute('href')),
        'generated navigation must use the host routing contract',
      )
    }
    await result.getByRole('link', { name: 'Detail', exact: true }).click()
    await result.getByRole('status').filter({ hasText: 'Loading detail' }).waitFor()
    assert.equal(requested, 1)
    release()
    const heading = result.getByRole('heading', { name: 'Delivery detail' })
    await heading.waitFor()
    await result.getByText('Bound source and verification evidence.').waitFor()
    assert.equal(await heading.evaluate((node) => getComputedStyle(node).color), 'rgb(24, 72, 96)')
    await result.reload()
    await heading.waitFor()
    await result.screenshot({ path: resolve(out, 'delivered-route-detail.png') })
    await result.getByRole('link', { name: 'Overview', exact: true }).click()
    await result.getByRole('heading', { name: 'Delivery overview' }).waitFor()
    await result.getByRole('link', { name: 'Detail', exact: true }).click()
    await heading.waitFor()
    assert.equal(requested, 2, 'reload requests the chunk again, same-page navigation reuses it')
    await result.getByRole('link', { name: 'Overview', exact: true }).click()
    await result.getByRole('heading', { name: 'Delivery overview' }).waitFor()
    const pageLinks = result.locator('main > :not(nav) a[href]')
    const pageLinkCount = await pageLinks.count()
    for (let index = 0; index < pageLinkCount; index++) {
      const link = pageLinks.nth(index)
      const target = await link.getAttribute('href')
      await link.click()
      await result
        .getByRole('heading', {
          name: target === '#/detail' ? 'Delivery detail' : 'Delivery overview',
          exact: true,
        })
        .waitFor()
      await result.getByRole('link', { name: 'Overview', exact: true }).click()
      await result.getByRole('heading', { name: 'Delivery overview' }).waitFor()
    }

    // An independent browser context has no cached module. A failed chunk is
    // shown as an error, and the eager overview remains available.
    const failed = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await failed.route('**' + chunk, (intercept) => intercept.abort('connectionreset'))
    await failed.goto(built.resolvedUrls.local[0])
    await failed.getByRole('link', { name: 'Detail', exact: true }).click()
    await failed.getByRole('alert').filter({ hasText: 'Detail could not load' }).waitFor()
    assert.equal(await failed.getByRole('heading', { name: 'Delivery detail' }).count(), 0)
    await failed.screenshot({ path: resolve(out, 'lazy-route-failed.png') })
    await failed.getByRole('link', { name: 'Overview', exact: true }).click()
    await failed.getByRole('heading', { name: 'Delivery overview' }).waitFor()
    await failed.close()

    await page.reload()
    await openTask()
    await page.getByTestId('board-tab-runs').click()
    await page.getByTestId('board-run-verification').click()
    await page.getByTestId('verification-delivery').waitFor()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByTestId('verification-delivery').scrollIntoViewIfNeeded()
    await page.screenshot({ path: resolve(out, 'verification-next-step-narrow.png') })
    await page.getByTestId('verification-delivery').click()
    assert.equal(await page.getByTestId('board-verification-dialog').count(), 0)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.getByTestId('delivery-load-candidates').click()
    await page.getByTestId('delivery-select-candidate').click()
    assert.equal(await page.getByTestId('delivery-paths').inputValue(), paths.join('\n'))
    await page
      .getByTestId('delivery-note-input')
      .fill('Two routes, selected CSS and JSON, and independent checks verified.')
    assert.equal(await page.getByTestId('delivery-submit').isEnabled(), true)
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
    assert.equal(delivery.source, 'CHAT_APPLIED_PREBOUND')
    assert.deepEqual(
      delivery.files.map((file) => [file.path, file.afterHash]),
      proposal.files.map((file) => [file.path, digest(file.content)]),
    )
    assert.equal(delivery.decision, null)
    await page.getByTestId('delivery-preview-url').fill(built.resolvedUrls.local[0] + '#/detail')
    await page.getByTestId('delivery-compare-prototype').click()
    const design = page.getByTestId('prototype-version-viewer')
    await design.getByText('Delivery overview and detail', { exact: true }).waitFor()
    await page.screenshot({ path: resolve(out, 'delivery-prototype-comparison.png') })
    await design.locator('[data-eap-dialog-close]').click()
    assert.equal(
      await page.getByTestId('delivery-preview-url').inputValue(),
      built.resolvedUrls.local[0] + '#/detail',
    )
    await page.getByTestId('delivery-criteria').check()
    await page.getByTestId('delivery-preview-url').fill(built.resolvedUrls.local[0] + '#/detail')
    const previewTab = page.waitForEvent('popup')
    await page.getByTestId('delivery-open-preview').click()
    const registeredPreview = await previewTab
    await registeredPreview.getByRole('heading', { name: 'Delivery detail' }).waitFor()
    await registeredPreview.close()
    await page.getByTestId('delivery-preview').check()
    await page
      .getByTestId('delivery-comment')
      .fill('Technical decision by the isolated Chromium fixture.')
    const decided = page.waitForResponse((response) =>
      response.url().endsWith(runPath + '/delivery/decision'),
    )
    await page.getByTestId('delivery-accept').click()
    await page
      .getByRole('dialog', { name: '确认人工接受此交付', exact: true })
      .getByRole('button', { name: '接受交付', exact: true })
      .click()
    assert.equal((await decided).status(), 200)
    assert.equal((await get(runPath + '/delivery')).record.decision.decision, 'ACCEPT')
    await page.reload()
    await openTask()
    await page.getByTestId('board-tab-runs').click()
    await page.getByTestId('board-run-delivery').click()
    await page.getByTestId('delivery-record').waitFor()
    assert.equal(
      await page.getByTestId('delivery-recorded-preview').getAttribute('href'),
      built.resolvedUrls.local[0] + '#/detail',
    )
    assert.equal(await page.getByTestId('delivery-accept').count(), 0)
    assert.deepEqual(pageErrors, [])
    await save(resolve(out, 'validation.json'), {
      browser: await browser.version(),
      proposalId: proposal.id,
      runId,
      verificationId: verification.id,
      deliveryId: delivery.id,
      files: paths,
      edges: state.dependencies,
      checks: verification.checks.map((check) => [check.id, check.status]),
      decision: 'technical ACCEPT; no user acceptance',
      boundPrototypeComparedWithoutLosingDeliveryDraft: true,
      provider,
      lazyLoading: {
        chunk,
        deferredUntilNavigation: true,
        loadingState: true,
        failureState: true,
        refreshedAudit: true,
      },
    })
  } catch (failure) {
    if (page && !page.isClosed()) {
      await page.screenshot({ path: resolve(out, 'delivery-failure.png'), fullPage: true })
      await writeFile(resolve(out, 'delivery-failure.txt'), await page.locator('body').innerText())
    }
    throw failure
  } finally {
    try {
      await browser?.close()
    } finally {
      try {
        await built?.close()
      } finally {
        await server.close()
      }
    }
  }
}

async function dependencies(manifest) {
  const { backend } = await json(manifest)
  const out = dirname(manifest)
  const require = createRequire(resolve('package.json'))
  const { createServer } = await import(
    pathToFileURL(resolve(dirname(require.resolve('vite-plus/package.json')), 'dist/index.js')).href
  )
  const { default: vue } = await import(pathToFileURL(require.resolve('@vitejs/plugin-vue')).href)
  const { default: tailwind } = await import(
    pathToFileURL(require.resolve('@tailwindcss/vite')).href
  )
  const { chromium } = loadPlaywright()
  const harness = `<div id="app"></div><script type="module">
    import { createApp, h } from '/node_modules/.vite/dependency-placeholder.js'
  </script>`
  const html = harness.replace("'/node_modules/.vite/dependency-placeholder.js'", "'vue'").replace(
    '</script>',
    `
    import '@eap/ui/styles.css'
    import '/src/style.css'
    import Dialog from '/src/features/shell/CodePreparationDialog.vue'
    import { i18n } from '/src/lib/i18n'
    createApp({ render: () => h(Dialog, { task: { title: 'Dependency review', revision: 1 },
      onPrepared: value => { window.adopted = value } }) }).use(i18n).mount('#app')
  </script>`,
  )
  const server = await createServer({
    configFile: false,
    root: resolve('apps/web'),
    cacheDir: resolve(out, 'vite-cache'),
    plugins: [
      vue(),
      tailwind(),
      {
        name: 'dependency-review-harness',
        configureServer(server) {
          server.middlewares.use('/dependency-review', async (_req, res) => {
            res.setHeader('Content-Type', 'text/html')
            res.end(await server.transformIndexHtml('/dependency-review', html))
          })
        },
      },
    ],
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify('/api'),
      'import.meta.env.VITE_API_SCOPE': JSON.stringify(backend + '/api'),
    },
    server: {
      host: '127.0.0.1',
      port: 5192,
      strictPort: true,
      proxy: { '/api': { target: backend, changeOrigin: true } },
    },
  })
  let browser
  try {
    await server.listen()
    browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(server.resolvedUrls.local[0] + 'dependency-review')
    await page.waitForFunction(() => {
      const node = document.querySelector('.eap-dialog')
      return (
        node &&
        getComputedStyle(node).boxSizing === 'border-box' &&
        node.getBoundingClientRect().right <= innerWidth
      )
    })
    await page.getByTestId('prepare-target').fill('frontend/Page.vue')
    await page.getByTestId('prepare-companions').fill('frontend/unused.vue')
    const response = page.waitForResponse((r) =>
      r.url().endsWith('/api/ai/workspace/code-dependencies'),
    )
    await page.getByTestId('prepare-discover').click()
    assert.equal((await response).status(), 200)
    await page.getByTestId('prepare-result').waitFor()
    assert.deepEqual(
      new Set((await page.getByTestId('prepare-companions').inputValue()).split('\n')),
      new Set(['frontend/Detail.vue', 'frontend/style.css', 'frontend/copy.json']),
    )
    await page.getByTestId('prepare-adopt').click()
    assert.equal((await page.evaluate(() => window.adopted)).targetPath, 'frontend/Page.vue')
    await page.getByTestId('prepare-target').fill('frontend/Other.vue')
    assert.equal(await page.getByTestId('prepare-adopt').isDisabled(), true)
    await page.getByTestId('prepare-target').fill('frontend/Page.vue')
    await page.getByTestId('prepare-discover').click()
    await page.getByTestId('prepare-result').waitFor()
    await page.screenshot({ path: resolve(out, 'dependency-preparation-narrow.png') })
    assert.deepEqual(errors, [])
    await save(resolve(out, 'validation.json'), {
      browser: 'real Chromium',
      http: 'real full application',
      discovered: 4,
      explicitAdoption: true,
      editedSelectionInvalidates: true,
      modelCalls: 0,
      pageErrors: errors,
    })
  } finally {
    await browser?.close()
    await server.close()
  }
}

async function navigation(manifest) {
  const { workspace, proposal } = await json(manifest)
  const require = createRequire(resolve('package.json'))
  const { preview } = await import(
    pathToFileURL(resolve(dirname(require.resolve('vite-plus/package.json')), 'dist/index.js')).href
  )
  const built = await preview({
    configFile: false,
    root: resolve(workspace, 'frontend'),
    preview: { host: '127.0.0.1', port: 5193, strictPort: true },
  })
  let browser
  try {
    browser = await loadPlaywright().chromium.launch({
      executablePath: process.env.EAP_CHROMIUM,
      headless: true,
    })
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const checked = []
    for (const route of ['#/', '#/detail']) {
      await page.goto(built.resolvedUrls.local[0] + route)
      await page
        .getByRole('heading', {
          name: route === '#/' ? 'Delivery overview' : 'Delivery detail',
          exact: true,
        })
        .waitFor()
      const links = await page
        .locator('a[href]')
        .evaluateAll((nodes) =>
          nodes.map((node) => ({ text: node.textContent.trim(), href: node.getAttribute('href') })),
        )
      for (const link of links) {
        assert.ok(
          ['#/', '#/detail'].includes(link.href),
          'invalid generated navigation: ' + JSON.stringify(link),
        )
        await page.goto(built.resolvedUrls.local[0] + route)
        await page
          .getByRole('heading', {
            name: route === '#/' ? 'Delivery overview' : 'Delivery detail',
            exact: true,
          })
          .waitFor()
        await page.getByRole('link', { name: link.text, exact: true }).click()
        await page
          .getByRole('heading', {
            name: link.href === '#/' ? 'Delivery overview' : 'Delivery detail',
            exact: true,
          })
          .waitFor()
        checked.push({ route, ...link })
      }
    }
    await page.screenshot({ path: resolve(dirname(manifest), 'generated-navigation-narrow.png') })
    await save(resolve(dirname(manifest), 'navigation-validation.json'), {
      proposalId: proposal.id,
      checked,
      modelCalls: 0,
      rebuilt: false,
    })
  } finally {
    await browser?.close()
    await built.httpServer.close()
  }
}

if (mode === 'prepare') await prepare(input)
else if (mode === 'setup') await setup(input)
else if (mode === 'deliver') await deliver(input)
else if (mode === 'dependencies') await dependencies(input)
else if (mode === 'navigation') await navigation(input)
else throw new Error('Unknown route delivery fixture mode')
