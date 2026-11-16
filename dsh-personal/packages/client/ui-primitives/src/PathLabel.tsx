/** A single-line file path whose trailing characters remain visible in narrow toolbars. */
import { defineComponent, h, onBeforeUnmount, onMounted, shallowRef, watch, type HTMLAttributes } from 'vue'
import clsx from 'clsx'
import { pathPartsOf } from '@deepseek-ai/dsh-util-workspace-path'
import css from './PathLabel.module.css'

/** Keep directory/name styling and measure clipping after path and size changes. */
export const PathLabel = defineComponent((props: {
  path: string
  className?: string | undefined
} & Omit<HTMLAttributes, 'children' | 'title'>, { attrs }) => {
  const outer = shallowRef<HTMLSpanElement | null>(null)
  const inner = shallowRef<HTMLSpanElement | null>(null)
  let observer: ResizeObserver | undefined
  const apply = (): void => {
    if (outer.value !== null && inner.value !== null) outer.value.toggleAttribute('data-path-clipped', inner.value.offsetWidth > outer.value.clientWidth)
  }
  onMounted(() => {
    apply()
    if (typeof ResizeObserver === 'undefined') return
    observer = new ResizeObserver(apply)
    if (outer.value !== null) observer.observe(outer.value)
    if (inner.value !== null) observer.observe(inner.value)
  })
  watch(() => props.path, apply, { flush: 'post' })
  onBeforeUnmount(() => { observer?.disconnect() })
  return () => {
    const { directory, name } = pathPartsOf(props.path)
    return h('span', { ...attrs, ref: outer, class: clsx(css.path, props.className, attrs.class), title: props.path, 'data-path-label': true }, [
      h('span', { ref: inner, class: css.text }, [directory !== '' ? h('span', { class: css.directory }, directory) : null, h('span', { class: css.name }, name)]),
    ])
  }
}, { name: 'PathLabel', inheritAttrs: false, props: ['path', 'className'] })
