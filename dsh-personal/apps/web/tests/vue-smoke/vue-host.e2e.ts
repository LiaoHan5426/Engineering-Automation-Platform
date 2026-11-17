/** Keyless named-profile smoke over the real Host, boot kernel and closure loader. */
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'tsdown'
import { expect, it } from 'vitest'
import { chromium } from 'playwright'
import { clientBundle } from '../../../../packages/client/tsdown.client.ts'

const repo = fileURLToPath(new URL('../../../..', import.meta.url))
const fixture = dirname(fileURLToPath(import.meta.url))

async function put(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text)
}

async function clientPackage(root: string, name: string, source: string): Promise<string> {
  await put(join(root, 'package.json'), JSON.stringify({
    name, version: '0.0.0', type: 'module',
    exports: { '.': './host.js', './client': './lib/client.js', './package.json': './package.json' },
    dsh: { client: { platform: 'web' } },
  }))
  await put(join(root, 'host.js'), 'export function apply() {}\n')
  await put(join(root, 'src/index.ts'), 'export function apply() {}\n')
  await put(join(root, 'src/client/index.ts'), source)
  await symlink(join(repo, 'node_modules'), join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  await rebuild(root)
  return join(root, 'host.js')
}

async function rebuild(root: string): Promise<void> {
  const configs = clientBundle(root, ['lib/types/index.js'])({ env: { DSH_BUILD_FACE: 'client' } })
  const config = configs.find(candidate => candidate.platform === 'browser')
  if (config === undefined) throw new Error('smoke: browser build configuration missing')
  const outputs = await build({ ...config, cwd: root, config: false, tsconfig: false, clean: false, exports: false, report: false })
  for (const output of outputs) await output[Symbol.asyncDispose]()
  expect(await readFile(join(root, 'lib/client.js'), 'utf8')).toContain('window.__ModuleLoader__.load(')
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = once(child, 'exit')
  child.kill('SIGTERM')
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
  try { await exited } finally { clearTimeout(timer) }
}

it('boots native Vue factories and releases effects, components and styles across real HMR and Host toggles', async () => {
  const distIndex = resolve(process.env.DSH_VUE_SMOKE_DIST ?? join(repo, 'apps/web/dist/index.html'))
  if (!existsSync(distIndex)) throw new Error(`smoke: build the Vue-seeded Web shell first: ${distIndex}`)
  const root = await mkdtemp(join(tmpdir(), 'dsh-vue-host-'))
  let child: ChildProcess | undefined
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  let logs = ''
  try {
    const renderer = await clientPackage(join(root, 'renderer'), '@deepseek-ai/dsh-client-ui-renderer',
      `export { apply, inject } from ${JSON.stringify(join(fixture, 'renderer.ts'))}\n`)
    const sfc = join(root, 'fixture/Smoke.vue')
    const originalSfc = await readFile(join(fixture, 'Smoke.vue'), 'utf8')
    await put(sfc, originalSfc)
    const moduleCss = await readFile(join(fixture, 'smoke.module.css'), 'utf8')
    await put(join(root, 'fixture/smoke.module.css'), moduleCss)
    const component = await clientPackage(join(root, 'fixture'), '@deepseek-ai/dsh-client-vue-smoke', `
      import Smoke from ${JSON.stringify(sfc)}
      export const inject = ['slots']
      export function apply(ctx) {
        ctx.slots.register({ name: 'vue-smoke.content' }, Smoke)
        ctx.effect(() => {
          const counts = document.documentElement.dataset
          counts.smokeEffects = String(Number(counts.smokeEffects ?? 0) + 1)
          const tick = () => { counts.smokeHits = String(Number(counts.smokeHits ?? 0) + 1) }
          window.addEventListener('vue-smoke-tick', tick)
          return () => {
            counts.smokeEffects = String(Number(counts.smokeEffects) - 1)
            window.removeEventListener('vue-smoke-tick', tick)
          }
        })
      }
    `)
    const home = join(root, 'home')
    const profile = join(home, 'profiles/vue-smoke')
    const ready = join(root, 'ready.json')
    await put(join(profile, 'package.json'), JSON.stringify({ name: 'vue-smoke', private: true, dsh: { profile: { bundles: [] } } }))
    // Absolute entries still use the normal Loader and module manifest discovery.
    const entry = (path: string) => join(repo, path, 'lib/index.js')
    const rows = [
      { id: 'webserver', name: entry('packages/host/webserver'), config: { host: '127.0.0.1', port: 0 } },
      { id: 'connection', name: entry('packages/client/connection') },
      { id: 'modules', name: entry('packages/client/modules') },
      { id: 'hmr', name: entry('packages/client/hmr'), config: { pollIntervalMs: 25 } },
      { id: 'frontend', name: entry('packages/host/frontend-static'), config: { distIndex } },
      { id: 'native-renderer', name: renderer },
      { id: 'vue-smoke', name: component },
      { id: 'smoke-carrier', name: join(fixture, 'host.ts'), config: { readyFile: ready } },
    ]
    await put(join(profile, 'cordis.patch.yml'), JSON.stringify([{ insert: rows }]))
    child = spawn(process.execPath, ['--import', import.meta.resolve('tsx/esm'), join(repo, 'apps/cli/lib/bin.js'), '--profile', 'vue-smoke'], {
      cwd: root, env: { ...process.env, DSH_HOME: home, NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout?.on('data', (chunk) => { logs += String(chunk) })
    child.stderr?.on('data', (chunk) => { logs += String(chunk) })
    await expect.poll(async () => {
      if (child?.exitCode !== null) throw new Error(`smoke Host exited: ${logs}`)
      return existsSync(ready)
    }, { timeout: 30000 }).toBe(true)
    const { port } = JSON.parse(await readFile(ready, 'utf8')) as { port: number }
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ extraHTTPHeaders: { 'x-vue-smoke': 'local-test' } })
    const errors: string[] = []
    page.on('pageerror', (error) => { errors.push(error.message); logs += `\nbrowser error: ${error.message}` })
    page.on('console', (message) => { if (message.type() === 'error') logs += `\nbrowser console: ${message.text()}` })
    const requests: string[] = []
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (url.origin !== `http://127.0.0.1:${port}`) return route.abort('blockedbyclient')
      return route.continue()
    })
    page.on('request', request => requests.push(request.url()))
    await page.goto(`http://127.0.0.1:${port}/`)
    await page.locator('[data-vue-smoke]').waitFor({ state: 'visible', timeout: 20000 })
    expect(await page.locator('[data-increment]').innerText()).toBe('Count 0')
    await page.locator('[data-increment]').click()
    expect(await page.locator('[data-increment]').innerText()).toBe('Count 1')
    expect(await page.locator('[data-vue-smoke]').evaluate(element => getComputedStyle(element).padding)).toBe('23px')
    expect(await page.locator('[data-increment]').evaluate(element => getComputedStyle(element).minHeight)).toBe('37px')
    expect(requests.some(url => url.includes('/plugins/'))).toBe(true)
    expect(errors).toEqual([])
    const styles = page.locator('style[data-plugin="@deepseek-ai/dsh-client-vue-smoke"]')
    const ownedStyleCount = await styles.count()
    expect(ownedStyleCount).toBeGreaterThan(0)
    expect(await page.locator('[data-vue-smoke]').evaluate(element => getComputedStyle(element).borderTopWidth)).toBe('7px')
    const documentIdentity = await page.evaluateHandle(() => document)
    const initialButton = await page.locator('[data-increment]').elementHandle()
    const tick = () => page.evaluate(() => { window.dispatchEvent(new Event('vue-smoke-tick')); return document.documentElement.dataset.smokeHits })
    expect(await tick()).toBe('1')

    // Rebuild the actual package artifact: Host polling broadcasts a normal rebuilt frame.
    await put(sfc, originalSfc.replace('Vue Host smoke', 'Vue Host updated'))
    await put(join(root, 'fixture/smoke.module.css'), moduleCss.replace('7px solid', '9px solid'))
    await rebuild(join(root, 'fixture'))
    await expect.poll(() => page.locator('h1').textContent(), { timeout: 15000 }).toBe('Vue Host updated')
    expect(await documentIdentity.evaluate(value => value === document)).toBe(true)
    expect(await initialButton!.evaluate(element => element.isConnected)).toBe(false)
    expect(await page.locator('[data-increment]').innerText()).toBe('Count 0')
    expect(await page.locator('[data-vue-smoke]').evaluate(element => getComputedStyle(element).borderTopWidth)).toBe('9px')
    expect(await styles.count()).toBe(ownedStyleCount)
    expect(await tick()).toBe('2')
    expect(await page.evaluate(() => Object.fromEntries(Object.entries(document.documentElement.dataset)))).toMatchObject({ smokeEffects: '1', smokeMounts: '2', smokeUnmounts: '1' })

    // Toggle the real Host entry; the graph event removes and later reactivates its client row.
    const ownedStyles = await styles.elementHandles()
    const toggle = async (disabled: boolean) => {
      const response = await page.request.post(`http://127.0.0.1:${port}/vue-smoke/toggle?disabled=${disabled}`, { headers: { origin: `http://127.0.0.1:${port}` } })
      expect(response.status(), await response.text()).toBe(204)
    }
    await toggle(true)
    await expect.poll(() => page.locator('[data-vue-smoke]').count(), { timeout: 15000 }).toBe(0)
    await expect.poll(() => styles.count()).toBe(0)
    for (const style of ownedStyles) expect(await style.evaluate(element => element.isConnected)).toBe(false)
    expect(await tick()).toBe('2')
    expect(await page.evaluate(() => Object.fromEntries(Object.entries(document.documentElement.dataset)))).toMatchObject({ smokeEffects: '0', smokeMounts: '2', smokeUnmounts: '2' })
    await toggle(false)
    await page.locator('[data-vue-smoke]').waitFor({ state: 'visible', timeout: 15000 })
    expect(await page.locator('[data-vue-smoke]').count()).toBe(1)
    expect(await styles.count()).toBe(ownedStyleCount)
    expect(await tick()).toBe('3')
    expect(await page.evaluate(() => Object.fromEntries(Object.entries(document.documentElement.dataset)))).toMatchObject({ smokeEffects: '1', smokeMounts: '3', smokeUnmounts: '2' })
    expect(await documentIdentity.evaluate(value => value === document)).toBe(true)
    await documentIdentity.dispose()
    await initialButton?.dispose()
    for (const style of ownedStyles) await style.dispose()
    expect(errors).toEqual([])
    await page.reload()
    await page.locator('[data-vue-smoke]').waitFor({ state: 'visible' })
    expect(await page.locator('[data-vue-smoke]').count()).toBe(1)
    expect(await page.locator('[data-increment]').innerText()).toBe('Count 0')
    expect(errors).toEqual([])
  } catch (error) {
    throw new Error(`Vue named-profile smoke failed\n${logs}`, { cause: error })
  } finally {
    await browser?.close()
    if (child !== undefined) await stop(child)
    await rm(root, { recursive: true, force: true })
  }
}, 90000)
