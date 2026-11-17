/** Quote action rendered through the Chat text-interaction Slot. */
import { defineComponent, h, watchEffect } from 'vue'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './QuoteSelection.module.css'

/** Render an admitted selection while its Session permits writing. */
export const QuoteSelectionAction = defineComponent((props:
PropsRuntime<'conversation.chat.text-interaction'> & PropsLocale<'messageQuotes'>) => {
  const enabled = props.useSession(s => !s.removed && (s.subagent === null
    || s.subagent.address.mode === 'continuable'))
  watchEffect(() => { if (!enabled.value) props.dismiss() }, { flush: 'post' })
  return () => enabled.value ? h('button', {
    type: 'button', class: css.action, 'aria-label': props.t('quote.add'),
    onPointerdown: (event: PointerEvent) => { event.preventDefault() },
    onClick: () => {
      const text = props.readText()
      if (text === null) { props.dismiss(); return }
      if (!props.inputActions.insertQuote(text)) return
      props.clearSelection()
      props.dismiss()
    },
  }, props.t('quote.add')) : null
}, { name: 'QuoteSelectionAction', inheritAttrs: false, props: ['dismiss', 'readText', 'clearSelection', 'inputActions', 'useSession', 't'] })
