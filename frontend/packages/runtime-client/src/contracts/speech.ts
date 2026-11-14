/** Mirrored from backend SpeechOperationStatus; independent from chat execution. */
export const SpeechOperationStatus = {
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const
export type SpeechOperationStatus =
  (typeof SpeechOperationStatus)[keyof typeof SpeechOperationStatus]
export type SpeechAudio = { mime: string; base64: string }
export type SpeechServicesResponse = {
  services: Array<{
    serverId: string
    transcription: boolean
    synthesis: boolean
    inputMimes: string[]
    outputMimes: string[]
  }>
  limits: {
    maxAudioBytes: number
    maxWireBytes: number
    maxTextChars: number
    maxTranscriptChars: number
  }
}
export type SpeechTranscriptionRequest = {
  operationId: string
  serverId: string
  audio: SpeechAudio
}
export type SpeechSynthesisRequest = { operationId: string; serverId: string; text: string }
export type SpeechOperation = {
  operationId: string
  kind: 'transcription' | 'synthesis'
  status: SpeechOperationStatus
  result: null | { text: string } | { audio: SpeechAudio }
  errorCode: string | null
  expiresAt: string
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
export function isSpeechOperation(value: unknown): value is SpeechOperation {
  if (!record(value) || Object.keys(value).length !== 6) return false
  const row = value as SpeechOperation
  if (
    typeof row.operationId !== 'string' ||
    !row.operationId ||
    !['transcription', 'synthesis'].includes(row.kind) ||
    !Object.values(SpeechOperationStatus).includes(row.status) ||
    typeof row.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(row.expiresAt)) ||
    (row.errorCode !== null && (typeof row.errorCode !== 'string' || !row.errorCode))
  )
    return false
  if (row.status !== 'SUCCEEDED')
    return (
      row.result === null &&
      (row.status === 'RUNNING' ? row.errorCode === null : typeof row.errorCode === 'string')
    )
  if (!record(row.result) || row.errorCode !== null || Object.keys(row.result).length !== 1)
    return false
  const result = row.result as Record<string, unknown>
  if (row.kind === 'transcription') return typeof result.text === 'string'
  const audio = result.audio
  return (
    record(audio) &&
    Object.keys(audio).length === 2 &&
    typeof audio.mime === 'string' &&
    !!audio.mime &&
    typeof audio.base64 === 'string' &&
    !!audio.base64
  )
}
export function isSpeechServicesResponse(value: unknown): value is SpeechServicesResponse {
  if (
    !record(value) ||
    Object.keys(value).length !== 2 ||
    !Array.isArray(value.services) ||
    !record(value.limits)
  )
    return false
  const limits = value.limits
  const keys = ['maxAudioBytes', 'maxWireBytes', 'maxTextChars', 'maxTranscriptChars']
  if (
    Object.keys(limits).length !== keys.length ||
    keys.some((key) => !Number.isSafeInteger(limits[key]) || (limits[key] as number) <= 0)
  )
    return false
  return value.services.every(
    (service) =>
      record(service) &&
      Object.keys(service).length === 5 &&
      typeof service.serverId === 'string' &&
      !!service.serverId &&
      typeof service.transcription === 'boolean' &&
      typeof service.synthesis === 'boolean' &&
      ['inputMimes', 'outputMimes'].every(
        (key) =>
          Array.isArray(service[key]) &&
          service[key].every((mime: unknown) => typeof mime === 'string' && !!mime),
      ),
  )
}
