import { defineComponent, h, Fragment } from 'vue'
/** Chip title of a changes tab: the changes icon and the view's name in the current language. */
import { IconFilesDiffOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { changesTitle, parseChangesAddress } from './changes-address.ts'
import type { NS } from './locales.ts'
import css from './Forge.module.css'
/** Props of the changes tab title. */
export type ChangesTabTitleProps = Pick<
  PropsRuntime<'sidebar.right.pane.tab.title'>,
  'useTabInfo'
> &
  PropsLocale<typeof NS>
/**
 * Render the chip title of a changes tab; an address this package did not mint keeps the captured title.
 * @param props - tab information and forge panel copy.
 * @returns the icon followed by the title.
 */
export const ChangesTabTitle = defineComponent(
  (props: ChangesTabTitleProps) => {
    const tabInfo = props.useTabInfo()
    return () => {
      const { tab } = tabInfo.value
      const target = parseChangesAddress(tab.contentId)
      return h(Fragment, null, [
        h('span', { class: css.titleIcon }, [h(IconFilesDiffOutlineRegular, { size: 16 })]),
        h('span', { class: css.titleText }, [
          target === undefined ? tab.title : changesTitle(target.source, props.t),
        ]),
      ])
    }
  },
  { props: ['useTabInfo', 't'] },
)
