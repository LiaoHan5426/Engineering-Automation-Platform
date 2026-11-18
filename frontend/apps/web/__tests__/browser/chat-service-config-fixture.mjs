// Actual-app evidence contract: BEFORE dfa9612, GET fixtures only; no live MCP/model.
// Reuse the CT02 canonical conversation, source answer, IDs and draft unchanged.
export { answer, draft, conversationId, userMessageId, assistantMessageId, executionId, graph, assertChatCoreState } from './chat-core-fixture.mjs'
import { openChatCoreFixture } from './chat-core-fixture.mjs'
export const baselineCommit = 'dfa9612c25cd12be1822bd16fc14fcd07dc5b133'
export const baselineWorktree = '/tmp/eap-chat-services-baseline-dfa9612'
export const server = {
  id: 'web-review', name: 'Review web service', transport: 'streamable-http',
  endpoint: 'http://127.0.0.1:59999/mcp', trusted: false, enabled: false, usable: false,
  tools: ['search', 'read'], productionGrantedTools: [], productionGranted: false,
  capabilities: [], authorisedExperts: [], enabledExperts: [], problems: [],
}
export const catalog = {
  items: [], kinds: [{ id: 'mcp', label: 'MCP 工具', description: '登记服务器并管理工具授权。', count: 2, scope: 'expert', scopeLabel: '专家级', expertScoped: true,
    management: { id: 'mcp', label: '服务器登记', description: '登记 MCP 服务器', creation: '操作者登记', manageable: true },
    manageable: true, visible: true, availability: { total: 2, unavailable: 2 } }],
  capabilities: [], globallyUsable: [], disabledPlatform: [], expertScoped: [], platformScoped: [], expertScopedVocabulary: [],
  mcpServers: [server], mcpProductionMatrix: [], settings: {}, disabledCapabilities: [], declared: [], unregistered: [], undeclared: [],
}
// Shared after contract: unchanged disabled/untrusted server, no callable web service.
export const webServices = []
export async function openServiceChatFixture(page, options) {
  const capture = await openChatCoreFixture(page, options)
  // Earlier core guard owns nonGET/external blocking; matched fixture GETs only.
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url())
    if (req.method() !== 'GET' || url.origin !== new URL(options.base).origin) return route.fallback()
    const payload = serviceGet(url.pathname)
    if (payload === undefined) return route.fallback()
    capture.requests.push({ method: req.method(), path: url.pathname })
    return route.fulfill({ json: payload })
  })
  return capture
}
export function serviceGet(path) {
  if (path === '/api/capabilities') return catalog
  if (path === '/api/mcp-servers') return { items: [server] }
  if (path === '/api/ai/web-sources') return webServices
  if (path === '/api/runtime/trusted-tools') return { items: [], programs: [], probeCache: { cached: 0, known: 0, failed: 0 } }
}
export async function openServiceMcpFixture(page, { base }) {
  const errors = [], requests = [], blocked = []
  page.on('pageerror', error => errors.push(error.message))
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
    const payload = serviceGet(url.pathname)
    if (payload !== undefined) return route.fulfill({ json: payload })
    return route.fulfill({ status: 503, json: { code: 'CAPTURE_UNAVAILABLE', detail: 'External services unavailable during evidence capture' } })
  })
  await page.addInitScript(() => localStorage.setItem('eap.appearance.v1', JSON.stringify({ version: 1, preferences: { theme: 'light' } })))
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  // App.vue hash allowlist owns this route; CapabilityManager owns the MCP tab.
  await page.goto(`${base}/#capabilities`)
  await page.getByRole('tab', { name: /MCP 工具/ }).click()
  await page.getByRole('heading', { name: /Review web service/ }).waitFor()
  return { errors, requests, blocked }
}
