import { normalizeClass } from 'vue'
import { h, Fragment, shallowRef, defineComponent, watch, useId } from 'vue'
import type { VNodeChild } from 'vue'
/**
 * Models settings section: the provider rows joined from the configurable
 * directory, settings namespaces, and credential states, with one editor
 * card at a time. Rows retain the account-first order supplied by the store
 * and expose only confirmed API-key state through accessible
 * solid configured or missing dots. A whole-section provider without a
 * configured key renders as its open setup card instead of a row, but only in
 * the first-run posture — no provider on the page can serve requests yet — and
 * only until the user closes that card. The add flow is one card behind one
 * button: a mode switch chooses between adopting a dormant directory provider
 * (the catalog select over the provider editor) and declaring a custom model
 * API (the create form). A panel mounts the first time its mode is shown and
 * stays mounted, hidden, while the card is open and its mode stays offered,
 * so switching modes discards neither draft and an unvisited mode costs
 * nothing; the switch holds still while either panel has a write or an
 * endpoint interrogation in flight, since a switch underneath one would
 * orphan the answer. Each card kind owns its own open state, so closing one
 * never discards a draft in another. Every
 * mutation writes through the wire, while a provider removal first requires
 * confirmation; the page re-renders from pushed invalidations or the
 * post-apply reload.
 */
import {
  Button,
  IconPlusOutlineRegular,
  Modal,
  SegmentedControl,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { LlmNativeAuth, SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls this package's SlotMap merge (the two Models child slots).
import type {} from './slot-contract.ts'
import { CustomProviderCard } from './CustomProviderCard.tsx'
import { deriveKeyRef, protocolChoices, providerUsable, reasoningLevelChoices } from './store.ts'
import type { ModelsSettingsStore, ProviderRow } from './store.ts'
import type { ModelsOperations } from './operations.ts'
import type { SettingsSchemaOperations } from './schema-operations.ts'
import { ProviderEditor, type ProviderEditorProps } from './ProviderEditor.tsx'
import type { en } from './locales.ts'
import styles from './ModelsSection.module.css'
/** Injected dependencies of {@link ModelsSection} (slot `inject`). */
export interface ModelsSectionInjected {
  /** The page store (loaded on mount, refreshed on pushed invalidations). */
  controller: ModelsSettingsStore
  hooks: {
    /** Page snapshot bound by the UI renderer as useSnapshot. */
    snapshot: ModelsSettingsStore['store']
  }
  /** The Host operations the section and its cards invoke. */
  operations: ModelsOperations
  /** Settings schema and immutable path callbacks. */
  schema: SettingsSchemaOperations
  /** Section copy. */
  t: (key: keyof typeof en) => string
}
/**
 * The two ways the add card gains a provider: adopt a directory row the
 * adapter already knows, or declare a route it does not.
 */
type AddMode = 'catalog' | 'custom'
/** The child slots this section declares and dispatches (see ./slot-contract.ts). */
type ModelsChildSlots = 'settings.models.provider-card' | 'settings.models.footer'
/** The child-slot dispatch function the renderer binds for the section. */
type ModelsRenderSlot = PropsRenderSlots<ModelsChildSlots>['renderSlot']
/**
 * Props delivered by the slot outlet: the inject face spread flat (the
 * renderer erases the share boundary at the render call) plus the child-slot
 * dispatch seat. The seat is required: the renderer binds it at the render
 * call itself — unlike the inject face it is never absent at runtime — and a
 * direct render that forgets it fails to compile instead of mounting nothing.
 */
export type ModelsSectionProps = Partial<InjectFace<ModelsSectionInjected>> &
  PropsRenderSlots<ModelsChildSlots>
type ModelsSectionFace = InjectFace<ModelsSectionInjected>
/** Provider identity shared by row actions and confirmation copy. */
export interface ProviderIdentity {
  /** Stable provider route id. */
  provider: string
  /** Human-facing provider name. */
  displayName: string
}
/** One existing row or dormant directory entry addressed by an editor action. */
interface EditorTarget extends ProviderIdentity {
  settingsNs: string
  settingsPath: readonly string[]
  /** Writable credential identified under this page's conventional reference. */
  credentialRef?: string
  /** The adapter reports this route as one it does not ship (see {@link ProviderEditorProps.declared}). */
  declared?: boolean
  /** The route's catalog endpoint (see {@link ProviderEditorProps.defaultBaseURL}). */
  defaultBaseURL?: string
  /** Environment used to construct an endpoint (see {@link ProviderEditorProps.baseURLEnv}). */
  baseURLEnv?: readonly string[]
  /** The route's native authentication (see {@link ProviderEditorProps.nativeAuth}). */
  nativeAuth?: LlmNativeAuth
}
/** A dormant directory row the add card can adopt, with its registered namespace. */
interface AddableRow {
  row: ProviderRow
  namespace: SettingsNamespaceView
}
/** The catalog draft the add card shows: its editor target and the namespace that takes the write. */
interface CatalogDraft {
  target: EditorTarget
  namespace: SettingsNamespaceView
}
/** Values that vary around the shared provider-editor rendering. */
interface ProviderEditorRenderProps extends Pick<
  ProviderEditorProps,
  'namespace' | 'schema' | 'operations' | 't' | 'readOnly' | 'onClose'
> {
  target: EditorTarget
  row: ProviderRow
}
/** Render an editor for either the setup posture or an expanded provider row. */
function renderProviderEditor({ target, row, ...props }: ProviderEditorRenderProps): VNodeChild {
  return h(ProviderEditor, {
    provider: target.provider,
    displayName: target.displayName,
    settingsPath: target.settingsPath,
    ...(target.declared === true ? { declared: true } : {}),
    ...(target.defaultBaseURL === undefined ? {} : { defaultBaseURL: target.defaultBaseURL }),
    ...(target.baseURLEnv === undefined ? {} : { baseURLEnv: target.baseURLEnv }),
    ...(target.nativeAuth === undefined ? {} : { nativeAuth: target.nativeAuth }),
    ...(row.credential === undefined ? {} : { credential: row.credential }),
    ...(row.credentialChecks === undefined ? {} : { credentialChecks: row.credentialChecks }),
    ...props,
  })
}
/**
 * Remove one user-added provider and its page-managed credential. Credential
 * removal comes first so a second-step failure leaves the provider row visible
 * and the whole operation safely retryable; both unsets are idempotent.
 * The settings removal names the profile rather than rebuilding its whole
 * namespace from a partial view.
 * @param operations - the page's Host operations.
 * @param controller - the page store to refresh.
 * @param target - the provider's settings address and optional managed credential.
 * @returns the failure message, or undefined once the write and reload landed.
 */
export async function removeProviderProfile(
  operations: ModelsOperations,
  controller: ModelsSettingsStore,
  target: {
    settingsNs: string
    settingsPath: readonly string[]
    credentialRef?: string
  },
): Promise<string | undefined> {
  if (target.credentialRef !== undefined) {
    const credential = await operations.removeCredential(target.credentialRef)
    if (credential !== undefined) return credential
  }
  const written = await operations.writeSettings(
    target.settingsNs,
    [{ op: 'unset', path: [...target.settingsPath] }],
    undefined,
  )
  if (written.kind !== 'written') return written.message
  await controller.load()
  return undefined
}
/**
 * Whether a whole-section provider still needs its first key: an unconfigured
 * credential opens the setup card instead of showing a row. This is the
 * first-run posture alone — a user who can already reach some provider gets an
 * ordinary row with the missing-key dot, since nothing here is blocking them.
 * @param row - the joined provider row.
 * @param anyUsable - whether any joined row can already serve requests.
 * @returns whether to render the setup card.
 */
export function needsSetup(row: ProviderRow, anyUsable: boolean): boolean {
  if (anyUsable || row.entry.provider === 'deepseek-account') return false
  if (row.entry.settingsPath.length > 0) return false
  return row.credential?.configured !== true
}
/**
 * The provider-card seat's credential fact: the reference this page would use
 * for the row — the profile's `apiKeyEnv`, or the page's derived
 * `<ROUTE>_API_KEY` while the profile names none — confirmed configured. The
 * derived half is what keeps the seat consistent with the editor on the
 * add-provider draft, whose dormant row names no reference yet.
 */
function keyConfiguredOf(row: ProviderRow): boolean {
  return row.apiKeyEnv !== undefined
    ? row.credential?.configured === true
    : row.derivedCredential?.configured === true
}
function targetOf(row: ProviderRow): EditorTarget {
  const managedRef = deriveKeyRef(row.entry.provider)
  const credentialRef =
    row.apiKeyEnv === managedRef && row.credential?.configured === true && row.credential.writable
      ? managedRef
      : undefined
  return {
    provider: row.entry.provider,
    displayName: row.entry.displayName,
    settingsNs: row.entry.settingsNs,
    settingsPath: row.entry.settingsPath,
    ...(credentialRef === undefined ? {} : { credentialRef }),
    // Only declared routes may expose route-owned fields.
    ...(row.entry.declared === true ? { declared: true } : {}),
    ...(row.entry.defaultBaseURL === undefined ? {} : { defaultBaseURL: row.entry.defaultBaseURL }),
    ...(row.entry.baseURLEnv === undefined ? {} : { baseURLEnv: row.entry.baseURLEnv }),
    ...(row.entry.nativeAuth === undefined ? {} : { nativeAuth: row.entry.nativeAuth }),
  }
}
/** Stable visible and accessible identity for one provider target. */
export function providerTargetLabel(target: ProviderIdentity): string {
  return target.provider === target.displayName
    ? target.provider
    : `${target.displayName} (${target.provider})`
}
/** Replace the one provider placeholder in localized destructive-action copy. */
export function providerCopy(template: string, target: ProviderIdentity): string {
  return template.replace('{provider}', () => providerTargetLabel(target))
}
/**
 * Render the Models section content column.
 * @param props - slot-delivered injected dependencies.
 * @returns the section, or null while the shell has not injected yet.
 */
export function ModelsSection(props: ModelsSectionProps): VNodeChild {
  const { controller, useSnapshot, operations, schema, t, renderSlot } = props
  if (
    controller === undefined ||
    useSnapshot === undefined ||
    operations === undefined ||
    schema === undefined ||
    t === undefined
  )
    return null
  return h(Loaded, {
    injected: { controller, useSnapshot, operations, schema, t },
    renderSlot: renderSlot,
  })
}
const Loaded = defineComponent(
  (props: { injected: ModelsSectionFace; renderSlot: ModelsRenderSlot }) => {
    const snapshotRef = props.injected.useSnapshot(value => value)
    const hasReadySnapshotRef = shallowRef(snapshotRef.value.status === 'ready')
    const setHasReadySnapshot = (
      value:
        | typeof hasReadySnapshotRef.value
        | ((previous: typeof hasReadySnapshotRef.value) => typeof hasReadySnapshotRef.value),
    ): void => {
      hasReadySnapshotRef.value =
        typeof value === 'function' ? value(hasReadySnapshotRef.value) : value
    }
    const editingRef = shallowRef<EditorTarget | undefined>(undefined)
    const setEditing = (
      value:
        | typeof editingRef.value
        | ((previous: typeof editingRef.value) => typeof editingRef.value),
    ): void => {
      editingRef.value = typeof value === 'function' ? value(editingRef.value) : value
    }
    const addOpenRef = shallowRef(false)
    const setAddOpen = (
      value:
        | typeof addOpenRef.value
        | ((previous: typeof addOpenRef.value) => typeof addOpenRef.value),
    ): void => {
      addOpenRef.value = typeof value === 'function' ? value(addOpenRef.value) : value
    }
    const addModeRef = shallowRef<AddMode>('catalog')
    const setAddMode = (
      value:
        | typeof addModeRef.value
        | ((previous: typeof addModeRef.value) => typeof addModeRef.value),
    ): void => {
      addModeRef.value = typeof value === 'function' ? value(addModeRef.value) : value
    }
    const visitedRef = shallowRef<ReadonlySet<AddMode>>((() => new Set())())
    const setVisited = (
      value:
        | typeof visitedRef.value
        | ((previous: typeof visitedRef.value) => typeof visitedRef.value),
    ): void => {
      visitedRef.value = typeof value === 'function' ? value(visitedRef.value) : value
    }
    const catalogBusyRef = shallowRef(false)
    const setCatalogBusy = (
      value:
        | typeof catalogBusyRef.value
        | ((previous: typeof catalogBusyRef.value) => typeof catalogBusyRef.value),
    ): void => {
      catalogBusyRef.value = typeof value === 'function' ? value(catalogBusyRef.value) : value
    }
    const customBusyRef = shallowRef(false)
    const setCustomBusy = (
      value:
        | typeof customBusyRef.value
        | ((previous: typeof customBusyRef.value) => typeof customBusyRef.value),
    ): void => {
      customBusyRef.value = typeof value === 'function' ? value(customBusyRef.value) : value
    }
    const addId = useId()
    const deleteTargetRef = shallowRef<EditorTarget | undefined>(undefined)
    const setDeleteTarget = (
      value:
        | typeof deleteTargetRef.value
        | ((previous: typeof deleteTargetRef.value) => typeof deleteTargetRef.value),
    ): void => {
      deleteTargetRef.value = typeof value === 'function' ? value(deleteTargetRef.value) : value
    }
    const deletingRef = shallowRef(false)
    const setDeleting = (
      value:
        | typeof deletingRef.value
        | ((previous: typeof deletingRef.value) => typeof deletingRef.value),
    ): void => {
      deletingRef.value = typeof value === 'function' ? value(deletingRef.value) : value
    }
    const deleteFailureRef = shallowRef<string | undefined>(undefined)
    const setDeleteFailure = (
      value:
        | typeof deleteFailureRef.value
        | ((previous: typeof deleteFailureRef.value) => typeof deleteFailureRef.value),
    ): void => {
      deleteFailureRef.value = typeof value === 'function' ? value(deleteFailureRef.value) : value
    }
    const savedTargetRef = shallowRef<ProviderIdentity | undefined>(undefined)
    const setSavedTarget = (
      value:
        | typeof savedTargetRef.value
        | ((previous: typeof savedTargetRef.value) => typeof savedTargetRef.value),
    ): void => {
      savedTargetRef.value = typeof value === 'function' ? value(savedTargetRef.value) : value
    }
    const dismissedSetupRef = shallowRef<ReadonlySet<string>>((() => new Set())())
    const setDismissedSetup = (
      value:
        | typeof dismissedSetupRef.value
        | ((previous: typeof dismissedSetupRef.value) => typeof dismissedSetupRef.value),
    ): void => {
      dismissedSetupRef.value =
        typeof value === 'function' ? value(dismissedSetupRef.value) : value
    }
    watch(
      () => snapshotRef.value.status,
      (status) => {
        if (status === 'ready') setHasReadySnapshot(true)
        if (status === 'error') setHasReadySnapshot(false)
        if (status === 'idle') void props.injected.controller.load()
      },
      { immediate: true, flush: 'sync' },
    )
    return () => {
      const { injected, renderSlot } = props
      const snapshot = snapshotRef.value
      const { controller, operations, schema, t } = injected
      const state = {
        ...snapshot,
        rows: snapshot.rows.map(row =>
          row.entry.provider === 'deepseek-account'
            ? { ...row, entry: { ...row.entry, displayName: t('deepSeekAccount') } }
            : row,
        ),
      }
      const hasReadySnapshot = hasReadySnapshotRef.value
      const editing = editingRef.value
      const addOpen = addOpenRef.value
      const addMode = addModeRef.value
      const visited = visitedRef.value
      const catalogBusy = catalogBusyRef.value
      const customBusy = customBusyRef.value
      const deleteTarget = deleteTargetRef.value
      const deleting = deletingRef.value
      const deleteFailure = deleteFailureRef.value
      const savedTarget = savedTargetRef.value
      const dismissedSetup = dismissedSetupRef.value
      const announceSaved = (target: ProviderIdentity): void => {
        // Announced only once the refreshed directory is in the snapshot the
        // notice reads its name from: an apply can rename the route, and the
        // target captured when the card opened still carries the old name.
        void controller.load().then(() => {
          setSavedTarget(target)
        })
      }
      const closeAdd = (): void => {
        setEditing(undefined)
        setAddOpen(false)
        setCatalogBusy(false)
        setCustomBusy(false)
      }
      const closeEditor = (changed: boolean, target: ProviderIdentity): void => {
        closeAdd()
        if (changed) announceSaved(target)
      }
      const closeSetup = (changed: boolean, target: ProviderIdentity): void => {
        setDismissedSetup(previous => new Set([...previous, target.provider]))
        if (changed) announceSaved(target)
      }
      const closeDelete = (): void => {
        if (deleting) return
        setDeleteTarget(undefined)
        setDeleteFailure(undefined)
      }
      const confirmDelete = (): void => {
        /* v8 ignore next -- the action only renders with a target and is disabled while a deletion is pending */
        if (deleteTarget === undefined || deleting) return
        setDeleting(true)
        setDeleteFailure(undefined)
        void removeProviderProfile(operations, controller, deleteTarget)
          .then((failure) => {
            if (failure !== undefined) {
              setDeleteFailure(failure)
              return
            }
            setDeleteTarget(undefined)
          })
          .finally(() => {
            setDeleting(false)
          })
      }
      if (state.status === 'error') {
        /* v8 ignore next -- an error status always carries text; the fallback satisfies the nullable type */
        const errorText = state.error ?? ''
        return h('div', { class: styles['section'] }, [
          h('p', { class: styles['error'] }, [`${t('loadFailed')}: ${errorText}`]),
          h(
            'button',
            {
              type: 'button',
              class: styles['secondaryButton'],
              onClick: () => {
                void controller.load()
              },
            },
            [t('retry')],
          ),
        ])
      }
      if (!hasReadySnapshot && state.status !== 'ready') {
        return h('div', { class: styles['section'] }, [
          h('h2', { class: styles['title'] }, [t('title')]),
          h('p', { class: styles['intro'] }, [t('intro')]),
        ])
      }
      const savedRow =
        savedTarget === undefined
          ? undefined
          : state.rows.find(row => row.entry.provider === savedTarget.provider)
      const savedIdentity =
        savedRow === undefined
          ? savedTarget
          : { provider: savedRow.entry.provider, displayName: savedRow.entry.displayName }
      const anyUsable = state.rows.some(providerUsable)
      const configured = state.rows.filter(row => row.configured)
      const configurable = state.rows.filter(row => state.namespaces.has(row.entry.settingsNs))
      const addable: AddableRow[] = state.rows.flatMap((row) => {
        const namespace = state.namespaces.get(row.entry.settingsNs)
        return namespace === undefined || row.configured ? [] : [{ row, namespace }]
      })
      const piAi = state.namespaces.get('llm-pi-ai')
      const protocols = protocolChoices(piAi, schema)
      const reasoningLevels = reasoningLevelChoices(piAi, schema)
      const catalogOffered = configurable.length > 0
      const catalogEnabled = addable.length > 0
      const customOffered = piAi !== undefined
      const customEnabled = protocols.length > 0
      const bothOffered = catalogOffered && customOffered
      const mode: AddMode = bothOffered ? addMode : customOffered ? 'custom' : 'catalog'
      const mounted = (candidate: AddMode): boolean => mode === candidate || visited.has(candidate)
      const switchLocked = catalogBusy || customBusy
      const draft = ((): CatalogDraft | undefined => {
        if (!addOpen || !catalogOffered) return undefined
        const kept = editing === undefined ? undefined : state.namespaces.get(editing.settingsNs)
        if (editing !== undefined && kept !== undefined)
          return { target: editing, namespace: kept }
        const first = addable[0]
        return first === undefined
          ? undefined
          : { target: targetOf(first.row), namespace: first.namespace }
      })()
      const addRow =
        draft === undefined
          ? undefined
          : state.rows.find(row => row.entry.provider === draft.target.provider)
      return h('div', { class: styles['section'] }, [
        h('h2', { class: styles['title'] }, [t('title')]),
        h('p', { class: styles['intro'] }, [t('intro')]),
        !state.writable && state.status === 'ready'
          ? h('p', { class: styles['notice'] }, [t('readOnly')])
          : null,
        savedIdentity === undefined
          ? null
          : h('p', { class: styles['savedNotice'], role: 'status', 'aria-live': 'polite' }, [
            providerCopy(t('savedProvider'), savedIdentity),
          ]),
        h('ul', { class: styles['rows'] }, [
          configured.map((row) => {
            const target = targetOf(row)
            const namespace = state.namespaces.get(target.settingsNs)
            if (namespace === undefined) return null
            const error =
              row.entry.error === undefined
                ? null
                : h('p', { role: 'alert', class: styles['error'] }, [row.entry.error])
            if (needsSetup(row, anyUsable) && !dismissedSetup.has(row.entry.provider)) {
              return h('li', { key: row.entry.provider, class: styles['setupCard'] }, [
                error,
                renderProviderEditor({
                  target,
                  row,
                  namespace,
                  schema,
                  operations,
                  t,
                  readOnly: !state.writable,
                  onClose: (changed) => {
                    closeSetup(changed, target)
                  },
                }),
                renderSlot(
                  'settings.models.provider-card',
                  {
                    provider: row.entry,
                    configured: row.configured,
                    keyConfigured: keyConfiguredOf(row),
                  },
                  { entryKey: row.entry.settingsNs },
                ),
              ])
            }
            const open = !addOpen && editing?.provider === row.entry.provider
            const credentialConfigured = row.credential?.configured === true
            const credentialMissing =
              !credentialConfigured &&
              row.apiKeyEnv !== undefined &&
              row.credential?.configured === false
            return h('li', { key: row.entry.provider, class: styles['rowCard'] }, [
              h('div', { class: styles['rowHead'] }, [
                h('span', { class: styles['rowIdentity'] }, [
                  h('span', { class: styles['rowName'] }, [row.entry.displayName]),
                  row.entry.declared === true
                    ? h('span', { class: styles['rowTag'] }, [t('customTag')])
                    : null,
                  row.entry.provider === 'deepseek-account'
                    ? h('span', { class: styles['accountStatus'] }, [
                      h('span', {
                        class: `${styles['credentialDot']} ${styles['credentialDotConfigured']}`,
                        'aria-hidden': 'true',
                      }),
                      t('accountSignedIn'),
                    ])
                    : null,
                  credentialConfigured
                    ? h('span', {
                      class: `${styles['credentialDot']} ${styles['credentialDotConfigured']}`,
                      role: 'img',
                      'aria-label': t('credentialConfigured'),
                      title: t('credentialConfigured'),
                    })
                    : credentialMissing
                      ? h('span', {
                        class: `${styles['credentialDot']} ${styles['credentialDotMissing']}`,
                        role: 'img',
                        'aria-label': t('credentialMissing'),
                        title: t('credentialMissing'),
                      })
                      : null,
                ]),
                h('span', { class: styles['rowActions'] }, [
                  row.entry.provider === 'deepseek-account'
                    ? null
                    : h(
                      'button',
                      {
                        type: 'button',
                        class: styles['secondaryButton'],
                        'aria-label': providerCopy(t('editProvider'), target),
                        disabled: !open && state.status !== 'ready',
                        onClick: () => {
                          if (!open && controller.store.getSnapshot().status !== 'ready') return
                          setSavedTarget(undefined)
                          setAddOpen(false)
                          setEditing(open ? undefined : target)
                        },
                      },
                      [t('edit')],
                    ),
                  row.removable
                    ? h(
                      'button',
                      {
                        type: 'button',
                        class: styles['dangerButton'],
                        'aria-label': providerCopy(t('removeProvider'), target),
                        disabled: !state.writable || state.status !== 'ready',
                        onClick: (
                          /** The route's catalog endpoint (see {@link ProviderEditorProps.defaultBaseURL}). */
                        ) => {
                          if (controller.store.getSnapshot().status !== 'ready') return
                          setSavedTarget(undefined)
                          setDeleteFailure(undefined)
                          setDeleteTarget(target)
                        },
                      },
                      [t('remove')],
                    )
                    : null,
                ]),
              ]),
              error,
              renderSlot(
                'settings.models.provider-card',
                {
                  provider: row.entry,
                  configured: row.configured,
                  keyConfigured: keyConfiguredOf(row),
                },
                { entryKey: row.entry.settingsNs },
              ),
              open
                ? renderProviderEditor({
                  target,
                  row,
                  namespace,
                  schema,
                  operations,
                  t,
                  readOnly: !state.writable,
                  onClose: (changed) => {
                    closeEditor(changed, target)
                  },
                })
                : /** Render an editor for either the setup posture or an expanded provider row. */ null,
            ])
          }),
        ]),
        h('div', { class: styles['addBlock'] }, [
          addOpen
            ? h('div', { class: styles['addCard'] }, [
              h('div', { class: styles['addModes'] }, [
                bothOffered
                  ? h(SegmentedControl<AddMode>, {
                    id: addId,
                    label: t('addMode'),
                    value: mode,
                    disabled: switchLocked,
                    options: [
                      {
                        value: 'catalog',
                        label: t('addCatalog'),
                        disabled: !catalogEnabled,
                        ...(catalogEnabled ? {} : { title: t('addCatalogExhausted') }),
                      },
                      {
                        value: 'custom',
                        label: t('addCustom'),
                        disabled: !customEnabled,
                        ...(customEnabled ? {} : { title: t('addCustomUnavailable') }),
                      },
                    ],
                    onChange: (next) => {
                      setAddMode(next)
                      setVisited(previous => new Set([...previous, next]))
                    },
                  })
                  : h('div', { class: styles['editorHeader'] }, [
                    h(
                      'span',
                      { class: styles['editorTitle'] },
                      t(mode === 'catalog' ? 'addCatalog' : 'addCustom'),
                    ),
                  ]),
                h(
                  'p',
                  { class: styles['advancedHint'] },
                  t(mode === 'catalog' ? 'addCatalogHint' : 'addCustomHint'),
                ),
              ]),
              mounted('catalog') && draft !== undefined
                ? h(
                  'div',
                  {
                    id: `${addId}-catalog-panel`,
                    ...(bothOffered
                      ? { role: 'tabpanel', 'aria-labelledby': `${addId}-catalog` }
                      : {}),
                    hidden: mode !== 'catalog',
                    class: styles['addPanel'],
                  },
                  [
                    h('div', { class: styles['field'] }, [
                      h('span', { class: styles['fieldLabel'] }, [t('provider')]),
                      h(
                        'select',
                        {
                          class: `${styles['input']} ${styles['selectInput']}`,
                          value: draft.target.provider,
                          'aria-label': t('provider'),
                          disabled: catalogBusy,
                          onInput: (event: InputEvent) => {
                            const picked = addable.find(
                              candidate =>
                                candidate.row.entry.provider ===
                                    (event.target as HTMLInputElement).value,
                            )
                            if (picked === undefined) return
                            setEditing(targetOf(picked.row))
                          },
                        },
                        addable.map(({ row }) =>
                          h(
                            'option',
                            { key: row.entry.provider, value: row.entry.provider },
                            row.entry.displayName,
                          ),
                        ),
                      ),
                    ]),
                    h(ProviderEditor, {
                      key: draft.target.provider,
                      provider: draft.target.provider,
                      displayName: draft.target.displayName,
                      hideTitle: true,
                      namespace: draft.namespace,
                      schema: schema,
                      settingsPath: draft.target.settingsPath,
                      operations: operations,
                      ...(draft.target.defaultBaseURL === undefined
                        ? {}
                        : { defaultBaseURL: draft.target.defaultBaseURL }),
                      ...(draft.target.baseURLEnv === undefined
                        ? {}
                        : { baseURLEnv: draft.target.baseURLEnv }),
                      ...(draft.target.nativeAuth === undefined
                        ? {}
                        : { nativeAuth: draft.target.nativeAuth }),
                      ...(addRow?.credentialChecks === undefined
                        ? {}
                        : { credentialChecks: addRow.credentialChecks }),
                      t: t,
                      readOnly: !state.writable,
                      onClose: (changed) => {
                        closeEditor(changed, draft.target)
                      },
                      onBusyChange: setCatalogBusy,
                    }),
                    addRow === undefined
                      ? null
                      : renderSlot(
                        'settings.models.provider-card',
                        {
                          provider: addRow.entry,
                          configured: addRow.configured,
                          keyConfigured: keyConfiguredOf(addRow),
                        },
                        { entryKey: addRow.entry.settingsNs },
                      ),
                  ],
                )
                : null,
              mounted('custom') && piAi !== undefined
                ? h(
                  'div',
                  {
                    id: `${addId}-custom-panel`,
                    ...(bothOffered
                      ? { role: 'tabpanel', 'aria-labelledby': `${addId}-custom` } // Only declared routes may expose route-owned fields.
                      : {
                        // Only declared routes may expose route-owned fields.
                      }),
                    hidden: mode !== 'custom',
                    class: styles['addPanel'],
                  },
                  [
                    h(CustomProviderCard, {
                      taken: state.rows.map(row => row.entry.provider),
                      protocols: protocols,
                      reasoningLevels: reasoningLevels,
                      revision: piAi.revision,
                      operations: operations,
                      t: t,
                      readOnly: !state.writable,
                      onClose: (changed) => {
                        closeAdd()
                        if (changed) void controller.load()
                      },
                      onBusyChange: setCustomBusy,
                    }),
                  ],
                )
                : null,
            ])
            : catalogOffered || customOffered
              ? h('div', { class: styles['addActions'] }, [
                h(
                  'button',
                  {
                    type: 'button',
                    class: styles['addButton'],
                    disabled:
                        !state.writable ||
                        state.status !== 'ready' ||
                        (!catalogEnabled && !customEnabled),
                    onClick: () => {
                      if (controller.store.getSnapshot().status !== 'ready') return
                      const first = addable[0]
                      const initial = catalogEnabled ? 'catalog' : 'custom'
                      setSavedTarget(undefined)
                      setEditing(first === undefined ? undefined : targetOf(first.row))
                      setAddMode(initial)
                      setVisited(new Set([initial]))
                      setAddOpen(true)
                    },
                  },
                  [h(IconPlusOutlineRegular, { size: 14 }), t('add')],
                ),
              ])
              : null,
        ]),
        renderSlot('settings.models.footer', {}),
        h(
          Modal,
          {
            open: deleteTarget !== undefined,
            onClose: closeDelete,
            title: deleteTarget === undefined ? '' : providerCopy(t('deleteTitle'), deleteTarget),
            closeLabel: t('close'),
            description:
              deleteTarget === undefined
                ? ''
                : providerCopy(
                  deleteTarget.credentialRef === undefined
                    ? t('deleteDescription')
                    : t('deleteDescriptionWithCredential'),
                  deleteTarget,
                ),
            className: normalizeClass(styles['deleteDialog']),
          },
          {
            footer: () =>
              h(Fragment, null, [
                h(
                  Button,
                  {
                    variant: 'outline',
                    'data-modal-autofocus': true,
                    disabled: deleting,
                    onClick: closeDelete,
                  },
                  {
                    default: () => t('cancel'),
                  },
                ),
                h(
                  Button,
                  {
                    variant: 'outline',
                    className: normalizeClass(styles['deleteConfirm']),
                    disabled: deleting,
                    onClick: confirmDelete,
                  },
                  {
                    default: () =>
                      deleteTarget === undefined
                        ? ''
                        : providerCopy(deleting ? t('deleting') : t('deleteConfirm'), deleteTarget),
                  },
                ),
              ]),
            default: () =>
              deleteFailure === undefined
                ? null
                : h('p', { class: styles['error'] }, [deleteFailure]),
          },
        ),
      ])
    }
  },
  { inheritAttrs: false, props: ['injected', 'renderSlot'] },
)
