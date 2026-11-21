import { defineComponent, h, type PropType, type VNode } from 'vue'
import type { Inline } from './markdown'

/**
 * Renders parsed inline nodes as real DOM elements.
 *
 * Model output is never treated as markup: every node becomes an element created by
 * `h()`, text is passed as a text child, and links only exist when `safeHref` already
 * accepted the protocol. There is no `v-html` anywhere on this path.
 */
const InlineNodes = defineComponent({
  name: 'EapInlineNodes',
  props: {
    nodes: { type: Array as PropType<Inline[]>, required: true },
  },
  setup(props) {
    const render = (nodes: Inline[]): VNode[] =>
      nodes.map((node, index) => {
        switch (node.type) {
          case 'code':
            return h('code', { key: index, class: 'eap-rich-text__code' }, node.value)
          case 'strong':
            return h('strong', { key: index }, render(node.children))
          case 'em':
            return h('em', { key: index }, render(node.children))
          case 'del':
            return h('del', { key: index }, render(node.children))
          case 'link':
            return h(
              'a',
              { key: index, href: node.href, target: '_blank', rel: 'noreferrer noopener' },
              render(node.children),
            )
          default:
            return h('span', { key: index }, node.value)
        }
      })

    return () => render(props.nodes)
  },
})

export default InlineNodes
