/** Selectable command text with keyboard access while horizontally overflowing. */
import { defineComponent, h, shallowRef, watch } from 'vue'
import clsx from 'clsx'
import css from './CommandText.module.css'

/** Display text and owner-localized identification for a command scrollport. */
export interface CommandTextProps {
  /** Original command or formatted command arguments, without truncation. */
  text: string
  /** Accessible name while the text can scroll horizontally. */
  label: string
  /** Owner typography and positioning. */
  className?: string | undefined
}

/** A named, keyboard-focusable scrollport only while its command overflows. */
export const CommandText = defineComponent({
  name: 'CommandText',
  props: { text: { type: String, required: true }, label: { type: String, required: true }, className: String },
  setup(props) {
    const element = shallowRef<HTMLSpanElement | null>(null)
    const overflow = shallowRef(false)
    watch([element, () => props.text], ([el], _previous, onCleanup) => {
      if (el === null) return
      const measure = () => { overflow.value = el.scrollWidth > el.clientWidth }
      measure()
      const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
      observer?.observe(el)
      const fonts = 'fonts' in el.ownerDocument ? el.ownerDocument.fonts : undefined
      fonts?.addEventListener('loadingdone', measure)
      onCleanup(() => { observer?.disconnect(); fonts?.removeEventListener('loadingdone', measure) })
    }, { flush: 'post' })
    return () => h('span', { ref: element, class: clsx(css.text, props.className), 'data-command-text': '',
      tabindex: overflow.value ? 0 : undefined, role: overflow.value ? 'group' : undefined,
      'aria-label': overflow.value ? props.label : undefined }, props.text)
  },
})
