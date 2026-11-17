import { computed, defineComponent, h, onMounted, shallowRef, watch } from 'vue'
/** Framework-hook projection into the desktop introduction's pure view. */
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { AccountSnapshot } from './AccountSection.tsx'
import type { DesktopOnboardingProps, DesktopOnboardingState } from './onboarding-contract.ts'
import { OnboardingSurface } from './OnboardingSurface.tsx'
import { DesktopOnboarding } from './DesktopOnboarding.tsx'
/** Observable sources and actions supplied by the account plugin's apply closure. */
export interface DesktopOnboardingInjected extends Omit<
  DesktopOnboardingProps,
  'state' | 'account' | 't' | 'exiting' | 'locale'
> {
  /** Publish whether onboarding covers the workspace. @param visible - includes loading, saving, and exit animation. */
  setVisible: (visible: boolean) => void
  hooks: {
    onboarding: HostObservable<DesktopOnboardingState>
    account: HostObservable<AccountSnapshot>
  }
}
/**
 * Read shared state through framework hooks; sessions do not control activation.
 * @param props - shell overlay bindings and account-owned actions.
 * @returns the unfinished flow, retained briefly after successful completion unless motion is reduced.
 */
export const DesktopOnboardingEntry = defineComponent(
  (
    componentProps: PropsRuntime<'shell.overlay'> &
      PropsLocale<'settings.account'> &
      InjectFace<DesktopOnboardingInjected>,
  ) => {
    const propsRef = computed(() => {
      const { useOnboarding: _useOnboarding, useAccount: _useAccount, setVisible: _setVisible, ...rest } = componentProps
      return rest
    })
    const localeRef = computed(() => propsRef.value.t('onboardingArtworkLocale'))
    const stateRef = componentProps.useOnboarding(value => value)
    const accountRef = componentProps.useAccount(value => value)
    onMounted(() => {
      watch(
        () => [stateRef.value.visible],
        (_values, _old, onCleanup) => {
          const dispose = (() => {
            if (!stateRef.value.visible) return
            const bridge = (
              globalThis as typeof globalThis & {
                dshOnboarding?: {
                  setActive(active: boolean): void
                }
              }
            ).dshOnboarding
            bridge?.setActive(true)
            return () => {
              bridge?.setActive(false)
            }
          })()
          if (typeof dispose === 'function') onCleanup(dispose)
        },
        { immediate: true, flush: 'post' },
      )
    })
    const lastVisibleRef = shallowRef(stateRef.value.visible ? stateRef.value : null)
    const setLastVisible = (
      value:
        | typeof lastVisibleRef.value
        | ((previous: typeof lastVisibleRef.value) => typeof lastVisibleRef.value),
    ): void => {
      lastVisibleRef.value = typeof value === 'function' ? value(lastVisibleRef.value) : value
    }
    const doneRef = computed(
      () =>
        !stateRef.value.visible &&
        stateRef.value.progress.step === 'done' &&
        accountRef.value.view?.status === 'credential-stored',
    )
    const pendingCompletionRef = computed(
      () => doneRef.value && stateRef.value.status === 'saving',
    )
    const completedRef = computed(() => doneRef.value && stateRef.value.status === 'ready')
    const exitingRef = computed(
      () =>
        completedRef.value &&
        lastVisibleRef.value !== null &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    )
    onMounted(() => {
      watch(
        () => [stateRef.value, completedRef.value, pendingCompletionRef.value],
        (_values, _old) => {
          (() => {
            if (stateRef.value.visible) setLastVisible(stateRef.value)
            else if (!completedRef.value && !pendingCompletionRef.value) setLastVisible(null)
          })()
        },
        { immediate: true, flush: 'post' },
      )
    })
    onMounted(() => {
      watch(
        () => [exitingRef.value],
        (_values, _old, onCleanup) => {
          const dispose = (() => {
            if (!exitingRef.value) return
            // Matches OnboardingSurface's exit animation; cleanup also covers sign-out.
            const timer = window.setTimeout(() => {
              setLastVisible(null)
            }, 180)
            return () => {
              window.clearTimeout(timer)
            }
          })()
          if (typeof dispose === 'function') onCleanup(dispose)
        },
        { immediate: true, flush: 'post' },
      )
    })
    const displayedRef = computed(() =>
      stateRef.value.visible
        ? stateRef.value
        : exitingRef.value || pendingCompletionRef.value
          ? lastVisibleRef.value
          : null,
    )
    const visibleRef = computed(
      () => displayedRef.value !== null || stateRef.value.status === 'loading',
    )
    onMounted(() => {
      watch(
        () => [componentProps.setVisible, visibleRef.value],
        (_values, _old) => {
          (() => {
            componentProps.setVisible(visibleRef.value)
          })()
        },
        { immediate: true, flush: 'post' },
      )
    })
    return () => {
      const render_displayedRef = displayedRef.value
      const render_stateRef = stateRef.value
      const render_propsRef = propsRef.value
      const render_localeRef = localeRef.value
      const render_pendingCompletionRef = pendingCompletionRef.value
      const render_accountRef = accountRef.value
      const render_exitingRef = exitingRef.value
      if (render_displayedRef === null)
        return render_stateRef.status === 'loading'
          ? h(OnboardingSurface, null, {
            default: () => h('div', { role: 'status' }, [render_propsRef.t('onboardingLoading')]),
          })
          : null
      return h(DesktopOnboarding, {
        ...render_propsRef,
        locale: render_localeRef,
        state: render_pendingCompletionRef
          ? { ...render_displayedRef, status: 'saving' }
          : render_displayedRef,
        account: render_accountRef,
        exiting: render_exitingRef,
      })
    }
  },
  {
    inheritAttrs: false,
    props: [
      'useOnboarding',
      'useAccount',
      'setVisible',
      'openPlatformPage',
      'update',
      'complete',
      'retry',
      't',
      'track',
    ],
  },
)
