import axios from 'axios'
import { errorMessage } from '../../lib/presentation'

export type TrustedToolInvokeFailure =
  | 'denied'
  | 'timeout'
  | 'cancelled'
  | 'failed'

function responseOf(error: unknown): { status?: number; data?: { detail?: unknown } } | null {
  if (axios.isAxiosError(error)) return error.response ?? null
  const response = (error as { response?: { status?: number; data?: { detail?: unknown } } } | null)
    ?.response
  return response ?? null
}

export function trustedToolInvokeFailure(error: unknown): TrustedToolInvokeFailure {
  if ((error as { code?: string } | null)?.code === 'ERR_CANCELED') return 'cancelled'
  if ((error as { name?: string } | null)?.name === 'AbortError') return 'cancelled'
  if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') return 'timeout'
  const response = responseOf(error)
  const status = response?.status
  const detail = String(response?.data?.detail ?? '')
  if (status === 403 || detail === 'CAPABILITY_DISABLED') return 'denied'
  if (status === 408 || status === 504 || detail === 'TRUSTED_TOOL_TIMEOUT') return 'timeout'
  if (status === 499 || detail === 'TRUSTED_TOOL_CANCELLED') return 'cancelled'
  return 'failed'
}

export function trustedToolInvokeFailureMessage(error: unknown): string {
  const kind = trustedToolInvokeFailure(error)
  if (kind === 'denied') return '能力已停用或未授权，已拒绝本次只读调用。'
  if (kind === 'timeout') return '可信工具调用超时，未修改工作区。'
  if (kind === 'cancelled') return '已取消本次可信工具调用。'
  return errorMessage(error)
}
