import { loadPlaywright } from './playwright-runtime.mjs'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, readFile, readdir, realpath, symlink, writeFile, lstat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Standalone acceptance fixture; never imports or changes the product board UI.
const [mode, input] = process.argv.slice(2)
const json = async (path) => JSON.parse(await readFile(path, 'utf8'))
const save = (path, value) => writeFile(path, JSON.stringify(value, null, 2))
const digest = (content) => createHash('sha256').update(content).digest('hex')
const paths = ['frontend/src/TaskForm.vue', 'frontend/src/task-form.css']
const initial = '任务列表加个导出功能\n支持按筛选条件导出，文件里保留名称和状态'
const title = '创建开发任务'
const copy = {
  name: '任务名称',
  category: '任务类别',
  description: '任务说明',
  confirmed: '我已核对任务内容和交付要求',
  submit: '提交任务',
  reset: '重置',
  help: '填写说明 ↗',
  dialog: '写清目标，保留你的判断',
  close: '知道了',
  optimize: 'AI 优化',
  adopt: '采用此版本',
  cancel: '取消优化',
  discard: '保留原文',
  success: '本地提交成功，任务说明的换行已保留。',
}
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
  const project = resolve(workspace, 'frontend'),
    src = resolve(project, 'src')
  await mkdir(src, { recursive: true })
  const require = createRequire(resolve('package.json'))
  const dependencies = {
    vue: require('vue/package.json').version,
    '@eap/request': '0.1.0',
    '@eap/runtime-client': '0.1.0',
  }
  const devDependencies = Object.fromEntries(
    ['@vitejs/plugin-vue', 'vite-plus', 'vue-tsc', 'typescript'].map((name) => [
      name,
      require(name + '/package.json').version,
    ]),
  )
  devDependencies.vite = 'npm:@voidzero-dev/vite-plus-core@' + require('vite/package.json').version
  await save(resolve(project, 'package.json'), {
    name: 'textarea-source-fixture',
    private: true,
    type: 'module',
    dependencies,
    devDependencies,
    scripts: { typecheck: 'vue-tsc --noEmit', test: 'vp test run', build: 'vp build' },
  })
  await save(resolve(project, 'tsconfig.json'), {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      noEmit: true,
      allowImportingTsExtensions: true,
      skipLibCheck: true,
      types: ['vite/client'],
    },
    include: ['src/**/*.ts', 'src/**/*.vue'],
  })
  await writeFile(
    resolve(project, 'vite.config.ts'),
    "import { defineConfig } from 'vite-plus'\nimport vue from '@vitejs/plugin-vue'\nexport default defineConfig({ plugins: [vue()], define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') } })\n",
  )
  await writeFile(
    resolve(project, 'index.html'),
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>创建开发任务</title><div id="app"></div><script type="module" src="/src/main.ts"></script></html>',
  )
  await writeFile(
    resolve(src, 'main.ts'),
    "import { createApp } from 'vue'\nimport TaskForm from './TaskForm.vue'\ncreateApp(TaskForm).mount('#app')\n",
  )
  await writeFile(
    resolve(src, 'optimization.ts'),
    `// Read-only host contract reference. Candidate imports runtimeApi directly from its public package.
import { runtimeApi } from '@eap/runtime-client'
export const optimizeTaskDescription = runtimeApi.optimizeTaskDescription
export const cancelTaskDescriptionOptimization = runtimeApi.cancelTaskDescriptionOptimization
export const MAX_DESCRIPTION_LENGTH = 2000
`,
  )
  await writeFile(
    resolve(src, 'TaskForm.vue'),
    '<script setup lang="ts">\nimport "./task-form.css"\n</script>\n<template><main><h1>任务表单待交付</h1></main></template>\n',
  )
  await writeFile(resolve(src, 'task-form.css'), 'body { margin: 0; }\n')
  await mkdir(resolve(project, '__tests__'), { recursive: true })
  await writeFile(
    resolve(project, '__tests__/host.test.ts'),
    `import { expect, it } from 'vite-plus/test'
import { MAX_DESCRIPTION_LENGTH, optimizeTaskDescription, cancelTaskDescriptionOptimization } from '../src/optimization'
it('uses the production optimization contract with the bounded description', () => { expect(MAX_DESCRIPTION_LENGTH).toBe(2000); expect(optimizeTaskDescription).toBeTypeOf('function'); expect(cancelTaskDescriptionOptimization).toBeTypeOf('function') })
`,
  )
  await writeFile(resolve(workspace, '.gitignore'), 'node_modules/\ndist/\n*.tsbuildinfo\n')
  // Root must be physical for BoardVerificationSource. Only children reference existing tools.
  const modules = resolve(project, 'node_modules')
  await mkdir(modules, { recursive: true })
  for (const name of [...Object.keys(dependencies), ...Object.keys(devDependencies)]) {
    const source = name.startsWith('@eap/')
      ? resolve('packages', name.slice(5))
      : dirname(require.resolve(name + '/package.json'))
    const destination = resolve(modules, name)
    await mkdir(dirname(destination), { recursive: true })
    await symlink(
      await realpath(source),
      destination,
      process.platform === 'win32' ? 'junction' : 'dir',
    )
  }
  await symlink(
    await realpath(resolve('node_modules/.bin')),
    resolve(modules, '.bin'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  assert.equal((await lstat(modules)).isSymbolicLink(), false)
  const run = (args) =>
    execFileSync('git', args, { cwd: workspace, stdio: 'inherit', timeout: 30000 })
  run(['init', '-q'])
  run(['add', '.'])
  // Owned, disposable fixture baseline is required for independently verified VCS diff.
  run([
    '-c',
    'user.name=EAP Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    '-c',
    'commit.gpgSign=false',
    'commit',
    '-qm',
    'Isolated textarea baseline',
  ])
  await save(resolve(dirname(workspace), 'prepare.json'), {
    workspace,
    paths,
    physicalNodeModules: true,
    installedPackages: false,
  })
}
async function setup(manifest) {
  const { backend } = await json(manifest),
    project = 'textarea-source-delivery'
  const node = (id, kind, props, children = []) => ({ id, kind, props, children })
  const interactionInstructions = [
    '独立交付样例，仅修改TaskForm.vue和task-form.css。宿主main.ts直接挂载TaskForm，无需路由。必须导入 ./task-form.css，独立行。',
    `精确中文文案：标题${title}；表单accessible name为创建开发任务。名称标签${copy.name}，初始空；类别标签${copy.category}，初始空，选项value为空/development/fix，对应请选择任务类别/功能开发/问题修复。任务说明标签${copy.description}，初始值${JSON.stringify(initial)}，真正textarea保留换行，maxLength=2000，动态字符计数。确认checkbox文案${copy.confirmed}，初始未勾选。`,
    `按钮${copy.submit}须novalidate并手动校验名称/类别/说明/确认。空白说明或名称无效，所有无效控件aria-invalid=true，可见中文反馈。有效提交仅本地role=status显示精确文案${copy.success}；不得保存看板或发业务提交请求。按钮${copy.reset}恢复所有初值并清除错误、成功、建议及处理中请求。`,
    `按钮${copy.help}打开accessible dialog名${copy.dialog}，包含任务说明支持换行，可以描述目标、范围与已有约束。按钮${copy.close}或Escape关闭并可重开。`,
    '像素风格严格复现确认稿：浅灰绿背景#f4f6f3、正文#263c39、白顶栏72px、工程交付logo绿色#337c69；main max-width896px，32px顶部间距/28px横padding；面包屑工作台/任务/创建任务；h1 27px；副标题清楚描述目标，让每一次交付都有据可循。白色卡片16px圆角#dfe6dc边框，卡片内30px 32px；任务信息小节；名称类别1.55fr/1fr两列gap24px；44px高输入，textarea最小160px、line-height1.8；绿色主按钮#337e68，次按钮#eef2eb；390px下单列、16px外间距、卡片19px内距、底部按钮均分，无横向溢出。正式显示真实AI优化/本地提交边界，删除模拟AI字样。',
    `真实AI必须 import { runtimeApi } from '@eap/runtime-client' 并调用runtimeApi.optimizeTaskDescription(id,{text},{signal})；optimization.ts仅只读合同参考，禁止相对import它，因为仅两个selected文件允许相对依赖。取消调用runtimeApi.cancelTaskDescriptionOptimization(id)。宿主已设置VITE_API_URL=/api与真实代理。调用，id=crypto.randomUUID()，返回{text,connectionId,model}。按钮${copy.optimize}从原文快照请求，原文继续可编辑；展示role=region aria-label=AI优化建议，输出data-testid=optimization-output并white-space:pre-wrap，不得自动覆盖。处理中按钮${copy.cancel}；完成显示${copy.discard}和${copy.adopt}。采用后提示已采用优化内容，可继续编辑。`,
    '请求期间optimize禁用；取消时先AbortController.abort再独立cancelTaskDescriptionOptimization(id)发DELETE，隐藏面板，不接收迟到结果。reset及卸载同样取消；请求id与快照保护避免旧响应覆盖。原文编辑漂移时禁用采用并提示原文已修改，请重新优化。新请求清除旧建议。空白/超过2000字在本地阻止请求，maxLength只限制手输也需业务校验；服务错误展示role=alert且保留原文、恢复重试。返回空白或超过2000字也报错且禁止采用。输出为文本，无v-html，无secrets。',
  ].join('\n')
  const schema = {
    version: 1,
    title,
    unknownMappings: [],
    grapesProject: {},
    root: node('page', 'page', {}, [
      node('title', 'heading', { text: title }),
      node('form', 'form', { label: title }, [
        node('name', 'input', { label: copy.name, required: true }),
        node('category', 'select', {
          label: copy.category,
          options: ['功能开发', '问题修复'],
          required: true,
        }),
        node('description', 'textarea', {
          label: copy.description,
          initialValue: initial,
          required: true,
        }),
        node('confirmed', 'checkbox', { label: copy.confirmed, required: true }),
        node('submit', 'button', {
          label: copy.submit,
          action: { type: 'SUBMIT', target: 'form' },
        }),
        node('reset', 'button', { label: copy.reset, action: { type: 'RESET', target: 'form' } }),
      ]),
    ]),
  }
  const version = await api(backend, '/prototype-versions', {
    requestId: randomUUID(),
    sourceRef: 'builder-alpha',
    title,
    acceptance: ['独立表单保留多行说明、必填验证、重置、填写说明；真实AI建议显式采用且保护原文。'],
    body: JSON.stringify({ format: 'eap-prototype-v1', schema }),
  })
  const task = await api(backend, '/board/tasks', {
    projectId: project,
    requestId: randomUUID(),
    title,
    sessionId: '',
    column: 'ready',
    goal: '交付确认的独立任务表单和真实AI优化',
    acceptanceCriteria: interactionInstructions,
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
    paths,
    interactionInstructions,
  })
}
async function exercise(result, out) {
  // Required markers are visible label decoration; retain anchored semantic names.
  const field = (name) => result.getByLabel(new RegExp(`^${name}\\s*\\*?\\s*$`, 'u'))
  const button = (name) =>
    result.getByRole('button', {
      name: name === copy.optimize ? /^AI\s*优化$/u : name === copy.help ? /^填写说明\s*↗$/u : name,
      exact: true,
    })
  const description = field(copy.description),
    name = field(copy.name),
    category = field(copy.category),
    confirmed = result.getByRole('checkbox', { name: copy.confirmed, exact: true })
  for (const width of [1440, 390]) {
    await result.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    await result.reload()
    await result.getByRole('heading', { name: title, exact: true }).waitFor()
    assert.equal(await description.inputValue(), initial)
    assert.equal(await description.evaluate((n) => n.tagName), 'TEXTAREA')
    await name.fill('   ')
    await description.fill(' \n ')
    await button(copy.submit).click()
    for (const f of [name, category, description, confirmed])
      assert.equal(await f.getAttribute('aria-invalid'), 'true')
    await button(copy.reset).click()
    assert.equal(await description.inputValue(), initial)
    assert.equal(await name.inputValue(), '')
    assert.equal(await category.inputValue(), '')
    assert.equal(await confirmed.isChecked(), false)
    assert.equal(await result.locator('[aria-invalid=true]').count(), 0)
    await name.fill('导出任务')
    await category.selectOption('development')
    await description.fill('第一行\n第二行')
    await confirmed.check()
    const business = []
    const observe = (r) => {
      if (['xhr', 'fetch'].includes(r.resourceType())) business.push(r.url())
    }
    result.on('request', observe)
    await button(copy.submit).click()
    await result.getByRole('status').filter({ hasText: copy.success }).waitFor()
    result.off('request', observe)
    assert.deepEqual(business, [])
    assert.equal(await description.inputValue(), '第一行\n第二行')
    await button(copy.help).click()
    const dialog = result.getByRole('dialog', { name: copy.dialog, exact: true })
    await dialog.waitFor()
    await dialog.getByRole('button', { name: copy.close, exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    await button(copy.help).click()
    await dialog.waitFor()
    await result.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    await button(copy.reset).click()
    assert.equal(
      await result.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    )
    await result.screenshot({ path: resolve(out, `textarea-form-${width}.png`), fullPage: true })
  }
  // This request passes through the real proxy to the configured backend/model, no interception.
  const responsePromise = result.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      r.url().includes('/api/ai/task-description/optimizations/'),
    { timeout: 90000 },
  )
  await button(copy.optimize).click()
  const response = await responsePromise,
    data = await response.json()
  await save(resolve(out, 'real-optimization.json'), {
    status: response.status(),
    request: response.request().postDataJSON(),
    response: data,
    mocked: false,
  })
  assert.equal(response.status(), 200)
  assert.ok(data.text.trim().length > 0 && data.text.length <= 2000)
  assert.ok(data.connectionId && data.model)
  await result.getByTestId('optimization-output').waitFor()
  assert.equal(
    await description.inputValue(),
    initial,
    'real response must not replace the original',
  )
  assert.equal(await result.getByTestId('optimization-output').textContent(), data.text)
  await result.screenshot({
    path: resolve(out, 'real-optimization-suggestion.png'),
    fullPage: true,
  })
  await button(copy.adopt).click()
  assert.equal(await description.inputValue(), data.text)
  await result.getByText('已采用优化内容，可继续编辑。', { exact: true }).waitFor()
  // Explicit fault injection below, independently reported; never counted as model evidence.
  const endpoint = '**/api/ai/task-description/optimizations/*'
  const injected = []
  await result.route(endpoint, async (route) => {
    const request = route.request()
    injected.push({ method: request.method(), url: request.url() })
    if (request.method() === 'DELETE') return route.fulfill({ status: 204 })
    return route.fulfill({
      status: 200,
      json: { text: '定向测试建议\n保留换行', connectionId: 'injected', model: 'injected' },
    })
  })
  await button(copy.reset).click()
  await button(copy.optimize).click()
  await result.getByTestId('optimization-output').waitFor()
  await description.fill('修改后的新原文')
  assert.equal(await button(copy.adopt).isDisabled(), true)
  await button(copy.discard).click()
  assert.equal(await description.inputValue(), '修改后的新原文')
  await result.unroute(endpoint)
  let release, enterPost, finishPost
  const gate = new Promise((done) => {
    release = done
  })
  const enteredPost = new Promise((done) => {
    enterPost = done
  })
  const finishedPost = new Promise((done) => {
    finishPost = done
  })
  const bounded = async (promise, label) => {
    let timer
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(label + ' timed out after 15000ms')), 15000)
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }
  await result.route(endpoint, async (route) => {
    const request = route.request()
    injected.push({ method: request.method(), url: request.url() })
    if (request.method() === 'DELETE') return route.fulfill({ status: 204 })
    enterPost(request.url())
    await gate
    try {
      await route.fulfill({
        status: 200,
        json: { text: '迟到建议', connectionId: 'injected', model: 'injected' },
      })
    } catch {
      // Aborting the original request may make the deliberately late response undeliverable.
    } finally {
      finishPost()
    }
  })
  try {
    const [, canceledUrl] = await Promise.all([
      button(copy.optimize).click(),
      bounded(enteredPost, 'Cancellation POST entering the gate'),
    ])
    await button(copy.cancel).waitFor()
    const deleteResponse = result.waitForResponse(
      (response) => response.request().method() === 'DELETE' && response.url() === canceledUrl,
      { timeout: 15000 },
    )
    const [, deletion] = await Promise.all([button(copy.cancel).click(), deleteResponse])
    assert.equal(deletion.status(), 204, 'independent DELETE must finish before releasing the POST')
    release()
    await bounded(finishedPost, 'Late cancellation response handling')
    await result.waitForFunction(
      () =>
        !document.querySelector('[aria-label="AI优化建议"]') ||
        getComputedStyle(document.querySelector('[aria-label="AI优化建议"]')).display === 'none',
    )
    assert.equal(await description.inputValue(), '修改后的新原文')
    assert.equal(await result.getByTestId('optimization-output').count(), 0)
  } finally {
    release()
    await save(resolve(out, 'cancellation-injection.json'), { mocked: true, requests: injected })
  }
  await result.unroute(endpoint)
  await result.route(endpoint, (route) =>
    route.fulfill({
      status: 503,
      json: { code: 'TEST_OPTIMIZATION_ERROR', message: '定向测试服务错误' },
    }),
  )
  await button(copy.optimize).click()
  await result.getByRole('alert').waitFor()
  assert.equal(await description.inputValue(), '修改后的新原文')
  assert.equal(await button(copy.optimize).isEnabled(), true)
  await result.unroute(endpoint)
  await result.route(endpoint, (route) =>
    route.fulfill({
      status: 200,
      json: { text: '长'.repeat(2001), connectionId: 'injected', model: 'injected' },
    }),
  )
  await button(copy.optimize).click()
  await result.getByRole('alert').waitFor()
  assert.equal(await description.inputValue(), '修改后的新原文')
  assert.equal(await button(copy.adopt).isVisible(), false)
  await result.unroute(endpoint)
  const blank = ' \n '
  const blankRequests = []
  const observeBlank = (request) => {
    if (
      request.method() === 'POST' &&
      request.url().includes('/api/ai/task-description/optimizations/')
    )
      blankRequests.push(request.url())
  }
  result.on('request', observeBlank)
  try {
    await description.fill(blank)
    await button(copy.optimize).click()
    await result
      .getByRole('alert')
      .filter({ hasText: /请填写任务说明/u })
      .waitFor()
    assert.equal(await description.inputValue(), blank, 'blank validation preserves the draft')
    assert.deepEqual(blankRequests, [], 'blank input must not make an optimization POST')
  } finally {
    result.off('request', observeBlank)
  }
  assert.ok(
    injected.some((x) => x.method === 'DELETE'),
    'cancel must issue independent DELETE',
  )
  await button(copy.reset).click()
  return {
    widths: [1440, 390],
    multiline: true,
    whitespaceRequired: true,
    reset: true,
    helpDialog: true,
    localSubmit: true,
    realModel: {
      mocked: false,
      connectionId: data.connectionId,
      model: data.model,
      explicitAdoption: true,
    },
    injectedProtectionTests: {
      mocked: true,
      drift: true,
      cancel: true,
      error: true,
      overlongResponse: true,
      requests: injected,
    },
  }
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
      port: 5196,
      strictPort: true,
      proxy: { '/api': { target: backend, changeOrigin: true } },
    },
  })
  let browser, built, page, result
  await save(resolve(out, 'validation.json'), {
    status: 'RUNNING',
    provider,
    proposalId: proposal.id,
    phases: [],
  })
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
        JSON.stringify([{ id: projectId, label: '独立任务表单交付', intendedPath: '' }]),
      )
      localStorage.setItem('eap.selected-project.v1', projectId)
    }, projectId)
    await page.goto(server.resolvedUrls.local[0] + '#board')
    const openTask = () =>
      page.getByRole('button').filter({ hasText: '创建开发任务' }).first().click()
    await openTask()
    await page.getByTestId('board-tab-code').click()
    await page.getByTestId('board-code-refresh').click()
    await page.getByTestId('board-code-open').click()
    await page.getByTestId('evidence-panel').waitFor()
    assert.equal(await page.getByTestId('evidence-file').count(), 2)
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
    await save(resolve(out, 'verification.json'), verification)
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
      preview: {
        host: '127.0.0.1',
        port: 5197,
        strictPort: true,
        proxy: { '/api': { target: backend, changeOrigin: true } },
      },
    })
    result = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    result.on('pageerror', (error) => pageErrors.push(error.message))
    await result.goto(built.resolvedUrls.local[0])
    const interactions = await exercise(result, out)
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
      .fill('独立任务表单：多行说明、真实AI建议与显式采用、取消和草稿保护，已执行独立检查。')
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
    const submittedResponse = await submitted
    await save(resolve(out, 'delivery-response.json'), {
      status: submittedResponse.status(),
      body: await submittedResponse.json(),
    })
    assert.equal(submittedResponse.status(), 200)
    const { record: delivery } = await get(runPath + '/delivery')
    await save(resolve(out, 'delivery.json'), delivery)
    assert.equal(delivery.source, 'CHAT_APPLIED_PREBOUND')
    assert.deepEqual(
      delivery.files.map((file) => [file.path, file.afterHash]),
      proposal.files.map((file) => [file.path, digest(file.content)]),
    )
    assert.equal(delivery.decision, null)
    await page.getByTestId('delivery-preview-url').fill(built.resolvedUrls.local[0])
    await page.getByTestId('delivery-compare-prototype').click()
    const design = page.getByTestId('prototype-version-viewer')
    await design.getByRole('heading', { name: title, level: 1, exact: true }).waitFor()
    await page.screenshot({ path: resolve(out, 'delivery-prototype-comparison.png') })
    await design.locator('[data-eap-dialog-close]').click()
    assert.equal(
      await page.getByTestId('delivery-preview-url').inputValue(),
      built.resolvedUrls.local[0],
    )
    await page.getByTestId('delivery-criteria').check()
    await page.getByTestId('delivery-preview-url').fill(built.resolvedUrls.local[0])
    const previewTab = page.waitForEvent('popup')
    await page.getByTestId('delivery-open-preview').click()
    const registeredPreview = await previewTab
    await registeredPreview.getByRole('heading', { name: '创建开发任务' }).waitFor()
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
      built.resolvedUrls.local[0],
    )
    assert.equal(await page.getByTestId('delivery-accept').count(), 0)
    assert.deepEqual(pageErrors, [])
    await save(resolve(out, 'validation.json'), {
      browser: await browser.version(),
      proposalId: proposal.id,
      runId,
      checks: verification.checks,
      decision: 'technical ACCEPT; no user acceptance',
      provider,
      interactions,
    })
    await save(resolve(out, 'verification.json'), verification)
    await save(resolve(out, 'delivery.json'), (await get(runPath + '/delivery')).record)
  } catch (failure) {
    await save(resolve(out, 'validation.json'), {
      status: 'FAILED',
      provider,
      proposalId: proposal.id,
      error: String(failure),
      stack: failure.stack,
    })
    if (result && !result.isClosed()) {
      await result.screenshot({ path: resolve(out, 'textarea-failure.png'), fullPage: true })
      await writeFile(
        resolve(out, 'textarea-failure.txt'),
        await result.locator('body').innerText(),
      )
    }
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
        if (built)
          await new Promise((done, reject) =>
            built.httpServer.close((error) => (error ? reject(error) : done())),
          )
      } finally {
        await server.close()
      }
    }
  }
}

if (mode === 'prepare') await prepare(input)
else if (mode === 'setup') await setup(input)
else if (mode === 'deliver') await deliver(input)
else throw new Error('Unknown textarea delivery phase: ' + mode)
