/** Stable header and content positions retain the navigator across preview states. */
import { defineComponent, h, type VNodeChild } from 'vue'
import type { PropsRenderFactories, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-files/client'
import type { ContextMenuTriggerProps } from '@deepseek-ai/dsh-client-ui-context-menu/client'
import { PathLabel } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './TextPreview.module.css'

/** The inputs both navigator Factory positions render from. */
type NavigatorSeatProps = Pick<PropsRuntime<'sidebar.right.pane.tab'>, 'useTabInfo'> & PropsRenderFactories

const NavigatorSeat = defineComponent((props: NavigatorSeatProps) => {
  const info = props.useTabInfo()
  const onOpen = (address: string): void => { info.value.tab.actions.openResource(address, { replaceTab: true }) }
  return () => props.renderFactorySlot('sidebar.files.navigator', { useTabInfo: props.useTabInfo, page: false, onOpen })
}, { name: 'DocumentNavigatorSeat', inheritAttrs: false, props: ['useTabInfo','renderFactorySlot'] })

const NavigatorToggleSeat = defineComponent((props: NavigatorSeatProps) =>
  () => props.renderFactorySlot('sidebar.files.navigator.toggle', { useTabInfo: props.useTabInfo }),
{ name: 'DocumentNavigatorToggleSeat', inheritAttrs: false, props: ['useTabInfo','renderFactorySlot'] })

/** Header and content nodes stay internal to this package. */
export type PreviewFrameProps = NavigatorSeatProps & {
  readonly path: string
  readonly pathTrigger: ContextMenuTriggerProps
  readonly banner?: VNodeChild
  readonly tools?: VNodeChild
  readonly handoff?: VNodeChild
  readonly children: VNodeChild
  readonly [attribute: `data-${string}`]: string | undefined
}

/**
 * @param props - header and content parts, navigator inputs and root data attributes.
 * @returns the preview root with stable Factory positions.
 */
export function PreviewFrame({
  path, pathTrigger, banner, tools, handoff, children, useTabInfo, renderFactorySlot, ...data
}: PreviewFrameProps): VNodeChild {
  return h('div', { class: css.preview, ...data }, [
    banner,
    h('div', { class: css.header }, [
      h(PathLabel, { path, className: css.path, 'data-textpreview-path': '', ...pathTrigger }),
      tools, h('div', { class: css.externalActions }, [handoff]), h(NavigatorToggleSeat, { useTabInfo, renderFactorySlot }),
    ]),
    h('div', { class: css.content, 'data-textpreview-content': '', 'data-files-navigator-row': '' }, [
      children, h(NavigatorSeat, { useTabInfo, renderFactorySlot }),
    ]),
  ])
}
