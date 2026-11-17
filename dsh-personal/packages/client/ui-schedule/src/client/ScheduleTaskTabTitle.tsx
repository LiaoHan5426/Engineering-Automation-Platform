import clsx from 'clsx'
import { h, Fragment, defineComponent, computed } from 'vue'
import { IconClockOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { taskName } from './schedule-format.ts'
import type {
  ScheduleTaskBindingInjected,
  ScheduleTaskCatalogInjected,
} from './ScheduleTaskTab.tsx'
import { useTaskTabTarget } from './task-tab-target.ts'
import css from './TaskManagerPage.module.css'
/** Props of the task tab's chip: the tab it names and the catalog row it reads. */
export type ScheduleTaskTabTitleProps = PropsRuntime<'sidebar.right.pane.tab.title'> &
  PropsLocale<'schedule.manager'> &
  InjectFace<ScheduleTaskCatalogInjected & ScheduleTaskBindingInjected>
/**
 * Render the clock glyph and the named task's stored title as the chip text.
 * @param props - tab information, the Host task catalog, the tab bindings, and localized copy.
 * @returns the clock glyph followed by the task's stored title, or the detail label without a catalog row.
 */
export const ScheduleTaskTabTitle = defineComponent(
  (props: ScheduleTaskTabTitleProps) => {
    const _projection0 = props.useTabInfo()
    const tab = computed(() => _projection0.value.tab)
    const _projection1 = useTaskTabTarget(
      () => props.sessionId,
      () => tab.value,
      () => props.taskBindings,
    )
    const params = computed(() => _projection1.value.params)
    const records = props.useCatalog(snapshot => snapshot.records)
    const record = computed(() => {
      const target = params.value
      return target === undefined ? undefined : records.value.find(item => item.id === target.id)
    })
    return () => {
      return h(Fragment, {}, [
        h(IconClockOutlineRegular, { size: 16, className: clsx(css.tabTitleIcon) }),
        record.value === undefined ? props.t('detail.label') : taskName(record.value),
      ])
    }
  },
  {
    props: [
      'useTabInfo',
      'useSession',
      'sessionId',
      'useProjection',
      'useAccess',
      'useConversation',
      'useInput',
      'inputActions',
      'useChat',
      'useRemoteAccess',
      'useSessions',
      'useSessionRetainInfo',
      'useSessionAccess',
      'usePanelInfo',
      'useContextMenu',
      'useWorkspaces',
      'taskBindings',
      'useCatalog',
      't',
    ],
  },
)
