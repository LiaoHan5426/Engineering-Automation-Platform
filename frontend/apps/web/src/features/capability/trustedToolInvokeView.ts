import axios from 'axios'
import { errorMessage } from '../../lib/presentation'

export type TrustedToolInvokeFailure =
  | 'denied'
  | 'timeout'
  | 'cancelled'
  | 'unknown'
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
  if (detail === 'TRUSTED_TOOL_UNKNOWN' || status === 520) return 'unknown'
  // Transport dropped with no HTTP response: outcome may be unknown (request may have reached the host).
  if (axios.isAxiosError(error) && !error.response) {
    const code = error.code ?? ''
    if (
      code === 'ERR_NETWORK' ||
      code === 'ECONNRESET' ||
      code === 'ECONNREFUSED' ||
      code === 'ERR_BAD_RESPONSE'
    ) {
      return 'unknown'
    }
  }
  return 'failed'
}

export function trustedToolInvokeFailureMessage(error: unknown): string {
  const kind = trustedToolInvokeFailure(error)
  if (kind === 'denied') return '能力已停用或未授权，已拒绝本次只读调用。'
  if (kind === 'timeout') return '可信工具调用超时，未修改工作区。'
  if (kind === 'cancelled') return '已取消本次可信工具调用。'
  if (kind === 'unknown') return '可信工具调用结果未知（连接中断）；未确认是否已执行，请核对后再试。'
  return errorMessage(error)
}

/** Stable detail code for invoke summary; never includes stdout/stderr bodies. */
export function trustedToolInvokeDetail(error: unknown): string {
  const detail = String(responseOf(error)?.data?.detail ?? '').trim()
  if (detail) return detail
  const kind = trustedToolInvokeFailure(error)
  if (kind === 'denied') return 'CAPABILITY_DISABLED'
  if (kind === 'timeout') return 'TRUSTED_TOOL_TIMEOUT'
  if (kind === 'cancelled') return 'CLIENT_ABORTED'
  if (kind === 'unknown') return 'TRUSTED_TOOL_UNKNOWN'
  return 'TRUSTED_TOOL_FAILED'
}

/** Long stdout collapses behind a summary; short results stay inline. */
export const TRUSTED_STDOUT_COLLAPSE_LINES = 8
export const TRUSTED_STDOUT_COLLAPSE_CHARS = 480

export function trustedStdoutNeedsCollapse(text: string | undefined | null): boolean {
  const body = String(text ?? '')
  if (!body) return false
  if (body.length >= TRUSTED_STDOUT_COLLAPSE_CHARS) return true
  const lines = body.split(/\r?\n/).length
  return lines >= TRUSTED_STDOUT_COLLAPSE_LINES
}

export function trustedStdoutPreview(text: string | undefined | null, maxLines = 3): string {
  const body = String(text ?? '').trimEnd()
  if (!body) return ''
  const lines = body.split(/\r?\n/).filter((line) => line.length > 0)
  const head = lines.slice(0, maxLines).join(' · ')
  if (lines.length <= maxLines) return head
  return `${head} · …`
}
