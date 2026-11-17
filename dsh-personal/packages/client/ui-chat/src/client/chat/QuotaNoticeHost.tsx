import { defineComponent, Fragment, h } from 'vue'
import { IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { QuotaNoticeHostProps, QuotaNoticeOwnerProps } from '../contract/slots.ts'
/**
 * @param props - the live notice, its dismissal, the chain outlet, and the locale seat.
 * @returns the notice on display, or null while none is live.
 */
export const QuotaNoticeHost = defineComponent((props: QuotaNoticeHostProps) => {
  const notice = props.useNotice(current => current)
  return () => {
    const { dismissNotice, keepNoticeOpen, renderSlotChain, t } = props
    if (notice.value === null)
      return null
    const owner: QuotaNoticeOwnerProps = {
      code: notice.value.code, message: t('message.failure.quota'), dismiss: dismissNotice, keepOpen: keepNoticeOpen,
    }
    return (h(Fragment, { 'key': `quota-notice-${String(notice.value.seq)}` }, [
      renderSlotChain('shell.quota-notice', owner, {
        fallback: h(Toast, { 'text': owner.message, 'icon': h(IconWarningOutlineRegular, { 'size': 18 }), 'onDone': dismissNotice }),
      }),
    ]))
  }
}, { name: 'QuotaNoticeHost', inheritAttrs: false, props: ['useNotice', 'dismissNotice', 'keepNoticeOpen', 'renderSlotChain', 't'] })
