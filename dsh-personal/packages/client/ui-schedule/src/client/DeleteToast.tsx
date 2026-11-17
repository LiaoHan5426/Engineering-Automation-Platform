import { h, defineComponent } from 'vue'
import { IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import type { CatalogDeleteOutcome } from './catalog-source.ts'
import type { ClearEndedOutcome } from './clear-ended.ts'
/** One reported outcome; `seq` keys the banner so a re-show restarts it. */
export type DeleteToastState =
  | {
    readonly kind: 'deleted' | 'deleteFailed'
    readonly seq: number
  }
  | {
    readonly kind: 'cleared'
    readonly count: number
    readonly seq: number
  }
  | {
    readonly kind: 'clearFailed'
    readonly seq: number
  }
/** Store the deletion wiring reports into and the overlay entry reads. */
export interface DeleteToastSource {
  /** Current notice for the overlay entry, or null while none shows. */
  readonly hooks: {
    readonly toast: HostObservable<DeleteToastState | null>
  }
  /**
   * Show the notice of one settled deletion; 'pending' raises nothing because
   * the deletion already in flight reports its own outcome.
   * @param outcome - resolution of `CatalogInjected.onDelete`.
   */
  readonly report: (outcome: CatalogDeleteOutcome) => void
  /**
   * Show the notice of one settled bulk removal.
   * @param outcome - resolution of the management page's bulk removal callback.
   */
  readonly reportClear: (outcome: ClearEndedOutcome) => void
  /** Clear the shown notice. */
  readonly dismiss: () => void
}
/**
 * Create the one deletion-outcome store the overlay entry shows.
 * @returns the observable notice with its report and dismiss actions.
 */
export function createDeleteToastSource(): DeleteToastSource {
  let state: DeleteToastState | null = null
  let seq = 0
  const listeners = new Set<() => void>()
  const publish = (next: DeleteToastState | null): void => {
    state = next
    for (const listener of listeners) listener()
  }
  return {
    hooks: {
      toast: {
        getSnapshot: () => state,
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
      },
    },
    report: (outcome) => {
      if (outcome === 'pending') return
      publish({ kind: outcome === 'deleted' ? 'deleted' : 'deleteFailed', seq: ++seq })
    },
    reportClear: (outcome) => {
      publish(
        outcome.cleared
          ? { kind: 'cleared', count: outcome.count, seq: ++seq }
          : { kind: 'clearFailed', seq: ++seq },
      )
    },
    dismiss: () => {
      publish(null)
    },
  }
}
/** Props of the `shell.overlay` entry: the notice store and localized copy. */
export type ScheduleDeleteToastProps = PropsRuntime<'shell.overlay'> &
  PropsLocale<'schedule.manager'> &
  InjectFace<Omit<DeleteToastSource, 'report' | 'reportClear'>>
/**
 * Render the current deletion notice: a success banner for a confirmed deletion
 * or settled bulk removal, a warning for one that could not be confirmed, or
 * nothing.
 * @param props - the notice hook, its dismissal, and the locale seat.
 * @returns the banner on display, or null.
 */
export const ScheduleDeleteToast = defineComponent(
  (props: ScheduleDeleteToastProps) => {
    const toast = props.useToast(current => current)
    return () => {
      const current = toast.value
      if (current === null) return null
      const key = `schedule-delete-${String(current.seq)}`
      switch (current.kind) {
        case 'deleted':
          return h(Toast, {
            key: key,
            text: props.t('toast.deleted'),
            tone: 'success',
            onDone: props.dismiss,
          })
        case 'deleteFailed':
          return h(Toast, {
            key: key,
            text: props.t('toast.deleteFailed'),
            icon: h(IconWarningOutlineRegular, {}),
            onDone: props.dismiss,
          })
        case 'cleared':
          // A removal that found nothing states that instead of a zero count, and
          // without the success tone: the ended rows can leave between the
          // confirmation and the request.
          return current.count === 0
            ? h(Toast, { key: key, text: props.t('toast.clearedNone'), onDone: props.dismiss })
            : h(Toast, {
              key: key,
              text: props.t(current.count === 1 ? 'toast.cleared.one' : 'toast.cleared.other', {
                count: current.count,
              }),
              tone: 'success',
              onDone: props.dismiss,
            })
        case 'clearFailed':
          return h(Toast, {
            key: key,
            text: props.t('toast.clearFailed'),
            icon: h(IconWarningOutlineRegular, {}),
            onDone: props.dismiss,
          })
        /* v8 ignore next -- the store publishes only the union's members, so the default holds no reachable statement. */
        default:
          return assertNever(current)
      }
    }
  },
  {
    props: [
      'useRemoteAccess',
      'useSessions',
      'useSessionRetainInfo',
      'useSessionAccess',
      'usePanelInfo',
      'useContextMenu',
      'useWorkspaces',
      'dismiss',
      'useToast',
      't',
    ],
  },
)
