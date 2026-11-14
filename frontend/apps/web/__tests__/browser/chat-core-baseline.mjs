// Run ONLY against the detached baseline server; this records actual baseline UI.
import { loadPlaywright } from './playwright-runtime.mjs'
import { mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { openChatCoreFixture, assertChatCoreState, baselineCommit, answer, draft } from './chat-core-fixture.mjs'
const { chromium, expect } = loadPlaywright()
const worktree = '/tmp/eap-chat-baseline-9e7257b'
expect(execFileSync('git', ['-c', `safe.directory=${worktree}`, '-C', worktree, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()).toBe(baselineCommit)
const root = new URL('../../../../../docs/evidence/chat-core-refactor/', import.meta.url).pathname
await mkdir(root, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } })
    const capture = await openChatCoreFixture(page, { base: process.env.EAP_CHAT_CORE_BASE || 'http://127.0.0.1:5202', width })
    await expect(page.getByText(answer, { exact: true })).toBeVisible()
    await expect(page.getByTestId('message-actions')).toHaveCount(2)
    const composer = page.getByTestId('chat-composer').locator('textarea').first()
    await composer.focus()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowRight')
    await expect(composer).toBeFocused()
    await expect(composer).toHaveValue(draft)
    await assertChatCoreState(page, expect, capture)
    await expect(page.locator('#nprogress')).toHaveCount(0)
    // The pinned UI renders this Markdown source as a plain paragraph.
    await expect(page.locator('.turn-assistant pre')).toHaveCount(0)
    await page.getByTestId('message-actions').last().scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${root}/before-${width}.png`, fullPage: true })
    const actions = page.getByTestId('message-actions').last()
    await actions.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menu')).toBeVisible()
    await page.screenshot({ path: `${root}/before-actions-${width}.png`, fullPage: true })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
    await expect(actions).toBeFocused()
    await composer.focus()
    await assertChatCoreState(page, expect, capture)
    process.stdout.write(JSON.stringify({ baselineCommit, width, height: 1000, errors: capture.errors, blocked: capture.blocked, requests: capture.requests, draftPreserved: true, keyboardFocusPreserved: true, actionMenuEscapeFocus: true }) + '\n')
    await page.close()
  }
} finally { await browser.close() }
