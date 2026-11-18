// Shared read-only history fixture for matching native-plan and DSH-menu evidence.
export const conversationId = '22222222-2222-4222-8222-222222222222'
export const executionId = '11111111-1111-4111-8111-111111111111'
export const title = 'Plugin and plan review'
export const answer = 'Review captured message with its execution plan.'
export const draft = 'Keep this draft with the original conversation'
export const plan = {
  schemaVersion: 1,
  planId: '33333333-3333-4333-8333-333333333333',
  conversationId,
  executionId,
  revision: 2,
  updatedAt: '2026-11-14T10:00:00Z',
  items: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      content: 'Inspect current implementation',
      status: 'completed',
    },
    {
      id: '55555555-5555-4555-8555-555555555555',
      content: 'Verify changes independently',
      status: 'pending',
    },
  ],
}
export async function openPluginPlanFixture(page, { base, width }) {
  const errors = []
  const requests = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('**/api/**', async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    requests.push({ method: req.method(), path })
    if (req.method() !== 'GET')
      return route.fulfill({
        status: 409,
        json: { code: 'AUDIT_WRITE_BLOCKED', detail: 'Read-only capture' },
      })
    if (path === `/api/ai/conversations/${conversationId}`)
      return route.fulfill({
        json: { workspaceLabel: 'UI review fixture', memory: '', connectionId: null, model: '' },
      })
    if (path === `/api/ai/conversations/${conversationId}/executions/${executionId}/plan`)
      return route.fulfill({ json: plan })
    return route.fulfill({
      status: 503,
      json: {
        code: 'AUDIT_UNAVAILABLE',
        detail: 'Read-only capture: external services unavailable',
      },
    })
  })
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.goto(`${base}/#chat`)
  await page.getByTestId('chat-composer').waitFor()
  await page.getByTestId('chat-composer').locator('textarea').first().fill('Unsaved scratch draft')
  await page.waitForFunction(() =>
    Object.keys(localStorage).some((k) => k.endsWith('.eap.chat.history.v1')),
  )
  const key = await page.evaluate(
    () =>
      Object.keys(localStorage).find((k) => k.endsWith('.eap.chat.history.v1')) ??
      '%2Fapi.eap.chat.history.v1',
  )
  await page.addInitScript(
    ({ key, conversationId, executionId, title, answer, draft }) => {
      const context = {
        mode: 'chat',
        expert: 'general',
        instructions: '',
        reasoning: 'default',
        approval: 'review',
        files: [],
        prototypeVersionId: '',
        targetPath: '',
      }
      localStorage.setItem(
        'eap.appearance.v1',
        JSON.stringify({ version: 1, preferences: { theme: 'light' } }),
      )
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          items: [
            {
              id: conversationId,
              title,
              archived: false,
              updatedAt: '2026-11-14T10:00:00Z',
              draft,
              workspaceLabel: 'UI review fixture',
              memory: '',
              connectionId: null,
              model: '',
              context,
            },
          ],
          transcripts: {
            [conversationId]: [
              {
                role: 'assistant',
                text: answer,
                error: '',
                status: 'SUCCEEDED',
                executionId,
                approval: '',
                verification: 'not_requested',
                toolEvents: [],
                artifactError: '',
                artifacts: [],
              },
            ],
          },
          scratch: { draft: 'Unsaved scratch draft', context },
        }),
      )
    },
    { key, conversationId, executionId, title, answer, draft },
  )
  await page.reload()
  await page.getByTestId('chat-composer').waitFor()
  if (width === 390) await page.getByTestId('open-sidebar').click()
  await page.getByRole('button', { name: title, exact: false }).click()
  await page.getByText(answer, { exact: true }).waitFor()
  return { errors, requests, key }
}
export async function assertPluginPlanState(page, expect, capture) {
  await expect(page.getByTestId('chat-composer').locator('textarea').first()).toHaveValue(draft)
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), capture.key)
  expect(saved.activeId).toBe(conversationId)
  expect(saved.items.find((item) => item.id === conversationId).draft).toBe(draft)
  expect(saved.items.find((item) => item.id === conversationId).context.mode).toBe('chat')
  expect(saved.transcripts[conversationId][0].executionId).toBe(executionId)
  expect(saved.transcripts[conversationId][0].text).toBe(answer)
  expect(capture.requests.filter((req) => req.method !== 'GET')).toEqual([])
  expect(capture.errors).toEqual([])
}
