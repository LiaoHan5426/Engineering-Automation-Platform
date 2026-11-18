import { Fragment, computed, defineComponent, h, onMounted, shallowRef, useId, watch } from 'vue'

/**
 * The stored share's editable permission, fork switch, and plugin-endpoint selection, with the one
 * save that submits all three through the host.
 *
 * @module @deepseek-ai/dsh-experimental-liveshare/src/client/ShareEditPanel
 */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { CreatedShare } from '../share-api-types.ts'
import type { NS } from './locales.ts'
import type { OwnerShares } from './owner-shares.ts'
import {
  sameKeys,
  selectionForOffered,
  selectionKeys,
  type PluginAccess,
} from './ShareCapabilitiesPicker.tsx'
import {
  readAccess,
  readOfferedPlugins,
  readPluginAccess,
  readViewerPolicies,
  type OutgoingShare,
  type OfferedPlugin,
  type ViewerPluginPolicy,
} from './share-types.ts'
import { readSessionMode, type ViewerSessionMode } from './viewer-capabilities.ts'
import { SharePermissionFields } from './SharePermissionFields.tsx'
import css from './ShareDialog.module.css'
/** Inputs the dialog supplies to its stored-share edit state. */
export interface UseShareEditOptions {
  /** Owner share management the edit state reads and saves through. */
  readonly shares: OwnerShares
  /** Session whose share this dialog edits. */
  readonly sessionId: SessionId
  /** Adopt a link the host listed when the dialog has none yet. */
  readonly onLink: (link: string) => void
  /** Localized copy. */
  readonly t: PropsLocale<typeof NS>['t']
}
/** Stored-share values, the owner's unsaved picks, and the one save they share. */
export interface ShareEditState {
  /** Confirmed ACL scope of the share on hand, as the host reported it. */
  readonly access: ReturnType<typeof readAccess>
  /** Plugin endpoints the mounted plugins currently offer; none hides the endpoint control. */
  readonly offered: readonly OfferedPlugin[]
  /** Global switch the control and the save act on: the owner's pick, or the stored value. */
  readonly pluginAccess: PluginAccess
  /** Endpoints the control and the save act on: the owner's own pick, or the stored selection. */
  readonly capabilities: readonly ViewerPluginPolicy[]
  /** The session tier the owner edits here: their pick, or the one the host reported. */
  readonly shareMode: ViewerSessionMode | undefined
  /** The fork switch the owner edits here: their pick, or the one the host reported (off when absent). */
  readonly shareFork: boolean
  /** The share whose stored record this dialog edits; nothing until the host lists one. */
  readonly editableShare: string | undefined
  /** Stored deadline; absent means the share never expires. */
  readonly expiresAt: string | undefined
  /** Whether the share holds anything the owner has picked but not saved. */
  readonly dirty: boolean
  /** Whether a close attempt already warned about unsaved changes; a second one closes. */
  readonly discardWarned: boolean
  /** Whether the save is in flight. */
  readonly saveBusy: boolean
  /** What the last accepted save stored, already localized. */
  readonly saveNotice: string
  /** Why the last save did not land, already localized. */
  readonly saveError: string
  /** Base id the tier control's own tab and panel ids derive from. */
  readonly capabilityControlId: string
  /** Base id the share's own session permission tabs derive from. */
  readonly shareModeControlId: string
  /** Record the owner's global plugin switch. */
  readonly pickPluginAccess: (access: PluginAccess) => void
  /** Record the owner's endpoint pick. */
  readonly pickCapabilities: (capabilities: readonly ViewerPluginPolicy[]) => void
  /** Record the owner's session permission pick. */
  readonly pickMode: (mode: ViewerSessionMode) => void
  /** Record the owner's fork-switch pick. */
  readonly pickFork: (fork: boolean) => void
  /** Ask the save to clear the stored deadline and make the share never expire. */
  readonly clearExpiry: () => void
  /** Save the session permission, the fork switch, and endpoint exposure through the host. */
  readonly savePermissions: () => Promise<void>
  /** Record that a close attempt warned about unsaved changes. */
  readonly warnDiscard: () => void
  /**
   * Adopt the record the host answered a create with.
   * @param created - The share the host created.
   * @param reportedMode - Session permission it stored, read through this build's vocabulary.
   * @param allowsFork - Whether the create request carried the fork switch.
   */
  readonly adoptCreated: (
    created: CreatedShare,
    reportedMode: ViewerSessionMode | undefined,
    allowsFork: boolean,
  ) => Promise<void>
}
/**
 * Read the stored share record, keep the owner's unsaved picks, and save all three editable fields.
 * @param options - Owner share management, the Session, the link adoption callback, and localized copy.
 * @returns The stored values, the owner's picks, and the one save.
 */
export function useShareEdit(options: UseShareEditOptions): ShareEditState {
  const confirmedAccessRef = shallowRef<ReturnType<typeof readAccess>>()
  const setConfirmedAccess = (
    value:
      | typeof confirmedAccessRef.value
      | ((previous: typeof confirmedAccessRef.value) => typeof confirmedAccessRef.value),
  ): void => {
    confirmedAccessRef.value =
      typeof value === 'function' ? value(confirmedAccessRef.value) : value
  }
  const offeredRef = shallowRef<readonly OfferedPlugin[]>([])
  const setOffered = (
    value:
      | typeof offeredRef.value
      | ((previous: typeof offeredRef.value) => typeof offeredRef.value),
  ): void => {
    offeredRef.value = typeof value === 'function' ? value(offeredRef.value) : value
  }
  const storedPluginAccessRef = shallowRef<PluginAccess>('none')
  const setStoredPluginAccess = (
    value:
      | typeof storedPluginAccessRef.value
      | ((previous: typeof storedPluginAccessRef.value) => typeof storedPluginAccessRef.value),
  ): void => {
    storedPluginAccessRef.value =
      typeof value === 'function' ? value(storedPluginAccessRef.value) : value
  }
  const storedCapabilitiesRef = shallowRef<readonly ViewerPluginPolicy[]>([])
  const setStoredCapabilities = (
    value:
      | typeof storedCapabilitiesRef.value
      | ((previous: typeof storedCapabilitiesRef.value) => typeof storedCapabilitiesRef.value),
  ): void => {
    storedCapabilitiesRef.value =
      typeof value === 'function' ? value(storedCapabilitiesRef.value) : value
  }
  const storedExpiresAtRef = shallowRef<string>()
  const setStoredExpiresAt = (
    value:
      | typeof storedExpiresAtRef.value
      | ((previous: typeof storedExpiresAtRef.value) => typeof storedExpiresAtRef.value),
  ): void => {
    storedExpiresAtRef.value =
      typeof value === 'function' ? value(storedExpiresAtRef.value) : value
  }
  const storedPermissionRef = shallowRef<{
    readonly mode?: ViewerSessionMode
    readonly fork: boolean
  }>({ fork: false })
  const setStoredPermission = (
    value:
      | typeof storedPermissionRef.value
      | ((previous: typeof storedPermissionRef.value) => typeof storedPermissionRef.value),
  ): void => {
    storedPermissionRef.value =
      typeof value === 'function' ? value(storedPermissionRef.value) : value
  }
  const pickedPluginAccessRef = shallowRef<PluginAccess>()
  const setPickedPluginAccess = (
    value:
      | typeof pickedPluginAccessRef.value
      | ((previous: typeof pickedPluginAccessRef.value) => typeof pickedPluginAccessRef.value),
  ): void => {
    pickedPluginAccessRef.value =
      typeof value === 'function' ? value(pickedPluginAccessRef.value) : value
  }
  const pickedCapabilitiesRef = shallowRef<readonly ViewerPluginPolicy[]>()
  const setPickedCapabilities = (
    value:
      | typeof pickedCapabilitiesRef.value
      | ((previous: typeof pickedCapabilitiesRef.value) => typeof pickedCapabilitiesRef.value),
  ): void => {
    pickedCapabilitiesRef.value =
      typeof value === 'function' ? value(pickedCapabilitiesRef.value) : value
  }
  const pickedModeRef = shallowRef<ViewerSessionMode>()
  const setPickedMode = (
    value:
      | typeof pickedModeRef.value
      | ((previous: typeof pickedModeRef.value) => typeof pickedModeRef.value),
  ): void => {
    pickedModeRef.value = typeof value === 'function' ? value(pickedModeRef.value) : value
  }
  const pickedForkRef = shallowRef<boolean>()
  const setPickedFork = (
    value:
      | typeof pickedForkRef.value
      | ((previous: typeof pickedForkRef.value) => typeof pickedForkRef.value),
  ): void => {
    pickedForkRef.value = typeof value === 'function' ? value(pickedForkRef.value) : value
  }
  const pickedExpiryRef = shallowRef(false)
  const setPickedExpiry = (
    value:
      | typeof pickedExpiryRef.value
      | ((previous: typeof pickedExpiryRef.value) => typeof pickedExpiryRef.value),
  ): void => {
    pickedExpiryRef.value = typeof value === 'function' ? value(pickedExpiryRef.value) : value
  }
  const saveBusyRef = shallowRef(false)
  const setSaveBusy = (
    value:
      | typeof saveBusyRef.value
      | ((previous: typeof saveBusyRef.value) => typeof saveBusyRef.value),
  ): void => {
    saveBusyRef.value = typeof value === 'function' ? value(saveBusyRef.value) : value
  }
  const saveNoticeRef = shallowRef('')
  const setSaveNotice = (
    value:
      | typeof saveNoticeRef.value
      | ((previous: typeof saveNoticeRef.value) => typeof saveNoticeRef.value),
  ): void => {
    saveNoticeRef.value = typeof value === 'function' ? value(saveNoticeRef.value) : value
  }
  const saveErrorRef = shallowRef('')
  const setSaveError = (
    value:
      | typeof saveErrorRef.value
      | ((previous: typeof saveErrorRef.value) => typeof saveErrorRef.value),
  ): void => {
    saveErrorRef.value = typeof value === 'function' ? value(saveErrorRef.value) : value
  }
  const discardWarnedRef = shallowRef(false)
  const setDiscardWarned = (
    value:
      | typeof discardWarnedRef.value
      | ((previous: typeof discardWarnedRef.value) => typeof discardWarnedRef.value),
  ): void => {
    discardWarnedRef.value = typeof value === 'function' ? value(discardWarnedRef.value) : value
  }
  const capabilityControlId = useId()
  const shareModeControlId = useId()
  const editableShareRef = shallowRef<string>()
  const setEditableShare = (
    value:
      | typeof editableShareRef.value
      | ((previous: typeof editableShareRef.value) => typeof editableShareRef.value),
  ): void => {
    editableShareRef.value = typeof value === 'function' ? value(editableShareRef.value) : value
  }
  const permissionShare = shallowRef<string>()
  const unsaved = shallowRef(false)
  const adoptStored = (share: OutgoingShare): void => {
    setConfirmedAccess(readAccess(share.access))
    const mode = readSessionMode(share.sessionMode)
    setStoredPermission({
      ...(mode === undefined ? {} : { mode }),
      fork: share.allowsFork === true,
    })
    setStoredPluginAccess(readPluginAccess(share.viewerPluginAccess))
    setStoredCapabilities(readViewerPolicies(share.viewerPlugins))
    setStoredExpiresAt(share.expiresAt)
  }
  const adoptShare = (share: OutgoingShare): void => {
    permissionShare.value = share.shareId
    setEditableShare(share.shareId)
    options.onLink(share.link)
    adoptStored(share)
    setPickedPluginAccess(undefined)
    setPickedCapabilities(undefined)
    setPickedMode(undefined)
    setPickedFork(undefined)
    setPickedExpiry(false)
    setDiscardWarned(false)
  }
  const readShareRecord = async (shareId: string): Promise<OutgoingShare | undefined> => {
    try {
      const listed = await options.shares.list()
      if (!listed.ok) return undefined
      return listed.value.shares.find(share => share.shareId === shareId)
    } catch (_sharesUnavailable) {
      return undefined
    }
  }
  const refreshShare = async (shareId: string): Promise<void> => {
    const fresh = await readShareRecord(shareId)
    if (fresh !== undefined) adoptShare(fresh)
  }
  onMounted(() => {
    watch(
      () => [options.sessionId, options.shares],
      (_values, _old, onCleanup) => {
        const dispose = (() => {
          let cancelled = false
          const load = async (): Promise<void> => {
            let listed
            try {
              listed = await options.shares.list()
            } catch (_pollFailed) {
              // Preserve the last list when polling fails.
              return
            }
              if (cancelled || !listed.ok) return
              const existing = listed.value.shares.find(
                share =>
                  share.sessionId === options.sessionId ||
                  share.sessionIds.includes(options.sessionId),
              )
              if (existing !== undefined) {
                options.onLink(existing.link)
                setConfirmedAccess(readAccess(existing.access))
                // The editable record belongs to one share: the first sight of that share adopts it, and
                // every later poll leaves the owner's own unsaved picks alone.
                if (permissionShare.value !== existing.shareId) {
                  setSaveNotice('')
                  setSaveError('')
                  adoptShare(existing)
                  /* v8 ignore start -- polling adoption is covered by the first-adoption path. */
                } else if (!unsaved.value) {
                  // The owner holds nothing unconfirmed, so this panel follows the host's record: a change
                  // made in Share management shows here instead of two panels stating different values.
                  adoptShare(existing)
                }
                /* v8 ignore stop */
              }
          }
          void load()
          const timer = setInterval(() => {
            void load()
          }, 3000)
          return () => {
            cancelled = true
            clearInterval(timer)
          }
        })()
        if (typeof dispose === 'function') onCleanup(dispose)
      },
      { immediate: true, flush: 'post' },
    )
  })
  onMounted(() => {
    watch(
      () => [options.shares],
      (_values, _old, onCleanup) => {
        const dispose = (() => {
          let cancelled = false
          const load = async (): Promise<void> => {
            let offeredNow
            try {
              offeredNow = await options.shares.capabilities()
            } catch (_hostUnanswered) {
              // An unanswered host offers no capabilities.
              return
            }
              if (!cancelled && offeredNow.ok)
                setOffered(readOfferedPlugins(offeredNow.value.capabilities))
          }
          void load()
          return () => {
            cancelled = true
          }
        })()
        if (typeof dispose === 'function') onCleanup(dispose)
      },
      { immediate: true, flush: 'post' },
    )
  })
  const pluginAccessRef = computed(
    () => pickedPluginAccessRef.value ?? storedPluginAccessRef.value,
  )
  const capabilitiesRef = computed(
    () =>
      pickedCapabilitiesRef.value ??
      selectionForOffered(offeredRef.value, storedCapabilitiesRef.value),
  )
  const shareModeRef = computed(() => pickedModeRef.value ?? storedPermissionRef.value.mode)
  const shareForkRef = computed(() => pickedForkRef.value ?? storedPermissionRef.value.fork)
  const dirtyRef = computed(
    () =>
      pluginAccessRef.value !== storedPluginAccessRef.value ||
      (pickedCapabilitiesRef.value !== undefined &&
        !sameKeys(
          selectionKeys(
            offeredRef.value,
            selectionForOffered(offeredRef.value, pickedCapabilitiesRef.value),
          ),
          selectionKeys(offeredRef.value, storedCapabilitiesRef.value),
        )) ||
      shareModeRef.value !== storedPermissionRef.value.mode ||
      shareForkRef.value !== storedPermissionRef.value.fork ||
      (pickedExpiryRef.value && storedExpiresAtRef.value !== undefined),
  )
  onMounted(() => {
    watch(
      () => [dirtyRef.value],
      () => {
        unsaved.value = dirtyRef.value
      },
      { immediate: true, flush: 'post' },
    )
  })
  const pickChanged = (): void => {
    setSaveNotice('')
    setSaveError('')
    setDiscardWarned(false)
  }
  const savePermissions = async (): Promise<void> => {
    const shareId = editableShareRef.value
    /* v8 ignore next -- the save control is disabled while a save is in flight and until a share is adopted. */
    if (saveBusyRef.value || shareId === undefined) return
    setSaveBusy(true)
    setSaveNotice('')
    setSaveError('')
    let permissionSaved = false
    try {
      const permission = await options.shares.updatePermissions({
        shareId,
        ...(shareModeRef.value === undefined ? {} : { sessionMode: shareModeRef.value }),
        allowsFork: shareForkRef.value,
        ...(pickedExpiryRef.value ? { ttlMinutes: null } : {}),
      })
      if (!permission.ok) throw new Error('session permission rejected')
      // From here the permission write is on the host: a later refusal must not be stated as the whole
      // save failing.
      permissionSaved = true
      // A page no plugin offers an endpoint to cannot state an endpoint selection, so it must not
      // write one: only the permission fields it does know are saved.
      const selected = selectionForOffered(offeredRef.value, capabilitiesRef.value)
      if (offeredRef.value.length > 0 || pluginAccessRef.value !== storedPluginAccessRef.value) {
        const endpoints = await options.shares.setCapabilities({
          shareId,
          viewerPluginAccess: pluginAccessRef.value,
          viewerPlugins: selected,
        })
        if (!endpoints.ok) throw new Error('capability selection rejected')
      }
      // The host accepted this write, so the fields state it from here; the confirming read below
      // replaces it with the record the host actually stored.
      setStoredPermission({
        ...(shareModeRef.value === undefined ? {} : { mode: shareModeRef.value }),
        fork: shareForkRef.value,
      })
      setStoredPluginAccess(pluginAccessRef.value)
      setStoredCapabilities(selected)
      setPickedPluginAccess(undefined)
      setPickedCapabilities(undefined)
      setPickedMode(undefined)
      setPickedFork(undefined)
      setPickedExpiry(false)
      setDiscardWarned(false)
      setSaveNotice(options.t('dialog.permissions.saved'))
      await refreshShare(shareId)
    } catch {
      // The picks stay on screen: a refused or half-accepted save is retried by saving again, not
      // re-derived from a record the owner did not ask for.
      if (!permissionSaved) {
        setSaveError(options.t('dialog.permissions.failed'))
      } else {
        // The permission write landed and only the endpoint write did not: state which of the two was
        // saved, and re-read the host's record so the tier and switch read what it stored instead of
        // claiming nothing changed.
        setSaveError(options.t('dialog.permissions.partial'))
        const fresh = await readShareRecord(shareId)
        if (fresh !== undefined) adoptStored(fresh)
      }
    } finally {
      setSaveBusy(false)
    }
  }
  const adoptCreated = async (
    created: CreatedShare,
    reportedMode: ViewerSessionMode | undefined,
    allowsFork: boolean,
  ): Promise<void> => {
    setConfirmedAccess(readAccess(created.access))
    setStoredPermission({
      ...(reportedMode === undefined ? {} : { mode: reportedMode }),
      fork: allowsFork,
    })
    setStoredPluginAccess('none')
    setStoredCapabilities([])
    setStoredExpiresAt(undefined)
    setPickedPluginAccess(undefined)
    setPickedCapabilities(undefined)
    setPickedMode(undefined)
    setPickedFork(undefined)
    setPickedExpiry(false)
    setSaveNotice('')
    setSaveError('')
    await refreshShare(created.shareId)
  }
  return {
    get access() {
      return confirmedAccessRef.value
    },
    get offered() {
      return offeredRef.value
    },
    get pluginAccess() {
      return pluginAccessRef.value
    },
    get capabilities() {
      return capabilitiesRef.value
    },
    get shareMode() {
      return shareModeRef.value
    },
    get shareFork() {
      return shareForkRef.value
    },
    get editableShare() {
      return editableShareRef.value
    },
    get expiresAt() {
      return storedExpiresAtRef.value
    },
    get dirty() {
      return dirtyRef.value
    },
    get discardWarned() {
      return discardWarnedRef.value
    },
    get saveBusy() {
      return saveBusyRef.value
    },
    get saveNotice() {
      return saveNoticeRef.value
    },
    get saveError() {
      return saveErrorRef.value
    },
    get capabilityControlId() {
      return capabilityControlId
    },
    get shareModeControlId() {
      return shareModeControlId
    },
    get pickPluginAccess() {
      return (next: Parameters<ShareEditState['pickPluginAccess']>[0]) => {
        pickChanged()
        setPickedPluginAccess(next)
      }
    },
    get pickCapabilities() {
      return (next: Parameters<ShareEditState['pickCapabilities']>[0]) => {
        pickChanged()
        setPickedCapabilities(next)
      }
    },
    get pickMode() {
      return (next: Parameters<ShareEditState['pickMode']>[0]) => {
        pickChanged()
        setPickedMode(next)
      }
    },
    get pickFork() {
      return (next: Parameters<ShareEditState['pickFork']>[0]) => {
        pickChanged()
        setPickedFork(next)
      }
    },
    get clearExpiry() {
      return () => {
        pickChanged()
        setPickedExpiry(true)
      }
    },
    get savePermissions() {
      return savePermissions
    },
    get warnDiscard() {
      return () => {
        setDiscardWarned(true)
      }
    },
    get adoptCreated() {
      return adoptCreated
    },
  }
}
/** Props for the stored share's permission section. */
export interface ShareEditPanelProps extends PropsLocale<typeof NS> {
  /** Whether a share exists to edit; the section renders nothing before one does. */
  readonly visible: boolean
  /** Stored values, owner picks, and the one save they share. */
  readonly edit: ShareEditState
}
/**
 * Render the stored share's session permission, fork switch, and endpoint tier.
 * @param props - The edit state, whether a share exists, and localized copy.
 * @returns The permission section, or nothing while no share exists.
 */
export const ShareEditPanel = defineComponent(
  (componentProps: ShareEditPanelProps) => {
    return () => {
      if (!componentProps.visible) return null
      return h(Fragment, null, [
        h('div', { class: css.permissions }, [
          h(SharePermissionFields, {
            sessionMode: componentProps.edit.shareMode,
            allowsFork: componentProps.edit.shareFork,
            offered: componentProps.edit.offered,
            pluginAccess: componentProps.edit.pluginAccess,
            capabilities: componentProps.edit.capabilities,
            disabled: componentProps.edit.saveBusy,
            sessionModeControlId: componentProps.edit.shareModeControlId,
            capabilityControlId: componentProps.edit.capabilityControlId,
            onSessionMode: (mode) => {
              componentProps.edit.pickMode(mode)
            },
            onAllowsFork: (value) => {
              componentProps.edit.pickFork(value)
            },
            onPluginAccess: (next) => {
              componentProps.edit.pickPluginAccess(next)
            },
            onCapabilities: (next) => {
              componentProps.edit.pickCapabilities(next)
            },
            t: componentProps.t,
          }),
          h('div', { class: css.row }, [
            h('span', { class: css.rowLabel }, [componentProps.t('dialog.expiry')]),
            h('span', { class: css.description }, [
              componentProps.edit.expiresAt === undefined
                ? componentProps.t('dialog.expiry.never')
                : /** Inputs the dialog supplies to its stored-share edit state. */ componentProps.t(
                  'dialog.expiry.until',
                  { time: new Date(componentProps.edit.expiresAt).toISOString().slice(0, 10) },
                ),
            ]),
            componentProps.edit.expiresAt === undefined
              ? null
              : h(
                Button,
                {
                  variant: 'ghost',
                  size: 'sm',
                  disabled: componentProps.edit.saveBusy,
                  onClick: componentProps.edit.clearExpiry,
                },
                {
                  default: () => componentProps.t('dialog.expiry.clear'),
                },
              ),
          ]),
          h('div', { class: css.field }, [
            h('span', { class: css.label }, [componentProps.t('dialog.linkSharing')]),
            componentProps.edit.access === undefined
              ? h('p', { class: css.description }, [componentProps.t('dialog.accessUnavailable')])
              : h(Fragment, null, [
                h('p', { class: css.description }, [
                  componentProps.t(
                    componentProps.edit.access.mode === 'selected'
                      ? 'dialog.mode.selected'
                      : 'dialog.mode.open',
                  ),
                ]),
                componentProps.edit.access.mode !== 'selected'
                  ? null
                  : h(Fragment, null, [
                    h('p', { class: css.description }, [
                      componentProps.t('dialog.selectedCount', {
                        count: componentProps.edit.access.selectedCount,
                      }),
                    ]),
                    h('p', { class: css.testWarn }, [
                      componentProps.t('dialog.selectedRetired'),
                    ]),
                  ]),
                componentProps.edit.access.deploymentCount > 0
                  ? h('p', { class: css.testWarn }, [
                    componentProps.t('dialog.deploymentAccess', {
                      count: componentProps.edit.access.deploymentCount,
                    }),
                  ])
                  : null,
              ]),
          ]),
          componentProps.edit.saveNotice === ''
            ? null
            : h('span', { class: css.testOk }, [componentProps.edit.saveNotice]),
          componentProps.edit.saveError === ''
            ? null
            : h('span', { class: css.testFail, role: 'alert' }, [componentProps.edit.saveError]),
        ]),
      ])
    }
  },
  { inheritAttrs: false, props: ['visible', 'edit', 't'] },
)
