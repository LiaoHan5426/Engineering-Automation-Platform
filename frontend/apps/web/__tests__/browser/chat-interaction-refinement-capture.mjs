// Actual App; public synthetic HTTP/SSE only. No backend/provider calls.
import { loadPlaywright } from './playwright-runtime.mjs'
import { createServer } from 'node:http'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const { chromium, expect } = loadPlaywright()
const phase = process.env.CAPTURE_PHASE || 'before',
  base = 'http://127.0.0.1:5208'
const root = process.env.EAP_CAPTURE_ROOT || new URL(`../../../../../docs/evidence/chat-interaction-refinement/${phase}-complete/`, import.meta.url)
  .pathname
await mkdir(root, { recursive: true })
const git = (...args) => execFileSync('git', ['-c', `safe.directory=${process.cwd()}`, ...args])
const head = git('rev-parse', 'HEAD').toString().trim()
if (phase === 'before') expect(head).toBe('579c0d59a2f131715f5b79c3455dad81bc74d7ef')
async function provenance() {
  const paths = git('ls-files', '-z', '--', 'frontend').toString().split('\0').filter(p => p && !p.includes('/__tests__/')).sort()
  const files = []
  for (const path of paths) files.push({path, sha256:createHash('sha256').update(await readFile(path)).digest('hex')})
  return {head, files, sourceTreeSha256:createHash('sha256').update(JSON.stringify(files)).digest('hex'), productionDiff:git('diff','HEAD','--','frontend/apps/web/src','frontend/packages').toString()}
}
const sourceBefore = await provenance()
if (phase === 'before') expect(sourceBefore.productionDiff).toBe('')
const id = 'c7070000-0000-4000-8000-000000000001'
const connection = {
  id: 'public-local-fixture',
  name: 'Public local fixture',
  kind: 'openai',
  enabled: true,
  baseUrl: 'http://fixture.invalid',
  defaultModel: 'layout-fixture',
  models: [{ id: 'layout-fixture', reasoningEfforts: [] }],
  allowedModels: ['layout-fixture'],
  discoveredAt: '',
  discoveryError: '',
  secretPresent: false,
  revision: 1,
  defaultSelected: true,
  configurationRevision: 'fixture-1',
}
const conversation = {
  conversationId: id,
  workspaceLabel: 'Public first-send fixture',
  memory: '',
  connectionId: connection.id,
  model: connection.defaultModel,
}
let active,
  sendCount = 0,
  graph = { conversationId: id, revision: 0, nodes: [], operations: [] }
const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  if (req.method === 'OPTIONS') {
    res.end()
    return
  }
  let body = ''
  req.on('data', (d) => (body += d))
  req.on('end', () => {
    const request = JSON.parse(body)
    sendCount++
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
    res.flushHeaders()
    active = {
      res,
      request,
      sequence: 0,
      executionId: `fixture-execution-${sendCount}`,
      userMessageId: `fixture-user-${sendCount}`,
      assistantMessageId: `fixture-assistant-${sendCount}`,
    }
  })
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const fixture = `http://127.0.0.1:${server.address().port}`
function frame(type, payload, text = '') {
  const a = active
  a.res.write(
    `event: ${type}\ndata: ${JSON.stringify({ eventId: `${a.executionId}:${++a.sequence}`, sequence: a.sequence, executionId: a.executionId, conversationId: id, protocolVersion: '1', occurredAt: '2026-11-15T03:00:00Z', type, status: type === 'final' ? payload.status : 'RUNNING', text, code: '', payload })}\n\n`,
  )
}
function accepted() {
  const a = active
  graph.revision++
  graph.nodes.push(
    {
      id: a.userMessageId,
      parentId: a.request.parentMessageId,
      role: 'user',
      content: a.request.message,
      executionId: null,
      operationId: a.request.operationId,
      status: 'SUCCEEDED',
      response: null,
    },
    {
      id: a.assistantMessageId,
      parentId: a.userMessageId,
      role: 'assistant',
      content: '',
      executionId: a.executionId,
      operationId: a.request.operationId,
      status: 'RUNNING',
      response: null,
    },
  )
  graph.operations.push({
    operationId: a.request.operationId,
    userMessageId: a.userMessageId,
    assistantMessageId: a.assistantMessageId,
    executionId: a.executionId,
    graphRevision: graph.revision,
    status: 'RUNNING',
    response: null,
  })
  frame('accepted', {
    operationId: a.request.operationId,
    executionId: a.executionId,
    userMessageId: a.userMessageId,
    assistantMessageId: a.assistantMessageId,
  })
  frame('answer.delta', null, 'Public controlled streaming reply.')
}
function finish(status, wire = true) {
  const a = active,
    response = {
      executionId: a.executionId,
      answer: status === 'SUCCEEDED' ? 'Public controlled streaming reply.' : '',
      error: status === 'FAILED' ? 'Public controlled error' : '',
      status,
      approval: '',
      verification: 'not_requested',
      toolEvents: [],
      artifactError: '',
      artifacts: [],
    }
  graph.revision++
  Object.assign(
    graph.nodes.find((n) => n.id === a.assistantMessageId),
    { content: response.answer, status, response },
  )
  Object.assign(
    graph.operations.find((o) => o.operationId === a.request.operationId),
    { status, response, graphRevision: graph.revision },
  )
  if (wire) { frame('final', response); a.res.end() }
}
const browser = await chromium.launch({ headless: true, executablePath: process.env.EAP_CHROMIUM })
const results = []
async function geometry(page) {
  return page.evaluate(() => {
    const box = (s) => {
      const el = document.querySelector(s)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
      }
    }
    return {
      rootHeight: document.documentElement.scrollHeight,
      rootWidth: document.documentElement.scrollWidth,
      grid: getComputedStyle(document.querySelector('.app')).gridTemplateRows,
      noticeParent: document.querySelector('[data-testid="send-in-flight"]')?.parentElement?.className,
      details: [...document.querySelectorAll('[data-testid="chat-composer"] details')].map(el=>({summary:el.querySelector('summary')?.textContent,open:el.open})),
      boxes: Object.fromEntries(
        [
          '.app',
          '.body',
          '[data-testid="send-in-flight"]',
          '[data-testid="chat-feed"]',
          '[data-testid="chat-composer"]',
          '[data-testid="cancel-message"]',
          '[data-testid="model-picker"]',
          '[data-testid="send-message"]',
          '[data-testid="chat-workspace"]',
          '.composer-draft',
          '.composer-context',
          '[data-testid="web-source-options"]',
          '[data-testid="outgoing-preview"]',
          '[data-testid="pending-receipt"]',
          '[data-testid="turn-progress"]',
        ].map((s) => [s, box(s)]),
      ),
    }
  })
}
try {
  for (const viewport of [
    { width: 1918, height: 914 },
    { width: 390, height: 1000 },
  ]) {
    active = null
    graph = { conversationId: id, revision: 0, nodes: [], operations: [] }
    const page = await browser.newPage({ viewport }),
      requests = [],
      blocked = [],
      errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.route('**/*', async (route) => {
      const req = route.request(),
        u = new URL(req.url()),
        record = { method: req.method(), path: u.pathname }
      if (!['http:', 'https:'].includes(u.protocol)) return route.continue()
      if (u.origin !== base) {
        blocked.push(record)
        return route.abort()
      }
      if (!u.pathname.startsWith('/api/')) {
        if (req.method() === 'GET') return route.continue()
        blocked.push(record)
        return route.abort()
      }
      requests.push(record)
      const p = u.pathname
      if (req.method() === 'POST' && p === `/api/ai/conversations/${id}/messages`)
        return route.continue({ url: fixture + '/stream' })
      if (
        req.method() === 'POST' &&
        p === `/api/ai/conversations/${id}/executions/${active?.executionId}/cancel`
      ) {
        finish('CANCELLED')
        return route.fulfill({ json: { cancelled: true, executionId: active.executionId } })
      }
      if (req.method() === 'POST' && p === '/api/ai/conversations')
        return route.fulfill({ json: conversation })
      if (req.method() !== 'GET') {
        blocked.push(record)
        return route.fulfill({ status: 409, json: { code: 'FIXTURE_BLOCKED' } })
      }
      let json
      if (p === '/api/ai/status')
        json = {
          state: 'available',
          provider: 'public-fixture',
          model: connection.defaultModel,
          configurationRevision: 'fixture-1',
          lastObservedAt: null,
          errorCode: '',
          tools: { git_status: false },
          workspaceLabel: 'Public first-send fixture',
        }
      else if (p === '/api/ai/connections')
        json = { items: [connection], effectiveDefaultId: connection.id }
      else if (p === `/api/ai/conversations/${id}`) json = conversation
      else if (p === `/api/ai/conversations/${id}/graph`) json = graph
      else if (p.startsWith(`/api/ai/conversations/${id}/operations/`)) json = graph.operations.find(o => o.operationId === decodeURIComponent(p.split('/').at(-1)))
      else if (p === '/api/ai/web-sources') json = []
      else if (p === '/api/ai/speech/services') json = {services:[],limits:{maxAudioBytes:2000000,maxWireBytes:3000000,maxTextChars:10000,maxTranscriptChars:10000}}
      if (json !== undefined) return route.fulfill({ json })
      return route.fulfill({
        status: 503,
        json: { code: 'FIXTURE_UNAVAILABLE', detail: 'Public fixture only' },
      })
    })
    const statusReady = page.waitForResponse(r => new URL(r.url()).pathname === '/api/ai/status')
    const connectionsReady = page.waitForResponse(r => new URL(r.url()).pathname === '/api/ai/connections')
    await page.goto(base + '/#chat')
    await Promise.all([statusReady, connectionsReady])
    await page.evaluate(() => document.fonts.ready)
    await expect(page.locator('#nprogress')).toHaveCount(0)
    const composer = page.getByTestId('chat-composer').locator('textarea').first()
    const states = []
    async function capture(state) {
      let exists = false
      try { await readFile(`${root}/${phase}-${state}-${viewport.width}.png`); exists = true } catch (e) { if (e.code !== 'ENOENT') throw e }
      // Preserve screenshots from an interrupted run; continue behavioral guards and geometry.
      if (!exists) await page.screenshot({ path: `${root}/${phase}-${state}-${viewport.width}.png` })
      const g = await geometry(page)
      states.push({ state, geometry: g })
      if (phase === 'after') {
        expect(g.rootHeight).toBe(viewport.height)
        expect(g.rootWidth).toBe(viewport.width)
        if (g.boxes['[data-testid="send-in-flight"]'])
          expect(g.boxes['[data-testid="send-in-flight"]'].height).toBeLessThan(110)
        expect(g.boxes['.body'].height).toBeGreaterThan(viewport.height * 0.65)
        expect(g.boxes['.body'].scrollHeight).toBeLessThanOrEqual(g.boxes['.body'].clientHeight + 1)
        if (state !== 'navigated-sending') {
          for (const selector of [
            '[data-testid="chat-feed"]',
            '[data-testid="chat-composer"]',
            '[data-testid="model-picker"]',
            g.boxes['[data-testid="cancel-message"]']
              ? '[data-testid="cancel-message"]'
              : '[data-testid="send-message"]',
          ]) {
            const control = g.boxes[selector]
            expect(control.height).toBeGreaterThan(0)
            expect(control.y).toBeGreaterThanOrEqual(g.boxes['.body'].y)
            expect(control.y + control.height).toBeLessThanOrEqual(viewport.height)
          }
        }
      }
    }
    await expect(page.getByTestId('model-picker')).toBeVisible()
    await expect(page.getByTestId('send-message')).toBeDisabled()
    await capture('default-composer')
    if (phase === 'before') {
      const web = page.getByTestId('web-source-options')
      await web.locator('summary').click()
      await expect(page.getByTestId('web-source-server')).toBeDisabled()
      await capture('web-options')
      await web.locator('summary').click()
      const speech = page.getByTestId('chat-composer').locator('details').filter({has:page.getByTestId('speech-controls')})
      await speech.locator('summary').click()
      await expect(page.getByTestId('speech-controls')).toBeVisible()
      await capture('speech-options')
      await speech.locator('summary').click()
    } else {
      await page.getByTestId('capabilities-open').click()
      await expect(page.getByTestId('capabilities-panel')).toBeVisible()
      await expect(page.getByTestId('web-source-server')).toBeDisabled()
      await capture('web-options')
      await expect(page.getByTestId('speech-controls')).toBeVisible()
      await capture('speech-options')
      await page.keyboard.press('Escape')
    }
    await composer.fill('Public synthetic first-send layout check.')
    await expect(page.getByTestId('send-message')).toBeEnabled()
    await page.getByTestId('send-message').click()
    await expect.poll(() => !!active).toBe(true)
    if (phase === 'before') await expect(page.getByTestId('send-in-flight')).toBeVisible()
    else {
      await expect(page.getByTestId('send-in-flight')).toHaveCount(0)
      await expect(page.getByTestId('pending-receipt')).toBeVisible()
      expect(await page.getByTestId('pending-receipt').evaluate(el => { const r=el.getBoundingClientRect(); const feed=el.closest('[data-testid="chat-feed"]'); const f=feed?.getBoundingClientRect(); return !!f && r.height>0 && r.top>=f.top && r.bottom<=f.bottom && r.bottom<=innerHeight })).toBe(true)
      await expect(page.getByTestId('chat-feed')).not.toContainText('从一个具体需求开始')
    }
    await capture('first-pending')
    if (phase === 'before') {
      expect(states.at(-1).geometry.noticeParent).toBe('shell-notices')
      expect(states.at(-1).geometry.boxes['[data-testid="send-in-flight"]'].height).toBeGreaterThan(0)
      active.res.end()
    } else {
      accepted()
      await expect(page.getByTestId('chat-feed')).toContainText(
        'Public controlled streaming reply.',
      )
      await expect(page.getByTestId('cancel-message')).toBeVisible()
      await expect(page.getByTestId('turn-progress')).toBeVisible()
      await expect(page.getByTestId('pending-receipt')).toHaveCount(0)
      await expect(page.getByTestId('send-in-flight')).toHaveCount(0)
      await capture('first-streaming')
      await page.evaluate(() => (location.hash = 'appearance'))
      await expect(page.getByTestId('appearance-settings')).toBeVisible()
      await expect(page.getByTestId('send-in-flight')).toBeVisible()
      await capture('navigated-sending')
      await page.getByTestId('return-running-chat').click()
      await expect(page.getByTestId('cancel-message')).toBeVisible()
      await capture('returned-sending')
      finish('SUCCEEDED')
      await expect(page.getByTestId('send-in-flight')).toHaveCount(0)
      await capture('success')
      for (const terminal of ['FAILED', 'CANCELLED']) {
        await composer.fill('Public second-send layout check ' + terminal)
        active = null
        await page.getByTestId('send-message').click()
        await expect.poll(() => !!active).toBe(true)
        await capture('second-pending-' + terminal.toLowerCase())
        accepted()
        if (terminal === 'CANCELLED') {
          const cancel = page.getByTestId('cancel-message')
          await cancel.click()
        } else finish(terminal)
        await expect(page.getByTestId('send-in-flight')).toHaveCount(0)
        await expect(page.getByTestId('turn-progress').last()).toBeVisible()
        await capture(terminal.toLowerCase())
      }
    }
    if (phase === 'after') {
      await composer.fill('Public unknown recovery check.')
      active = null
      await page.getByTestId('send-message').click()
      await expect.poll(() => !!active).toBe(true)
      accepted()
      await expect(page.getByTestId('chat-feed')).toContainText('Public controlled streaming reply.')
      active.res.end()
      await expect(page.getByTestId('inspect-turn')).toBeVisible()
      await expect(composer).toBeDisabled()
      await expect(page.getByTestId('send-message')).toHaveCount(0)
      const sends = sendCount
      const getCount = requests.filter(r => r.path.endsWith('/graph')).length
      await page.getByTestId('inspect-turn').click()
      await expect.poll(() => requests.filter(r => r.path.endsWith('/graph')).length).toBeGreaterThan(getCount)
      expect(sendCount).toBe(sends)
      await capture('unknown-read-only-inspection')
      finish('SUCCEEDED', false)
      await page.getByTestId('inspect-turn').click()
      await expect(page.getByTestId('inspect-turn')).toHaveCount(0)
      expect(sendCount).toBe(sends)
      await capture('unknown-recovered')
    }
    expect(blocked).toEqual([])
    expect(errors).toEqual([])
    results.push({
      viewport,
      states,
      requests,
      blocked,
      errors,
      firstSendNewConversation: true,
      backend: false,
      realProvider: false,
    })
    await page.close()
  }
  const sourceAfter = await provenance()
  expect(sourceAfter).toEqual(sourceBefore)
  await writeFile(`${root}/${phase}-source-provenance.json`, JSON.stringify(sourceBefore,null,2)+'\n', {flag:'wx'})
  const sources = []
  for (const path of ['frontend/apps/web/src/App.vue', 'frontend/apps/web/src/work-pages.css'])
    sources.push({
      path,
      sha256: createHash('sha256')
        .update(await readFile(path))
        .digest('hex'),
    })
  await writeFile(
    `${root}/${phase}-manifest.json`,
    JSON.stringify(
      {
        head: execFileSync('git', ['-c', `safe.directory=${process.cwd()}`, 'rev-parse', 'HEAD'], {
          encoding: 'utf8',
        }).trim(),
        phase,
        sources,
        results,
      },
      null,
      2,
    ) + '\n',
    {flag:'wx'},
  )
  console.log(
    JSON.stringify(
      results.map((r) => ({
        viewport: r.viewport,
        states: r.states.map((s) => ({
          state: s.state,
          grid: s.geometry.grid,
          noticeHeight: s.geometry.boxes['[data-testid="send-in-flight"]']?.height ?? 0,
          bodyHeight: s.geometry.boxes['.body'].height,
        })),
      })),
      null,
      2,
    ),
  )
} finally {
  await browser.close()
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
}
