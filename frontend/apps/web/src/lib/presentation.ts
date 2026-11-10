import { isRequestError } from '@eap/request'
import { i18n } from './i18n'

export function errorMessage(error: unknown): string {
  const response = (
    error as { response?: { status?: number; data?: { code?: unknown; detail?: unknown } } } | null
  )?.response
  if (
    typeof response?.data?.code === 'string' &&
    typeof response.data.detail === 'string' &&
    response.data.detail.trim()
  )
    return response.data.detail
  if (isRequestError(error)) {
    if (error.code === 'ECONNABORTED') return i18n.global.t('presentation.timeout')
    if (!error.response) return i18n.global.t('presentation.offline')
  }
  if (response?.status) return i18n.global.t('presentation.httpFailed', { status: response.status })
  return i18n.global.t('presentation.failure')
}

export function statusLabel(status: string): string {
  const key = 'presentation.statuses.' + status
  return i18n.global.te(key) ? i18n.global.t(key) : status
}
