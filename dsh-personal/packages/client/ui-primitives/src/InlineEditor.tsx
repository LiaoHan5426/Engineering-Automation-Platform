/** Multi-line inline editor for short saved-on-Enter drafts such as queued messages and goals. */
import { defineComponent, h, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import clsx from 'clsx'
import css from './InlineEditor.module.css'

interface InlineEditorProps {
  value: string
  label: string
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
  className?: string
}

/** Autofocus a growing textarea; plain Enter saves, Shift+Enter inserts a line,
 * composition retains the draft, and Escape cancels.
 */
export const InlineEditor = defineComponent((props: InlineEditorProps) => {
  const textarea = shallowRef<HTMLTextAreaElement | null>(null)
  let observer: ResizeObserver | undefined
  const fit = (): void => {
    const node = textarea.value
    if (node === null) return
    node.style.height = 'auto'
    // scrollHeight excludes the border that the border-box height includes.
    node.style.height = `${node.scrollHeight + node.offsetHeight - node.clientHeight}px`
  }
  onMounted(() => {
    const node = textarea.value
    if (node === null) return
    node.focus()
    fit()
    // A width change rewraps text without changing the measured width.
    observer = new ResizeObserver(fit)
    observer.observe(node)
  })
  watch(() => props.value, fit, { flush: 'post' })
  onBeforeUnmount(() => { observer?.disconnect() })
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      props.onCancel()
      return
    }
    // keyCode 229 is the legacy composition signal some engines emit.
    const compositionEvent: { readonly keyCode: number } = event
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing || compositionEvent.keyCode === 229) return
    event.preventDefault()
    props.onSave()
  }
  return () => h('textarea', {
    ref: textarea,
    autofocus: true,
    rows: 1,
    class: clsx(css.editor, props.className),
    'aria-label': props.label,
    value: props.value,
    onInput: (event: Event) => {
      if (event.currentTarget instanceof HTMLTextAreaElement) props.onChange(event.currentTarget.value)
    },
    onKeydown,
  })
}, { name: 'InlineEditor', inheritAttrs: false, props: ['value', 'label', 'onChange', 'onSave', 'onCancel', 'className'] })
