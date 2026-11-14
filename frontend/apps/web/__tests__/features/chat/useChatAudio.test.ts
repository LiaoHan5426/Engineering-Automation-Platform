// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { createApp, h, nextTick, ref, type App } from 'vue'
import { runtimeApi, type SpeechOperation, type SpeechServicesResponse } from '@eap/runtime-client'
import { useChatAudio } from '../../../src/features/chat/useChatAudio'

// Explicit browser/provider simulations: no backend or real microphone/provider is contacted.
class RecorderSimulation {
  static instances: RecorderSimulation[] = []
  static isTypeSupported = vi.fn((mime: string) => mime === 'audio/webm')
  state: RecordingState = 'inactive'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(readonly stream: MediaStream) {
    RecorderSimulation.instances.push(this)
  }
  start = vi.fn(() => {
    this.state = 'recording'
  })
  // Browsers dispatch stop later; tests deliberately control when that queued event runs.
  stop = vi.fn(() => {
    this.state = 'inactive'
  })
  data(text = 'simulated audio') {
    this.ondataavailable?.({ data: new Blob([text], { type: 'audio/webm' }) })
  }
  stopped() {
    this.onstop?.()
  }
}
class PlayerSimulation {
  static instances: PlayerSimulation[] = []
  static playResults: Promise<void>[] = []
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  play = vi.fn(() => PlayerSimulation.playResults.shift() ?? Promise.resolve())
  pause = vi.fn()
  constructor(readonly src: string) {
    PlayerSimulation.instances.push(this)
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const catalog: SpeechServicesResponse = {
  services: [
    {
      serverId: 'simulated-speech',
      transcription: true,
      synthesis: true,
      inputMimes: ['audio/webm'],
      outputMimes: ['audio/wav'],
    },
  ],
  limits: { maxAudioBytes: 1024, maxWireBytes: 2048, maxTextChars: 100, maxTranscriptChars: 100 },
}
function result(
  operationId: string,
  kind: SpeechOperation['kind'],
  value: SpeechOperation['result'],
  status: SpeechOperation['status'] = 'SUCCEEDED',
): SpeechOperation {
  return {
    operationId,
    kind,
    status,
    result: value,
    errorCode: null,
    expiresAt: '2099-01-01T00:00:00Z',
  }
}
const tracks: Array<ReturnType<typeof vi.fn>> = []
const getUserMedia = vi.fn<typeof navigator.mediaDevices.getUserMedia>()
const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
let app: App | undefined
let host: HTMLDivElement | undefined
let nextUrl = 0
const createUrl = vi.fn(() => `blob:simulation-${++nextUrl}`)
const revokeUrl = vi.fn()

async function mountAudio(draftText = '') {
  const active = ref(true),
    conversationId = ref<string | null>('conversation-a'),
    draft = ref(draftText)
  let audio!: ReturnType<typeof useChatAudio>
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({
    setup() {
      audio = useChatAudio({ active, conversationId, draft })
      return () => h('div')
    },
  })
  app.mount(host)
  await audio.refresh()
  audio.serviceId.value = 'simulated-speech'
  return { audio, active, conversationId, draft }
}
async function record(audio: ReturnType<typeof useChatAudio>) {
  await audio.startRecording()
  const recorder = RecorderSimulation.instances.at(-1)!
  recorder.data()
  audio.stopRecording()
  recorder.stopped()
  return recorder
}

beforeEach(() => {
  vi.useFakeTimers()
  RecorderSimulation.instances = []
  PlayerSimulation.instances = []
  PlayerSimulation.playResults = []
  tracks.length = 0
  nextUrl = 0
  createUrl.mockClear()
  revokeUrl.mockClear()
  getUserMedia.mockReset().mockImplementation(async () => {
    const stop = vi.fn()
    tracks.push(stop)
    // Only the browser boundary is simulated; runtimeApi spies retain their real function types.
    return { getTracks: () => [{ stop }] } as MediaStream
  })
  vi.stubGlobal('MediaRecorder', RecorderSimulation)
  vi.stubGlobal('Audio', PlayerSimulation)
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  })
  vi.spyOn(URL, 'createObjectURL').mockImplementation(createUrl)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeUrl)
  vi.spyOn(runtimeApi, 'speechServices').mockResolvedValue(catalog)
  vi.spyOn(runtimeApi, 'transcribeSpeech').mockImplementation(async (request) =>
    result(request.operationId, 'transcription', { text: 'recognized text' }),
  )
  vi.spyOn(runtimeApi, 'synthesizeSpeech').mockImplementation(async (request) =>
    result(request.operationId, 'synthesis', { audio: { mime: 'audio/wav', base64: 'YXVkaW8=' } }),
  )
  vi.spyOn(runtimeApi, 'getSpeechOperation').mockRejectedValue(
    new Error('No simulated GET configured'),
  )
  vi.spyOn(runtimeApi, 'cancelSpeechOperation').mockImplementation(async (operationId) => ({
    operationId,
    cancelRequested: true,
  }))
})
afterEach(() => {
  app?.unmount()
  app = undefined
  host?.remove()
  host = undefined
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices)
  else Reflect.deleteProperty(navigator, 'mediaDevices')
  vi.unstubAllGlobals()
})

describe('useChatAudio with simulated browser and speech service', () => {
  it.each(['replay', 'reset and regenerate'] as const)(
    'keeps player B active after %s when player A play rejects or queued events arrive late',
    async (restart) => {
      const { audio } = await mountAudio()
      await audio.synthesize('audio A')
      const urlA = audio.playbackUrl.value
      const pendingPlayA = deferred<void>()
      PlayerSimulation.playResults.push(pendingPlayA.promise)
      const playingA = audio.play()
      const playerA = PlayerSimulation.instances[0]!
      // Capture already queued events: detaching a handler need not cancel a queued callback.
      const endedA = playerA.onended
      const failedA = playerA.onerror
      expect(audio.playing.value).toBe(false)
      if (restart === 'reset and regenerate') {
        audio.reset()
        await audio.synthesize('audio B')
        expect(revokeUrl).toHaveBeenCalledWith(urlA)
      }
      await audio.play()
      const playerB = PlayerSimulation.instances[1]!
      const operationB = audio.operation.value!.operationId
      const urlB = audio.playbackUrl.value
      expect(playerA.pause).toHaveBeenCalledOnce()
      expect(playerB.play).toHaveBeenCalledOnce()
      expect(audio.playing.value).toBe(true)

      pendingPlayA.reject(new Error('Simulated superseded audio A play rejection'))
      await playingA
      expect(playerB.pause).not.toHaveBeenCalled()
      expect(audio.playing.value).toBe(true)
      expect(audio.error.value).toBe('')
      endedA?.()
      expect(audio.playing.value).toBe(true)
      failedA?.()
      expect(playerB.pause).not.toHaveBeenCalled()
      expect(audio.playing.value).toBe(true)
      expect(audio.error.value).toBe('')
      expect(audio.busy.value).toBe(false)
      expect(audio.operation.value!.operationId).toBe(operationB)
      expect(audio.playbackUrl.value).toBe(urlB)
      expect(revokeUrl).not.toHaveBeenCalledWith(urlB)
      // A's stale ended callback must not drop the current player reference either.
      audio.stopPlayback()
      expect(playerB.pause).toHaveBeenCalledOnce()
      expect(audio.playing.value).toBe(false)
    },
  )

  it('records locally and requires explicit transcription; TTS requires explicit playback', async () => {
    const { audio, draft } = await mountAudio('draft')
    expect(audio.recorderAvailable).toBe(true)
    await record(audio)
    expect(audio.microphone.value).toBe('idle')
    expect(tracks[0]).toHaveBeenCalled()
    expect(audio.recordingUrl.value).toBe('blob:simulation-1')
    expect(runtimeApi.transcribeSpeech).not.toHaveBeenCalled()
    expect(runtimeApi.synthesizeSpeech).not.toHaveBeenCalled()

    await audio.transcribe()
    expect(runtimeApi.transcribeSpeech).toHaveBeenCalledWith(
      {
        operationId: expect.any(String),
        serverId: 'simulated-speech',
        audio: { mime: 'audio/webm', base64: btoa('simulated audio') },
      },
      { signal: expect.any(AbortSignal) },
    )
    expect(draft.value).toBe('draft\nrecognized text')
    await audio.synthesize('Read this')
    expect(runtimeApi.synthesizeSpeech).toHaveBeenCalledWith(
      {
        operationId: expect.any(String),
        serverId: 'simulated-speech',
        text: 'Read this',
      },
      { signal: expect.any(AbortSignal) },
    )
    expect(audio.playbackUrl.value).toBe('blob:simulation-2')
    expect(PlayerSimulation.instances).toHaveLength(0)
    expect(audio.playing.value).toBe(false)
    await audio.play()
    expect(PlayerSimulation.instances[0]!.play).toHaveBeenCalledOnce()
    expect(audio.playing.value).toBe(true)
  })

  it.each(['transcription', 'synthesis'] as const)(
    'retains a lost %s POST identity and blocks new operations until GET reconciliation',
    async (kind) => {
      const { audio, draft } = await mountAudio()
      await record(audio)
      const post = deferred<SpeechOperation>()
      if (kind === 'transcription')
        vi.mocked(runtimeApi.transcribeSpeech).mockReturnValueOnce(post.promise)
      else vi.mocked(runtimeApi.synthesizeSpeech).mockReturnValueOnce(post.promise)
      const submission = kind === 'transcription' ? audio.transcribe() : audio.synthesize('first')
      const operationId = audio.operation.value!.operationId
      expect(audio.busy.value).toBe(true)
      post.reject(new Error('Simulated POST response lost after provider accepted'))
      await submission
      expect(audio.busy.value).toBe(false)
      expect(audio.operation.value).toMatchObject({ operationId, status: 'RUNNING', kind })
      expect(audio.unresolved.value).toBe(true)
      expect(audio.error.value).not.toBe('')
      const postCounts = [
        vi.mocked(runtimeApi.transcribeSpeech).mock.calls.length,
        vi.mocked(runtimeApi.synthesizeSpeech).mock.calls.length,
      ]
      const captures = getUserMedia.mock.calls.length
      await audio.transcribe()
      await audio.synthesize('second')
      await audio.startRecording()
      expect(audio.operation.value!.operationId).toBe(operationId)
      expect(runtimeApi.transcribeSpeech).toHaveBeenCalledTimes(postCounts[0]!)
      expect(runtimeApi.synthesizeSpeech).toHaveBeenCalledTimes(postCounts[1]!)
      expect(getUserMedia).toHaveBeenCalledTimes(captures)

      vi.mocked(runtimeApi.getSpeechOperation).mockResolvedValueOnce(
        result(operationId, kind, null, 'RUNNING'),
      )
      await audio.recover()
      expect(audio.unresolved.value).toBe(true)
      await audio.synthesize('still blocked')
      expect(runtimeApi.synthesizeSpeech).toHaveBeenCalledTimes(postCounts[1]!)
      const recovered = result(
        operationId,
        kind,
        kind === 'transcription'
          ? { text: 'recovered' }
          : { audio: { mime: 'audio/wav', base64: 'YQ==' } },
      )
      vi.mocked(runtimeApi.getSpeechOperation).mockResolvedValue(recovered)
      await audio.recover()
      expect(runtimeApi.getSpeechOperation).toHaveBeenLastCalledWith(operationId, {
        signal: expect.any(AbortSignal),
      })
      expect(audio.unresolved.value).toBe(false)
      await audio.recover()
      if (kind === 'transcription') expect(draft.value).toBe('recovered')
      else expect(createUrl).toHaveBeenCalledTimes(2)
      expect(runtimeApi.transcribeSpeech).toHaveBeenCalledTimes(postCounts[0]!)
      expect(runtimeApi.synthesizeSpeech).toHaveBeenCalledTimes(postCounts[1]!)
      await audio.synthesize('allowed after GET terminal state')
      expect(audio.operation.value!.operationId).not.toBe(operationId)
      expect(runtimeApi.synthesizeSpeech).toHaveBeenCalledTimes(postCounts[1]! + 1)
    },
  )

  it('protects a draft edited and undone while ASR is pending, then consumes append only once', async () => {
    const { audio, draft } = await mountAudio('original')
    await record(audio)
    const post = deferred<SpeechOperation>()
    vi.mocked(runtimeApi.transcribeSpeech).mockReturnValueOnce(post.promise)
    const submission = audio.transcribe()
    const operationId = audio.operation.value!.operationId
    draft.value = 'user edit'
    draft.value = 'original'
    post.resolve(result(operationId, 'transcription', { text: 'late transcript' }))
    await submission
    expect(draft.value).toBe('original')
    expect(audio.pendingText.value).toBe('late transcript')
    audio.appendTranscript()
    audio.appendTranscript()
    expect(draft.value).toBe('original\nlate transcript')
    expect(audio.pendingText.value).toBe('')
    vi.mocked(runtimeApi.getSpeechOperation).mockResolvedValue(
      result(operationId, 'transcription', { text: 'late transcript' }),
    )
    await audio.recover()
    expect(draft.value).toBe('original\nlate transcript')
    expect(audio.pendingText.value).toBe('')
  })

  it('a stale queued recorder A stop cannot stop recorder B stream after reset', async () => {
    const { audio } = await mountAudio()
    await audio.startRecording()
    const recorderA = RecorderSimulation.instances[0]!
    recorderA.data('A')
    audio.reset()
    expect(tracks[0]).toHaveBeenCalled()
    await audio.startRecording()
    const recorderB = RecorderSimulation.instances[1]!
    recorderA.stopped()
    expect(tracks[1]).not.toHaveBeenCalled()
    expect(audio.microphone.value).toBe('recording')
    expect(audio.recordingUrl.value).toBe('')
    recorderB.data('B')
    audio.stopRecording()
    recorderB.stopped()
    expect(tracks[1]).toHaveBeenCalled()
    await audio.transcribe()
    expect(runtimeApi.transcribeSpeech).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: { mime: 'audio/webm', base64: btoa('B') },
      }),
      expect.anything(),
    )
  })

  it.each(['conversation', 'inactive', 'unmount'] as const)(
    'cleans tracks, recorded/playback URLs and player on %s lifecycle change',
    async (trigger) => {
      const { audio, conversationId, active } = await mountAudio()
      await record(audio)
      const recordingUrl = audio.recordingUrl.value
      await audio.synthesize('simulated playback')
      const playbackUrl = audio.playbackUrl.value
      await audio.play()
      const player = PlayerSimulation.instances[0]!
      if (trigger === 'conversation') conversationId.value = 'conversation-b'
      else if (trigger === 'inactive') active.value = false
      else {
        app!.unmount()
        app = undefined
      }
      await nextTick()
      expect(tracks[0]).toHaveBeenCalled()
      expect(revokeUrl).toHaveBeenCalledWith(recordingUrl)
      expect(revokeUrl).toHaveBeenCalledWith(playbackUrl)
      expect(player.pause).toHaveBeenCalledOnce()
      expect(audio.recordingUrl.value).toBe('')
      expect(audio.playbackUrl.value).toBe('')
      expect(audio.playing.value).toBe(false)
      expect(audio.operation.value).toBeNull()
      expect(runtimeApi.transcribeSpeech).not.toHaveBeenCalled()
    },
  )

  it.each(['conversation', 'inactive', 'unmount'] as const)(
    'stops an active capture and ignores its queued data/stop after %s',
    async (trigger) => {
      const { audio, conversationId, active } = await mountAudio()
      await audio.startRecording()
      const recorder = RecorderSimulation.instances[0]!
      recorder.data()
      if (trigger === 'conversation') conversationId.value = 'conversation-b'
      else if (trigger === 'inactive') active.value = false
      else {
        app!.unmount()
        app = undefined
      }
      await nextTick()
      expect(recorder.stop).toHaveBeenCalledOnce()
      expect(tracks[0]).toHaveBeenCalled()
      recorder.data('late data')
      recorder.stopped()
      expect(audio.microphone.value).toBe('idle')
      expect(audio.recordingUrl.value).toBe('')
      expect(createUrl).not.toHaveBeenCalled()
      expect(runtimeApi.transcribeSpeech).not.toHaveBeenCalled()
    },
  )

  it('a delayed cancel for conversation A cannot recover or alter conversation B operation', async () => {
    const { audio, conversationId } = await mountAudio()
    vi.mocked(runtimeApi.synthesizeSpeech).mockImplementation(async (request) =>
      result(request.operationId, 'synthesis', null, 'RUNNING'),
    )
    await audio.synthesize('conversation A')
    const operationA = audio.operation.value!.operationId
    const cancellation = deferred<Awaited<ReturnType<typeof runtimeApi.cancelSpeechOperation>>>()
    vi.mocked(runtimeApi.cancelSpeechOperation).mockReturnValueOnce(cancellation.promise)
    const cancelA = audio.cancel()
    conversationId.value = 'conversation-b'
    await nextTick()
    await audio.synthesize('conversation B')
    const operationB = audio.operation.value!.operationId
    cancellation.resolve({ operationId: operationA, cancelRequested: true })
    await cancelA
    expect(runtimeApi.getSpeechOperation).not.toHaveBeenCalled()
    expect(audio.operation.value).toMatchObject({ operationId: operationB, status: 'RUNNING' })
    expect(audio.error.value).toBe('')
  })

  it('a pending GET from conversation A cannot clear busy or apply a result to conversation B', async () => {
    const { audio, conversationId } = await mountAudio()
    vi.mocked(runtimeApi.synthesizeSpeech).mockImplementationOnce(async (request) =>
      result(request.operationId, 'synthesis', null, 'RUNNING'),
    )
    await audio.synthesize('conversation A')
    const operationA = audio.operation.value!.operationId
    const recovery = deferred<SpeechOperation>()
    vi.mocked(runtimeApi.getSpeechOperation).mockReturnValueOnce(recovery.promise)
    const recoveringA = audio.recover()
    const signalA = vi.mocked(runtimeApi.getSpeechOperation).mock.calls[0]![1]!.signal!
    conversationId.value = 'conversation-b'
    await nextTick()
    expect(signalA.aborted).toBe(true)
    const postB = deferred<SpeechOperation>()
    vi.mocked(runtimeApi.synthesizeSpeech).mockReturnValueOnce(postB.promise)
    const submittingB = audio.synthesize('conversation B')
    const operationB = audio.operation.value!.operationId
    recovery.resolve(
      result(operationA, 'synthesis', { audio: { mime: 'audio/wav', base64: 'YQ==' } }),
    )
    await recoveringA
    expect(audio.busy.value).toBe(true)
    expect(audio.operation.value!.operationId).toBe(operationB)
    expect(audio.playbackUrl.value).toBe('')
    postB.resolve(result(operationB, 'synthesis', { audio: { mime: 'audio/wav', base64: 'Yg==' } }))
    await submittingB
    expect(audio.busy.value).toBe(false)
    expect(audio.operation.value!.status).toBe('SUCCEEDED')
    expect(createUrl).toHaveBeenCalledOnce()
  })

  it('aborts a pending request and cancels its operation on conversation change, ignoring late success', async () => {
    const { audio, conversationId, draft } = await mountAudio('keep')
    const post = deferred<SpeechOperation>()
    vi.mocked(runtimeApi.synthesizeSpeech).mockReturnValueOnce(post.promise)
    const submission = audio.synthesize('pending')
    const operationId = audio.operation.value!.operationId
    const signal = vi.mocked(runtimeApi.synthesizeSpeech).mock.calls[0]![1]!.signal!
    conversationId.value = 'conversation-b'
    await nextTick()
    expect(signal.aborted).toBe(true)
    expect(runtimeApi.cancelSpeechOperation).toHaveBeenCalledWith(operationId)
    post.resolve(result(operationId, 'synthesis', { audio: { mime: 'audio/wav', base64: 'YQ==' } }))
    await submission
    expect(audio.operation.value).toBeNull()
    expect(audio.playbackUrl.value).toBe('')
    expect(createUrl).not.toHaveBeenCalled()
    expect(draft.value).toBe('keep')
  })
})
