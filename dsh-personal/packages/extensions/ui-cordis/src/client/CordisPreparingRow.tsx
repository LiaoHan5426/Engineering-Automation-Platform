/** Argument-free Cordis tool prefix shared by its three card families. */
import { defineComponent, h, type VNodeChild } from 'vue'
import { DisclosureRow } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'

/* v8 ignore next -- Non-expandable rows never invoke DisclosureRow's required toggle callback. */
const noop = (): void => undefined

type CordisPreparingRowProps = Pick<ToolCallViewProps, 'toolName'> & PropsLocale<'cordis'> & {
  readonly icon: VNodeChild
  readonly title: string
  readonly className?: string | undefined
  readonly rowClassName?: string | undefined
  readonly titleClassName?: string | undefined
}

/**
 * Render a Cordis-owned prefix without disclosure.
 * @param props - Cordis prefix, styling, and locale.
 * @returns the preparation row.
 */
export const CordisPreparingRow = defineComponent((props: CordisPreparingRowProps) => () =>
  h('div', { 'data-tool': props.toolName, 'data-state': 'preparing', 'aria-label': props.t('a11y.preparing') }, [
    h(DisclosureRow, { icon: props.icon, title: props.title, className: props.className,
      rowClassName: props.rowClassName, titleClassName: props.titleClassName,
      open: false, expandable: false, onToggle: noop, running: true }),
  ]), { name: 'CordisPreparingRow', inheritAttrs: false,
  props: ['toolName', 't', 'icon', 'title', 'className', 'rowClassName', 'titleClassName'] })
