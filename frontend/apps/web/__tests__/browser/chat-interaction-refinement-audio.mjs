// Synthetic local browser microphone; bounded HTTP fixture, no remote speech/model calls.
import { loadPlaywright } from './playwright-runtime.mjs'
import { openServiceChatFixture, draft } from './chat-service-config-fixture.mjs'
import { title } from './chat-core-fixture.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
const {chromium,expect}=loadPlaywright()
const base='http://127.0.0.1:5208'
const root=process.env.EAP_AUDIO_ROOT||new URL('../../../../../docs/evidence/chat-interaction-refinement/after-audio/',import.meta.url).pathname
await mkdir(root,{recursive:true})
const browser=await chromium.launch({headless:true,executablePath:process.env.EAP_CHROMIUM,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']})
const results=[]
try {
 for(const viewport of [{width:1918,height:914},{width:390,height:1000}]) {
  const context=await browser.newContext({viewport,permissions:['microphone']})
  const page=await context.newPage()
  const capture=await openServiceChatFixture(page,{base,width:viewport.width})
  let operation, posts=0,gets=0,recovered=false
  await page.route('**/api/ai/speech/**',async route=>{
   const req=route.request(),u=new URL(req.url())
   if(u.origin!==base)return route.fallback()
   capture.requests.push({method:req.method(),path:u.pathname})
   if(req.method()==='GET'&&u.pathname==='/api/ai/speech/services') return route.fulfill({json:{services:[{serverId:'public-local-audio',transcription:true,synthesis:false,inputMimes:['audio/webm'],outputMimes:[]}],limits:{maxAudioBytes:2000000,maxWireBytes:3000000,maxTextChars:10000,maxTranscriptChars:10000}}})
   if(req.method()==='POST'&&u.pathname==='/api/ai/speech/transcriptions') {
    posts++; const body=req.postDataJSON()
    expect(body.serverId).toBe('public-local-audio');expect(body.audio.base64.length).toBeGreaterThan(0)
    operation={operationId:body.operationId,kind:'transcription',status:'RUNNING',result:null,errorCode:null,expiresAt:'2030-01-01T00:00:00Z'}
    return route.abort('failed') // Lost response retains identity and requires GET-only inspection.
   }
   if(req.method()==='GET'&&u.pathname===`/api/ai/speech/operations/${operation?.operationId}`) {gets++;return route.fulfill({json:recovered?{...operation,status:'SUCCEEDED',result:{text:'Public recovered transcript.'}}:operation})}
   return route.fallback()
  })
  await page.reload()
  if(viewport.width===390)await page.getByTestId('open-sidebar').click()
  await page.getByRole('button',{name:title,exact:false}).click()
  await page.evaluate(()=>document.fonts.ready)
  await expect(page.locator('#nprogress')).toHaveCount(0)
  const composer=page.getByTestId('chat-composer').locator('textarea').first()
  await expect(composer).toHaveValue(draft)
  const open=async()=>{await page.getByTestId('capabilities-open').click();await expect(page.getByTestId('capabilities-panel')).toBeVisible()}
  await open()
  const speech=page.getByTestId('speech-controls')
  await speech.getByRole('combobox').selectOption('public-local-audio')
  await speech.getByRole('button',{name:'开始录音（将请求麦克风权限）',exact:true}).click()
  await expect(speech.getByRole('button',{name:'停止录音',exact:true})).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('capabilities-panel')).toHaveCount(0)
  await expect(page.getByTestId('audio-attention')).toBeVisible()
  await expect(page.getByTestId('audio-attention').getByRole('button',{name:'停止录音',exact:true})).toBeVisible()
  // Let the real MediaRecorder collect a bounded synthetic audio sample.
  await page.waitForTimeout(400)
  await page.getByTestId('audio-attention').getByRole('button',{name:'停止录音',exact:true}).click()
  await open()
  await expect(speech.locator('audio')).toBeVisible()
  await speech.getByRole('button',{name:'转录到草稿',exact:true}).click()
  await expect.poll(()=>posts).toBe(1)
  await expect(speech.getByRole('button',{name:'检查语音请求结果',exact:true})).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('audio-attention')).toBeVisible()
  await composer.fill(draft+' locally changed')
  await open()
  await expect(speech.getByRole('combobox')).toHaveValue('public-local-audio')
  await speech.getByRole('button',{name:'检查语音请求结果',exact:true}).click()
  await expect.poll(()=>gets).toBe(1)
  expect(posts).toBe(1)
  const transcribe = speech.getByRole('button',{name:'转录到草稿',exact:true})
  await expect(transcribe).toBeDisabled()
  await expect(speech.getByRole('combobox')).toBeDisabled()
  await expect(speech.getByRole('button',{name:'开始录音（将请求麦克风权限）',exact:true})).toBeDisabled()
  expect(posts).toBe(1)
  recovered=true
  await speech.getByRole('button',{name:'检查语音请求结果',exact:true}).click()
  await expect(speech).toContainText('Public recovered transcript.')
  await expect(composer).toHaveValue(draft+' locally changed')
  await page.keyboard.press('Escape');await expect(page.getByTestId('audio-attention')).toBeVisible();await open()
  await expect(speech).toContainText('Public recovered transcript.')
  await page.screenshot({path:`${root}/after-speech-pending-append-${viewport.width}.png`})
  await speech.getByRole('button',{name:'追加识别文本',exact:true}).click()
  await expect(composer).toHaveValue(draft+' locally changed\nPublic recovered transcript.')
  expect(posts).toBe(1);expect(gets).toBe(2)
  expect(capture.blocked).toEqual([]);expect(capture.errors).toEqual([])
  results.push({viewport,syntheticBrowserMicrophone:true,panelCloseKeepsRecordingAndStopReachable:true,panelReopenKeepsServiceRecordingOperationAndPendingTranscript:true,lostResponseRecoveryGetOnly:true,posts,gets,capture})
  await context.close()
 }
 await writeFile(`${root}/after-audio.json`,JSON.stringify(results,null,2)+'\n')
}finally{await browser.close()}
