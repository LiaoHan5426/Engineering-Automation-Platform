import {
  Fragment,
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  watch,
} from 'vue'
/** Account-owned take-over of the frame-wide quota notice for account balances. */
import {
  Button,
  Modal,
  Toast,
  IconWarningOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  InjectFace,
  HostObservable,
  PropsLocale,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { QuotaNoticeOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { AccountSnapshot } from './AccountSection.tsx'
import type { PlatformPageClaim, PlatformPages } from './platform-pages.ts'
/** Injected share of the account route's frame-wide quota notice entry. */
export interface AccountQuotaNoticeInjected {
  /** Desktop-only: show one page in the account feature's shared native host; absent in ordinary browsers. */
  openPlatformPage?: PlatformPages['open']
  hooks: {
    account: HostObservable<AccountSnapshot>
    /** The page the shared host is showing, or null while it is closed. */
    platformPage: HostObservable<PlatformPageClaim | null>
  }
}
type AccountQuotaNoticeProps = PropsRuntime<'shell.quota-notice'> & {
  matched: QuotaNoticeOwnerProps
} & PropsLocale<'settings.account'> &
  InjectFace<AccountQuotaNoticeInjected>
/**
 * @param props - the claimed notice, account state, and the shared Platform page channel.
 * @returns the balance Modal, nothing while awaiting account state or a Platform page's return, or the fallback Toast.
 */
export const AccountQuotaNotice = defineComponent(
  (componentProps: AccountQuotaNoticeProps) => {
    const dismissRef = computed(() => componentProps.matched.dismiss)
    const keepOpenRef = computed(() => componentProps.matched.keepOpen)
    const messageRef = computed(() => componentProps.matched.message)
    const accountStatusRef = componentProps.useAccount(snapshot => snapshot.view?.status)
    const accountFailedRef = componentProps.useAccount(snapshot => snapshot.failed)
    const signedInRef = computed(() => accountStatusRef.value === 'credential-stored')
    const platformPageRef = componentProps.usePlatformPage(current => current)
    const openedRef = shallowRef(false)
    const setOpened = (
      value:
        | typeof openedRef.value
        | ((previous: typeof openedRef.value) => typeof openedRef.value),
    ): void => {
      openedRef.value = typeof value === 'function' ? value(openedRef.value) : value
    }
    const previousSignedIn = shallowRef(signedInRef.value)
    const releaseHold = shallowRef<(() => void) | undefined>(undefined)
    const releasePage = shallowRef<(() => void) | undefined>(undefined)
    const releaseClaims = () => {
      releasePage.value?.()
      releasePage.value = undefined
      releaseHold.value?.()
      releaseHold.value = undefined
    }
    onMounted(() => {
      const dispose = (() => releaseClaims)()
      if (typeof dispose === 'function') onBeforeUnmount(dispose)
    })
    onMounted(() => {
      watch(
        () => [dismissRef.value, signedInRef.value],
        (_values, _old) => {
          (() => {
            // The notice outlives the panel that raised it, so only a real sign-out takes
            // the balance surface down; the first, still unloaded snapshot must not.
            if (previousSignedIn.value && !signedInRef.value) {
              releaseClaims()
              dismissRef.value()
            }
            previousSignedIn.value = signedInRef.value
          })()
        },
        { immediate: true, flush: 'post' },
      )
    })
    return () => {
      const render_accountStatusRef = accountStatusRef.value
      const render_accountFailedRef = accountFailedRef.value
      const render_signedInRef = signedInRef.value
      const render_messageRef = messageRef.value
      const render_dismissRef = dismissRef.value
      const render_openedRef = openedRef.value
      const render_platformPageRef = platformPageRef.value
      const render_keepOpenRef = keepOpenRef.value
      const render_prop_openPlatformPage = componentProps.openPlatformPage
      const render_prop_t = componentProps.t
      // notice before the native account action becomes available. A terminal stream
      // failure ends that wait and leaves the generic warning available.
      if (
        render_accountStatusRef === undefined &&
        !render_accountFailedRef &&
        render_prop_openPlatformPage !== undefined
      )
        return null
      // Signed out, unavailable, or without the native host, use generic notice copy.
      if (!render_signedInRef || render_prop_openPlatformPage === undefined) {
        return h(Toast, {
          text: render_messageRef,
          icon: h(IconWarningOutlineRegular, { size: 18 }),
          onDone: render_dismissRef,
        })
      }
      // Defer the Modal until the native page closes; do not mount hidden focus or
      // Escape handlers under the opaque view.
      if (render_openedRef || render_platformPageRef !== null) return null
      return h(
        Modal,
        {
          open: true,
          title: render_prop_t('quotaTitle'),
          closeLabel: render_prop_t('close'),
          onClose: render_dismissRef,
          description: render_prop_t('quotaDescription'),
        },
        {
          footer: () =>
            h(Fragment, null, [
              h(
                Button,
                { variant: 'outline', onClick: render_dismissRef },
                {
                  default: () => render_prop_t('cancel'),
                },
              ),
              h(
                Button,
                {
                  variant: 'primary',
                  onClick: () => {
                    releaseHold.value = render_keepOpenRef()
                    releasePage.value = render_prop_openPlatformPage('top-up', () => {
                      releasePage.value = undefined
                      render_dismissRef()
                    })
                    setOpened(true)
                  },
                },
                {
                  default: () => render_prop_t('quotaTopUp'),
                },
              ),
            ]),
        },
      )
    }
  },
  {
    inheritAttrs: false,
    props: ['matched', 'openPlatformPage', 'useAccount', 'usePlatformPage', 't'],
  },
)
