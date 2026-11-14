import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { runtimeApi, type SpeechOperation, type SpeechServicesResponse } from '@eap/runtime-client'
import { errorMessage } from '../../lib/presentation'

/** View-local audio resources; draft and conversation remain owned by chatSession. */
export function useChatAudio(options: {
  active: Ref<boolean>
  conversationId: Ref<string | null>
  draft: Ref<string>
}) {
  const catalog = ref<SpeechServicesResponse | null>(null)
  const serviceId = ref('')
  const microphone = ref<'idle' | 'recording' | 'stopping'>('idle')
  const busy = ref(false),
    error = ref(''),
    pendingText = ref(''),
    playing = ref(false)
  const operation = ref<SpeechOperation | null>(null)
  const unresolved = computed(() => operation.value?.status === 'RUNNING')
  let draftRevision = 0,
    requestDraftRevision = 0
  watch(
    options.draft,
    () => {
      draftRevision++
    },
    { flush: 'sync' },
  )
  const recorded = ref<Blob | null>(null)
  const recordingUrl = ref(''),
    playbackUrl = ref('')
  const recorderAvailable =
    typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  const selectedService = computed(() =>
    catalog.value?.services.find((service) => service.serverId === serviceId.value),
  )
  let stream: MediaStream | undefined,
    recorder: MediaRecorder | undefined,
    player: HTMLAudioElement | undefined
  let generation = 0,
    chunks: Blob[] = [],
    recordedBytes = 0,
    limitTimer: ReturnType<typeof setTimeout> | undefined
  let requestDraft = '',
    requestConversation: string | null = null
  let controller: AbortController | undefined
  let processedOperation: string | undefined
  const limits = computed(() => catalog.value?.limits)
  function clearRecording() {
    if (recordingUrl.value) URL.revokeObjectURL(recordingUrl.value)
    recordingUrl.value = ''
    recorded.value = null
  }
  function stopPlayback() {
    player?.pause()
    player = undefined
    playing.value = false
  }
  function clearPlayback() {
    stopPlayback()
    if (playbackUrl.value) URL.revokeObjectURL(playbackUrl.value)
    playbackUrl.value = ''
  }
  function stopTracks() {
    for (const track of stream?.getTracks() ?? []) track.stop()
    stream = undefined
    clearTimeout(limitTimer)
  }
  function reset() {
    generation++
    controller?.abort()
    controller = undefined
    if (operation.value?.status === 'RUNNING')
      void runtimeApi.cancelSpeechOperation(operation.value.operationId).catch(() => {})
    if (recorder?.state === 'recording') recorder.stop()
    recorder = undefined
    microphone.value = 'idle'
    stopTracks()
    chunks = []
    clearRecording()
    clearPlayback()
    pendingText.value = ''
    busy.value = false
    operation.value = null
  }
  watch(() => [options.active.value, options.conversationId.value], reset)
  onBeforeUnmount(reset)
  async function refresh() {
    try {
      catalog.value = await runtimeApi.speechServices()
    } catch (failure) {
      error.value = errorMessage(failure)
    }
  }
  async function startRecording() {
    if (
      !recorderAvailable ||
      busy.value ||
      unresolved.value ||
      microphone.value !== 'idle' ||
      !selectedService.value?.transcription ||
      !options.active.value
    )
      return
    const mime = selectedService.value.inputMimes.find((mime) =>
      MediaRecorder.isTypeSupported(mime),
    )
    if (!mime || !limits.value) return
    clearRecording()
    error.value = ''
    const current = ++generation
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (current !== generation || !options.active.value) {
        acquired.getTracks().forEach((track) => track.stop())
        return
      }
      stream = acquired
      chunks = []
      recordedBytes = 0
      const recording = new MediaRecorder(acquired, { mimeType: mime })
      recorder = recording
      recording.ondataavailable = (event) => {
        if (current !== generation || !event.data.size) return
        recordedBytes += event.data.size
        if (recordedBytes > (limits.value?.maxAudioBytes ?? 0)) {
          error.value = 'speech.audioLimit'
          reset()
          return
        }
        chunks.push(event.data)
      }
      recording.onerror = () => {
        if (current === generation) {
          error.value = 'speech.recordingFailed'
          reset()
        }
      }
      recording.onstop = () => {
        acquired.getTracks().forEach((track) => track.stop())
        if (current !== generation) return
        if (stream === acquired) stream = undefined
        clearTimeout(limitTimer)
        const blob = new Blob(chunks, { type: mime })
        chunks = []
        microphone.value = 'idle'
        recorder = undefined
        if (!blob.size || blob.size > (limits.value?.maxAudioBytes ?? 0)) {
          error.value = 'speech.audioLimit'
          return
        }
        recorded.value = blob
        recordingUrl.value = URL.createObjectURL(blob)
      }
      recording.start(250)
      microphone.value = 'recording'
      // A local capture budget prevents an idle microphone from recording indefinitely.
      limitTimer = setTimeout(stopRecording, 60_000)
    } catch (failure) {
      if (current === generation) {
        stopTracks()
        microphone.value = 'idle'
        error.value = errorMessage(failure)
      }
    }
  }
  function stopRecording() {
    if (recorder?.state === 'recording') {
      microphone.value = 'stopping'
      recorder.stop()
      stopTracks()
    }
  }
  async function encode(blob: Blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (let start = 0; start < bytes.length; start += 8192)
      binary += String.fromCharCode(...bytes.subarray(start, start + 8192))
    return btoa(binary)
  }
  function receive(result: SpeechOperation, current: number) {
    if (
      current !== generation ||
      !options.active.value ||
      options.conversationId.value !== requestConversation
    )
      return
    if (result.operationId !== operation.value?.operationId) {
      error.value = 'speech.invalidOperation'
      return
    }
    operation.value = result
    if (result.status === 'FAILED') error.value = result.errorCode ?? 'speech.failed'
    if (
      result.status !== 'SUCCEEDED' ||
      !result.result ||
      processedOperation === result.operationId
    )
      return
    processedOperation = result.operationId
    if ('text' in result.result) {
      if (result.result.text.length > (limits.value?.maxTranscriptChars ?? 0)) {
        error.value = 'speech.transcriptLimit'
        return
      }
      if (draftRevision === requestDraftRevision && options.draft.value === requestDraft)
        options.draft.value = options.draft.value
          ? options.draft.value + '\n' + result.result.text
          : result.result.text
      else pendingText.value = result.result.text
    } else if ('audio' in result.result) {
      const { mime, base64 } = result.result.audio
      if (
        !selectedService.value?.outputMimes.includes(mime) ||
        !mime.startsWith('audio/') ||
        !limits.value ||
        base64.length > limits.value.maxWireBytes
      ) {
        error.value = 'speech.invalidAudio'
        return
      }
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
      if (bytes.length > limits.value.maxAudioBytes) {
        error.value = 'speech.audioLimit'
        return
      }
      clearPlayback()
      playbackUrl.value = URL.createObjectURL(new Blob([bytes], { type: mime }))
    }
  }
  async function submit(kind: 'transcription' | 'synthesis', text = '') {
    if (
      busy.value ||
      unresolved.value ||
      !options.active.value ||
      !selectedService.value?.[kind] ||
      !limits.value
    )
      return
    if (kind === 'transcription' && !recorded.value) return
    if (kind === 'synthesis' && (!text.trim() || text.length > limits.value.maxTextChars)) return
    busy.value = true
    error.value = ''
    const current = ++generation
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal
    requestDraftRevision = draftRevision
    requestDraft = options.draft.value
    requestConversation = options.conversationId.value
    const operationId = crypto.randomUUID()
    // Keep the request identity even when the response is lost; recovery never resubmits.
    operation.value = {
      operationId,
      kind,
      status: 'RUNNING',
      result: null,
      errorCode: null,
      expiresAt: '',
    }
    try {
      const result =
        kind === 'transcription'
          ? await runtimeApi.transcribeSpeech(
              {
                operationId,
                serverId: serviceId.value,
                audio: { mime: recorded.value!.type, base64: await encode(recorded.value!) },
              },
              { signal },
            )
          : await runtimeApi.synthesizeSpeech(
              { operationId, serverId: serviceId.value, text },
              { signal },
            )
      receive(result, current)
    } catch (failure) {
      if (current === generation) error.value = errorMessage(failure)
    } finally {
      if (current === generation) busy.value = false
    }
  }
  async function recover() {
    if (!operation.value || busy.value) return
    const current = generation
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal
    busy.value = true
    try {
      receive(await runtimeApi.getSpeechOperation(operation.value.operationId, { signal }), current)
    } catch (failure) {
      if (current === generation) error.value = errorMessage(failure)
    } finally {
      if (current === generation) busy.value = false
    }
  }
  async function cancel() {
    if (!operation.value) return
    const current = generation,
      id = operation.value.operationId
    try {
      await runtimeApi.cancelSpeechOperation(id)
      if (current === generation && id === operation.value?.operationId) await recover()
    } catch (failure) {
      if (current === generation) error.value = errorMessage(failure)
    }
  }
  function appendTranscript() {
    if (!pendingText.value) return
    options.draft.value += (options.draft.value ? '\n' : '') + pendingText.value
    pendingText.value = ''
  }
  async function play() {
    if (!playbackUrl.value) return
    stopPlayback()
    const audio = new Audio(playbackUrl.value),
      current = generation
    player = audio
    const ownsPlayback = () => player === audio && current === generation
    audio.onended = () => {
      if (!ownsPlayback()) return
      playing.value = false
      player = undefined
    }
    audio.onerror = () => {
      if (!ownsPlayback()) return
      error.value = 'speech.playbackFailed'
      stopPlayback()
    }
    try {
      await audio.play()
      if (ownsPlayback()) playing.value = true
      else audio.pause()
    } catch (failure) {
      if (!ownsPlayback()) {
        audio.pause()
        return
      }
      error.value = errorMessage(failure)
      stopPlayback()
    }
  }
  return {
    unresolved,
    catalog,
    serviceId,
    selectedService,
    microphone,
    recorderAvailable,
    busy,
    error,
    pendingText,
    recordingUrl,
    playbackUrl,
    playing,
    operation,
    refresh,
    reset,
    startRecording,
    stopRecording,
    clearRecording,
    transcribe: () => submit('transcription'),
    synthesize: (text: string) => submit('synthesis', text),
    recover,
    cancel,
    appendTranscript,
    play,
    stopPlayback,
  }
}
