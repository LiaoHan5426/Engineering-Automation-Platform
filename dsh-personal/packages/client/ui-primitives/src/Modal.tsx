/** Body-teleported modal with document-owned focus and keyboard lifetime. */
import { defineComponent, h, shallowRef, Teleport } from 'vue'
import clsx from 'clsx'
import { IconCloseOutlineRegular, IconWarningOutlineRegular } from './icons/index.tsx'
import { useModalLayer } from './useModalLayer.ts'
import css from './Modal.module.css'

interface ModalBaseProps {
  open: boolean
  onClose: () => void
  title: string
  tone?: 'warning'
  description?: string
  className?: string
  contentClassName?: string
  shortcutModal?: string
  onKeyDownCapture?: (event: KeyboardEvent) => void
  backdropBlur?: boolean
}

type ModalProps = ModalBaseProps & (
  | { headless: true; closeLabel?: never }
  | { headless?: false; closeLabel: string }
)

/**
 * Render a centered modal using default content and an optional footer slot.
 * Escape belongs to a nested menu first. Mark initial focus with data-modal-autofocus.
 * Headless mode omits header/body chrome; closeLabel is required otherwise.
 * @param props - Visibility, localized labels, close command, styling and keyboard ownership.
 * @returns A native Vue component that teleports its overlay into the document body.
 */
export const Modal = defineComponent((props: ModalProps, { slots, attrs }) => {
  const dialog = shallowRef<HTMLDivElement | null>(null)
  useModalLayer(dialog, () => props.open, () => { props.onClose() })
  return () => {
    if (!props.open) return null
    const body = slots.default?.()
    const footer = slots.footer?.()
    return h(Teleport, { to: document.body }, h('div', {
      ...attrs, class: [css.root, attrs.class], role: 'presentation', onKeydownCapture: props.onKeyDownCapture,
    }, [
      h('div', { class: css.mask, style: props.backdropBlur === false ? { backdropFilter: 'none' } : undefined, 'aria-hidden': 'true', onClick: props.onClose }),
      h('div', {
        ref: dialog, tabindex: -1, 'data-shortcut-modal': props.shortcutModal,
        class: clsx(css.dialog, !props.headless && props.tone === 'warning' && css.warning, props.className),
        role: 'dialog', 'aria-modal': 'true', 'aria-label': props.title,
      }, props.headless ? body : [
        h('div', { class: clsx(css.content, props.contentClassName) }, [
          h('div', { class: css.header }, [
            h('h2', { class: css.title }, [props.tone === 'warning' && h(IconWarningOutlineRegular, { size: 18, className: clsx(css.warningIcon), 'aria-hidden': 'true' }), props.title]),
            h('button', { type: 'button', class: css.close, 'aria-label': props.closeLabel, onClick: props.onClose }, [h(IconCloseOutlineRegular, { size: 14 })]),
          ]),
          props.description !== undefined && props.description !== '' && h('p', { class: css.description }, props.description),
          body !== undefined && h('div', { class: css.body }, body),
        ]),
        footer !== undefined && h('div', { class: css.footer }, footer),
      ]),
    ]))
  }
}, { name: 'Modal', inheritAttrs: false, props: ['open', 'onClose', 'title', 'tone', 'description', 'className', 'contentClassName', 'shortcutModal', 'onKeyDownCapture', 'backdropBlur', 'headless', 'closeLabel'] })
