import { loadPlaywright } from './playwright-runtime.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const manifest = process.argv[2],
  output = dirname(manifest)
const host = JSON.parse(await readFile(manifest, 'utf8'))
const require = createRequire(resolve('package.json'))
const { createServer } = await import(
  pathToFileURL(resolve(dirname(require.resolve('vite-plus/package.json')), 'dist/index.js')).href
)
const { default: vue } = await import(pathToFileURL(require.resolve('@vitejs/plugin-vue')).href)
const { default: tailwind } = await import(pathToFileURL(require.resolve('@tailwindcss/vite')).href)
const { chromium } = loadPlaywright()
const server = await createServer({
  configFile: false,
  root: resolve('apps/web'),
  cacheDir: resolve(output, 'vite-cache'),
  plugins: [vue(), tailwind()],
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('/api'),
    'import.meta.env.VITE_API_SCOPE': JSON.stringify(host.backend + '/api'),
  },
  server: {
    host: '127.0.0.1',
    port: 5195,
    strictPort: true,
    proxy: { '/api': { target: host.backend, changeOrigin: true } },
  },
})
let browser
const errors = [],
  deletes = []
try {
  await server.listen()
  browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  page.setDefaultTimeout(20000)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript((host) => {
    localStorage.setItem(
      encodeURIComponent(host.backend + '/api') + '.eap.chat.history.v1',
      JSON.stringify({
        version: 1,
        activeId: host.conversationId,
        items: [
          {
            id: host.conversationId,
            title: 'History reset',
            draft: 'Preserve this implementation draft',
            archived: false,
            workspaceLabel: host.workspaceLabel,
            memory: '',
            connectionId: null,
            model: null,
          },
        ],
        transcripts: {
          [host.conversationId]: [
            {
              role: 'user',
              text: 'Saved displayed request',
              status: 'SUCCEEDED',
              error: '',
              approval: 'review',
              verification: 'not_requested',
              toolEvents: [],
              artifactError: '',
              artifacts: [],
            },
            {
              role: 'assistant',
              text: 'Draft office report',
              status: 'SUCCEEDED',
              error: '',
              approval: 'review',
              verification: 'not_requested',
              toolEvents: [],
              artifactError: '',
              artifacts: [],
            },
          ],
        },
      }),
    )
    localStorage.setItem('eap.locale', 'zh-CN')
  }, host)
  await page.goto(server.resolvedUrls.local[0] + '#work')
  await page.getByTestId('task-memory-details').locator('summary').first().click()
  await page.getByTestId('working-memory-edit').click()
  await page.getByTestId('working-memory-goal').fill('Unsaved local goal')
  const memoryRoute = host.backend + '/api/ai/conversations/' + host.conversationId
  const current = (await (await page.request.get(memoryRoute)).json()).workingMemory
  const concurrent = await page.request.put(memoryRoute + '/working-memory', {
    data: {
      ...current,
      layers: undefined,
      invalidation: undefined,
      updatedAt: undefined,
      expectedUpdatedAt: current.updatedAt,
      goal: 'Concurrent goal',
    },
  })
  assert.equal(concurrent.status(), 200, await concurrent.text())
  await page.getByTestId('working-memory-save').click()
  await page.getByRole('alert').filter({ hasText: '任务记忆已变化' }).waitFor()
  assert.equal(await page.getByTestId('working-memory-goal').inputValue(), 'Unsaved local goal')
  await page
    .getByRole('dialog', { name: '编辑目标与约束', exact: true })
    .getByRole('button', { name: '关闭', exact: true })
    .click()
  await page.locator('.eap-confirm__actions button').first().click()
  await page.getByTestId('working-memory-refresh').click()
  await page
    .getByTestId('working-memory-goal-text')
    .filter({ hasText: 'Concurrent goal' })
    .waitFor()
  await page.getByTestId('working-memory-edit').click()
  await page.getByTestId('working-memory-goal').fill('Updated delivery goal')
  await page
    .getByTestId('working-memory-constraint-input')
    .fill('Use shared components\nKeep source evidence')
  await page.getByTestId('working-memory-save').click()
  await page
    .getByTestId('working-memory-goal-text')
    .filter({ hasText: 'Updated delivery goal' })
    .waitFor()
  await page.getByTestId('working-memory-adopt').click()
  await page.getByTestId('open-model-history').click()
  await page.getByTestId('model-history-summarize').click()
  await page.locator('.eap-confirm__actions button').first().click()
  await page.getByTestId('model-history-summary').waitFor()
  assert.equal(
    await page.getByTestId('model-history-summary').inputValue(),
    'Fixture summary: review the remaining delivery work.',
  )
  await page
    .getByTestId('model-history-summary')
    .fill('Reviewed history summary: preserve the remaining delivery work.')
  await page.getByTestId('model-history-summary-adopt').click()
  await page.getByTestId('model-history-clear').waitFor()
  await page.waitForFunction(
    () => !document.querySelector('[data-testid=model-history-clear]').disabled,
  )
  await page.route('**/model-history', async (route) => {
    if (route.request().method() !== 'DELETE') return route.continue()
    deletes.push(route.request().url())
    await route.fetch()
    await route.abort('connectionreset')
  })
  await page.getByTestId('model-history-clear').click()
  await page.locator('.eap-confirm__actions button').first().click()
  await page
    .getByText('已核对模型窗口为空，可关闭后继续编辑并发送当前草稿。', { exact: true })
    .waitFor()
  assert.equal(deletes.length, 1)
  assert.equal(await page.getByTestId('model-history-clear').isDisabled(), true)
  await page.screenshot({ path: resolve(output, 'cleared-narrow.png') })
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('[data-testid=model-history-dialog]'))
  const saved = await page.evaluate(
    (backend) =>
      JSON.parse(
        localStorage.getItem(encodeURIComponent(backend + '/api') + '.eap.chat.history.v1'),
      ),
    host.backend,
  )
  const draft = saved.items.find((item) => item.id === host.conversationId).draft
  assert.ok(draft.startsWith('Preserve this implementation draft'))
  assert.ok(draft.includes('Updated delivery goal'))
  assert.ok(draft.includes('Use shared components'))
  assert.ok(draft.includes('Reviewed history summary: preserve the remaining delivery work.'))
  await page.getByTestId('ribbon-more').click()
  await page.getByTestId('chat-export-open').click()
  const exported = page.getByTestId('chat-export-dialog')
  await exported.waitFor()
  assert.ok(
    (await page.getByTestId('chat-export-preview').innerText()).includes('Saved displayed request'),
  )
  assert.ok(
    !(await page.getByTestId('chat-export-preview').innerText()).includes(
      'Preserve this implementation draft',
    ),
  )
  const downloadEvent = page.waitForEvent('download')
  await page.getByTestId('chat-export-download').click()
  const download = await downloadEvent
  assert.ok(download.suggestedFilename().endsWith('.md'))
  const downloaded = await readFile(await download.path(), 'utf8')
  assert.ok(downloaded.includes('Saved displayed request'))
  assert.ok(!downloaded.includes('fixture-key'))
  await page.screenshot({ path: resolve(output, 'chat-export-narrow.png') })
  await exported.locator('[data-eap-dialog-close]').click()
  await page.getByTestId('work-document-open').click()
  await page.getByTestId('work-document-name').fill('Reviewed report')
  await page
    .getByTestId('work-document-body')
    .fill('Manually reviewed office report.\n\nRemaining work is explicit.')
  await page.getByTestId('work-document-save').click()
  await page.getByText('草稿已保存，可关闭后从同一条回答重新打开。', { exact: true }).waitFor()
  await page.getByTestId('work-document-dialog').locator('[data-eap-dialog-close]').click()
  await page.getByTestId('work-document-open').click()
  assert.equal(await page.getByTestId('work-document-name').inputValue(), 'Reviewed report')
  assert.ok(
    (await page.getByTestId('work-document-body').inputValue()).includes(
      'Manually reviewed office report.',
    ),
  )
  await page.getByTestId('work-document-body').fill('Unsaved edit')
  await page.getByTestId('work-document-dialog').locator('[data-eap-dialog-close]').click()
  await page.locator('.eap-confirm__actions button').last().click()
  assert.equal(await page.getByTestId('work-document-body').inputValue(), 'Unsaved edit')
  const documentEvent = page.waitForEvent('download')
  await page.getByTestId('work-document-download').click()
  const document = await documentEvent
  assert.equal(document.suggestedFilename(), 'Reviewed-report.md')
  assert.equal(await readFile(await document.path(), 'utf8'), '# Reviewed report\n\nUnsaved edit\n')
  await page.screenshot({ path: resolve(output, 'work-document-narrow.png') })
  await page.getByTestId('work-document-dialog').locator('[data-eap-dialog-close]').click()
  await page.locator('.eap-confirm__actions button').first().click()
  // Working memory is checked from the authoritative registry by the Java host.
  assert.deepEqual(errors, [])
  await writeFile(
    resolve(output, 'validation.json'),
    JSON.stringify(
      {
        errors,
        deletes: deletes.length,
        lostDeleteResponseRecoveredByGet: true,
        draftPreserved: true,
        taskMemoryEditedAndExplicitlyAdopted: true,
        completionSummaryReviewedAndExplicitlyAdopted: true,
        staleSaveRejectedAndInputPreserved: true,
        actualMarkdownDownloadPreservedTranscriptAndExcludedDraft: true,
        officeDocumentEditedSavedReopenedAndDownloaded: true,
        viewport: 390,
      },
      null,
      2,
    ),
  )
} finally {
  if (browser) await browser.close()
  await server.close()
}
