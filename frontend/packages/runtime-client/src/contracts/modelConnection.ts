export const ModelConnectionState = {
  DISABLED: 'disabled',
  NOT_CONFIGURED: 'not_configured',
  CONFIGURED_UNVERIFIED: 'configured_unverified',
  AVAILABLE: 'available',
  ERROR: 'error',
} as const
export type ModelConnectionState = (typeof ModelConnectionState)[keyof typeof ModelConnectionState]
export const modelConnectionStateValues: readonly ModelConnectionState[] =
  Object.values(ModelConnectionState)
export function isModelConnectionState(value: unknown): value is ModelConnectionState {
  return (
    typeof value === 'string' && (modelConnectionStateValues as readonly string[]).includes(value)
  )
}

export const ChatGptLoginStatus = {
  WAITING: 'waiting',
  EXCHANGING: 'exchanging',
  CONNECTED: 'connected',
  PERMISSION_REQUIRED: 'permission_required',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
} as const
export type ChatGptLoginStatus = (typeof ChatGptLoginStatus)[keyof typeof ChatGptLoginStatus]
export const chatGptLoginStatusValues: readonly ChatGptLoginStatus[] =
  Object.values(ChatGptLoginStatus)
export function isChatGptLoginStatus(value: unknown): value is ChatGptLoginStatus {
  return (
    typeof value === 'string' && (chatGptLoginStatusValues as readonly string[]).includes(value)
  )
}

export function isChatGptLoginStatusActive(value: unknown): boolean {
  return value === ChatGptLoginStatus.WAITING || value === ChatGptLoginStatus.EXCHANGING
}
