import { defineComponent, h } from 'vue'
/** The `shell.overlay` entry that renders the account feature's shared native Platform page. */
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { PlatformPageClaim } from './platform-pages.ts'
import { PlatformOverlay, type PlatformBridge } from './PlatformOverlay.tsx'
/** Injected share of the shared Platform host. */
export interface AccountPlatformHostInjected {
  platform: PlatformBridge
  hooks: {
    page: HostObservable<PlatformPageClaim | null>
  }
  /**
   * Viewer returned: drop the live request, notifying its owner with the reason
   * the page stopped being live. Post-return reads belong to the requesting
   * surface; this host closes the page and nothing else.
   */
  closePage(this: void): void
}
/** Composed props of the shared Platform host. */
export type AccountPlatformHostProps = PropsRuntime<'shell.overlay'> &
  PropsLocale<'settings.account'> &
  InjectFace<AccountPlatformHostInjected>
/**
 * @param props - the native commands, the live page request, and its dismissal.
 * @returns the native Platform container, or null while no page is requested.
 */
export const AccountPlatformHost = defineComponent(
  (componentProps: AccountPlatformHostProps) => {
    const claimRef = componentProps.usePage(current => current)
    return () => {
      const render_claimRef = claimRef.value
      const render_prop_platform = componentProps.platform
      const render_prop_t = componentProps.t
      const render_prop_closePage = componentProps.closePage
      if (render_claimRef === null) return null
      return h(PlatformOverlay, {
        bridge: render_prop_platform,
        page: render_claimRef.page,
        backLabel: render_prop_t('backToHarness'),
        loadingLabel: render_prop_t('loading'),
        failureLabel: render_prop_t('platformFailed'),
        retryLabel: render_prop_t('platformRetry'),
        onClose: render_prop_closePage,
      })
    }
  },
  { inheritAttrs: false, props: ['platform', 'usePage', 'closePage', 't'] },
)
