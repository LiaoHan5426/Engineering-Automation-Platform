import { WorkspaceErrors } from '@eap/runtime-client'
import { CodeErrors } from '@eap/runtime-client'
import { platformErrorCode } from '@eap/runtime-client'
import { errorMessage } from '../../lib/presentation'

/** Exact machine identity; translated messages are presentation only. */
export function applyFailureCode(error: unknown): string {
  return platformErrorCode(error)
}

export function applyFailureMessage(error: unknown, translate: (key: string) => string): string {
  const code = applyFailureCode(error)
  if (code === CodeErrors.FILE_CHANGED_SINCE_PROPOSAL) return translate('task.applyConflict')
  if (code === CodeErrors.CODE_GENERATION_CONTEXT_UNAVAILABLE)
    return translate('task.applyBaseline')
  if (code === CodeErrors.READ_ONLY_PROPOSAL) return translate('task.applyReadOnly')
  if (code === WorkspaceErrors.AUTHORIZED_ROOT_MISSING) return translate('task.applyNoRoot')
  return errorMessage(error)
}
