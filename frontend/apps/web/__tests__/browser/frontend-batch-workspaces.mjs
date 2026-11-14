import { loadPlaywright } from './playwright-runtime.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const { chromium, expect } = loadPlaywright()
const output = resolve('docs/evidence/frontend-batch/workspaces')
const taskId = '11111111-1111-4111-8111-111111111111'
const task = {
  id: taskId,
  projectId: 'audit',
  title: 'Interaction audit task',
  column: 'planned',
  goal: 'Keep goal',
  acceptanceCriteria: 'Keep criteria',
  notes: '',
  priority: 'none',
  sessionId: '',
  revision: 1,
  events: [],
  executionActive: false,
  prototypeVersionId: null,
  preparationIssues: [],
  allowedColumns: ['planned', 'ready'],
}
const version = {
  id: 'version-a',
  requestId: '22222222-2222-4222-8222-222222222222',
  sourceRef: 'builder-alpha',
  title: 'Audit design',
  body: 'Explicit browser fixture',
  acceptance: [],
  contentHash: 'fixture-hash',
}
const browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
const results = []
try {
  for (const [phase, base] of [
    ['before', 'http://127.0.0.1:5187'],
    ['after', 'http://127.0.0.1:5186'],
  ]) {
    await mkdir(resolve(output, phase), { recursive: true })
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } })
      const page = await context.newPage()
      const errors = [],
        writes = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.addInitScript(() => {
        localStorage.setItem('eap.locale', 'zh-CN')
        localStorage.setItem(
          'eap.local-projects.v1',
          JSON.stringify([{ id: 'audit', label: 'Audit fixture', intendedPath: '' }]),
        )
        localStorage.setItem('eap.selected-project.v1', 'audit')
      })
      await page.route('**/api/**', async (route) => {
        const request = route.request(),
          path = new URL(request.url()).pathname
        const fulfill = (body, status = 200) =>
          route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
        if (request.method() !== 'GET') {
          writes.push({ method: request.method(), path, body: request.postData() })
          if (path === '/api/board/tasks/' + taskId)
            return fulfill(
              {
                type: 'about:blank',
                title: 'Injected error',
                status: 500,
                code: 'AUDIT_FAILURE',
                detail: 'Explicit interaction audit failure',
              },
              500,
            )
          return fulfill(
            {
              type: 'about:blank',
              title: 'Blocked',
              status: 409,
              code: 'AUDIT_WRITE_BLOCKED',
              detail: 'Browser fixture blocks mutations',
            },
            409,
          )
        }
        if (path === '/api/board/tasks') return fulfill({ items: [task] })
        if (path === '/api/board/tasks/' + taskId) return fulfill(task)
        if (path === '/api/board/tasks/' + taskId + '/runs')
          return fulfill({
            availability: {
              allowed: false,
              workspacePath: 'fixture',
              workspaceLabel: 'fixture',
              reason: 'AUDIT',
            },
            items: [
              {
                requestId: 'run-request',
                taskRevision: 1,
                task: {
                  title: task.title,
                  goal: task.goal,
                  acceptanceCriteria: task.acceptanceCriteria,
                },
                execution: {
                  id: 'run-a',
                  missionId: 'mission-a',
                  status: 'SUCCEEDED',
                  capability: 'git-status',
                  principal: 'local-operator',
                  approval: 'NOT_REQUIRED',
                  workspacePath: 'fixture',
                  workspaceLabel: 'fixture',
                  executable: 'git',
                  stdout: '',
                  stderr: '',
                  startedAt: '2026-11-01T00:00:00Z',
                  finishedAt: '2026-11-01T00:00:01Z',
                  exitCode: 0,
                },
              },
            ],
          })
        if (path.endsWith('/runs/run-a/delivery'))
          return fulfill({
            record: null,
            prepareAllowed: false,
            reason: 'BOARD_VERIFICATION_REQUIRED',
          })
        if (path === '/api/prototype-versions') return fulfill({ items: [version] })
        return route.continue()
      })
      await page.goto(base + '/#board?projectId=audit&taskId=' + taskId)
      await page.getByTestId('board-detail-dialog').waitFor()
      await page.getByTestId('board-tab-preparation').click()
      await page.getByTestId('task-notes').fill('Retained after failure')
      await page.getByTestId('board-save-fields').click()
      await expect(page.getByTestId('board-save-fields')).toBeEnabled()
      const inlineError =
        (await page
          .getByTestId('board-detail-dialog')
          .getByText(/任务更新失败，本机修改仍保留|Task update failed/i)
          .count()) > 0
      await page.screenshot({
        path: resolve(output, phase, `board-error-${width}.png`),
        fullPage: true,
      })
      // Reload clears only this unsaved test edit; fixture state stays immutable.
      await page.evaluate(() => {
        sessionStorage.clear()
      })
      await page.reload()
      await page.getByTestId('board-detail-dialog').waitFor()
      await page.getByTestId('board-tab-prototype').click()
      await expect(page.getByTestId('board-prototype-select')).toBeEnabled()
      await page.getByTestId('board-prototype-select').selectOption('version-a')
      await page.getByTestId('board-close-detail').click()
      const prototypeConfirmed = (await page.locator('.eap-confirm').count()) > 0
      await page.screenshot({
        path: resolve(output, phase, `prototype-close-${width}.png`),
        fullPage: true,
      })
      if (phase === 'after') {
        expect(inlineError).toBe(true)
        expect(prototypeConfirmed).toBe(true)
        await page.locator('[data-confirm-cancel]').click()
        await expect(page.getByTestId('board-prototype-select')).toHaveValue('version-a')
        await page.getByTestId('board-close-detail').click()
        await page.locator('.eap-confirm__actions button').first().click()
      }
      await page.goto(base + '/#board?projectId=audit&taskId=' + taskId)
      await page.reload()
      await page.getByTestId('board-tab-runs').click()
      await page.getByTestId('board-run-delivery').click()
      await page.getByTestId('delivery-paths').fill('frontend/Unsaved.vue')
      await page.getByTestId('board-delivery-dialog').locator('[data-eap-dialog-close]').click()
      const deliveryConfirmed = (await page.locator('.eap-confirm').count()) > 0
      await page.screenshot({
        path: resolve(output, phase, `delivery-close-${width}.png`),
        fullPage: true,
      })
      if (phase === 'after') {
        expect(deliveryConfirmed).toBe(true)
        await page.locator('[data-confirm-cancel]').click()
        await expect(page.getByTestId('delivery-paths')).toHaveValue('frontend/Unsaved.vue')
      }
      await page.goto(base + '/#board')
      await page.reload()
      await page.getByTestId('board-create-task').click()
      await page.getByTestId('board-new-title').fill('Unsaved navigation draft')
      await page.getByTestId('board-new-goal').fill('Keep create goal')
      await page.evaluate(() => {
        location.hash = 'scenes'
      })
      await page.waitForTimeout(150)
      const navigationConfirmed = (await page.locator('.eap-confirm').count()) > 0
      await page.screenshot({
        path: resolve(output, phase, `board-navigation-${width}.png`),
        fullPage: true,
      })
      if (phase === 'after') {
        expect(navigationConfirmed).toBe(true)
        await page.locator('[data-confirm-cancel]').click()
        await expect(page.getByTestId('board-new-title')).toHaveValue('Unsaved navigation draft')
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
      results.push({
        phase,
        width,
        inlineError,
        prototypeConfirmed,
        deliveryConfirmed,
        navigationConfirmed,
        overflow,
        pageErrors: errors,
        interceptedWrites: writes,
        boundary:
          'Explicit deterministic browser fixtures; all non-GET requests intercepted; no real mutation authorized or executed.',
      })
      await context.close()
    }
  }
} finally {
  await browser.close()
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2))
}
console.log(JSON.stringify(results, null, 2))
