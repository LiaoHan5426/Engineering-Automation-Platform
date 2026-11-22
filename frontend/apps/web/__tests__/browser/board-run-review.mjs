import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadPlaywright } from './playwright-runtime.mjs'

const require = createRequire(resolve('frontend/package.json'))
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)
const { default: vue } = await import(pathToFileURL(require.resolve('@vitejs/plugin-vue')).href)
const { chromium } = loadPlaywright()
const task = { id: 'task-browser', projectId: 'project-browser', title: '检查仓库', column: 'ready', goal: '核对运行', acceptanceCriteria: '核对证据', notes: '', priority: 'none', sessionId: '', revision: 1, events: [], executionActive: true, prototypeVersionId: null, preparationIssues: [], allowedColumns: ['ready'] }
const run = { requestId: 'request-browser', taskRevision: 1, task: { title: task.title, goal: task.goal, acceptanceCriteria: task.acceptanceCriteria }, execution: { id: 'run-browser', missionId: 'mission-browser', status: 'RUNNING', capability: 'git-status', principal: 'local-operator', approval: 'NOT_REQUIRED', workspacePath: 'J:/authorized/sample', workspaceLabel: 'sample', executable: 'git', stdout: '只读运行证据', stderr: '', startedAt: '2026-11-22T12:00:00Z', finishedAt: null, unconfirmedReason: 'SERVICE_RESTART_EXIT_UNCONFIRMED' } }
const entry = `import {createApp,h} from 'vue';import Panel from '/apps/web/src/features/shell/BoardRunPanel.vue';import {i18n} from '/apps/web/src/lib/i18n.ts';import '@eap/ui/styles.css';createApp({render:()=>h(Panel,{task:${JSON.stringify(task)}})}).use(i18n).mount('#app');`
const virtualPath = resolve('frontend/apps/web/board-run-harness.ts')
const server = await createServer({
  configFile: false, root: resolve('frontend'),
  cacheDir: resolve('frontend/apps/web/__tests__/browser/.cache/board-run-review'),
  plugins: [vue(), {
    name: 'board-run-review-harness',
    resolveId(id) { if (id === '/board-run-harness.ts') return virtualPath },
    load(id) { if (id.replaceAll('\\', '/').toLowerCase() === virtualPath.replaceAll('\\', '/').toLowerCase()) return entry },
    configureServer(host) {
      host.middlewares.use(async (req, res, next) => {
        if (req.url !== '/board-run-harness') return next()
        res.setHeader('Content-Type', 'text/html')
        res.end(await host.transformIndexHtml('/board-run-harness', '<html><body><div id="app"></div><script type="module" src="/board-run-harness.ts"></script></body></html>'))
      })
    },
  }],
  server: { host: '127.0.0.1', port: 5198, strictPort: true },
})
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    page.setDefaultTimeout(15000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    let writes = 0
    let closed = false
    await page.route('**/api/**', async route => {
      const request = route.request()
      const url = new URL(request.url())
      if (request.method() === 'GET' && url.pathname.endsWith('/board/tasks/task-browser/runs')) {
        return route.fulfill({ json: { availability: { allowed: true, workspacePath: run.execution.workspacePath, workspaceLabel: 'sample', reason: '' }, items: [{ ...run, execution: closed ? { ...run.execution, status: 'CLOSED_UNCONFIRMED', unconfirmedReason: null, resolution: { executionId: 'run-browser', note: '已核对进程身份与运行日志，结果仍未确认', operator: 'local-operator', resolvedAt: '2026-11-22T13:00:00Z' } } : run.execution }] } })
      }
      if (request.method() === 'POST') {
        assert.equal(url.pathname, '/api/missions/mission-browser/executions/run-browser/resolve-unknown')
        assert.deepEqual(request.postDataJSON(), { note: '已核对进程身份与运行日志，结果仍未确认' })
        writes++
        if (writes === 1) return route.fulfill({ status: 503, json: { message: '暂时不可用' } })
        closed = true
        return route.fulfill({ json: { ...run.execution, status: 'CLOSED_UNCONFIRMED' } })
      }
      return route.fulfill({ status: 404, json: {} })
    })
    await page.goto('http://127.0.0.1:5198/board-run-harness')
    await page.getByTestId('board-run-resolve-unknown').click()
    const dialog = page.getByRole('dialog')
    await page.getByTestId('board-run-resolve-note').fill('已核对进程身份与运行日志，结果仍未确认')
    await page.getByTestId('board-run-resolve-ack').check()
    await page.getByTestId('board-run-resolve-confirm').click()
    await page.getByTestId('board-run-resolve-error').waitFor()
    assert.match(await dialog.innerText(), /核对提交失败/)
    assert.equal(await page.getByTestId('board-run-resolve-note').inputValue(), '已核对进程身份与运行日志，结果仍未确认')
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'board-run-resolve-confirm')
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    assert.equal(await page.getByTestId('board-run-resolve-unknown').evaluate(el => el === document.activeElement), true)
    await page.getByTestId('board-run-refresh').click()
    await page.getByTestId('board-run-resolve-unknown').click()
    await page.getByTestId('board-run-resolve-note').fill('已核对进程身份与运行日志，结果仍未确认')
    await page.getByTestId('board-run-resolve-ack').check()
    await page.getByTestId('board-run-resolve-confirm').click()
    await dialog.waitFor({ state: 'detached' })
    await page.getByTestId('board-run-resolution').waitFor()
    assert.match(await page.getByTestId('board-run-summary').innerText(), /已结束 1/)
    assert.match(await page.getByTestId('board-run-resolution').innerText(), /2026-11-22T13:00:00Z/)
    assert.equal(writes, 2)
    assert.deepEqual(errors, [])
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    await page.close()
  }
  console.log('PASS: 390/1440px run summary, Mission identity, in-dialog failure, retained draft, Escape/focus, manual refresh, successful resolution and audit readback. HTTP fixture only.')
} finally {
  await browser?.close()
  await server.close()
}
