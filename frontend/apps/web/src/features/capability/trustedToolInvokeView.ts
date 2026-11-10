import { i18n } from '../../lib/i18n'
import { ToolErrors } from '@eap/runtime-client'
import { isRequestError } from '@eap/request'
import { errorMessage } from '../../lib/presentation'

export type TrustedToolInvokeFailure = 'denied' | 'timeout' | 'cancelled' | 'unknown' | 'failed'

function responseOf(error: unknown): { status?: number; data?: { code?: unknown } } | null {
  if (isRequestError(error)) return error.response ?? null
  const response = (error as { response?: { status?: number; data?: { code?: unknown } } } | null)
    ?.response
  return response ?? null
}

function clientWaitAborted(error: unknown): boolean {
  return (
    (error as { code?: string } | null)?.code === 'ERR_CANCELED' ||
    (error as { name?: string } | null)?.name === 'AbortError'
  )
}

export function trustedToolInvokeFailure(error: unknown): TrustedToolInvokeFailure {
  // This endpoint has no server cancellation acknowledgement. Aborting HTTP only stops waiting.
  if (clientWaitAborted(error)) return 'unknown'
  if (isRequestError(error) && error.code === 'ECONNABORTED') return 'unknown'
  const response = responseOf(error)
  const status = response?.status
  const detail = String(response?.data?.code ?? '')
  if (status === 403 || detail === ToolErrors.CAPABILITY_DISABLED) return 'denied'
  if (status === 408 || status === 504 || detail === 'TRUSTED_TOOL_TIMEOUT') return 'timeout'
  if (status === 499 || detail === 'TRUSTED_TOOL_CANCELLED') return 'cancelled'
  if (detail === 'TRUSTED_TOOL_UNKNOWN' || status === 520) return 'unknown'
  // Transport dropped with no HTTP response: outcome may be unknown (request may have reached the host).
  if (isRequestError(error) && !error.response) {
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
  if (clientWaitAborted(error)) return i18n.global.t('presentation.waitAborted')
  const kind = trustedToolInvokeFailure(error)
  if (kind === 'denied') return i18n.global.t('presentation.invokeDenied')
  if (kind === 'timeout') return i18n.global.t('presentation.invokeTimeout')
  if (kind === 'cancelled') return i18n.global.t('presentation.invokeCancelled')
  if (kind === 'unknown') return i18n.global.t('presentation.invokeUnknown')
  return errorMessage(error)
}

/** Stable detail code for invoke summary; never includes stdout/stderr bodies. */
export function trustedToolInvokeDetail(error: unknown): string {
  if (clientWaitAborted(error)) return 'CLIENT_WAIT_ABORTED'
  const detail = String(responseOf(error)?.data?.code ?? '').trim()
  if (detail) return detail
  const kind = trustedToolInvokeFailure(error)
  if (kind === 'denied') return ToolErrors.CAPABILITY_DISABLED
  if (kind === 'timeout') return 'TRUSTED_TOOL_TIMEOUT'
  if (kind === 'cancelled') return 'TRUSTED_TOOL_CANCELLED'
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
