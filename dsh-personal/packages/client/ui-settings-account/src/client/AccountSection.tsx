import {
  normalizeClass,
  Fragment,
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  watch,
} from 'vue'
/** Account settings renders safe Host state and explicit login actions. */
import { Big } from 'big.js'
import { Button, IconRightUpOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  AccountDetails,
  AccountView,
  SignInAttemptId,
} from '@deepseek-ai/dsh-deepseek-account/types'
import type {
  PropsRuntime,
  PropsLocale,
  InjectFace,
  HostObservable,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { PlatformPage, PlatformPages } from './platform-pages.ts'
import { formatBalance } from './formatBalance.ts'
import { AccountAvatar } from './AccountAvatar.tsx'
import type { AccountAvatarSnapshot } from './account-avatar.ts'
import { authorizeUrlWithTheme } from './authorize-url.ts'
import css from './AccountSection.module.css'
/** Safe account snapshot shared by the settings page and launcher. */
export interface AccountSnapshot {
  /** Latest Host state, absent until the stream responds. */
  view: AccountView | undefined
  /** Sanitized profile and balance query outcomes, absent while loading. */
  details: Partial<AccountDetails> | undefined
  /** Shared picture load; absent until a profile supplies a picture or after sign-out. */
  avatar: AccountAvatarSnapshot | undefined
  /** Whether the state stream failed. */
  failed: boolean
  /** Explicitly opened account dialog outside onboarding. */
  loginVisible?: boolean
  /** Latest explicit start request failed before a Host state was available. */
  loginFailed?: boolean
  /** Model credential onboarding owns the login dialog and delays account notifications while mounted. */
  onboarding?: boolean
  /** Desktop introduction covers the workspace during loading, saving, and exit animation.
   * True on Desktop until shell.overlay reports visibility, false in browsers; Desktop layouts must render that slot.
   */
  desktopOnboardingVisible?: boolean
}
/** Host operations injected into the Cordis-free account component. */
export interface AccountSectionInjected {
  /** @param snapshot - picture attempt whose rendered image failed; superseded attempts are ignored. */
  avatarFailed: (snapshot: AccountAvatarSnapshot) => void
  /** Subscribe to live credential-expiry notifications.
   * @param listener - callback after the current credential is removed.
   * @returns listener cleanup.
   */
  subscribeSessionExpired?: (listener: () => void) => () => void
  /** Subscribe to live model sign-in guidance; the returned function removes the listener.
   * @param listener - callback for one rejected account-model request.
   * @returns listener cleanup.
   */
  subscribeModelSignInRequired?: (listener: () => void) => () => void
  /** Desktop-only: show one page in the account feature's shared native host; absent in ordinary browsers. */
  openPlatformPage?: PlatformPages['open']
  /** Account stream owned by the Host and theme snapshots published by the renderer, observed through framework hooks. */
  hooks: {
    account: HostObservable<AccountSnapshot>
    /** Palette the Platform login pages follow. */
    theme: HostObservable<ThemeSnapshot>
  }
  /**
   * Retry a failed avatar, read the profile and balances, and notify account refresh extensions. The Settings launcher
   * calls it on each entry, and a page opener on return from top-up.
   * @returns after the account queries settle; image loading completes independently.
   */
  refreshAccount: () => Promise<void>
  /** Open the external support questionnaire with the account, build and environment sampled by this click. */
  contactUs: () => void
  /** Open or dismiss the login dialog. */
  showLogin: (visible: boolean) => void
  /** Claim dialog ownership for the onboarding step. */
  setOnboarding: (active: boolean) => void
  /** @returns after the login attempt is created. */
  start: () => Promise<void>
  /** @param id - attempt to cancel. @returns after cancellation or an already-admitted commit. */
  cancel: (id: SignInAttemptId) => Promise<void>
  /** @returns whether a running task currently uses the account token. */
  hasRunningAccountTasks: () => Promise<boolean>
  /** @returns after local account credentials are removed. */
  signOut: () => Promise<void>
}
/** Composed account section props. */
export type AccountSectionProps = PropsRuntime<'settings.section'> &
  PropsLocale<'settings.account'> &
  InjectFace<AccountSectionInjected>
/** @param props - localized actions, account subscription, and the shared Platform page channel. @returns account settings UI. */
export const AccountSection = defineComponent(
  (componentProps: AccountSectionProps) => {
    const snapshot0Ref = componentProps.useAccount(value => value)
    const colorSchemeRef = componentProps.useTheme(snapshot => snapshot.active.colorScheme)
    const releasePage = shallowRef<(() => void) | undefined>(undefined)
    const failedRef = shallowRef(false)
    const setFailed = (
      value:
        | typeof failedRef.value
        | ((previous: typeof failedRef.value) => typeof failedRef.value),
    ): void => {
      failedRef.value = typeof value === 'function' ? value(failedRef.value) : value
    }
    const busyRef = shallowRef(false)
    const setBusy = (
      value: typeof busyRef.value | ((previous: typeof busyRef.value) => typeof busyRef.value),
    ): void => {
      busyRef.value = typeof value === 'function' ? value(busyRef.value) : value
    }
    const profileRef = computed(() =>
      snapshot0Ref.value.details?.profile?.status === 'ready'
        ? snapshot0Ref.value.details.profile.value
        : undefined,
    )
    const walletsRef = computed(() =>
      snapshot0Ref.value.details?.balance?.status === 'ready'
        ? snapshot0Ref.value.details.balance.value
        : undefined,
    )
    const bonusWalletsRef = computed(() =>
      snapshot0Ref.value.details?.balance?.status === 'ready'
        ? snapshot0Ref.value.details.balance.bonusWallets.filter(wallet =>
          new Big(wallet.balance).gt(0),
        )
        : [],
    )
    const showBonusRowRef = computed(
      () =>
        snapshot0Ref.value.details?.balance?.status !== 'ready' || bonusWalletsRef.value.length > 0,
    )
    const attemptRef = computed(() => snapshot0Ref.value.view?.attempt)
    const activeRef = computed(
      () =>
        attemptRef.value !== null &&
        attemptRef.value !== undefined &&
        ['initializing', 'waiting-browser', 'exchanging', 'committing'].includes(
          attemptRef.value.phase,
        ),
    )
    const signedInRef = computed(() => snapshot0Ref.value.view?.status === 'credential-stored')
    onMounted(() => {
      const dispose = (() => () => {
        releasePage.value?.()
        releasePage.value = undefined
      })()
      if (typeof dispose === 'function') onBeforeUnmount(dispose)
    })
    onMounted(() => {
      watch(
        () => [signedInRef.value],
        (_values, _old) => {
          (() => {
            if (signedInRef.value) return
            releasePage.value?.()
            releasePage.value = undefined
          })()
        },
        { immediate: true, flush: 'post' },
      )
    })
    const showPage = (open: PlatformPages['open'], page: PlatformPage) => {
      releasePage.value?.()
      releasePage.value = open(page, () => {
        releasePage.value = undefined
      })
    }
    const run = async (action: () => Promise<void>) => {
      setBusy(true)
      setFailed(false)
      try {
        await action()
      } catch {
        setFailed(true)
      } finally {
        setBusy(false)
      }
    }
    const openUsage = (event: MouseEvent): void => {
      if (componentProps.openPlatformPage !== undefined && signedInRef.value) {
        event.preventDefault()
        showPage(componentProps.openPlatformPage, 'usage')
      }
    }
    const platformLink = (label: string, className: string | undefined) =>
      h(
        'a',
        {
          class: className,
          href: snapshot0Ref.value.view?.links.usageUrl,
          'aria-disabled': snapshot0Ref.value.view === undefined,
          target: '_blank',
          rel: 'noreferrer',
          onClick: openUsage,
        },
        [label],
      )
    const statusRef = computed(() =>
      failedRef.value || snapshot0Ref.value.failed || attemptRef.value?.phase === 'failed'
        ? componentProps.t('failed')
        : attemptRef.value?.phase === 'expired'
          ? componentProps.t('expired')
          : activeRef.value
            ? componentProps.t(
              attemptRef.value?.phase === 'initializing'
                ? 'initializing'
                : attemptRef.value?.phase === 'waiting-browser'
                  ? 'waiting'
                  : 'completing',
            )
            : signedInRef.value
              ? (profileRef.value?.contact ??
                componentProps.t(
                  snapshot0Ref.value.details?.profile === undefined
                    ? 'loading'
                    : 'profileUnavailable',
                ))
              : componentProps.t('signInDescription'),
    )
    return () => {
      const render_signedInRef = signedInRef.value
      const render_activeRef = activeRef.value
      const render_failedRef = failedRef.value
      const render_snapshot0Ref = snapshot0Ref.value
      const render_busyRef = busyRef.value
      const render_profileRef = profileRef.value
      const render_statusRef = statusRef.value
      const render_attemptRef = attemptRef.value
      const render_colorSchemeRef = colorSchemeRef.value
      const render_walletsRef = walletsRef.value
      const render_showBonusRowRef = showBonusRowRef.value
      const render_bonusWalletsRef = bonusWalletsRef.value
      const render_prop_t = componentProps.t
      const render_prop_start = componentProps.start
      const render_prop_avatarFailed = componentProps.avatarFailed
      const render_prop_cancel = componentProps.cancel
      const render_prop_openPlatformPage = componentProps.openPlatformPage
      if (!render_signedInRef && !render_activeRef)
        return h('section', { class: css.signedOut, 'aria-label': render_prop_t('nav') }, [
          h('div', { class: css.signedOutContent }, [
            h('div', { class: css.signedOutCopy }, [
              h('span', { class: css.signedOutTitle }, [render_prop_t('settingsSignedOutTitle')]),
              h('span', { class: css.signedOutDescription, role: 'status' }, [
                render_failedRef || render_snapshot0Ref.failed
                  ? render_prop_t('failed')
                  : render_prop_t('settingsSignedOutDescription'),
              ]),
            ]),
            h(
              Button,
              {
                variant: 'primary',
                className: normalizeClass(css.signInButton),
                disabled: render_busyRef || render_snapshot0Ref.view === undefined,
                onClick: () => {
                  void run(render_prop_start)
                },
              },
              {
                default: () => render_prop_t('signIn'),
              },
            ),
          ]),
        ])
      return h('section', { class: css.section, 'aria-label': render_prop_t('nav') }, [
        h('div', { class: css.card }, [
          h('div', { class: css.identity }, [
            h(
              'span',
              {
                class: css.avatar,
                'data-avatar-status': render_signedInRef
                  ? render_snapshot0Ref.avatar?.status
                  : undefined,
              },
              [
                h(AccountAvatar, {
                  avatar: render_signedInRef ? render_snapshot0Ref.avatar : undefined,
                  avatarFailed: render_prop_avatarFailed,
                }),
              ],
            ),
            h('div', { class: css.identityCopy }, [
              h('span', { class: css.name }, [
                render_signedInRef
                  ? (render_profileRef?.name ?? render_prop_t('signedIn'))
                  : render_prop_t('signedOut'),
              ]),
              h('span', { class: css.status, role: 'status' }, [render_statusRef]),
            ]),
          ]),
          render_signedInRef && render_snapshot0Ref.view !== undefined &&
            h(
              'a',
              {
                class: css.accountInfo,
                href: new URL('/', render_snapshot0Ref.view.links.usageUrl).href,
                target: '_blank',
                rel: 'noopener noreferrer',
              },
              [render_prop_t('accountInfo'), h(IconRightUpOutlineRegular, { size: 12 })],
            ),
        ]),
        render_activeRef && render_attemptRef !== undefined && render_attemptRef !== null &&
          h('div', { class: css.actions }, [
            render_attemptRef.authorizeUrl &&
              h(
                'a',
                {
                  class: css.linkButton,
                  href: authorizeUrlWithTheme(
                    render_attemptRef.authorizeUrl,
                    render_colorSchemeRef,
                  ),
                  target: '_blank',
                  rel: 'noreferrer',
                },
                [render_prop_t('open')],
              ),
            h(
              Button,
              {
                variant: 'outline',
                disabled: render_busyRef || render_attemptRef.phase === 'committing',
                onClick: () => {
                  void run(() => render_prop_cancel(render_attemptRef.id))
                },
              },
              {
                default: () => render_prop_t('cancel'),
              },
            ),
          ]),
        h('div', { class: css.balanceCard }, [
          h('div', { class: css.row }, [
            h('span', null, [render_prop_t('balance')]),
            render_signedInRef && render_walletsRef !== undefined && render_walletsRef.length > 0
              ? h('span', { class: css.amount }, [
                render_walletsRef.map(wallet =>
                  h('span', { key: wallet.currency }, [
                    formatBalance(wallet.balance, wallet.currency === 'CNY' ? '\u00A5' : '$'),
                  ]),
                ),
              ])
              : !render_signedInRef || render_snapshot0Ref.details?.balance === undefined
                ? h('span', { class: css.unavailable }, [
                  render_prop_t(!render_signedInRef ? 'balanceSignedOut' : 'loading'),
                ])
                : platformLink(render_prop_t('balanceUnavailable'), css.unavailableLink),
          ]),
          render_signedInRef &&
            render_showBonusRowRef &&
            h(Fragment, null, [
              h('div', { class: css.divider }),
              h('div', { class: css.row }, [
                h('span', null, [render_prop_t('bonusBalance')]),
                h('span', { class: css.bonusValue }, [
                  render_bonusWalletsRef.length > 0
                    ? h('span', { class: css.amount }, [
                      render_bonusWalletsRef.map(wallet =>
                        h('span', { key: wallet.currency }, [
                          formatBalance(
                            wallet.balance,
                            wallet.currency === 'CNY' ? '\u00A5' : '$',
                          ),
                        ]),
                      ),
                    ])
                    : render_snapshot0Ref.details?.balance === undefined
                      ? h('span', { class: css.unavailable }, [render_prop_t('loading')])
                      : platformLink(render_prop_t('balanceUnavailable'), css.unavailableLink),
                ]),
              ]),
            ]),
          h('div', { class: css.divider }),
          h('div', { class: css.row }, [
            h('span', { class: css.secondary }, [render_prop_t('more')]),
            h('div', { class: css.links }, [
              platformLink(render_prop_t('usage'), css.linkButton),
              h(
                'a',
                {
                  class: `${css.linkButton} ${css.primary}`,
                  href: render_snapshot0Ref.view?.links.topUpUrl,
                  'aria-disabled': render_snapshot0Ref.view === undefined,
                  target: '_blank',
                  rel: 'noreferrer',
                  onClick: (event) => {
                    if (render_prop_openPlatformPage !== undefined && render_signedInRef) {
                      event.preventDefault()
                      showPage(render_prop_openPlatformPage, 'top-up')
                    }
                  },
                },
                [render_prop_t('topUp')],
              ),
            ]),
          ]),
        ]),
      ])
    }
  },
  {
    inheritAttrs: false,
    props: ['t', 'useAccount', 'useTheme', 'start', 'cancel', 'openPlatformPage', 'avatarFailed'],
  },
)
