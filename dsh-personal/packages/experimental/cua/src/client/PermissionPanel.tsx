import { defineComponent, computed, shallowRef, watch, h, Fragment, onMounted } from 'vue'
import {
  Button,
  IconSettingsOutlineRegular,
  Modal,
  Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { CuaApplicationGrant, CuaSystemPermissionState } from '../access-types.ts'
import type { PermissionFace } from './controller.ts'
import type { NS } from './locales.ts'
import css from './PermissionPanel.module.css'
/** Renderer-bound permission observation and localized controls. */
export type PermissionProps = InjectFace<PermissionFace> & PropsLocale<typeof NS>
/** Permission guidance only navigates to the existing bundle details. */
export type PermissionSetupProps = PermissionProps &
  Pick<PropsRuntime<'plugins.bundle.activation'>, 'onDismiss' | 'onOpenDetails'>
type DefaultPresetProps = PermissionProps &
  InjectFace<{
    hooks: {
      cuaDefaultPreset: ConfigForm<{
        default: string
        selectedDefault?: string
      }>
    }
    setPtcDefault: () => Promise<boolean>
  }>
type PersistentPtcProps = PermissionProps & {
  setPersistentPtc: () => Promise<boolean>
}
/** The detail page owns explicit preset and execution-mode settings. */
export type PermissionPanelProps = PermissionProps & DefaultPresetProps & PersistentPtcProps
const DefaultPresetSetting = defineComponent(
  (props: DefaultPresetProps) => {
    const preset = props.useCuaDefaultPreset(value => value)
    const changing = props.useCuaPermissions(value => value.changing)
    return () =>
      h(ConfigurationSetting, {
        kind: 'default',
        status:
          preset.value.value !== undefined && preset.value.status === 'loading'
            ? 'ready'
            : preset.value.status,
        loading: preset.value.value === undefined && preset.value.status === 'loading',
        writable: preset.value.writable,
        t: props.t,
        busy: changing.value,
        save: props.setPtcDefault,
        configured: (preset.value.value?.selectedDefault ?? preset.value.value?.default) === 'ptc',
      })
  },
  {
    props: ['useCuaDefaultPreset', 'useCuaPermissions', 't', 'setPtcDefault'],
    inheritAttrs: false,
  },
)
const PersistentPtcSetting = defineComponent(
  (props: PersistentPtcProps) => {
    const runtime = props.useCuaPermissions(value => value.runtime)
    const changing = props.useCuaPermissions(value => value.changing)
    return () =>
      h(ConfigurationSetting, {
        kind: 'persistent',
        loading: runtime.value.value === null && runtime.value.error === null,
        status:
          runtime.value.error !== null
            ? 'unavailable'
            : runtime.value.value !== null
              ? 'ready'
              : 'loading',
        writable: runtime.value.value?.writable === true,
        t: props.t,
        busy: changing.value || runtime.value.busy,
        save: props.setPersistentPtc,
        configured: runtime.value.value?.persistent === true,
      })
  },
  {
    props: ['useCuaPermissions', 't', 'setPersistentPtc'],
    inheritAttrs: false,
  },
)
const ConfigurationSetting = defineComponent(
  (
    props: PropsLocale<typeof NS> & {
      kind: 'default' | 'persistent'
      busy: boolean
      status: 'loading' | 'ready' | 'unavailable'
      loading: boolean
      writable: boolean
      configured: boolean
      save: () => Promise<boolean>
    },
  ) => {
    const kind = computed(() => props.kind)
    const status = computed(() => props.status)
    const loading = computed(() => props.loading)
    const writable = computed(() => props.writable)
    const configured = computed(() => props.configured)
    const save = computed(() => props.save)
    const t = computed(() => props.t)
    const busy = computed(() => props.busy)
    const saving = shallowRef(false)
    const setSaving = (
      next: typeof saving.value | ((previous: typeof saving.value) => typeof saving.value),
    ) => {
      saving.value = typeof next === 'function' ? next(saving.value) : next
    }
    const error = shallowRef<string | null>(null)
    const setError = (next: (string | null) | ((previous: string | null) => string | null)) => {
      error.value = typeof next === 'function' ? next(error.value) : next
    }
    const submit = async (): Promise<void> => {
      setSaving(true)
      setError(null)
      try {
        if (!(await save.value())) setError(t.value(`${kind.value}NotSaved`))
      } catch (failure) {
        setError(
          t.value(`${kind.value}Failed`, {
            message: failure instanceof Error ? failure.message : String(failure),
          }),
        )
      } finally {
        setSaving(false)
      }
    }
    return () =>
      h(
        'div',
        {
          class: css.defaultSetting,
          role: 'group',
          'aria-label': t.value(`${kind.value}Title`),
        },
        [
          h(
            'div',
            {
              class: css.permission,
            },
            [
              h('div', null, [
                h('strong', null, [t.value(`${kind.value}Title`)]),
                h('p', null, [t.value(`${kind.value}Body`)]),
              ]),
              loading.value
                ? h('span', {
                  class: css.buttonPlaceholder,
                  'aria-hidden': true,
                })
                : h(
                  Button,
                  {
                    size: 'sm',
                    className: css.permissionAction ?? '',
                    'data-configured': configured.value || undefined,
                    variant: configured.value ? 'outline' : 'primary',
                    disabled:
                        busy.value ||
                        saving.value ||
                        configured.value ||
                        !writable.value ||
                        status.value !== 'ready',
                    onClick: () => {
                      void submit()
                    },
                  },
                  {
                    default: () => [
                      t.value(configured.value ? `${kind.value}Set` : `${kind.value}Confirm`),
                    ],
                  },
                ),
            ],
          ),
          !configured.value &&
            (status.value === 'unavailable'
              ? h(
                'p',
                {
                  class: css.error,
                  role: 'alert',
                },
                [t.value(`${kind.value}Unavailable`)],
              )
              : status.value === 'ready' &&
                !writable.value &&
                h(
                  'p',
                  {
                    class: css.error,
                    role: 'alert',
                  },
                  [t.value(`${kind.value}ReadOnly`)],
                )),
          error.value !== null &&
            h(
              'p',
              {
                class: css.error,
                role: 'alert',
              },
              [error.value],
            ),
        ],
      )
  },
  {
    props: ['kind', 'status', 'loading', 'writable', 'configured', 'save', 't', 'busy'],
    inheritAttrs: false,
  },
)
function Applications({
  title,
  apps,
  icons,
  onAction,
  label,
  disabled,
}: {
  title: string
  apps: readonly CuaApplicationGrant[]
  icons: Record<string, string> | null
  disabled: boolean
  label: string
  onAction: PermissionProps['revoke']
}) {
  return h(
    'section',
    {
      class: css.group,
    },
    [
      h('h4', null, [title]),
      h(
        'ul',
        {
          class: css.apps,
        },
        [
          apps.map(app =>
            h(
              'li',
              {
                key: app.id,
              },
              [
                h(
                  'div',
                  {
                    class: css.application,
                    title: app.executablePath,
                  },
                  [
                    app.executablePath !== undefined && icons?.[app.executablePath] !== undefined
                      ? h('img', {
                        src: icons[app.executablePath],
                        alt: '',
                        width: 32,
                        height: 32,
                        draggable: false,
                      })
                      : h('span', {
                        class: css.iconPlaceholder,
                        'aria-hidden': true,
                      }),
                    h('strong', null, [app.name]),
                  ],
                ),
                h(
                  Button,
                  {
                    size: 'sm',
                    variant: 'outline',
                    disabled: disabled,
                    onClick: () => {
                      onAction(app.id)
                    },
                  },
                  {
                    default: () => [label],
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    ],
  )
}
function PermissionDescription({
  application,
  permission,
  loading = false,
  t,
}: Pick<PermissionProps, 't'> & {
  application: Extract<
    CuaSystemPermissionState,
    {
      platform: 'darwin'
    }
  >['launchApplication']
  permission: 'accessibility' | 'screenRecording'
  loading?: boolean
}) {
  if (application === undefined && !loading)
    return h('p', null, [
      t(permission === 'accessibility' ? 'accessibilityUse' : 'screenRecordingUse'),
    ])
  const [before, after] = t(
    permission === 'accessibility' ? 'accessibilityPermission' : 'screenRecordingPermission',
  ).split('{application}')
  return h('p', null, [
    before,
    h(
      'span',
      {
        class: css.applicationBadge,
      },
      [
        application === undefined
          ? h('span', {
            class: css.appPlaceholder,
          })
          : h(Fragment, null, [
            application.icon !== undefined &&
                h('img', {
                  src: application.icon,
                  alt: '',
                  width: 20,
                  height: 20,
                  draggable: false,
                }),
            h('span', null, [application.name]),
          ]),
      ],
    ),
    after,
  ])
}
function PermissionAction({
  permission,
  granted,
  busy,
  request,
  openSettings,
  t,
}: Pick<PermissionProps, 'request' | 'openSettings' | 't'> & {
  permission: 'accessibility' | 'screenRecording'
  granted: boolean | null
  busy: boolean
}) {
  if (granted === false)
    return h(
      Button,
      {
        size: 'sm',
        variant: 'primary',
        className: css.permissionAction ?? '',
        disabled: busy,
        onClick: () => {
          request(permission)
        },
      },
      {
        default: () => [t('request')],
      },
    )
  return h(
    Button,
    {
      size: 'sm',
      variant: 'outline',
      className: css.permissionAction ?? '',
      disabled: busy,
      title: t('settings'),
      onClick: () => {
        openSettings(permission)
      },
    },
    {
      default: () => [
        t(granted === true ? 'granted' : 'unknown'),
        h(IconSettingsOutlineRegular, {
          size: 14,
          'aria-hidden': 'true',
        }),
      ],
    },
  )
}
function UnknownStatus({
  loading,
  t,
}: Pick<PermissionProps, 't'> & {
  loading: boolean
}) {
  return (['accessibility', 'screenRecording'] as const).map((permission) => {
    const use = t(permission === 'accessibility' ? 'accessibilityUse' : 'screenRecordingUse')
    return h(
      'div',
      {
        class: css.permission,
        key: permission,
        role: 'group',
        'aria-label': use,
      },
      [
        loading
          ? h(
            'div',
            {
              class: css.skeletonCopy,
              'aria-hidden': 'true',
            },
            [
              h('strong', null, [t(permission)]),
              h(PermissionDescription, {
                application: undefined,
                permission: permission,
                loading: true,
                t: t,
              }),
            ],
          )
          : h('div', null, [h('strong', null, [use])]),
        loading
          ? h('span', {
            class: css.buttonPlaceholder,
            'aria-hidden': true,
          })
          : h('span', null, [t('unknown')]),
      ],
    )
  })
}
function WindowsStatus({
  system,
  uncertain,
  t,
}: Pick<PermissionProps, 't'> & {
  system: Extract<
    CuaSystemPermissionState,
    {
      platform: 'windows'
    }
  >
  uncertain: boolean
}) {
  const unlocked = system.sessionLocked === false
  return h(Fragment, null, [
    h(
      'div',
      {
        class: css.permission,
        role: 'group',
        'aria-label': t('windowsDesktop'),
      },
      [
        h('div', null, [
          h('strong', null, [t('windowsDesktop')]),
          h('p', null, [t('windowsDesktopUse')]),
        ]),
        h('span', null, [
          uncertain || system.sessionLocked === null
            ? t('unknown')
            : t(unlocked ? 'available' : 'locked'),
        ]),
      ],
    ),
    h(
      'div',
      {
        class: css.permission,
        role: 'group',
        'aria-label': t('windowsCapture'),
      },
      [
        h('div', null, [
          h('strong', null, [t('windowsCapture')]),
          h('p', null, [t('screenRecordingUse')]),
        ]),
        h('span', null, [
          uncertain || system.sessionLocked === null
            ? t('unknown')
            : t(unlocked && system.captureAvailable ? 'available' : 'unavailable'),
        ]),
      ],
    ),
  ])
}
function systemReady(system: CuaSystemPermissionState): boolean {
  switch (system.platform) {
    case 'darwin':
      return system.accessibility && system.screenRecording
    case 'windows':
      return system.sessionLocked === false && system.captureAvailable
    /* v8 ignore next -- Native permission responses validate the closed platform union. */
    default:
      return assertNever(system)
  }
}
/** @param props Host observation and explicit user actions. @returns Permission controls without automatic system prompts. */
export const PermissionPanel = defineComponent(
  (props: PermissionPanelProps) => {
    const t = computed(() => props.t)
    const refresh = computed(() => props.refresh)
    const state = props.useCuaPermissions(value => value)
    const observed = computed(() => state.value.system.value)
    const apps = computed(() => state.value.applications.value)
    const transitioning = computed(() => state.value.changing)
    const busy = computed(() => transitioning.value || state.value.system.busy)
    const appsBusy = computed(() => transitioning.value || state.value.applications.busy)
    const loading = computed(() => observed.value === null && state.value.system.error === null)
    const mac = computed(() => (observed.value?.platform === 'darwin' ? observed.value : null))
    const application = computed(() =>
      state.value.system.error !== null ? undefined : mac.value?.launchApplication,
    )
    onMounted(() =>
      watch(
        [() => refresh.value],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            const refreshNow = refresh.value
            refreshNow()
            window.addEventListener('focus', refreshNow)
            return () => {
              window.removeEventListener('focus', refreshNow)
            }
          })()
          if (typeof cleanup === 'function') onCleanup(cleanup)
        },
        { immediate: true, flush: 'post' },
      ),
    )
    return () =>
      h(
        'div',
        {
          class: css.panels,
          'data-cua-settings': true,
          'aria-busy': transitioning.value || state.value.busy || loading.value,
        },
        [
          h(
            'section',
            {
              class: css.panel,
              'aria-label': t.value('title'),
            },
            [
              h('h3', null, [t.value('title')]),
              h(
                'div',
                {
                  class: css.card,
                },
                [
                  h(DefaultPresetSetting, {
                    ...props,
                  }),
                  h(PersistentPtcSetting, {
                    ...props,
                  }),
                  state.value.system.error !== null &&
                    h(
                      'div',
                      {
                        class: css.notice,
                        role: 'alert',
                      },
                      [
                        h(
                          'span',
                          {
                            class: css.error,
                          },
                          [t.value('queryFailed', { message: state.value.system.error })],
                        ),
                        h(
                          Button,
                          {
                            size: 'sm',
                            variant: 'outline',
                            disabled: busy.value,
                            onClick: refresh.value,
                          },
                          {
                            default: () => [t.value('retry')],
                          },
                        ),
                      ],
                    ),
                  observed.value === null
                    ? h(UnknownStatus, {
                      loading: loading.value,
                      t: t.value,
                    })
                    : observed.value.platform === 'windows'
                      ? h(WindowsStatus, {
                        system: observed.value,
                        uncertain: state.value.system.error !== null,
                        t: t.value,
                      })
                      : (['accessibility', 'screenRecording'] as const).map(permission =>
                        h(
                          'div',
                          {
                            class: css.permission,
                            key: permission,
                            role: 'group',
                            'aria-label': t.value(permission),
                          },
                          [
                            h('div', null, [
                              h('strong', null, [t.value(permission)]),
                              h(PermissionDescription, {
                                application: application.value,
                                permission: permission,
                                t: t.value,
                              }),
                            ]),
                            h(PermissionAction, {
                              permission: permission,
                              granted:
                                  mac.value === null || state.value.system.error !== null
                                    ? null
                                    : mac.value[permission],
                              busy: busy.value,
                              request: props.request,
                              openSettings: props.openSettings,
                              t: t.value,
                            }),
                          ],
                        ),
                      ),
                ],
              ),
              h(
                'p',
                {
                  class: observed.value === null ? css.pendingHint : undefined,
                  'aria-hidden': observed.value === null || undefined,
                },
                [
                  observed.value?.platform === 'windows'
                    ? h(Fragment, null, [
                      t.value('windowsInstructions'),
                      ' ',
                      t.value(observed.value.elevated ? 'elevated' : 'standardPrivileges'),
                    ])
                    : t.value('permissionHint'),
                ],
              ),
            ],
          ),
          h(
            'section',
            {
              class: css.panel,
              'aria-label': t.value('applicationsTitle'),
            },
            [
              h('h3', null, [t.value('applicationsTitle')]),
              h(
                'div',
                {
                  class: css.card,
                },
                [
                  (['applications', 'icons'] as const).map(
                    key =>
                      state.value[key].error !== null &&
                      h(
                        'div',
                        {
                          class: css.notice,
                          role: 'alert',
                          key: key,
                        },
                        [
                          h(
                            'span',
                            {
                              class: css.error,
                            },
                            [
                              t.value(
                                key === 'applications' ? 'applicationsFailed' : 'iconsFailed',
                                { message: state.value[key].error },
                              ),
                            ],
                          ),
                          h(
                            Button,
                            {
                              size: 'sm',
                              variant: 'outline',
                              disabled: transitioning.value || state.value[key].busy,
                              onClick: refresh.value,
                            },
                            {
                              default: () => [t.value('retry')],
                            },
                          ),
                        ],
                      ),
                  ),
                  apps.value === null
                    ? h(
                      'p',
                      {
                        class: css.emptyState,
                      },
                      [
                        h(
                          'span',
                          {
                            class: css.appsPlaceholder,
                            'aria-hidden': true,
                          },
                          [t.value('noApps')],
                        ),
                      ],
                    )
                    : h(Fragment, null, [
                      apps.value.allowedApps.length === 0 &&
                          apps.value.blockedApps.length === 0 &&
                          h(
                            'p',
                            {
                              class: css.emptyState,
                            },
                            [t.value('noApps')],
                          ),
                      apps.value.allowedApps.length > 0 &&
                          h(Applications, {
                            title: t.value('allowedApps'),
                            apps: apps.value.allowedApps,
                            icons: state.value.icons.value,
                            onAction: props.revoke,
                            label: t.value('revoke'),
                            disabled: appsBusy.value || !apps.value.persistentAvailable,
                          }),
                      apps.value.blockedApps.length > 0 &&
                          h(Applications, {
                            title: t.value('blockedApps'),
                            apps: apps.value.blockedApps,
                            icons: state.value.icons.value,
                            onAction: props.retryApproval,
                            label: t.value('retryApproval'),
                            disabled: appsBusy.value,
                          }),
                    ]),
                ],
              ),
            ],
          ),
        ],
      )
  },
  {
    props: [
      't',
      'refresh',
      'useCuaPermissions',
      'request',
      'openSettings',
      'revoke',
      'retryApproval',
      'useCuaDefaultPreset',
      'setPtcDefault',
      'setPersistentPtc',
      'dismissToast',
    ],
    inheritAttrs: false,
  },
)
/**
 * @param props Permission observation and activation navigation callbacks.
 * @returns Setup guidance when system permissions need attention.
 */
export const PermissionSetup = defineComponent(
  (props: PermissionSetupProps) => {
    const t = computed(() => props.t)
    const refresh = computed(() => props.refresh)
    const useCuaPermissions = computed(() => props.useCuaPermissions)
    const onDismiss = computed(() => props.onDismiss)
    const onOpenDetails = computed(() => props.onOpenDetails)
    const state = useCuaPermissions.value(value => value.system)
    const ready = computed(
      () =>
        state.value.value !== null && state.value.error === null && systemReady(state.value.value),
    )
    onMounted(() =>
      watch(
        [() => refresh.value],
        () => {
          refresh.value()
        },
        { immediate: true, flush: 'post' },
      ),
    )
    onMounted(() =>
      watch(
        [() => ready.value, () => state.value.busy, () => onDismiss.value],
        () => {
          if (ready.value && !state.value.busy) onDismiss.value()
        },
        { immediate: true, flush: 'post' },
      ),
    )
    return () =>
      h(
        Modal,
        {
          open:
            !ready.value &&
            (state.value.value !== null || (!state.value.busy && state.value.error !== null)),
          title: t.value(
            state.value.value?.platform === 'windows' ? 'windowsSetupTitle' : 'setupTitle',
          ),
          closeLabel: t.value('close'),
          onClose: onDismiss.value,
        },
        {
          default: () => [
            h('p', null, [
              t.value(
                state.value.error !== null
                  ? 'setupQueryFailed'
                  : state.value.value?.platform !== 'windows'
                    ? 'setupBody'
                    : state.value.value.sessionLocked === null
                      ? 'windowsSessionUnknown'
                      : state.value.value.sessionLocked
                        ? 'windowsSetupBody'
                        : 'windowsCaptureUnavailable',
              ),
            ]),
          ],
          footer: () =>
            h(Fragment, null, [
              h(
                Button,
                {
                  variant: 'ghost',
                  onClick: onDismiss.value,
                },
                {
                  default: () => [t.value('later')],
                },
              ),
              h(
                Button,
                {
                  variant: 'primary',
                  'data-modal-autofocus': true,
                  onClick: onOpenDetails.value,
                },
                {
                  default: () => [t.value('openSetup')],
                },
              ),
            ]),
        },
      )
  },
  {
    props: ['t', 'refresh', 'useCuaPermissions', 'onDismiss', 'onOpenDetails'],
    inheritAttrs: false,
  },
)
/** @param props Shared operation outcome, independent of page lifetime. @returns The existing global toast presentation. */
export const PermissionToast = defineComponent(
  (props: PermissionProps) => {
    const toast = props.useCuaPermissions(value => value.toast)
    return () => {
      if (!toast.value) return null
      return h(Toast, {
        key: toast.value.id,
        text:
          toast.value.kind === 'failed'
            ? props.t('failed', { message: toast.value.message })
            : props.t(toast.value.kind),
        ...(toast.value.kind === 'revoked' ? { tone: 'success' as const } : {}),
        onDone: props.dismissToast,
      })
    }
  },
  {
    props: ['useCuaPermissions', 't', 'dismissToast'],
    inheritAttrs: false,
  },
)

Applications.inheritAttrs = false
PermissionDescription.inheritAttrs = false
PermissionAction.inheritAttrs = false
UnknownStatus.inheritAttrs = false
WindowsStatus.inheritAttrs = false
