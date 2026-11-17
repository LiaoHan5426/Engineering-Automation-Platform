/** Render native Vue decorators into Lexical hosts, retaining each NodeKey's identity. */
import { defineComponent, h, shallowRef, Teleport, watchEffect, type VNode } from 'vue'
import type { LexicalEditor, NodeKey } from 'lexical'

/** Portal-loop props. */
export interface DecoratorPortalsProps {
  /** The bound editor; null (no-session) renders nothing. */
  readonly editor: LexicalEditor | null
}

/** Native decorator loop; subscriptions and teleports leave with the editor binding. */
export const DecoratorPortals = defineComponent(
  (props: DecoratorPortalsProps) => {
    const decorators = shallowRef<Record<NodeKey, VNode>>({})
    watchEffect((onCleanup) => {
      const editor = props.editor
      if (editor === null) {
        decorators.value = {}
        return
      }
      let active = true
      decorators.value = editor.getDecorators<VNode>()
      const off = editor.registerDecoratorListener<VNode>((next) => {
        if (active) decorators.value = next
      })
      decorators.value = editor.getDecorators<VNode>()
      onCleanup(() => {
        active = false
        off()
      })
    })
    return () =>
      props.editor === null
        ? null
        : Object.entries(decorators.value).map(([key, node]) => {
          const target = props.editor?.getElementByKey(key)
          return target == null ? null : h(Teleport, { to: target, key }, [node])
        })
  },
  { props: ['editor'], inheritAttrs: false },
)
