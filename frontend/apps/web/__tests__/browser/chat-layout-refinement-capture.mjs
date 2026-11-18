import { loadPlaywright } from './playwright-runtime.mjs'
import { openServiceChatFixture, assertChatCoreState } from './chat-service-config-fixture.mjs'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
const { chromium, expect } = loadPlaywright()
const phase = process.env.CAPTURE_PHASE || 'before'
const base = process.env.EAP_CHAT_LAYOUT_BASE || 'http://127.0.0.1:5206'
const revision = execFileSync('git', ['-c', `safe.directory=${process.cwd()}`, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
if (phase === 'before') expect(revision).toBe('36b9e7a8b5e367a66b7b63bd7c8263c4af4c0581')
const root = new URL('../../../../../docs/evidence/chat-layout-refinement/', import.meta.url).pathname
await mkdir(root, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
const results = []
try {
  for (const viewport of [{ width: 1918, height: 900 }, { width: 1440, height: 1000 }, { width: 390, height: 1000 }]) {
    const page = await browser.newPage({ viewport })
    const capture = await openServiceChatFixture(page, { base, width: viewport.width })
    await expect(page.locator('.turn-assistant h1')).toHaveText('Review')
    await expect(page.locator('#nprogress')).toHaveCount(0)
    await assertChatCoreState(page, expect, capture)
    await page.getByTestId('chat-feed').evaluate(el => { el.scrollTop = 0 })
    await page.screenshot({ path: `${root}/${phase}-chat-${viewport.width}.png` })
    const geometry = await page.evaluate(() => {
      const box = el => { if (!el) return null; const r = el.getBoundingClientRect(), s = getComputedStyle(el); return { x:r.x, y:r.y, width:r.width, height:r.height, clientHeight:el.clientHeight, scrollHeight:el.scrollHeight, overflowY:s.overflowY, display:s.display } }
      const selectors = ['html','body','#app','.workbench','[data-testid="chat-workspace"]','.chat-page-head','[data-testid="chat-body"]','[data-testid="chat-main"]','[data-testid="chat-feed"]','[data-testid="chat-composer"]','[data-testid="send-message"]','[data-testid="model-picker"]','.composer-draft','.live-shortcuts']
      const boxes = Object.fromEntries(selectors.map(s => [s, box(document.querySelector(s))]))
      const ancestors = []; let el = document.querySelector('[data-testid="chat-feed"]'); while(el) { ancestors.push({ tag:el.tagName, class:el.className, ...box(el) }); el=el.parentElement }
      return { viewport: { width:innerWidth,height:innerHeight }, rootScroll:document.documentElement.scrollHeight, rootWidth:document.documentElement.scrollWidth, boxes, ancestors }
    })
    if (phase === 'after') {
      expect(geometry.rootScroll).toBe(viewport.height)
      expect(geometry.rootWidth).toBe(viewport.width)
      for (const ancestor of geometry.ancestors.slice(1)) expect(ancestor.scrollHeight).toBeLessThanOrEqual(ancestor.clientHeight+1)
      const form=geometry.boxes['[data-testid="chat-composer"]']
      expect(form.scrollHeight).toBeLessThanOrEqual(form.clientHeight+1)
      for (const selector of ['[data-testid="send-message"]','[data-testid="model-picker"]']) {
        const control=geometry.boxes[selector]
        expect(control.y+control.height).toBeLessThanOrEqual(form.y+form.height)
        expect(control.y+control.height).toBeLessThanOrEqual(viewport.height)
      }
      expect(geometry.boxes['.composer-draft'].height).toBeGreaterThanOrEqual(70)
    }
    results.push({ revision, phase, viewport, geometry, capture })
    process.stdout.write(JSON.stringify({ phase, viewport, geometry })+'\n')
    await page.close()
  }
  await writeFile(`${root}/${phase}-geometry.json`, JSON.stringify(results,null,2)+'\n')
  if (phase === 'after') {
    const git=(...args)=>execFileSync('git',['-c',`safe.directory=${process.cwd()}`,...args])
    const paths=git('ls-files','-z','--','frontend').toString().split('\0').filter(p=>p && !p.includes('/__tests__/')).sort()
    const files=[]
    for (const path of paths) files.push({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')})
    await writeFile(`${root}/after-source-provenance.json`,JSON.stringify({head:revision,sourceTreeSha256:createHash('sha256').update(JSON.stringify(files)).digest('hex'),trackedFrontendDiffSha256:createHash('sha256').update(git('diff','HEAD','--','frontend/apps/web/src','frontend/packages/dsh-adapter/src')).digest('hex'),files},null,2)+'\n')
  }
} finally { await browser.close() }
