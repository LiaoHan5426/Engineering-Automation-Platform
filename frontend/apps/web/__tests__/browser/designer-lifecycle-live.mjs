import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createServer } from 'vite-plus'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
const { values } = parseArgs({ options: { session: { type: 'string' } } })
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
  },
  server: {
    host: '127.0.0.1',
    port: 5187,
    strictPort: true,
    proxy: { '/api': { target: input.base, changeOrigin: true } },
  },
})
const checks = [],
  errors = [],
  mutations = [],
  externalRequests = []
let browser, page
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
async function file(name) {
  for (let i = 0; i < 600; i++) {
    try {
      return await readFile(resolve(session, name), 'utf8')
    } catch {
      await wait(50)
    }
  }
  throw new Error('Missing fixture signal ' + name)
}
try {
  await server.listen()
  browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(15000)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('dialog', (dialog) => dialog.accept())
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1')
      externalRequests.push({ method: request.method(), origin: new URL(request.url()).origin })
    if (request.url().includes('/api/') && request.method() !== 'GET')
      mutations.push({ method: request.method(), path: new URL(request.url()).pathname })
  })
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (/^https?:/.test(url) && new URL(url).hostname !== '127.0.0.1') return route.abort()
    return route.continue()
  })
  const by = (id) => page.getByTestId(id)
  const nav = async (id) => {
    await by('fixture-' + id).click()
  }
  const editor = (source) => by(source).getByTestId('grapes-scaffold')
  const ready = async (source) => {
    await editor(source).getByTestId('grapes-publish').waitFor()
    await page.waitForFunction(
      (id) =>
        document
          .querySelector('[data-testid="' + id + '"] [data-testid="grapes-status"]')
          ?.textContent.includes('已挂载'),
      source,
    )
  }
  async function detail() {
    await nav('scenes')
    if (await by('workflow-back-detail').count()) await by('workflow-back-detail').click()
    if (await by('scene-open-detail').count())
      await page
        .locator('[data-testid="scene-open-detail"][data-scene-id="prototype-to-code"]')
        .click()
    await by('scenario-composition').waitFor()
  }
  const getVersions = async (source) => {
    const reply = await page.request.get(input.base + '/api/prototype-versions?sourceRef=' + source)
    assert.equal(reply.status(), 200)
    return (await reply.json()).items
  }
  async function inspect(source) {
    const disclosure = editor(source)
      .locator('details')
      .filter({ has: page.getByTestId('grapes-inspection') })
    if (!(await disclosure.evaluate((element) => element.open)))
      await disclosure.locator('summary').click()
    await editor(source).getByTestId('grapes-inspect').click()
    return JSON.parse(await editor(source).getByTestId('grapes-inspection-result').innerText())
  }
  async function setTitle(source, title) {
    await editor(source).getByRole('tab', { name: '页面设置', exact: true }).click()
    await editor(source).getByTestId('grapes-title').fill(title)
  }
  await page.goto('http://127.0.0.1:5187/__tests__/browser/fixtures/designer-lifecycle/index.html')
  await detail()
  await by('composition-check').click()
  await by('scenario-composition').getByText('原型版本目录可读取', { exact: true }).waitFor()
  await by('composition-blocked').waitFor()
  assert.match(await by('scenario-composition').innerText(), /已发布版本 0/)
  checks.push(
    'empty real version catalog is readable but cannot satisfy the required published-version resource',
  )
  await nav('builder-alpha')
  await ready('builder-alpha')
  await setTitle('builder-alpha', 'Alpha published design')
  await editor('builder-alpha').getByTestId('grapes-add-button').click()
  const firstInspection = await inspect('builder-alpha')
  await editor('builder-alpha').getByTestId('grapes-publish').click()
  assert.equal(JSON.parse(await file('publish-waiting.json')).persisted, true)
  await nav('plugins')
  await by('plugin-toggle-builder').click()
  let dialog = page.getByRole('dialog', { name: '停用设计器' })
  await dialog.getByRole('button', { name: '保存恢复草稿并停用', exact: true }).click()
  await by('plugin-installation-error').waitFor()
  assert.match(await by('plugin-installation-error').innerText(), /正在发布|保存未确认/)
  assert.equal(
    JSON.parse(await page.evaluate(() => localStorage.getItem('eap.plugin.installation')))?.enabled
      .builder ?? true,
    true,
  )
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await writeFile(resolve(session, 'release-publish.request'), 'release actual persisted response')
  await nav('builder-alpha')
  await by('builder-alpha').getByTestId('prototype-version').waitFor()
  const alpha = (await getVersions('builder-alpha'))[0]
  assert.equal(alpha.title, 'Alpha published design')
  checks.push(
    'actual publish is persisted through HTTP/JDBC; disabling while its response is pending is refused and does not replay it',
  )
  await by('builder-alpha').getByTestId('builder-tab-design').click()
  await setTitle('builder-alpha', 'Alpha unsaved recovery')
  await editor('builder-alpha').getByTestId('grapes-add-text').click()
  await inspect('builder-alpha')
  await nav('builder-beta')
  await ready('builder-beta')
  await setTitle('builder-beta', 'Beta published design')
  await editor('builder-beta').getByTestId('grapes-add-heading').click()
  await editor('builder-beta').getByTestId('grapes-publish').click()
  await by('builder-beta').getByTestId('prototype-version').waitFor()
  const beta = (await getVersions('builder-beta'))[0]
  await by('builder-beta').getByTestId('builder-tab-design').click()
  await setTitle('builder-beta', 'Beta unsaved recovery')
  await editor('builder-beta').getByTestId('grapes-add-input').click()
  const drafts = await page.evaluate(() =>
    Object.fromEntries(
      ['builder-alpha', 'builder-beta'].map((id) => [
        id,
        JSON.parse(localStorage.getItem('eap.prototype-recovery.v1.' + id)),
      ]),
    ),
  )
  assert.equal(drafts['builder-alpha'].title, 'Alpha unsaved recovery')
  assert.equal(drafts['builder-beta'].title, 'Beta unsaved recovery')
  assert.notDeepEqual(drafts['builder-alpha'].project, drafts['builder-beta'].project)
  checks.push(
    'real GrapesJS A/B projects, local versions and unpublished edits are isolated per instance',
  )
  await nav('plugins')
  // Board is optional for this workflow.
  await by('plugin-toggle-board').click()
  await page
    .getByRole('dialog', { name: '停用看板显示' })
    .getByRole('button', { name: '仅停用看板显示', exact: true })
    .click()
  await by('plugin-toggle-builder').click()
  dialog = page.getByRole('dialog', { name: '停用设计器' })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  assert.equal(await by('builder-alpha').count(), 1)
  await by('plugin-toggle-builder').click()
  await dialog.getByRole('button', { name: '保存恢复草稿并停用', exact: true }).click()
  assert.equal(await by('grapes-scaffold').count(), 0)
  await detail()
  await by('composition-check').click()
  await by('composition-blocked').waitFor()
  assert.match(await by('composition-designer').innerText(), /已停用/)
  assert.match(await by('composition-board').innerText(), /可选任务看板不可用/)
  await page.screenshot({
    path: resolve(session, 'designer-disabled-dependencies.png'),
    fullPage: true,
  })
  await page.reload()
  await by('scene-open-detail').first().waitFor()
  await detail()
  await by('composition-check').click()
  await by('composition-blocked').waitFor()
  assert.equal((await getVersions('builder-alpha'))[0].contentHash, alpha.contentHash)
  assert.equal((await getVersions('builder-beta'))[0].contentHash, beta.contentHash)
  checks.push(
    'confirmed disable releases all designers; refresh preserves disabled preference and original server versions while required composition stays blocked',
  )
  await nav('plugins')
  await by('fixture-activation-fail').click()
  await by('plugin-toggle-builder').click()
  await by('plugin-activation-failed').waitFor()
  await by('plugin-refresh').click()
  assert.match(await by('plugin-runtime-builder').innerText(), /激活失败/)
  await by('plugin-toggle-builder').click()
  for (const source of ['builder-alpha', 'builder-beta']) {
    await nav(source)
    await ready(source)
    assert.equal(
      await editor(source).getByTestId('grapes-title').inputValue(),
      drafts[source].title,
    )
    const inspected = await inspect(source)
    assert.deepEqual(inspected.draft.project, drafts[source].project)
    assert.notEqual(inspected.target.instanceId, firstInspection.target.instanceId)
    assert.match(await editor(source).innerText(), /未保存修改/)
  }
  checks.push(
    'activation failure rolls back and stays visible; successful re-enable creates fresh instances and restores exact unsaved project/title with dirty state',
  )
  await detail()
  await by('composition-check').click()
  await page.waitForFunction(() => !document.querySelector('[data-testid="composition-blocked"]'))
  await writeFile(
    resolve(session, 'fail-service.request'),
    'make owned prototype relation unavailable',
  )
  await file('service-failed.json')
  await by('composition-check').click()
  await by('scenario-composition')
    .getByText('原型版本服务检查失败，可用性未知', { exact: true })
    .waitFor()
  await by('composition-blocked').waitFor()
  assert.match(await by('scenario-composition').innerText(), /已发布版本 2/)
  await writeFile(resolve(session, 'restore-service.request'), 'restore owned relation')
  await file('service-restored.json')
  await by('composition-check').click()
  await page.waitForFunction(() => !document.querySelector('[data-testid="composition-blocked"]'))
  checks.push(
    'actual PostgreSQL relation failure returns bounded 503 and retains old evidence; explicit retry after relation repair restores readiness',
  )
  await by('scene-copy').click()
  await by('scene-save').click()
  await by('scene-save-result').waitFor()
  await by('scene-enter-workflow').click()
  await by('scenario-version').selectOption(alpha.id)
  await nav('plugins')
  await detail()
  assert.equal((await getVersions('builder-alpha')).length, 1)
  assert.equal((await getVersions('builder-beta')).length, 1)
  const sceneReply = await page.request.get(input.base + '/api/scenarios')
  const scenes = (await sceneReply.json()).items
  assert.equal(scenes.length, 1)
  assert.equal(scenes[0].definition.workflow, 'prototype-to-code')
  checks.push(
    'copied scene persists its workflow through the real revision API; navigation keeps chosen version and does not mutate or republish original versions',
  )
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      true,
    )
    await page.screenshot({
      path: resolve(session, 'designer-restored-' + width + '.png'),
      fullPage: true,
    })
  }
  assert.deepEqual(errors, [])
  assert.equal(
    mutations.filter((x) => x.method === 'POST' && x.path === '/api/prototype-versions').length,
    2,
  )
  assert.equal(
    mutations.filter((x) => x.method === 'PUT' && x.path.startsWith('/api/scenarios/custom-'))
      .length,
    1,
  )
  await writeFile(
    resolve(session, 'request-audit.json'),
    JSON.stringify({ mutations, externalRequests }, null, 2),
  )
  assert.equal(mutations.length, 3, JSON.stringify(mutations))
  assert.deepEqual(externalRequests, [])
  await writeFile(
    resolve(session, 'browser-result.json'),
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        errors,
        mutations,
        externalRequests,
        versions: [alpha, beta].map(({ id, sourceRef, title, contentHash }) => ({
          id,
          sourceRef,
          title,
          contentHash,
        })),
        faultScope:
          'Publish response latch and owned PostgreSQL relation rename; activation failure is an explicitly injected local Host test fault',
      },
      null,
      2,
    ),
  )
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: resolve(session, 'failure.png'), fullPage: true })
    await writeFile(resolve(session, 'failure.txt'), await page.locator('body').innerText())
  }
  throw error
} finally {
  await browser?.close()
  await server.close()
}
