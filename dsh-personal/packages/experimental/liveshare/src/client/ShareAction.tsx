import { Fragment, computed, defineComponent, h, onMounted, shallowRef, watch } from 'vue'

/** Session-header action that opens the Liveshare owner-side share dialog. */
import { IconShareOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { LiveshareManageSharesDialog } from './ManageSharesDialog.tsx'
import { openManagedSession, rememberManagedShare, takeManagedShare } from './share-navigation.ts'
import { LiveshareShareDialog } from './ShareDialog.tsx'
import type { NS } from './locales.ts'
import type { OwnerShares } from './owner-shares.ts'
import css from './ShareAction.module.css'
/** Business face the header action receives: the owner's share-management Remote. */
export interface LiveshareShareActionInjected {
  /** Owner share management, addressed through the generated `liveshareShares` namespace. */
  readonly shares: OwnerShares
}
/** Full props for the Liveshare Session-header utility. */
export type LiveshareShareActionProps = PropsRuntime<'conversation.session.header.utilities'> &
  InjectFace<LiveshareShareActionInjected> &
  PropsLocale<typeof NS>
/**
 * Render the Session Header Share action and its dialog for a local owner.
 * @param props - Session runtime plus localized copy.
 * @returns the header action and optional dialog.
 */
export const LiveshareShareAction = defineComponent(
  (componentProps: LiveshareShareActionProps) => {
    const viewRef = shallowRef<'closed' | 'share' | 'manage'>('closed')
    const setView = (
      value: typeof viewRef.value | ((previous: typeof viewRef.value) => typeof viewRef.value),
    ): void => {
      viewRef.value = typeof value === 'function' ? value(viewRef.value) : value
    }
    const managedShareRef = shallowRef<{
      readonly sessionId: SessionId
      readonly sessionTitle: string
    }>()
    const setManagedShare = (
      value:
        | typeof managedShareRef.value
        | ((previous: typeof managedShareRef.value) => typeof managedShareRef.value),
    ): void => {
      managedShareRef.value = typeof value === 'function' ? value(managedShareRef.value) : value
    }
    const defaultRelayRef = shallowRef('')
    const setDefaultRelay = (
      value:
        | typeof defaultRelayRef.value
        | ((previous: typeof defaultRelayRef.value) => typeof defaultRelayRef.value),
    ): void => {
      defaultRelayRef.value = typeof value === 'function' ? value(defaultRelayRef.value) : value
    }
    const displayTitle = componentProps.useSessions(
      state => state.byId[componentProps.sessionId]?.displayTitle,
    )
    const sessionTitleRef = computed(() => displayTitle.value ?? componentProps.sessionId)
    onMounted(() => {
      watch(
        () => [componentProps.sessionId],
        () => {
          if (takeManagedShare(componentProps.sessionId)) setView('share')
        },
        { immediate: true, flush: 'post' },
      )
    })
    onMounted(() => {
      watch(
        () => [defaultRelayRef.value, viewRef.value, componentProps.shares],
        (_values, _old, onCleanup) => {
          const dispose = (() => {
            if (viewRef.value === 'closed' || defaultRelayRef.value !== '') return
            let cancelled = false
            void componentProps.shares
              .relay()
              .then((result) => {
                if (cancelled || !result.ok) return
                // No saved address is a valid answer: the dialog opens with an empty field that says so.
                setDefaultRelay(result.value.effective ?? '')
              })
              .catch(() => {})
            return () => {
              cancelled = true
            }
          })()
          if (typeof dispose === 'function') onCleanup(dispose)
        },
        { immediate: true, flush: 'post' },
      )
    })
    return () => {
      return h(Fragment, null, [
        h(
          'button',
          {
            type: 'button',
            class: css.trigger,
            'aria-label': componentProps.t('header.action'),
            onClick: () => {
              setManagedShare(undefined)
              setView('share')
            },
          },
          [
            h('span', null, [componentProps.t('header.action')]),
            h(IconShareOutlineRegular, { size: 12 }),
          ],
        ),
        viewRef.value === 'share' &&
          h(LiveshareShareDialog, {
            sessionId: managedShareRef.value?.sessionId ?? componentProps.sessionId,
            sessionTitle: managedShareRef.value?.sessionTitle ?? sessionTitleRef.value,
            defaultRelay: defaultRelayRef.value,
            shares: componentProps.shares,
            onManage: () => {
              setView('manage')
            },
            onClose: () => {
              setManagedShare(undefined)
              setView('closed')
            },
            t: componentProps.t,
          }),
        viewRef.value === 'manage' &&
          h(LiveshareManageSharesDialog, {
            shares: componentProps.shares,
            onOpenShare: (target, title) => {
              const selected = { sessionId: target as SessionId, sessionTitle: title }
              if (target !== componentProps.sessionId) {
                rememberManagedShare(target)
                openManagedSession(target)
              }
              setManagedShare(selected)
              setView('share')
            },
            onClose: () => {
              setView('closed')
            },
            t: componentProps.t,
          }),
      ])
    }
  },
  { inheritAttrs: false, props: ['sessionId', 'useSessions', 'shares', 't'] },
)
