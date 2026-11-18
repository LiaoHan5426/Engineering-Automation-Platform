// Actual App; reuse bounded GET fixture. Execute only after UI_READY.
import { loadPlaywright } from './playwright-runtime.mjs'
import { openServiceChatFixture, assertChatCoreState, draft } from './chat-service-config-fixture.mjs'
import { title } from './chat-core-fixture.mjs'
import { writeFile, mkdir } from 'node:fs/promises'
const { chromium, expect } = loadPlaywright()
const base = 'http://127.0.0.1:5208'
const root = process.env.EAP_CONTROLS_ROOT || new URL('../../../../../docs/evidence/chat-interaction-refinement/after-controls/', import.meta.url).pathname
await mkdir(root, {recursive:true})
const browser = await chromium.launch({headless:true, executablePath:process.env.EAP_CHROMIUM})
const results=[]
try {
 for (const viewport of [{width:1918,height:914},{width:390,height:1000}]) {
  const page=await browser.newPage({viewport})
  const capture=await openServiceChatFixture(page,{base,width:viewport.width})
  await page.route('**/api/ai/status',route=>route.fulfill({json:{state:'available',provider:'public-fixture',model:'',configurationRevision:'fixture-1',lastObservedAt:null,errorCode:'',tools:{git_status:false},workspaceLabel:'Public attachment fixture',workspacePath:'/public/synthetic-workspace'}}))
  await page.route('**/api/ai/speech/services',route=>route.fulfill({json:{services:[],limits:{maxAudioBytes:2000000,maxWireBytes:3000000,maxTextChars:10000,maxTranscriptChars:10000}}}))
  await page.reload()
  if(viewport.width===390)await page.getByTestId('open-sidebar').click()
  await page.getByRole('button',{name:title,exact:false}).click()
  await page.evaluate(()=>document.fonts.ready)
  await expect(page.locator('#nprogress')).toHaveCount(0)
  const composer=page.getByTestId('chat-composer').locator('textarea').first()
  await composer.fill(draft+' edited locally')
  await composer.press('End'); await composer.press('Shift+Enter')
  await composer.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true,bubbles:true})
  await expect(composer).toHaveValue(draft+' edited locally\n')
  await expect(page.getByTestId('send-message')).toBeDisabled()
  await composer.fill(draft)
  const preferences=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),capture.storageKey)
  await page.getByTestId('composer-add').click()
  await page.getByTestId('composer-cat-files').click()
  const chooser=page.waitForEvent('filechooser')
  await page.getByTestId('upload-local-file').click()
  await (await chooser).setFiles({name:'public-review.txt',mimeType:'text/plain',buffer:Buffer.from('Public local attachment; do not upload automatically.')})
  await expect(page.getByTestId('chat-composer')).toContainText('public-review.txt')
  await page.keyboard.press('Escape')
  await page.getByTestId('context-review').click()
  const review=page.getByTestId('context-review-dialog')
  await expect(review).toBeVisible()
  await expect(review).toContainText('public-review.txt')
  await expect(page.getByTestId('composer-scope-select')).toBeEnabled()
  // Raw outgoing technical content belongs inside an opt-in collapse.
  await expect(page.getByTestId('outgoing-preview')).not.toHaveAttribute('open','')
  await page.screenshot({path:`${root}/after-context-review-${viewport.width}.png`})
  await page.getByTestId('context-review-close').click()
  const saved=await preferences()
  const open=async()=>{await page.getByTestId('capabilities-open').click();await expect(page.getByTestId('capabilities-panel')).toBeVisible()}
  await open()
  const panel=page.getByTestId('capabilities-panel')
  for (const name of ['搜索网页','阅读链接','本次对话使用所选能力']) await expect(panel.getByRole('checkbox',{name,exact:true})).toBeDisabled()
  await expect(page.getByTestId('web-source-server')).toBeDisabled()
  await expect(page.getByTestId('speech-controls')).toBeVisible()
  await page.screenshot({path:`${root}/after-capabilities-${viewport.width}.png`})
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(composer).toHaveValue(draft)
  expect(await preferences()).toEqual(saved)
  await open()
  for (const name of ['搜索网页','阅读链接','本次对话使用所选能力']) await expect(panel.getByRole('checkbox',{name,exact:true})).not.toBeChecked()
  await page.keyboard.press('Escape')
  expect(await preferences()).toEqual(saved)
  await assertChatCoreState(page,expect,capture)
  expect(capture.requests.every(r=>r.method==='GET')).toBe(true)
  results.push({viewport,localAttachmentNoUpload:true,accessibleWebCheckboxNames:true,capabilityCloseReopenRetainsDraftContextPermissions:true,shiftEnterAndIME:true,capture})
  await page.close()
 }
 await writeFile(`${root}/after-controls.json`,JSON.stringify(results,null,2)+'\n')
} finally {await browser.close()}
