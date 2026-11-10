import { i18n } from '../../src/lib/i18n'
import { modelApi } from '../../src/features/chat/chatService'
import { errorMessage } from '../../src/lib/presentation'
import { platformErrorCode, type RuntimeLanguage } from '@eap/runtime-client/contracts'

/** Browser-only test entry, resolved by Vite using ordinary same-package imports. */
export async function probeLanguageErrors(language: RuntimeLanguage, conversationId: string) {
  i18n.global.locale.value = language
  await modelApi.aiStatus()
  const inspect = async (action: () => Promise<unknown>) => {
    try {
      await action()
    } catch (error) {
      return {
        code: platformErrorCode(error),
        status: (error as { response?: { status?: number } }).response?.status,
        detail: errorMessage(error),
      }
    }
    throw new Error('Expected the expired test conversation to be refused')
  }
  return {
    axiosProblem: await inspect(() => modelApi.aiConversation(conversationId)),
    sseProblem: await inspect(() =>
      modelApi.sendAiMessage(conversationId, 'Expired session must never reach provider', 'none'),
    ),
    expectedClosed: i18n.global.t('toolExecution.CLOSED_UNKNOWN'),
    expectedStore: i18n.global.t('toolExecution.storeUnavailable'),
  }
}

// Installed only when this test entry is explicitly loaded by the browser harness.
Object.assign(window, { __eapStatusI18nProbe: probeLanguageErrors })
