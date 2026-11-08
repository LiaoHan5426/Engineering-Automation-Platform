// Real Chromium rendering with isolated API fixtures. No model calls or filesystem writes via EAP.
// EAP_PLAYWRIGHT_MODULE and EAP_CHROMIUM point to an already installed driver/browser.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.EAP_PLAYWRIGHT_MODULE || 'playwright-core')
const output = resolve(
  process.env.EAP_VISUAL_OUTPUT || 'apps/web/__tests__/browser/artifacts/expert-hierarchy',
)
await mkdir(output, { recursive: true })
const native = process.env.EAP_VISUAL_NATIVE === 'true'
const browser = await chromium.launch({
  headless: !native,
  executablePath: process.env.EAP_CHROMIUM,
  args: native ? ['--start-maximized'] : [],
})
const context = await browser.newContext({
  viewport: native ? null : { width: 1440, height: 1000 },
  locale: 'zh-CN',
})
const page = await context.newPage()
page.setDefaultTimeout(10000)
const errors = [],
  mutations = [],
  checks = []
page.on('pageerror', (error) => errors.push(error.message))
const expertId = 'visual-sql-agent'
const id = '11111111-1111-4111-8111-111111111111'
const manifest = {
  id: expertId,
  name: '视觉验收 SQL Agent（模拟）',
  apiVersion: 'eap/v2',
  behavior: { id: 'sql-readonly-agent', version: 1 },
  agent: { goal: '模拟 SQL 取证，仅验证界面交互', tools: ['sql.parse', 'database.explain'] },
  steps: [],
  edges: [],
}
function candidate() {
  return {
    run: {
      id,
      snapshot: { manifest, revision: 3 },
      request: '{}',
      checkpoint: JSON.stringify({
        observations: [
          { capability: 'sql.parse', stdout: '模拟解析证据：单条 SELECT，无数据库执行。' },
        ],
      }),
      state: 'awaiting-approval',
      attempts: 1,
      automatic: true,
      leaseUntil: null,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      result: null,
    },
    approval: {
      proposal_id: 'visual-proposal',
      approval_digest: 'a'.repeat(64),
      approval_expires_at: new Date(Date.now() + 600000).toISOString(),
      decision: null,
      decided_by: null,
      decided_at: null,
    },
    candidate: {
      proposal: {
        id: 'visual-proposal',
        conversationId: id,
        workspace: 'F:/visual-fixture-only/workspace',
        summary: '模拟 SQL 候选，不会修改真实文件',
        files: [
          {
            path: 'queries/analysis/reports/customer_revenue_by_month.sql',
            before: 'SELECT * FROM orders WHERE customer_id = 42;',
            content:
              'SELECT id, total FROM orders WHERE customer_id = 42;\n-- 模拟候选，仅用于界面验收',
            baseHash: 'b'.repeat(64),
          },
        ],
        applied: false,
        writeAllowed: true,
        verification: 'unverified',
      },
      status: 'PROPOSED',
      result: null,
      reason: '',
    },
  }
}
let detail = candidate(),
  failApproval = false
const summary = () => ({
  id,
  expertId,
  expertName: manifest.name,
  state: detail.run.state,
  attempts: 1,
  automatic: true,
  createdAt: '2026-11-08T12:00:00Z',
  updatedAt: '2026-11-08T12:00:00Z',
  expiresAt: detail.run.expiresAt,
})
const approve = () => page.getByTestId('agent-approve')
const dialog = () => page.getByRole('dialog')
const refresh = async () => {
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="agent-detail"] [role="status"]'),
  )
}
async function screenshot(name) {
  if (native) name = name.replace(/-(390|640|900|1440)$/, '-native')
  await page.screenshot({ path: resolve(output, name + '.png') })
}
async function fits(selector) {
  const bounds = await page.locator(selector).evaluate((e) => ({
    width: e.clientWidth,
    scroll: e.scrollWidth,
    left: e.getBoundingClientRect().left,
    right: e.getBoundingClientRect().right,
    viewport: innerWidth,
  }))
  assert.ok(bounds.scroll <= bounds.width + 1, JSON.stringify({ selector, ...bounds }))
  assert.ok(
    bounds.left >= -1 && bounds.right <= bounds.viewport + 1,
    JSON.stringify({ selector, ...bounds }),
  )
  return bounds
}
try {
  // First observe the live shell/read-only list. Every subsequent fixture mutation is intercepted.
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
      return route.fulfill({ status: 409, body: 'VISUAL_QA_MUTATION_BLOCKED' })
    return route.continue()
  })
  await page.goto(process.env.EAP_VISUAL_URL || 'http://127.0.0.1:5173')
  await page.getByRole('button', { name: 'code · 编程', exact: true }).click()
  await page.getByRole('button', { name: '专家', exact: true }).click()
  if (await page.getByRole('button', { name: '专家定义', exact: true }).count())
    await page.getByRole('button', { name: '专家定义', exact: true }).click()
  await page.getByTestId('expert-workspace').waitFor()
  await screenshot('live-expert-page')
  await page.unroute('**/api/**')
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname
    const reply = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path === '/api/expert-agent-runs')
      return reply({ items: [summary()], automaticScheduling: true })
    if (path === '/api/experts' && request.method() === 'GET')
      return reply({
        items: [JSON.stringify(manifest)],
        states: { [expertId]: { enabled: true, builtin: false, revision: 3 } },
      })
    if (path.includes('/agent-runs/')) {
      if (request.method() !== 'GET')
        mutations.push({ method: request.method(), path, body: request.postDataJSON() })
      if (request.method() === 'POST' && path.endsWith('/approval')) {
        if (failApproval) return reply({ message: 'VISUAL_BASELINE_CHANGED' }, 409)
        const body = request.postDataJSON()
        assert.equal(body.proposalId, detail.approval.proposal_id)
        assert.equal(body.digest, detail.approval.approval_digest)
        detail.run.state = body.approve ? 'applied' : 'denied'
        detail.candidate.status = body.approve ? 'APPLIED' : 'FAILED'
      } else if (request.method() === 'DELETE') {
        detail.run.state = 'cancelled'
        return reply({ cancelRequested: true })
      } else if (path.endsWith('/queue')) return reply(detail.run, 202)
      return reply(detail)
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
      return reply({ message: 'VISUAL_QA_MUTATION_BLOCKED' }, 409)
    return route.continue()
  })
  const base = process.env.EAP_VISUAL_URL || 'http://127.0.0.1:5173'
  async function openView(view, run = false) {
    const hash = 'experts?view=' + view + '&expert=' + expertId + (run ? '&run=' + id : '')
    await page.evaluate((hash) => {
      location.hash = hash
    }, hash)
    if (view === 'review') await page.getByTestId('proposal-diff-monaco').waitFor()
    else if (view === 'tasks') await page.getByTestId('agent-run-' + id).waitFor()
    else if (view === 'start') await page.locator('#agent-sql').waitFor()
  }
  await page.goto(base + '/#experts')
  await page.reload()
  await page.getByRole('button', { name: manifest.name, exact: true }).click()
  await page.getByTestId('expert-start').waitFor()
  assert.equal(await page.getByTestId('expert-agent-panel').count(), 0)
  await page.getByRole('tab', { name: '任务记录', exact: true }).click()
  await page.getByTestId('agent-run-' + id).click()
  assert.equal(await approve().count(), 0)
  for (const control of ['task-input-open', 'task-evidence-open', 'task-run-open']) {
    await page.getByTestId(control).click()
    await fits('.eap-drawer .eap-dialog')
    await page.keyboard.press('Tab')
    assert.equal(await dialog().evaluate(e => e.contains(document.activeElement)), true)
    await page.keyboard.press('Escape')
    assert.equal(await dialog().count(), 0)
    assert.equal(await page.getByTestId(control).evaluate(e => e === document.activeElement), true)
  }
  assert.equal(mutations.length, 0)
  checks.push('supporting task details open in the shared drawer and restore focus without mutations')
  await page.getByTestId('agent-open-review').click()
  await page.getByTestId('proposal-diff-monaco').waitFor({ state: 'visible' })
  const display = await page.evaluate(() => ({
    devicePixelRatio,
    screen: { width: screen.width, height: screen.height },
    inner: { width: innerWidth, height: innerHeight },
    outer: { width: outerWidth, height: outerHeight },
    visualScale: visualViewport.scale,
  }))
  for (const width of native ? [display.inner.width] : [1440, 900, 640, 390]) {
    if (!native) await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 })
    await openView('tasks')
    await page.locator('.agent-list').scrollIntoViewIfNeeded()
    checks.push({ width, panel: await fits('[data-testid="expert-agent-panel"]') })
    await screenshot('list-' + width)
    await page.getByTestId('agent-run-' + id).click()
    await page.getByTestId('agent-open-review').click()
    await approve().scrollIntoViewIfNeeded()
    await screenshot('approval-' + width)
    await approve().click()
    await fits('.eap-confirm__dialog')
    assert.equal(
      await page.locator('[data-confirm-cancel]').evaluate((e) => e === document.activeElement),
      true,
    )
    await page.keyboard.press('Tab')
    assert.equal(await dialog().evaluate((e) => e.contains(document.activeElement)), true)
    await screenshot('confirm-' + width)
    const before = mutations.length
    await page.keyboard.press('Escape')
    assert.equal(await dialog().count(), 0)
    assert.equal(mutations.length, before)
    assert.equal(await approve().evaluate((e) => e === document.activeElement), true)
  }
  if (!native) {
    await page.setViewportSize({ width: 390, height: 360 })
    await approve().click()
    await fits('.eap-confirm__dialog')
    await dialog().getByRole('button', { name: '取消', exact: true }).scrollIntoViewIfNeeded()
    const cancelBounds = await page.locator('[data-confirm-cancel]').boundingBox()
    assert.ok(cancelBounds.y >= 0 && cancelBounds.y + cancelBounds.height <= 360)
    await screenshot('confirm-short-window')
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 390, height: 844 })
  }
  await approve().click()
  await dialog().getByRole('button', { name: '确认写入这个 SQL 文件', exact: true }).click()
  await page.getByTestId('agent-state').filter({ hasText: '已写入' }).waitFor()
  assert.equal(await approve().count(), 0)
  checks.push('approve sends exact binding and renders applied; Escape never writes')
  detail = candidate()
  await refresh()
  await page.getByTestId('agent-deny').click()
  await dialog().getByRole('button', { name: '确认拒绝这个候选', exact: true }).click()
  await page.getByTestId('agent-state').filter({ hasText: '已拒绝' }).waitFor()
  await page.getByRole('button', { name: 'code · 编程', exact: true }).click()
  await page.goto(base + '/#experts?view=review&expert=' + expertId + '&run=' + id)
  await page.getByTestId('agent-state').filter({ hasText: '已拒绝' }).waitFor()
  assert.equal(await page.getByText('暂无匹配专家，点击新建开始配置。', { exact: true }).count(), 0)
  checks.push(
    'deny and remount retain state; populated expert list has no empty-state contradiction',
  )
  for (const state of ['unknown', 'expired']) {
    detail = candidate()
    detail.run.state = state
    await refresh()
    await page.waitForFunction(() => !document.querySelector('[data-testid="agent-approve"]'))
    await page.getByTestId('agent-state').scrollIntoViewIfNeeded()
    await screenshot(state + '-390')
  }
  detail = candidate()
  failApproval = true
  await refresh()
  await approve().click()
  await dialog().getByRole('button', { name: '确认写入这个 SQL 文件', exact: true }).click()
  await dialog().waitFor({ state: 'hidden' })
  assert.equal(detail.run.state, 'awaiting-approval')
  await page.locator('.agent-panel > .eap-feedback').first().scrollIntoViewIfNeeded()
  await screenshot('approval-error-390')
  failApproval = false
  await page.getByTestId('agent-cancel').click()
  await page.getByTestId('agent-state').filter({ hasText: '已取消' }).waitFor()
  checks.push(
    'unknown/expired refuse approval; rejected approval remains waiting; explicit cancel renders cancelled',
  )
  await openView('start')
  await page.locator('#agent-sql').fill('select 1')
  await page.locator('#agent-target').fill('queries/review.sql')
  await page.getByTestId('agent-submit').scrollIntoViewIfNeeded()
  await fits('[data-testid="expert-agent-panel"]')
  await screenshot('submit-form-390')
  const count = mutations.length
  await page.getByTestId('agent-submit').click()
  assert.match(await dialog().innerText(), /模型费用/)
  await screenshot('submit-cost-confirm-390')
  await page.keyboard.press('Escape')
  assert.equal(mutations.length, count)
  await page.getByTestId('agent-submit').click()
  await dialog().getByRole('button', { name: '确认启动后台分析', exact: true }).click()
  await dialog().waitFor({ state: 'hidden' })
  assert.equal(mutations.at(-1).path.endsWith('/queue'), true)
  await page.getByRole('button', { name: 'code · 编程', exact: true }).click()
  assert.equal(mutations.at(-1).path.endsWith('/queue'), true)
  checks.push('submission requires cost confirmation; leaving does not cancel the server task')
  await page.goto(base + '/#experts?view=review&expert=' + expertId + '&run=' + id)
  if (!native) await page.setViewportSize({ width: 1440, height: 1000 })
  detail = candidate()
  await refresh()
  await page.evaluate(() => document.documentElement.setAttribute('data-eap-theme', 'dark'))
  await approve().scrollIntoViewIfNeeded()
  await screenshot('approval-dark-1440')
  assert.deepEqual(errors, [])
  await writeFile(
    resolve(output, 'result.json'),
    JSON.stringify(
      {
        checks,
        mutations,
        errors,
        native,
        display,
        boundary:
          'Real Chromium/UI/Monaco; fixture API only for Agent state/actions. No model calls or real candidate writes.',
      },
      null,
      2,
    ),
  )
  console.log(
    JSON.stringify({
      result: 'passed',
      checks: checks.length,
      mutations: mutations.length,
      output,
    }),
  )
} finally {
  await browser.close()
}
