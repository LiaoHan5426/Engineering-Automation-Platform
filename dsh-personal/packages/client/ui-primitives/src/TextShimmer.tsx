/** Text activity animation shared by a row and its nested text fragments. */
import { cloneVNode, defineComponent, h, inject, isVNode, provide, Text, type InjectionKey, type Slot, type VNode, type VNodeChild } from 'vue'
import clsx from 'clsx'
import css from './TextShimmer.module.css'

const DecorativeCopy: InjectionKey<boolean> = Symbol('DecorativeCopy')

/** Activity and styling; default-slot content contains presentation without effects or element ids. */
export interface TextShimmerProps {
  readonly active?: boolean | undefined
  readonly className?: string | undefined
  readonly contentClassName?: string | undefined
}

function plainText(nodes: VNode[] | undefined): string | undefined {
  return nodes?.length === 1 && nodes[0]?.type === Text && typeof nodes[0].children === 'string'
    ? nodes[0].children : undefined
}

const TextContent = defineComponent({
  props: { className: String },
  setup(props, { slots }) {
    const decorative = inject(DecorativeCopy, undefined)
    return () => {
      const content = slots.default?.()
      const text = decorative === true ? plainText(content) : undefined
      return h('span', { class: clsx(css.text, props.className), 'data-shimmer-text': text }, text === undefined ? content : undefined)
    }
  },
})

/** Each visual copy owns its vnodes, including content supplied through component slots. */
function copyContent(content: VNode): VNode
function copyContent(content: VNodeChild): VNodeChild
function copyContent(content: VNodeChild): VNodeChild {
  if (Array.isArray(content)) return content.map(copyContent)
  if (!isVNode(content)) return content
  const copy = cloneVNode(content)
  if (Array.isArray(content.children)) copy.children = content.children.map(copyContent)
  else if (content.children !== null && typeof content.children === 'object') {
    const childSlots = content.children
    const renderDefault = childSlots.default
    if (typeof renderDefault === 'function') {
      const defaultSlot = renderDefault as Slot
      copy.children = { ...childSlots, default: () => copyContent(defaultSlot()) }
    }
  }
  return copy
}

const CopyContent = defineComponent({
  props: { decorative: Boolean, className: String },
  setup(props, { slots }) {
    provide(DecorativeCopy, props.decorative)
    return () => {
      const content = slots.default?.().map(node => copyContent(node))
      return h('span', { class: props.className }, plainText(content) === undefined ? content : [h(TextContent, {}, { default: () => content })])
    }
  },
})

/** Render selectable text with an optional inert highlight; nested instances inherit the containing animation. */
export const TextShimmer = defineComponent({
  name: 'TextShimmer',
  props: { active: Boolean, className: String, contentClassName: String },
  setup(props, { slots }) {
    const decorative = inject(DecorativeCopy, undefined)
    return () => {
      if (decorative !== undefined) return h(TextContent, { className: props.className ?? '' }, slots)
      return h('span', { class: clsx(css.root, props.className), 'data-shimmer': props.active || undefined }, [
        h(CopyContent, { className: clsx(css.content, props.contentClassName) }, slots),
        props.active && h('span', { class: css.decoration, 'aria-hidden': 'true', inert: '' }, [
          h('span', { class: css.sweep }, [h(CopyContent, { decorative: true, className: clsx(css.content, css.highlight, props.contentClassName) }, slots)]),
        ]),
      ])
    }
  },
})
