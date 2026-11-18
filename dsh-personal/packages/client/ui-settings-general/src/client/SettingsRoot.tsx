/**
 * Settings shell root: the sidebar-foot trigger row plus the centered modal
 * panel with the section nav rail. In browsers below 768px the panel fills
 * the viewport and the rail turns into a horizontal strip; Windows and macOS
 * desktop windows retain the rail
 * (SettingsRoot.module.css). The shell is a pure composition face —
 * slot-owned text (trigger label, panel title, close label, sections) arrives
 * from registrants through slots; accessible names resolve from localized
 * content (trigger: shell locale; dialog: aria-labelledby the title node;
 * close: visually-hidden slot text). Modal open state and the active section
 * id belong to the declared owner store; the onboarding coordinator mounts
 * exactly one ordered registrant while the sessions-derived empty-Hero fact
 * is active. Visible dialog chrome belongs to the step, so a
 * mounted-but-deciding step paints nothing here.
 */
import {
  h,
  Fragment,
  Teleport,
  defineComponent,
  shallowRef,
  computed,
  watch,
  watchEffect,
  useId,
} from 'vue'
import clsx from 'clsx'
import {
  ConnectionIndicator,
  Tooltip,
  useModalLayer,
  IconAgentPresetOutlineMedium,
  IconArchiveOutlineMedium,
  IconCloseOutlineRegular,
  IconDataOutlineMedium,
  IconPersonalizationOutlineMedium,
  IconSettingsOutlineMedium,
  IconUserOutlineMedium,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConnectionIndicatorState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsRootComponentProps, SettingsSectionRow } from './shell-contract.ts'
import css from './SettingsRoot.module.css'
import { DesktopUpdateIndicator } from './DesktopUpdateIndicator.tsx'
const RECOVERY_CONFIRMATION_MS = 2000
/** Minimum visible time for the connecting pill; shorter attempts read as flicker. */
const CONNECTING_MIN_VISIBLE_MS = 800
/** Nav glyph by section id; unknown ids fall back to the settings gear. */
function navIcon(id: string) {
  if (id === 'account') return h(IconUserOutlineMedium, { size: 16 })
  if (id === 'models') return h(IconDataOutlineMedium, { size: 16 })
  if (id === 'agent-presets') return h(IconAgentPresetOutlineMedium, { size: 16 })
  if (id === 'plugins') return h(IconPersonalizationOutlineMedium, { size: 16 })
  if (id === 'archived-sessions') return h(IconArchiveOutlineMedium, { size: 16 })
  return h(IconSettingsOutlineMedium, { size: 16 })
}
type PanelProps = {
  rows: readonly SettingsSectionRow[]
  renderSlot: SettingsRootComponentProps['renderSlot']
  renderFactorySlot: SettingsRootComponentProps['renderFactorySlot']
  activeId: string | undefined
  onSelect: (id: string) => void
  onClose: () => void
}
/**
 * Body-portaled modal layer: full-viewport mask + centered panel. Close paths: the
 * header button, a mask click, and document-level Escape (mounted only while
 * open, so the listener lifetime is the panel's).
 */
const SettingsPanel = defineComponent(
  (props: PanelProps) => {
    // Entries can unmount underneath the requested id, so the render-time
    // projection falls back to the first row when the id is gone.
    const titleId = useId()
    const panel = shallowRef<HTMLDivElement | null>(null)
    useModalLayer(panel, true, () => { props.onClose() })
    return () => {
      const { rows, renderSlot, renderFactorySlot, activeId, onSelect, onClose } = props
      const active = rows.find(r => r.id === activeId)?.id ?? rows[0]?.id
      // Portalled beside #root like the Modal primitive: a covering surface mounted
      // inside the root would precede the columns' chrome in document order, so a
      // chrome row that declares window drag after it would override its subtraction.
      // Beside the root, base.css's `body > :not(#root)` rule subtracts it instead.
      return h(
        Teleport,
        { to: 'body' },
        {
          default: () => [
            h('div', { class: css.overlay, role: 'presentation' }, [
              h('div', { class: css.mask, 'aria-hidden': 'true', onClick: onClose }),
              h(
                'div',
                {
                  ref: panel,
                  tabIndex: -1,
                  'data-shortcut-modal': 'settings',
                  class: css.panel,
                  role: 'dialog',
                  'aria-modal': 'true',
                  'aria-labelledby': titleId,
                },
                [
                  h(
                    'div',
                    {
                      class: css.navTitle,
                      id: titleId,
                      tabIndex: -1,
                      'data-modal-autofocus': active === undefined ? '' : undefined,
                    },
                    [renderSlot('settings.header', {})],
                  ),
                  h('nav', { class: css.nav }, [
                    h('div', { class: css.navList }, [
                      rows.map(row =>
                        h(
                          'button',
                          {
                            key: row.id,
                            type: 'button',
                            class: clsx(css.navCell, row.id === active && css.active),
                            'aria-current': row.id === active ? 'true' : undefined,
                            'data-modal-autofocus': row.id === active ? '' : undefined,
                            onFocus: (event) => {
                              if (event.currentTarget instanceof HTMLElement)
                                event.currentTarget.scrollIntoView({
                                  block: 'nearest',
                                  inline: 'nearest',
                                })
                            },
                            onClick: () => {
                              onSelect(row.id)
                            },
                          },
                          [
                            h('span', { class: css.navIcon, 'aria-hidden': 'true' }, [
                              renderSlot(
                                'settings.section.icon',
                                { size: 16, active: row.id === active },
                                {
                                  only: row.id,
                                  fallback: navIcon(row.id),
                                },
                              ),
                            ]),
                            h('span', { class: css.navLabel }, [row.label]),
                          ],
                        ),
                      ),
                    ]),
                  ]),
                  h('div', { class: css.header }, [
                    h('div', { class: css.actions }, [renderSlot('settings.action', {})]),
                    h('button', { type: 'button', class: css.close, onClick: onClose }, [
                      h(IconCloseOutlineRegular, { size: 14 }),
                      h('span', { class: css.hiddenLabel }, [renderSlot('settings.close', {})]),
                    ]),
                  ]),
                  h('div', { class: css.options }, [
                    active !== undefined &&
                      renderFactorySlot('settings.section.view', { id: active, close: onClose }),
                  ]),
                ],
              ),
            ]),
          ],
        },
      )
    }
  },
  { inheritAttrs: false, props: ['rows', 'renderSlot', 'renderFactorySlot', 'activeId', 'onSelect', 'onClose'] },
)
/**
 * Render the settings trigger and panel.
 * @param props - composed slot props (contract/slots.ts).
 * @returns the settings shell element tree.
 */
export const SettingsRoot = defineComponent(
  (props: SettingsRootComponentProps) => {
    const shell = props.useStore(state => state)
    const shortcutRef = props.useShortcuts(rows =>
      rows.find(row => row.id === 'settings.open'),
    )
    const rowsRef = props.useSections(value => value)
    const desktopRef = props.useDesktopUpdate(value => value)
    const connectionRef = props.useConnectionState(value => value)
    const stepsRef = props.useOnboardingSteps(value => value)
    const onboardingActive = props.useSessions((state) => {
      const main = Object.values(state.byId).find(
        session => (session.retainedBy.mainView ?? 0) > 0,
      )
      return state.phase === 'ready' && (main === undefined || main.blank)
    })
    const requestedOnboarding = shallowRef<string>()
    const completedOnboarding = shallowRef<ReadonlySet<string>>(new Set())
    const showRecovery = shallowRef(false)
    const holdConnecting = shallowRef(false)
    let connectingShownAt: number | undefined
    const onboarding = computed(() =>
      requestedOnboarding.value !== undefined
        ? stepsRef.value.find(step => step.id === requestedOnboarding.value)
        : onboardingActive.value
          ? stepsRef.value.find(step => !completedOnboarding.value.has(step.id))
          : undefined,
    )
    watch(onboardingActive, (active) => {
      if (!active) completedOnboarding.value = new Set()
    })
    watch(onboarding, (step, previous) => {
      if (previous === undefined && step !== undefined && shell.value.open) props.actions.close()
    })
    watch(
      connectionRef,
      (state, previous) => {
        if (state !== 'connected') showRecovery.value = false
        else if (previous === 'disconnected' || previous === 'connecting')
          showRecovery.value = true
      },
      { flush: 'sync' },
    )
    watchEffect(
      (onCleanup) => {
        if (!showRecovery.value || holdConnecting.value) return
        const timeout = window.setTimeout(() => {
          showRecovery.value = false
        }, RECOVERY_CONFIRMATION_MS)
        onCleanup(() => {
          window.clearTimeout(timeout)
        })
      },
      { flush: 'sync' },
    )
    watch(
      connectionRef,
      (state, _previous, onCleanup) => {
        if (state === 'connecting') {
          connectingShownAt = Date.now()
          return
        }
        const shownAt = connectingShownAt
        if (shownAt === undefined) return
        connectingShownAt = undefined
        const remaining = CONNECTING_MIN_VISIBLE_MS - (Date.now() - shownAt)
        if (remaining <= 0) return
        holdConnecting.value = true
        const timeout = window.setTimeout(() => {
          holdConnecting.value = false
        }, remaining)
        onCleanup(() => {
          window.clearTimeout(timeout)
          holdConnecting.value = false
        })
      },
      { immediate: true, flush: 'sync' },
    )
    const setRequestedOnboarding = (id: string | undefined) => {
      requestedOnboarding.value = id
    }
    const completeOnboardingStep = (id: string) => {
      requestedOnboarding.value = undefined
      completedOnboarding.value = new Set([...completedOnboarding.value, id])
    }
    return () => {
      const { wide, reconnect, renderSlot, renderFactorySlot, t, openDesktopUpdate, actions } = props
      const { close, openSection } = actions
      const { open, activeId } = shell.value
      const shortcut = shortcutRef.value
      const rows = rowsRef.value
      const desktopUpdate = desktopRef.value
      const onboardingStep = onboarding.value
      let connectionIndicator: ConnectionIndicatorState | undefined
      if (connectionRef.value === 'connecting' || holdConnecting.value)
        connectionIndicator = 'connecting'
      else if (connectionRef.value === 'disconnected') connectionIndicator = 'disconnected'
      else if (showRecovery.value) connectionIndicator = 'recovered'
      const openSettings = (sectionId?: string): void => {
        if (sectionId === undefined) actions.open()
        else actions.openSection(sectionId)
      }
      return h(Fragment, null, [
        h('div', { class: css.noticeRow, hidden: !wide }, [h('div', { class: css.notice }, [renderSlot('settings.notice', { openSettings })])]),
        h('div', { class: clsx(css.triggerRow, !wide && css.railRow) }, [
          renderSlot(
            'settings.launcher',
            {
              wide,
              settingsOpen: open,
              openSettings: (sectionId) => {
                if (sectionId === undefined) actions.open()
                else actions.openSection(sectionId)
              },
              ...(shortcut?.keys.length
                ? { settingsShortcut: { keys: shortcut.keys, aria: shortcut.aria } }
                : {}),
              openOnboarding: (id) => {
                close()
                setRequestedOnboarding(id)
              },
            },
            {
              fallback: h(
                Tooltip,
                {
                  disabled: open,
                  label: t('trigger'),
                  ...(shortcut === undefined ? {} : { shortcutKeys: shortcut.keys }),
                },
                {
                  default: () => [
                    h(
                      'button',
                      {
                        type: 'button',
                        class: clsx(css.trigger, !wide && css.rail),
                        'aria-label': t('trigger'),
                        'aria-keyshortcuts': shortcut?.aria,
                        'aria-haspopup': 'dialog',
                        'aria-expanded': open,
                        onClick: () => {
                          actions.open()
                        },
                      },
                      [renderSlot('settings.trigger', { wide })],
                    ),
                  ],
                },
              ),
            },
          ),
          h(ConnectionIndicator, {
            state:
              wide && desktopUpdate.presentation?.phase !== 'installing'
                ? connectionIndicator
                : undefined,
            disconnectedLabel: t('connection.error'),
            connectingLabel: t('connection.connecting'),
            recoveredLabel: t('connection.connected'),
            reconnectActionLabel: t('connection.reconnect'),
            restartActionLabel: t('connection.restart'),
            onReconnect: reconnect,
          }),
          h(DesktopUpdateIndicator, {
            wide: wide,
            hidden:
              connectionIndicator !== undefined &&
              desktopUpdate.presentation?.phase !== 'installing',
            t: t,
            view: desktopUpdate,
            onOpen: openDesktopUpdate,
          }),
        ]),
        open &&
          h(SettingsPanel, {
            rows: rows,
            renderSlot: renderSlot,
            renderFactorySlot,
            activeId: activeId,
            onSelect: actions.select,
            onClose: close,
          }),
        onboardingStep !== undefined &&
          renderSlot(
            'settings.onboarding',
            {
              stepId: onboardingStep.id,
              explicit: requestedOnboarding.value !== undefined,
              complete: () => {
                completeOnboardingStep(onboardingStep.id)
              },
              openSection,
            },
            { only: onboardingStep.id },
          ),
      ])
    }
  },
  {
    inheritAttrs: false,
    props: [
      'wide',
      'reconnect',
      'renderSlot',
      'renderFactorySlot',
      't',
      'openDesktopUpdate',
      'actions',
      'useStore',
      'useShortcuts',
      'useSections',
      'useDesktopUpdate',
      'useConnectionState',
      'useOnboardingSteps',
      'useSessions',
    ],
  },
)
