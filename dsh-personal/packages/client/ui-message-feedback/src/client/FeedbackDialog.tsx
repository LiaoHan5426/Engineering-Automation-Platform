/** Session-owned feedback dialog and acknowledgement/failure toasts. */
import { defineComponent, Fragment, h, onMounted, shallowRef, watch } from 'vue'
import { Button, IconWarningOutlineRegular, Modal, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FeedbackCategory } from '@deepseek-ai/dsh-command-feedback/types'
import type { FeedbackDialogProps } from './slots.ts'
import css from './FeedbackDialog.module.css'

/** Client taxonomy remains checked against the Host's type-only closed union. */
const CATEGORY_CHIPS = {
  'task-result': true,
  'instruction-following': true,
  'product-interaction': true,
  'service-stability': true,
  'resource-cost': true,
  'security-privacy-permission': true,
  'other': true,
} satisfies Record<FeedbackCategory, true>
const CATEGORIES = Object.keys(CATEGORY_CHIPS) as FeedbackCategory[]

/** Failure codes with dedicated copy; other failures use the generic message. */
const FAILURE_COPY: Partial<Record<string, 'error.conflict' | 'error.noteTooLarge'>> = {
  'version-conflict': 'error.conflict',
  'note-too-large': 'error.noteTooLarge',
}

/** Render the current dialog draft and retire toasts with their owning overlay. */
export const FeedbackDialog = defineComponent((props: FeedbackDialogProps) => {
  const state = props.useDialog(value => value)
  const probe = shallowRef<HTMLSpanElement | null>(null)
  const card = shallowRef<HTMLElement | null>(null)
  onMounted(() => { card.value = probe.value?.closest<HTMLElement>('[data-composer-card]') ?? null })
  watch([() => state.value.toast, () => props.dismissToast], ([toast, dismissToast], _previous, cleanup) => {
    cleanup(() => { dismissToast(toast) })
  }, { immediate: true, flush: 'post' })
  return () => {
    const current = state.value
    const failureCode = current.failure
    const failure = failureCode === null ? null : props.t(FAILURE_COPY[failureCode] ?? 'error.generic')
    return h(Fragment, null, [
      h('span', { ref: probe, hidden: true }),
      current.toast > 0 && failure === null ? h(Toast, {
        key: current.toast, text: props.t('toast.recorded'), tone: 'success', anchor: card.value,
        onDone: () => { props.dismissToast(current.toast) },
      }) : null,
      failure !== null ? h(Toast, {
        key: `failure-${failureCode}`, text: failure, icon: h(IconWarningOutlineRegular),
        anchor: card.value, holdMs: 6000, onDone: () => { props.dismissFailure() },
      }) : null,
      h(Modal, { open: current.target !== null, title: props.t('dialog.title'), closeLabel: props.t('close'),
        onClose: () => { props.dismiss() }, className: css.dialog ?? '',
      }, {
        footer: () => h(Button, { variant: 'primary', className: css.submit ?? '', disabled: current.submitting,
          onClick: () => { void props.submit() },
        }, { default: () => props.t(current.submitting ? 'submitting' : 'submit') }),
        default: () => [
          h('div', { class: css.categories, role: 'group', 'aria-label': props.t('dialog.categories') }, CATEGORIES.map(category =>
            h('button', { key: category, type: 'button', class: current.category === category ? `${css.chip} ${css.chipActive}` : css.chip,
              'aria-pressed': current.category === category, disabled: current.submitting,
              onClick: () => { props.edit({ category: current.category === category ? null : category }) },
            }, props.t(`category.${category}`)))),
          h('textarea', { class: css.detail, 'aria-label': props.t('dialog.detail'), placeholder: props.t('dialog.hint'),
            value: current.text, readonly: current.submitting,
            onInput: (event: Event) => { if (event.currentTarget instanceof HTMLTextAreaElement) props.edit({ text: event.currentTarget.value }) },
          }),
        ],
      }),
    ])
  }
}, { name: 'FeedbackDialog', inheritAttrs: false, props: ['useDialog', 'edit', 'submit', 'dismiss', 'dismissFailure', 'dismissToast', 't'] })
