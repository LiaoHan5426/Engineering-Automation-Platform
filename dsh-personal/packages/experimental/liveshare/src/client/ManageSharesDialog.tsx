import { defineComponent, h, normalizeClass, onMounted, shallowRef, watch } from 'vue'

/** Global owner-side list of shares; each row opens that Session's share dialog. */
import { Button, Modal, RiskConfirmation } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { NS } from './locales.ts'
import type { OwnerShares } from './owner-shares.ts'
import type { OutgoingShare } from './share-types.ts'
import css from './ShareDialog.module.css'
/** Props for the global Liveshare share manager. */
export interface LiveshareManageSharesDialogProps extends PropsLocale<typeof NS> {
  /** Owner share management, addressed through the generated `liveshareShares` namespace. */
  readonly shares: OwnerShares
  /** Open the share dialog for one Session. */
  readonly onOpenShare?: (sessionId: string, sessionTitle: string) => void
  /** Close the manager. */
  readonly onClose: () => void
}
/**
 * List every share and open the one whose Session the owner wants to manage.
 * @param props - Owner shares, navigation callback, close callback, and copy.
 * @returns The manager modal.
 */
export const LiveshareManageSharesDialog = defineComponent(
  (componentProps: LiveshareManageSharesDialogProps) => {
    const shareListRef = shallowRef<readonly OutgoingShare[]>([])
    const setShareList = (
      value:
        | typeof shareListRef.value
        | ((previous: typeof shareListRef.value) => typeof shareListRef.value),
    ): void => {
      shareListRef.value = typeof value === 'function' ? value(shareListRef.value) : value
    }
    const loadedRef = shallowRef(false)
    const setLoaded = (
      value:
        | typeof loadedRef.value
        | ((previous: typeof loadedRef.value) => typeof loadedRef.value),
    ): void => {
      loadedRef.value = typeof value === 'function' ? value(loadedRef.value) : value
    }
    const errorRef = shallowRef('')
    const setError = (
      value: typeof errorRef.value | ((previous: typeof errorRef.value) => typeof errorRef.value),
    ): void => {
      errorRef.value = typeof value === 'function' ? value(errorRef.value) : value
    }
    const stopTargetRef = shallowRef<OutgoingShare>()
    const setStopTarget = (
      value:
        | typeof stopTargetRef.value
        | ((previous: typeof stopTargetRef.value) => typeof stopTargetRef.value),
    ): void => {
      stopTargetRef.value = typeof value === 'function' ? value(stopTargetRef.value) : value
    }
    const stopAcknowledgedRef = shallowRef(false)
    const setStopAcknowledged = (
      value:
        | typeof stopAcknowledgedRef.value
        | ((previous: typeof stopAcknowledgedRef.value) => typeof stopAcknowledgedRef.value),
    ): void => {
      stopAcknowledgedRef.value =
        typeof value === 'function' ? value(stopAcknowledgedRef.value) : value
    }
    const stoppingRef = shallowRef(false)
    const setStopping = (
      value:
        | typeof stoppingRef.value
        | ((previous: typeof stoppingRef.value) => typeof stoppingRef.value),
    ): void => {
      stoppingRef.value = typeof value === 'function' ? value(stoppingRef.value) : value
    }
    onMounted(() => {
      watch(
        () => [componentProps.shares, componentProps.t],
        (_values, _old, onCleanup) => {
          const dispose = (() => {
            let cancelled = false
            void componentProps.shares
              .list()
              .then((listed) => {
                if (cancelled) return
                if (!listed.ok) throw new Error('shares unavailable')
                setShareList(listed.value.shares)
                setLoaded(true)
              })
              .catch(() => {
                if (!cancelled) setError(componentProps.t('manage.unavailable'))
              })
            return () => {
              cancelled = true
            }
          })()
          if (typeof dispose === 'function') onCleanup(dispose)
        },
        { immediate: true, flush: 'post' },
      )
    })
    const stopShare = async (): Promise<void> => {
      const target = stopTargetRef.value
      /* v8 ignore next -- the confirmation is only rendered while a share is selected */
      if (target === undefined) return
      setStopping(true)
      setError('')
      try {
        const stopped = await componentProps.shares.stop({ shareId: target.shareId })
        // A Host whose share state another running process holds refuses the write; the share stays
        // listed, and the owner acts on it in the process holding the state.
        if (!stopped.ok) {
          setError(
            stopped.error.code === 'liveshareShares/owner-state-held'
              ? componentProps.t('dialog.ownerStateHeld')
              : componentProps.t('dialog.stopFailed'),
          )
          return
        }
        setShareList(current => current.filter(share => share.shareId !== target.shareId))
        setStopTarget(undefined)
        setStopAcknowledged(false)
      } catch {
        setError(componentProps.t('dialog.stopFailed'))
      } finally {
        setStopping(false)
      }
    }
    return () => {
      return h(
        Modal,
        {
          open: true,
          onClose: componentProps.onClose,
          title: componentProps.t('manage.title'),
          closeLabel: componentProps.t('manage.done'),
          className: normalizeClass(css.modal),
        },
        {
          footer: () =>
            h(
              Button,
              { variant: 'primary', onClick: componentProps.onClose },
              {
                default: () => componentProps.t('manage.done'),
              },
            ),
          default: () => [
            h('div', { class: css.form }, [
              h('p', { class: css.description }, [componentProps.t('manage.description')]),
              !loadedRef.value && errorRef.value === ''
                ? h('p', { class: css.noRequests }, [componentProps.t('manage.loading')])
                : null,
              loadedRef.value &&
              shareListRef.value.length ===
                /** Props for the global Liveshare share manager. */
                0
                ? h('p', { class: css.noRequests }, [componentProps.t('manage.empty')])
                : null,
              shareListRef.value.length === 0
                ? null
                : /** Owner share management, addressed through the generated `liveshareShares` namespace. */ h(
                  'ul',
                  { class: css.outgoingList },
                  [
                    shareListRef.value.map((share) => {
                      const primary =
                        share.sessionIds /** Open the share dialog for one Session. */?.[0] ??
                          share.sessionId ??
                          ''
                      const open =
                        primary === '' || componentProps.onOpenShare === undefined
                          ? undefined
                          : () => {
                            componentProps.onOpenShare?.(primary, share.sessionTitle)
                          }
                      return h('li', { key: share.shareId, class: css.outgoingItem }, [
                        h('div', { class: css.managerRow }, [
                          h('strong', { title: share.sessionTitle }, [share.sessionTitle]),
                          h('span', { class: share.online ? css.online : css.offline }, [
                            componentProps.t(
                              share.online ? 'dialog.share.online' : 'dialog.share.offline',
                            ),
                          ]),
                          h('div', { class: css.managerActions }, [
                            h(
                              Button,
                              {
                                variant: 'outline',
                                size: 'sm',
                                disabled: open === undefined,
                                onClick: open,
                              },
                              {
                                default: () => componentProps.t('manage.open'),
                              },
                            ),
                            h(
                              Button,
                              {
                                variant: 'ghost',
                                size: 'sm',
                                onClick: () => {
                                  setStopTarget(share)
                                  setStopAcknowledged(false)
                                },
                              },
                              {
                                default: () => componentProps.t('manage.cancelShare'),
                              },
                            ),
                          ]),
                        ]),
                      ])
                    }),
                  ],
                ),
              errorRef.value === ''
                ? null
                : h('div', { class: css.error, role: 'alert' }, [errorRef.value]),
            ]),
            h(RiskConfirmation, {
              open: stopTargetRef.value !== undefined,
              title: componentProps.t('manage.stop.title'),
              description: componentProps.t('manage.stop.description'),
              acknowledgeLabel: componentProps.t('manage.stop.acknowledge'),
              cancelLabel: componentProps.t('dialog.cancel'),
              closeLabel: componentProps.t('manage.done'),
              confirmLabel: componentProps.t('dialog.stop'),
              acknowledged: stopAcknowledgedRef.value,
              disabled: stoppingRef.value,
              onAcknowledgedChange: setStopAcknowledged,
              onCancel: () => {
                setStopAcknowledged(false)
                setStopTarget(undefined)
              },
              onConfirm: () => {
                void stopShare()
              },
            }),
          ],
        },
      )
    }
  },
  { inheritAttrs: false, props: ['shares', 'onOpenShare', 'onClose', 't'] },
)
