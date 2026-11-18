// Read-only HTTP/browser fixture for CT02 before/after evidence.
// BEFORE provenance: detached 9e7257b9fb45f138db04b6cfe57e1839c5261597 actual app.
// Baseline consumes scoped history.v1; candidate consumes preferences + GET graph.
// These are observations, never uploads or an alternate product implementation.
export const baselineCommit = '9e7257b9fb45f138db04b6cfe57e1839c5261597'
export const conversationId = 'c7020000-0000-4000-8000-000000000001'
export const userMessageId = 'c7020000-0000-4000-8000-000000000002'
export const assistantMessageId = 'c7020000-0000-4000-8000-000000000003'
export const executionId = 'c7020000-0000-4000-8000-000000000004'
export const operationId = 'c7020000-0000-4000-8000-000000000005'
export const title = 'Review message rendering'
export const question = 'Review this small example.'
export const draft = 'Keep this draft for the next review.'
export const answer = '# Review\n**Ready** `count`\n```ts\nconst count = 2\n```\n$x^2+y^2=z^2$\n```mermaid\ngraph LR; A-->B\n```\n| Item | State |\n| --- | --- |\n| Check | Ready |'
export const context = { mode: 'chat', expert: 'general', instructions: '', reasoning: 'default', approval: 'review', files: [], prototypeVersionId: '', targetPath: '' }
const response = { answer, error: '', status: 'SUCCEEDED', executionId, approval: '', verification: 'not_requested', toolEvents: [], artifactError: '', artifacts: [] }
export const graph = {
  conversationId, revision: 1,
  nodes: [
    { id: userMessageId, parentId: null, role: 'user', content: question, executionId: null, operationId, status: 'SUCCEEDED', response: null },
    { id: assistantMessageId, parentId: userMessageId, role: 'assistant', content: answer, executionId, operationId, status: 'SUCCEEDED', response },
  ],
  operations: [{ operationId, userMessageId, assistantMessageId, executionId, graphRevision: 1, status: 'SUCCEEDED', response }],
}
export async function openChatCoreFixture(page, { base, width }) {
  const errors = [], requests = [], blocked = []
  page.on('pageerror', error => errors.push(error.message))
  // Guard every HTTP request, not just /api: no real model, writes or remote reads.
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url())
    if (!['http:', 'https:'].includes(url.protocol)) return route.continue()
    const record = { method: req.method(), path: url.pathname }
    if (req.method() !== 'GET' || url.origin !== new URL(base).origin) {
      blocked.push(record)
      return route.fulfill({ status: 409, json: { code: 'CAPTURE_READ_ONLY', detail: 'Read-only evidence fixture' } })
    }
    if (!url.pathname.startsWith('/api/')) return route.continue()
    requests.push(record)
    if (url.pathname === `/api/ai/conversations/${conversationId}`)
      return route.fulfill({ json: { workspaceLabel: 'UI review fixture', memory: '', connectionId: null, model: '' } })
    if (url.pathname === `/api/ai/conversations/${conversationId}/graph`) return route.fulfill({ json: graph })
    return route.fulfill({ status: 503, json: { code: 'CAPTURE_UNAVAILABLE', detail: 'External services unavailable during evidence capture' } })
  })
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.goto(`${base}/#chat`)
  const composer = page.getByTestId('chat-composer').locator('textarea').first()
  await composer.fill('Scratch draft')
  await page.waitForFunction(() => Object.keys(localStorage).some(k => /eap.chat.(history.v1|preferences.v2)$/.test(k)))
  const storageKey = await page.evaluate(() => Object.keys(localStorage).find(k => /eap.chat.(history.v1|preferences.v2)$/.test(k)))
  const scope = storageKey.replace(/eap.chat.(history.v1|preferences.v2)$/, '')
  await page.addInitScript(({ scope, conversationId, title, question, answer, draft, context, userMessageId, assistantMessageId, executionId }) => {
    localStorage.setItem('eap.appearance.v1', JSON.stringify({ version: 1, preferences: { theme: 'light' } }))
    const items = [{ id: conversationId, title, archived: false, updatedAt: '2026-11-14T10:00:00Z', draft, workspaceLabel: 'UI review fixture', memory: '', connectionId: null, model: '', context }]
    const common = { items, scratch: { draft: 'Scratch draft', context } }
    localStorage.setItem(`${scope}eap.chat.history.v1`, JSON.stringify({ ...common, version: 1, transcripts: { [conversationId]: [
      { id: userMessageId, role: 'user', text: question, error: '', status: 'SUCCEEDED', executionId: '', toolEvents: [], artifacts: [] },
      { id: assistantMessageId, parentId: userMessageId, role: 'assistant', text: answer, error: '', status: 'SUCCEEDED', executionId, approval: '', verification: 'not_requested', toolEvents: [], artifactError: '', artifacts: [] },
    ] } }))
    localStorage.setItem(`${scope}eap.chat.preferences.v2`, JSON.stringify({ ...common, version: 2, branches: {}, pendingOperations: {} }))
  }, { scope, conversationId, title, question, answer, draft, context, userMessageId, assistantMessageId, executionId })
  await page.reload()
  await page.getByTestId('chat-composer').waitFor()
  if (width === 390) await page.getByTestId('open-sidebar').click()
  await page.getByRole('button', { name: title, exact: false }).click()
  await page.getByText(question, { exact: true }).waitFor()
  await composer.fill(draft)
  return { errors, requests, blocked, storageKey, scope }
}
export async function assertChatCoreState(page, expect, capture) {
  await expect(page.getByTestId('chat-composer').locator('textarea').first()).toHaveValue(draft)
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), capture.storageKey)
  expect(saved.activeId).toBe(conversationId)
  expect(saved.items.find(item => item.id === conversationId).draft).toBe(draft)
  expect(capture.blocked).toEqual([])
  expect(capture.errors).toEqual([])
}
