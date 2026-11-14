// Explicit HTTP and browser-audio simulation. No real MCP, microphone, ASR or TTS.
import { loadPlaywright } from './playwright-runtime.mjs'
import { openServiceChatFixture, openServiceMcpFixture, server, draft } from './chat-service-config-fixture.mjs'
import { title } from './chat-core-fixture.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
const { chromium, expect } = loadPlaywright()
const base = process.env.EAP_CHAT_SERVICE_BASE || 'http://127.0.0.1:5205'
const root = new URL('../../../../../docs/evidence/chat-service-config/', import.meta.url).pathname
await mkdir(root, { recursive: true })
const wav = Buffer.alloc(204)
wav.write('RIFF', 0); wav.writeUInt32LE(196, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(160, 40)
const waveBase64 = wav.toString('base64')
const speechServer = 'simulated-authorized-speech'
const limits = { maxAudioBytes: 4194304, maxWireBytes: 6291456, maxTextChars: 4000, maxTranscriptChars: 16000 }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const schema = properties => ({ type: 'object', properties: Object.fromEntries(properties.map(([key, type]) => [key, { type }])), required: properties.map(([key]) => key) })
const common = { expertId: 'fixture-expert', approved: true }
const initialBindings = [
 { ...common, operation: 'SEARCH', tool: 'search', inputArgument: 'query', resultsField: 'items', titleField: 'title', urlField: 'url', textField: 'text', inputSchema: schema([['query', 'string']]) },
 { ...common, operation: 'READ', tool: 'read', inputArgument: 'url', resultsField: '', titleField: 'title', urlField: 'url', textField: 'text', ownerPolicyArgument: 'policy', inputSchema: schema([['url', 'string'], ['policy', 'object']]) },
 { ...common, operation: 'ASR', tool: 'transcribe', audioArgument: 'audio', mimeArgument: 'mime', textField: 'text', resultFormat: 'JSON', inputSchema: schema([['audio', 'string'], ['mime', 'string']]) },
 { ...common, operation: 'TTS', tool: 'speak', textArgument: 'text', audioField: 'audio', mimeField: 'mime', resultFormat: 'JSON', inputSchema: schema([['text', 'string']]) },
]
function exact(value, keys) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)) }
async function mockAudio(page) {
 await page.addInitScript(({ waveBase64 }) => {
  window.__simulatedAudio = { permissionRequests: 0, trackStops: 0, recordings: 0, plays: 0, pauses: 0 }
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { window.__simulatedAudio.permissionRequests++; return { getTracks: () => [{ stop: () => { window.__simulatedAudio.trackStops++ } }] } } } })
  window.MediaRecorder = class {
   static isTypeSupported(mime) { return mime === 'audio/wav' }
   state = 'inactive'
   constructor(stream, options) { this.mimeType = options.mimeType }
   start() { this.state = 'recording'; window.__simulatedAudio.recordings++ }
   stop() { if (this.state !== 'recording') return; this.state = 'inactive'; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob([Uint8Array.from(atob(waveBase64), char => char.charCodeAt(0))], { type: this.mimeType }) }); this.onstop?.() }) }
  }
  HTMLMediaElement.prototype.play = async function () { window.__simulatedAudio.plays++ }
  HTMLMediaElement.prototype.pause = function () { window.__simulatedAudio.pauses++ }
 }, { waveBase64 })
}
const browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
const results = { simulated: true, realMicrophoneOrProviderUsed: false, config: null, speech: [] }
try {
 // Configuration persistence is a separate fixture from the paired disabled-server screenshots.
 const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
 const capture = await openServiceMcpFixture(page, { base })
 const state = { snapshot: { revision: 0, bindings: structuredClone(initialBindings) }, writes: [], reads: [], conflict: false, readbackFailure: false, responseLost: false }
 await page.route('**/api/**', async route => {
  const req = route.request(), url = new URL(req.url())
  if (url.origin !== new URL(base).origin || url.pathname !== `/api/mcp-servers/${server.id}/operation-bindings`) return route.fallback()
  if (req.method() === 'GET') { state.reads.push({ revision: state.snapshot.revision, failed: state.readbackFailure }); return state.readbackFailure ? route.fulfill({ status: 503, json: { code: 'CAPTURE_READBACK_UNAVAILABLE' } }) : route.fulfill({ json: state.snapshot }) }
  if (req.method() !== 'PUT') return route.fallback()
  const body = req.postDataJSON()
  expect(exact(body, ['expectedRevision', 'bindings'])).toBe(true); expect(body.bindings).toHaveLength(4)
  expect(body.bindings.map(item => item.operation)).toEqual(['SEARCH', 'READ', 'ASR', 'TTS'])
  for (const binding of body.bindings) { expect(binding.inputSchema.type).toBe('object'); expect(typeof binding.approved).toBe('boolean') }
  state.writes.push(body)
  if (state.conflict || body.expectedRevision !== state.snapshot.revision) return route.fulfill({ status: 409, json: { code: 'TOOL_BINDING_CHANGED', detail: '操作配置已变化，请核对保存结果。' } })
  state.snapshot = { revision: state.snapshot.revision + 1, bindings: structuredClone(body.bindings) }
  if (state.responseLost) return route.fulfill({ status: 503, json: { code: 'CAPTURE_SAVE_RESPONSE_LOST' } })
  return route.fulfill({ json: state.snapshot })
 })
 const openConfig = async () => { await page.getByRole('button', { name: /聊天服务配置|操作映射|服务配置/ }).first().click(); await expect(page.getByTestId('mcp-operation-bindings')).toBeVisible() }
 await openConfig()
 const dialog = page.getByTestId('mcp-operation-bindings')
 await expect(dialog.getByRole('checkbox', { name: '批准此操作映射', exact: true })).toHaveCount(4)
 for (const operation of ['SEARCH', 'READ', 'ASR', 'TTS']) await expect(dialog.getByRole('heading', { name: operation, exact: true })).toBeVisible()
 const asr = dialog.locator('.operation-binding').filter({ has: page.getByRole('heading', { name: 'ASR', exact: true }) })
 await asr.getByLabel('授权专家标识', { exact: true }).fill('fixture-expert-edited')
 await dialog.getByRole('button', { name: '取消', exact: true }).click()
 const discard = page.getByRole('dialog', { name: '放弃未保存的配置？', exact: true })
 await expect(discard).toBeVisible()
 await discard.getByRole('button', { name: '取消', exact: true }).click()
 await expect(asr.getByLabel('授权专家标识', { exact: true })).toHaveValue('fixture-expert-edited')
 expect(state.writes).toHaveLength(0)
 await dialog.getByRole('button', { name: '保存', exact: true }).click()
 await expect.poll(() => state.snapshot.revision).toBe(1)
 await dialog.getByRole('button', { name: '取消', exact: true }).click()
 await expect(dialog).toHaveCount(0)
 await openConfig(); await expect(asr.getByLabel('授权专家标识', { exact: true })).toHaveValue('fixture-expert-edited')
 await page.screenshot({ path: `${root}/after-config-dialog-1440.png`, fullPage: true })
 await page.setViewportSize({ width: 390, height: 1000 })
 await expect(dialog.getByRole('checkbox', { name: '批准此操作映射', exact: true })).toHaveCount(4)
 await dialog.getByRole('button', { name: '保存', exact: true }).scrollIntoViewIfNeeded()
 await page.screenshot({ path: `${root}/after-config-dialog-390.png`, fullPage: true })
 await page.setViewportSize({ width: 1440, height: 1000 })
 state.conflict = true
 await asr.getByLabel('授权专家标识', { exact: true }).fill('fixture-conflict-draft')
 await dialog.getByRole('button', { name: '保存', exact: true }).click()
 await expect(dialog).toContainText(/TOOL_BINDING_CHANGED|配置.*变化|绑定.*变化/)
 await expect(asr.getByLabel('授权专家标识', { exact: true })).toHaveValue('fixture-conflict-draft')
 await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
 const reconcile = dialog.getByRole('button', { name: '重新核对保存结果', exact: true })
 const writesAfterConflict = state.writes.length
 await reconcile.click()
 await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
 expect(state.writes).toHaveLength(writesAfterConflict)
 state.conflict = false; state.responseLost = true
 await dialog.getByRole('button', { name: '保存', exact: true }).click()
 await expect.poll(() => state.snapshot.revision).toBe(2)
 await expect(reconcile).toBeVisible()
 await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
 const writesAfterLoss = state.writes.length
 state.readbackFailure = true
 await reconcile.click()
 await expect(dialog).toContainText(/CAPTURE_READBACK_UNAVAILABLE|503/)
 await expect(asr.getByLabel('授权专家标识', { exact: true })).toHaveValue('fixture-conflict-draft')
 expect(state.writes).toHaveLength(writesAfterLoss)
 state.readbackFailure = false
 await reconcile.click()
 await expect(dialog).toContainText('已确认配置已保存。')
 await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
 expect(state.writes).toHaveLength(writesAfterLoss)
 expect(capture.blocked).toEqual([]); expect(capture.errors).toEqual([])
 results.config = { unsavedCloseCancelledRetainsDraft: true, saveReopen: true, casConflictRetainsDraft: true, readbackFailureRetainsDraft: true, noEnableTrustProbeOrToolCall: true, ...state, ...capture }
 await page.close()
 for (const width of [1440, 390]) {
  const audioPage = await browser.newPage({ viewport: { width, height: 1000 } })
  await mockAudio(audioPage)
  const capture = await openServiceChatFixture(audioPage, { base, width })
  const operations = new Map(), intentional = []
  let late = false, cancelOffline = false
  await audioPage.route('**/api/**', async route => {
   const req = route.request(), url = new URL(req.url()), path = url.pathname
   if (url.origin !== new URL(base).origin) return route.fallback()
   if (req.method() === 'GET' && path === `/api/mcp-servers/${server.id}/operation-bindings`) return route.fulfill({ json: { revision: 0, bindings: [] } })
   if (req.method() === 'GET' && path === '/api/ai/speech/services') return route.fulfill({ json: { services: [{ serverId: speechServer, transcription: true, synthesis: true, inputMimes: ['audio/wav'], outputMimes: ['audio/wav'] }], limits } })
   const get = /^\/api\/ai\/speech\/operations\/([0-9a-f-]+)$/.exec(path)
   if (req.method() === 'GET' && get && operations.has(get[1])) return route.fulfill({ json: operations.get(get[1]) })
   const cancel = /^\/api\/ai\/speech\/([0-9a-f-]+)\/cancel$/.exec(path)
   if (req.method() === 'POST' && cancel && operations.has(cancel[1])) {
    expect(req.postDataJSON()).toEqual({}); intentional.push({ method: 'POST', path, simulated: true })
    if (cancelOffline) return route.fulfill({ status: 503, json: { code: 'CAPTURE_CANCEL_OFFLINE' } })
    const operation = operations.get(cancel[1]); operation.status = 'CANCELLED'; operation.result = null; operation.errorCode = 'SPEECH_CANCELLED'
    return route.fulfill({ json: { operationId: operation.operationId, cancelRequested: true } })
   }
   if (req.method() !== 'POST' || !['/api/ai/speech/transcriptions', '/api/ai/speech/synthesis'].includes(path)) return route.fallback()
   const body = req.postDataJSON(), transcription = path.endsWith('/transcriptions')
   expect(exact(body, transcription ? ['operationId', 'serverId', 'audio'] : ['operationId', 'serverId', 'text'])).toBe(true)
   expect(uuid.test(body.operationId)).toBe(true); expect(body.serverId).toBe(speechServer)
   if (transcription) { expect(body.audio).toEqual({ mime: 'audio/wav', base64: waveBase64 }) } else { expect(body.text.trim().length).toBeGreaterThan(0) }
   intentional.push({ method: 'POST', path, operationId: body.operationId, simulated: true })
   const operation = { operationId: body.operationId, kind: transcription ? 'transcription' : 'synthesis', status: transcription && late ? 'RUNNING' : 'SUCCEEDED', result: transcription ? { text: 'Simulated transcript; no provider called.' } : { audio: { mime: 'audio/wav', base64: waveBase64 } }, errorCode: null, expiresAt: new Date(Date.now() + 600000).toISOString() }
   if (operation.status === 'RUNNING') operation.result = null
   operations.set(operation.operationId, operation)
   return route.fulfill({ json: operation })
  })
  await audioPage.reload()
  if (width === 390) await audioPage.getByTestId('open-sidebar').click()
  await audioPage.getByRole('button', { name: title, exact: false }).click()
  const controls = audioPage.getByTestId('speech-controls'), composer = audioPage.getByTestId('chat-composer').locator('textarea').first()
  await audioPage.getByRole('button', { name: '语音设置', exact: true }).first().click()
  const chatConfig = audioPage.getByTestId('chat-service-configuration')
  await expect(chatConfig).toBeVisible()
  await expect(chatConfig.getByRole('combobox')).toHaveValue('')
  await expect(chatConfig.getByRole('button', { name: '编辑操作映射', exact: true })).toBeDisabled()
  await chatConfig.getByRole('combobox').selectOption(server.id)
  await audioPage.screenshot({ path: `${root}/after-chat-config-dialog-${width}.png`, fullPage: true })
  await chatConfig.getByRole('button', { name: '编辑操作映射', exact: true }).click()
  await expect(audioPage.getByTestId('mcp-operation-bindings')).toBeVisible()
  await audioPage.getByTestId('mcp-operation-bindings').getByRole('button', { name: '取消', exact: true }).click()
  await expect(chatConfig).toBeVisible()
  await chatConfig.getByRole('contentinfo').getByRole('button', { name: '关闭', exact: true }).click()
  await expect(composer).toHaveValue(draft)
  expect(intentional).toEqual([])
  await controls.locator('xpath=ancestor::details[1]').locator('summary').click()
  await expect(controls).toBeVisible()
  await controls.getByRole('combobox').selectOption(speechServer)
  const record = async () => { await controls.getByRole('button', { name: /开始录音/ }).click(); await controls.getByRole('button', { name: '停止录音', exact: true }).click(); await expect(controls.locator('audio')).toBeVisible() }
  await composer.fill(draft); await record()
  expect(intentional).toEqual([])
  await audioPage.screenshot({ path: `${root}/after-recording-preview-${width}.png`, fullPage: true })
  await controls.getByRole('button', { name: '转录到草稿', exact: true }).click()
  await expect(composer).toHaveValue(draft + '\nSimulated transcript; no provider called.')
  late = true; await record(); await controls.getByRole('button', { name: '转录到草稿', exact: true }).click()
  await expect(controls.getByRole('button', { name: '检查语音请求结果', exact: true })).toBeEnabled()
  await composer.fill('Edited while transcription was running')
  const pending = [...operations.values()].at(-1); pending.status = 'SUCCEEDED'; pending.result = { text: 'Late simulated transcript' }
  await controls.getByRole('button', { name: '检查语音请求结果', exact: true }).click()
  await expect(composer).toHaveValue('Edited while transcription was running')
  await expect(controls).toContainText('Late simulated transcript')
  await controls.getByRole('button', { name: '追加识别文本', exact: true }).click()
  await expect(composer).toHaveValue('Edited while transcription was running\nLate simulated transcript')
  expect((await audioPage.evaluate(() => window.__simulatedAudio)).plays).toBe(0)
  // UI owner mounts an explicit answer action; synthesis must not begin on selection/render.
  await audioPage.getByRole('button', { name: /生成语音|朗读回答|生成朗读/ }).last().click()
  await expect(controls.getByRole('button', { name: '播放生成的语音', exact: true })).toBeVisible()
  expect((await audioPage.evaluate(() => window.__simulatedAudio)).plays).toBe(0)
  await controls.getByRole('button', { name: '播放生成的语音', exact: true }).click()
  expect((await audioPage.evaluate(() => window.__simulatedAudio)).plays).toBe(1)
  await controls.getByRole('button', { name: '停止播放', exact: true }).click()
  await record(); await controls.getByRole('button', { name: '转录到草稿', exact: true }).click()
  await expect(controls.getByRole('button', { name: '检查语音请求结果', exact: true })).toBeEnabled()
  cancelOffline = true; await controls.getByRole('button', { name: '请求取消', exact: true }).click()
  await expect(controls).toContainText(/CAPTURE_CANCEL_OFFLINE|503/)
  await expect(controls.getByRole('button', { name: '检查语音请求结果', exact: true })).toBeVisible()
  cancelOffline = false; await controls.getByRole('button', { name: '请求取消', exact: true }).click()
  try { await expect(controls.getByRole('button', { name: '检查语音请求结果', exact: true })).toHaveCount(0) } catch (error) { console.error('CANCEL_DIAGNOSTIC', JSON.stringify({ controls: await controls.innerText(), intentional, blocked: capture.blocked, operations: [...operations.values()] })); throw error }
  expect(capture.blocked).toEqual([]); expect(capture.errors).toEqual([])
  const counters = await audioPage.evaluate(() => window.__simulatedAudio)
  expect(counters.trackStops).toBeGreaterThanOrEqual(counters.recordings)
  results.speech.push({ width, chatConfigurationDialogSharedEditorNavigation: true, chatConfigNoAutoSelection: true, explicitRecordStopPreviewTranscribe: true, lateDraftGuard: true, explicitAppend: true, noAutoplay: true, explicitPlay: true, offlineCancelRecoverable: true, exactOwnedOperationCancellation: true, counters, intentional, ...capture })
  await audioPage.close()
 }
} finally { await browser.close() }
await writeFile(`${root}/after-behavior-results.json`, JSON.stringify(results, null, 2) + '\n')
console.log(JSON.stringify(results, null, 2))
