import { loadPlaywright } from './playwright-runtime.mjs'
// Real Chromium + the explicitly simulated mock service. No real CLI or model calls.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    playwright: { type: 'string' },
    chromium: { type: 'string' },
    url: { type: 'string', default: 'http://127.0.0.1:5186' },
  },
})
const { chromium } = loadPlaywright(values.playwright)
const browser = await chromium.launch({
  executablePath: values.chromium || process.env.EAP_CHROMIUM,
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
const errors = [],
  checks = []
page.on('pageerror', (error) => errors.push(error.message))
page.setDefaultTimeout(15000)
const output = resolve('apps/web/__tests__/browser/artifacts/tool-execution')
await mkdir(output, { recursive: true })
const button = (id) => page.getByTestId('trusted-git-' + id)
try {
  await page.goto(values.url + '/#capabilities')
  await page.getByTestId('trusted-tools-panel').waitFor()
  await page.getByTestId('trusted-operation-git-status').waitFor()
  assert.equal(await page.getByTestId('trusted-tool-git').count(), 1)
  assert.equal(await page.getByTestId('trusted-operation-git-diff').count(), 1)
  assert.equal(await page.getByTestId('trusted-tool-probe-git-status').count(), 0)
  checks.push('one Git program with two operations')
  await page.getByTestId('trusted-tool-probe-git').click()
  await page.getByTestId('trusted-tool-version-git').getByText('版本已知').waitFor()
  checks.push('program-level explicit version probe')
  await button('diff-invoke').click()
  await button('diff-result').waitFor()
  assert.match(await button('diff-result').innerText(), /mock: no real Git executed/)
  assert.match(await button('diff-result').innerText(), /diff --git/)
  assert.match(await button('diff-execution-panel').innerText(), /不包含暂存区和未跟踪文件/)
  checks.push('diff uses its own route and explicit unstaged scope')
  await button('mock-running').click()
  await button('status-cancel').waitFor()
  const id = await button('status-summary').locator('code').innerText()
  await page.evaluate(() => {
    location.hash = 'rules'
  })
  await page.waitForFunction(() => location.hash === '#rules')
  await page.evaluate(() => {
    location.hash = 'capabilities'
  })
  await button('status-summary').filter({ hasText: id }).waitFor()
  checks.push('cached navigation restores durable running record')
  await button('status-cancel').click()
  await button('status-cancelling').waitFor()
  await button('status-cancelled').waitFor()
  checks.push('request cancellation then observe cleanup confirmation')
  await page.reload()
  await button('status-cancelled').waitFor()
  checks.push('browser reload reads the same terminal execution')
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 960 })
    await button('status-summary').scrollIntoViewIfNeeded()
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      true,
      `overflow at ${width}`,
    )
    await page.screenshot({ path: resolve(output, `cancelled-${width}.png`) })
  }
  checks.push('1440/900/390px viewport bounds')
  await button('mock-unknown').click()
  await button('status-unknown').waitFor()
  assert.equal(await button('status-invoke').isDisabled(), true)
  assert.equal(await button('status-cancel').count(), 0)
  await page.screenshot({ path: resolve(output, 'unknown-390.png') })
  checks.push('restart UNKNOWN blocks another invocation')
  assert.equal(await button('diff-invoke').isDisabled(), false)
  await button('diff-mock-running').click()
  await button('diff-cancel').waitFor()
  await button('diff-cancel').click()
  await button('diff-cancelling').waitFor()
  await button('diff-cancelled').waitFor()
  assert.equal(await button('status-invoke').isDisabled(), true)
  checks.push('status UNKNOWN does not block diff or share cancellation state')
  await page.reload()
  await button('diff-cancelled').waitFor()
  await button('status-unknown').waitFor()
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 960 })
    await button('diff-summary').scrollIntoViewIfNeeded()
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      true,
      'diff overflow at ' + width,
    )
    await page.screenshot({ path: resolve(output, 'diff-cancelled-' + width + '.png') })
  }
  checks.push('diff reload recovery and three viewport bounds')
  for (const operation of ['status', 'diff']) {
    if (operation === 'diff') {
      await button('diff-mock-unknown').click()
      await button('diff-unknown').waitFor()
    }
    await button(operation + '-process-inspect').click()
    await button(operation + '-process-observation').waitFor()
    assert.match(await button(operation + '-process-observation').innerText(), /未捕获有效 PID/)
    assert.match(await button(operation + '-process-observation').innerText(), /已观察的子进程/)
    assert.match(
      await button(operation + '-process-observation').innerText(),
      /身份匹配，进程仍存活/,
    )
    assert.match(await button(operation + '-process-observation').innerText(), /子进程证据已截断/)
    assert.equal(await button(operation + '-invoke').isDisabled(), true)
    assert.equal(await button(operation + '-review-open').isDisabled(), true)
    checks.push(operation + ' explicit process observation does not release UNKNOWN')
    for (const width of [1440, 900, 390]) {
      await page.setViewportSize({ width, height: 960 })
      await button(operation + '-process-observation').scrollIntoViewIfNeeded()
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        true,
      )
      await page.screenshot({
        path: resolve(output, operation + '-process-observation-' + width + '.png'),
      })
    }

    assert.equal(await button(operation + '-review-open').isDisabled(), true)
    await button(operation + '-review-note').fill(
      'mock review: fixture has no real process; related processes checked',
    )
    await button(operation + '-review-checked').check()
    await button(operation + '-review-open').click()
    const dialog = page.getByRole('dialog', { name: '关闭这条 UNKNOWN 的启动阻塞' })
    await dialog.waitFor()
    assert.match(await dialog.innerText(), /原结果仍未知/)
    for (const width of [1440, 900, 390]) {
      await page.setViewportSize({ width, height: 960 })
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        true,
      )
      await page.screenshot({
        path: resolve(output, operation + '-review-confirm-' + width + '.png'),
      })
    }
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    assert.equal(await button(operation + '-invoke').isDisabled(), true)
    await button(operation + '-review-note').fill(
      'mock review: no real process was launched by this fixture',
    )
    await button(operation + '-review-open').click()
    await dialog.getByRole('button', { name: '保存核对并关闭阻塞' }).click()
    await button(operation + '-review-resolution').waitFor()
    assert.match(
      await button(operation + '-review-resolution').innerText(),
      /人工关闭（结果仍未知）/,
    )
    assert.equal(await button(operation + '-invoke').isDisabled(), false)
    assert.equal(await button(operation + '-cancelled').count(), 0)
    await page.reload()
    await button(operation + '-review-resolution').waitFor()
    assert.match(
      await button(operation + '-review-resolution').innerText(),
      /SERVICE_RESTART_EXIT_UNCONFIRMED/,
    )
    for (const width of [1440, 900, 390]) {
      await page.setViewportSize({ width, height: 960 })
      await button(operation + '-summary').scrollIntoViewIfNeeded()
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        true,
      )
      await page.screenshot({ path: resolve(output, operation + '-reviewed-' + width + '.png') })
    }
    checks.push(
      operation +
        ' explicit review, cancel confirmation, manual closure, reload and three viewport bounds',
    )
  }
  assert.deepEqual(errors, [])
  await writeFile(
    resolve(output, 'result.json'),
    JSON.stringify({ source: 'mock service / real Chromium', checks, errors }, null, 2),
  )
  process.stdout.write(JSON.stringify({ passed: checks.length, errors }) + '\n')
} finally {
  await browser.close()
}
