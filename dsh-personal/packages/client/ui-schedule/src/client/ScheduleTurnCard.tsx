import { h, defineComponent, computed, watch } from 'vue'
import type { ToolResultNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ScheduleCatalogEntry, ScheduleId } from '@deepseek-ai/dsh-schedule/client'
import type { CatalogInjected } from './catalog-source.ts'
import {
  ScheduleCreateCard,
  type ScheduleCreateCardInput,
  type ScheduleCreateCardProps,
} from './ScheduleCreateCard.tsx'
import { scheduleCreateCardModel } from './schedule-create-card.ts'
import { SCHEDULE_CREATE_TOOL, selectScheduleTasks } from './schedule-turn.ts'
import css from './ScheduleTurnCard.module.css'
/** Task navigation the turn row receives from its list registration. */
export interface ScheduleTurnCardInjected extends Pick<
  CatalogInjected<ScheduleCatalogEntry>,
  'hooks' | 'onRetry'
> {
  /**
   * Show one created task's detail in the right Sidebar.
   * @param id - Task created by this Turn.
   */
  readonly openTaskDetail: (id: ScheduleId) => void
}
/** Props of the created-task row of one Turn tail. */
export type ScheduleTurnCardProps = PropsRuntime<'conversation.chat.turnTail'> &
  InjectFace<ScheduleTurnCardInjected> &
  PropsLocale<'schedule.manager'>
/**
 * Props of one card rendered from the Turn tail.
 *
 * The keyed Tool seat also carries the owner's file opener, image loader, and
 * workspace facts; this card reads none of them, and the Turn tail supplies
 * only the fields it does.
 * @param block - settled result node recorded against the Turn.
 * @param openTaskDetail - right-Sidebar navigation for the created task.
 * @param t - the active locale's copy.
 * @returns the composed props of one `ScheduleCreateCard`.
 */
function cardProps(
  block: ToolResultNode,
  openTaskDetail: ScheduleTurnCardInjected['openTaskDetail'],
  t: ScheduleCreateCardProps['t'],
  currentTask: ScheduleCatalogEntry | null | undefined,
): ScheduleCreateCardInput {
  const supplied: ScheduleCreateCardInput = {
    callId: block.callId,
    toolName: SCHEDULE_CREATE_TOOL,
    block,
    openTaskDetail,
    t,
    ...(currentTask === undefined ? {} : { currentTask }),
  }
  return supplied
}
interface CurrentScheduleCardsProps {
  readonly created: readonly ToolResultNode[]
  readonly openTaskDetail: ScheduleTurnCardInjected['openTaskDetail']
  readonly t: ScheduleCreateCardProps['t']
  readonly useCatalog: ScheduleTurnCardProps['useCatalog']
  readonly onRetry: ScheduleTurnCardInjected['onRetry']
}
const CurrentScheduleCards = defineComponent(
  (props: CurrentScheduleCardsProps) => {
    const catalog = props.useCatalog(snapshot => snapshot)
    const requestAtMount = catalog.value.readRequest
    // The mount ordinal goes with the request: the source shares an in-flight read
    // only when that read was requested after this tail appeared, so a read sent
    // before it cannot answer for it.
    watch(
      [() => props.onRetry, () => requestAtMount],
      (_value, _previous) => {
        (() => {
          void props.onRetry(requestAtMount)
        })()

      },
      { immediate: true, flush: 'post' },
    )
    const records = computed(() =>
      catalog.value.settled && catalog.value.readSettled > requestAtMount
        ? catalog.value.records
        : undefined,
    )
    return () => {
      return props.created.map((block) => {
        const task = scheduleCreateCardModel(block, SCHEDULE_CREATE_TOOL).task
        const current =
          task === undefined || records.value === undefined
            ? undefined
            : (records.value.find(record => record.id === task.id) ?? null)
        return h(ScheduleCreateCard, {
          key: block.callId,
          ...cardProps(block, props.openTaskDetail, props.t, current),
        })
      })
    }
  },
  { props: ['created', 'openTaskDetail', 't', 'useCatalog', 'onRetry'] },
)
/**
 * Render the tasks one Turn created as standalone cards beneath its closing
 * prose.
 *
 * The Turn tail is a list seat independent of the Turn's process disclosure,
 * so the cards stay visible while the Tool group is collapsed. Every list entry
 * renders for every Turn, so this one narrows its own Turn here.
 * @param props - closing Turn owner currency, turn-tail navigation, and copy.
 * @returns one created-task card per settled `schedule_create` result, or null when the Turn created none.
 */
export const ScheduleTurnCard = defineComponent(
  (props: ScheduleTurnCardProps) => {
    const matched = computed(() => selectScheduleTasks(props))
    return () => {
      if (matched.value === null) return null
      return h('div', { class: css.list }, [
        h(CurrentScheduleCards, {
          created: matched.value.created,
          openTaskDetail: props.openTaskDetail,
          t: props.t,
          useCatalog: props.useCatalog,
          onRetry: props.onRetry,
        }),
      ])
    }
  },
  {
    props: [
      'turn',
      'seq',
      'openFile',
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
      'onRetry',
      'openTaskDetail',
      'useCatalog',
      't',
    ],
  },
)
