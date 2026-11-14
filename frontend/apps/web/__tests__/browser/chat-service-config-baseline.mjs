// Actual BEFORE server must remain pinned; never run this against the candidate app.
import { loadPlaywright } from './playwright-runtime.mjs'
import { mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { baselineCommit, baselineWorktree, server, draft, openServiceChatFixture, openServiceMcpFixture, assertChatCoreState } from './chat-service-config-fixture.mjs'
const { chromium, expect } = loadPlaywright()
const revision = execFileSync('git', ['-c', `safe.directory=${baselineWorktree}`, '-C', baselineWorktree, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
expect(revision).toBe(baselineCommit)
const root = new URL('../../../../../docs/evidence/chat-service-config/', import.meta.url).pathname
await mkdir(root, { recursive: true })
const base = process.env.EAP_CHAT_SERVICE_BASE || 'http://127.0.0.1:5204'
const browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } })
    const chat = await openServiceChatFixture(page, { base, width })
    await expect(page.locator('.turn-assistant h1')).toHaveText('Review')
    await expect(page.locator('.turn-assistant table')).toContainText('Check')
    await expect(page.locator('.turn-assistant .katex').first()).toBeAttached()
    await expect(page.locator('#nprogress')).toHaveCount(0)
    await page.getByTestId('message-actions').last().scrollIntoViewIfNeeded()
    await assertChatCoreState(page, expect, chat)
    await page.screenshot({ path: `${root}/before-chat-${width}.png`, fullPage: true })
    await page.getByTestId('web-source-options').locator('summary').click()
    await expect(page.getByTestId('web-source-server')).toBeDisabled()
    await expect(page.getByTestId('chat-composer').locator('textarea').first()).toHaveValue(draft)
    await expect(page.getByTestId('voice-record')).toHaveCount(0)
    await page.getByTestId('web-source-options').scrollIntoViewIfNeeded()
    await assertChatCoreState(page, expect, chat)
    await page.screenshot({ path: `${root}/before-chat-options-${width}.png`, fullPage: true })
    await page.close()
    const mcpPage = await browser.newPage({ viewport: { width, height: 1000 } })
    const mcp = await openServiceMcpFixture(mcpPage, { base, width })
    await mcpPage.getByRole('button', { name: '编辑', exact: true }).scrollIntoViewIfNeeded()
    await mcpPage.screenshot({ path: `${root}/before-mcp-${width}.png`, fullPage: true })
    await mcpPage.getByRole('button', { name: '编辑', exact: true }).click()
    const dialog = mcpPage.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByPlaceholder('files')).toHaveValue(server.id)
    await expect(dialog.getByPlaceholder('文件服务器')).toHaveValue(server.name)
    await expect(mcpPage.getByTestId('mcp-transport')).toHaveValue(server.transport)
    await expect(dialog.getByPlaceholder('https://example.com/mcp')).toHaveValue(server.endpoint)
    await expect(dialog.getByPlaceholder('search, read')).toHaveValue('search, read')
    expect(mcp.errors).toEqual([])
    expect(mcp.blocked).toEqual([])
    await mcpPage.screenshot({ path: `${root}/before-mcp-editor-${width}.png`, fullPage: true })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    process.stdout.write(JSON.stringify({ revision, width, height: 1000, chat, mcp, draftPreserved: true, mcpEditorReadOnly: true }) + '\n')
    await mcpPage.close()
  }
} finally { await browser.close() }
