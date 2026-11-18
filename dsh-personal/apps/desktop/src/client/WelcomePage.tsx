/** Desktop welcome presentation; account and credential operations stay in the preload. */
import { defineComponent, h, shallowRef, computed, watch, onScopeDispose } from 'vue'
import { Toast } from '@deepseek-ai/dsh-client-ui-primitives/src/Toast.tsx'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives/src/StateDot.tsx'
import type { AccountView } from '@deepseek-ai/dsh-deepseek-account/types'
import type { WelcomeApi } from '../welcome-api.ts'
type Page = 'entry' | 'key' | 'account'
/**
 * Render the standalone welcome flow using shell-owned operations and localized copy.
 * Clearing the account attempt returns the sign-in status page to the initial choices.
 * @param props.api - isolated preload API; no account credentials reach the renderer.
 * @returns welcome pages with fixed bottom actions.
 */
export const Welcome = defineComponent(
  (props: { api: WelcomeApi }) => {
    const m = computed(() => props.api.messages)
    const expiryNotice = shallowRef(false)
    const page = shallowRef<Page>('entry')
    const visiblePage = shallowRef<Page>('entry')
    const attempt = shallowRef<AccountView['attempt']>(null)
    const starting = shallowRef(false)
    const cancelling = shallowRef(false)
    const copyFeedback = shallowRef<{
      status: 'idle' | 'busy' | 'copied' | 'failed'
    }>({ status: 'idle' })
    const copyState = computed(() => copyFeedback.value.status)
    const draft = shallowRef('')
    const error = shallowRef('')
    const busy = shallowRef(false)
    const mounted = shallowRef(true)
    const revision = shallowRef(0)
    const input = shallowRef<HTMLInputElement | null>(null)
    const keyButton = shallowRef<HTMLButtonElement | null>(null)
    const focusEntry = shallowRef(false)
    function navigate(next: Page) {
      page.value = next
    }
    function showAccount(state: AccountView) {
      if (page.value === 'key' || (state.attempt === null && page.value === 'entry')) return
      attempt.value = state.attempt
      starting.value = false
      copyFeedback.value = { status: 'idle' }
      navigate(state.attempt === null || state.attempt.phase === 'cancelled' ? 'entry' : 'account')
    }
    onScopeDispose(() => {
      mounted.value = false
    })
    watch(
      () => props.api,
      (_api, _previous, onCleanup) => {
        mounted.value = true
        document.documentElement.lang = props.api.id
        document.title = m.value.welcomeTitle
        const takeNotice = (): void => {
          void props.api
            .takeNotice()
            .then((notice) => {
              if (mounted.value && notice === 'session-expired') expiryNotice.value = true
            })
            .catch((_closedChannel: unknown) => {
              // A closed Welcome IPC channel leaves the sign-in page usable.
            })
        }
        takeNotice()
        const stop = props.api.onAccountState((state) => {
          revision.value++
          takeNotice()
          showAccount(state)
        })
        onCleanup(stop)
      },
      { immediate: true },
    )
    watch(
      page,
      () => {
        if (page.value === 'entry' && visiblePage.value !== 'entry')
          void props.api.analytics?.('auth_page_view', {})
        visiblePage.value = page.value
        if (page.value === 'key') input.value?.focus()
        else if (page.value === 'entry' && focusEntry.value) {
          focusEntry.value = false
          keyButton.value?.focus()
        }
      },
      { flush: 'post' },
    )
    watch(copyFeedback, (_next, _previous, onCleanup) => {
      if (copyFeedback.value.status !== 'copied' && copyFeedback.value.status !== 'failed') return
      const timer = setTimeout(() => {
        copyFeedback.value = { status: 'idle' }
      }, 2000)
      onCleanup(() => { clearTimeout(timer) })
    })
    async function saveKey(event: SubmitEvent) {
      event.preventDefault()
      if (busy.value) return
      void props.api.analytics?.('api_key_save_click', {})
      const value = draft.value.trim()
      if (
        !/^[\x21-\x7e]+$/.test(value) ||
        /^[A-Z][A-Z0-9_]*=[^=]/.test(value) ||
        ((value.startsWith('"') || value.startsWith("'") || value.charCodeAt(0) === 96) &&
          value.at(-1) === value[0])
      ) {
        error.value = value === '' ? m.value.welcomeKeyBlank : m.value.welcomeKeyInvalid
        input.value?.focus()
        return
      }
      busy.value = true
      error.value = ''
      try {
        const result = await props.api.saveApiKey(value)
        if (!mounted.value) return
        if (result.ok) draft.value = ''
        else error.value = m.value.welcomeKeyFailed
      } catch {
        if (mounted.value) error.value = m.value.welcomeKeyFailed
      } finally {
        if (mounted.value) busy.value = false
      }
    }
    async function skip() {
      if (busy.value) return
      busy.value = true
      try {
        await props.api.skip()
        if (mounted.value) draft.value = ''
      } catch {
        if (mounted.value) error.value = m.value.welcomeContinueFailed
      } finally {
        if (mounted.value) busy.value = false
      }
    }
    async function start() {
      navigate('account')
      starting.value = true
      attempt.value = null
      const current = ++revision.value
      try {
        const state = await props.api.startSignIn()
        if (mounted.value && revision.value === current) showAccount(state)
      } catch {
        if (mounted.value && revision.value === current) starting.value = false
      }
    }
    async function cancel() {
      if (cancelling.value || attempt.value === null) return
      cancelling.value = true
      const current = ++revision.value
      let state: AccountView | undefined
      try {
        state = await props.api.cancelSignIn(attempt.value.id)
      } catch (_cancelFailed) {
        // The current attempt remains visible so cancellation can be retried.
      } finally {
        if (mounted.value) cancelling.value = false
      }
      if (state !== undefined && mounted.value && revision.value === current) showAccount(state)
    }
    async function copyLink() {
      const current = attempt.value
      if (
        current?.phase !== 'waiting-browser' ||
        copyState.value === 'busy' ||
        copyState.value === 'copied'
      )
        return
      copyFeedback.value = { status: 'busy' }
      try {
        await props.api.copySignInLink(current.id)
        if (mounted.value && attempt.value === current) copyFeedback.value = { status: 'copied' }
      } catch {
        if (mounted.value && attempt.value === current) copyFeedback.value = { status: 'failed' }
      }
    }
    return () => {
      const phase = starting.value ? 'initializing' : (attempt.value?.phase ?? 'failed')
      const waiting = phase === 'waiting-browser'
      const failed = phase === 'expired' || phase === 'failed'
      const title =
        phase === 'initializing'
          ? m.value.welcomeAuthStarting
          : waiting
            ? m.value.welcomeAuthWaiting
            : phase === 'expired'
              ? m.value.welcomeAuthExpired
              : phase === 'failed'
                ? m.value.welcomeAuthFailed
                : m.value.welcomeAuthExchanging
      const heading =
        page.value === 'entry'
          ? 'welcome-heading'
          : page.value === 'key'
            ? 'key-title'
            : 'auth-status'
      return [
        expiryNotice.value &&
          h(
            Toast,
            {
              text: m.value.welcomeSessionExpired,
              onDone: () => {
                expiryNotice.value = false
              },
            },
            { default: () => [] },
          ),
        h('div', { class: 'titlebar', 'aria-hidden': 'true' }, []),
        h('main', { class: 'welcome', 'aria-labelledby': heading }, [
          h(
            'img',
            {
              class: 'brand',
              src: 'assets/welcome-brand.svg',
              alt: m.value.welcomeBrand,
              width: '472',
              height: '40',
            },
            [],
          ),
          h('div', { id: 'tagline', class: 'tagline', hidden: page.value !== 'entry' }, [
            h('h1', { id: 'welcome-heading' }, [
              h('span', {}, [m.value.welcomeTaglineBefore]),
              h('em', {}, [m.value.welcomeTaglineBrand]),
              h('span', {}, [m.value.welcomeTaglineAfter]),
            ]),
            h('p', { id: 'welcome-description' }, [m.value.welcomeDescription]),
          ]),
          h(
            'form',
            {
              id: 'key-form',
              class: 'key-form',
              hidden: page.value !== 'key',
              noValidate: true,
              onSubmit: (event: SubmitEvent) => {
                void saveKey(event)
              },
              'aria-busy': busy.value,
            },
            [
              h('header', { class: 'key-heading' }, [
                h('h1', { id: 'key-title' }, [m.value.welcomeKeyTitle]),
                h('p', { id: 'key-description' }, [m.value.welcomeKeyDescription]),
              ]),
              h('div', { class: 'key-field' }, [
                h('label', { class: 'visually-hidden', htmlFor: 'key-input' }, [
                  m.value.welcomeKeyPlaceholder,
                ]),
                h(
                  'input',
                  {
                    ref: input,
                    id: 'key-input',
                    type: 'password',
                    autoComplete: 'new-password',
                    autoCapitalize: 'off',
                    spellCheck: false,
                    required: true,
                    'aria-describedby': 'key-description key-error',
                    'aria-invalid': error.value !== '',
                    placeholder: m.value.welcomeKeyPlaceholder,
                    value: draft.value,
                    disabled: busy.value,
                    onInput: (event: Event) => {
                      draft.value = (event.target as HTMLInputElement).value
                      error.value = ''
                    },
                  },
                  [],
                ),
                h(
                  'p',
                  {
                    id: 'key-error',
                    class: 'key-error',
                    role: 'alert',
                    hidden: error.value === '',
                  },
                  [error.value],
                ),
              ]),
            ],
          ),
          h(
            'section',
            {
              id: 'auth-page',
              class: `key-heading ${waiting ? 'auth-waiting' : phase === 'expired' ? 'auth-expired' : ''}`,
              hidden: page.value !== 'account',
              'aria-live': 'polite',
            },
            [
              h('h1', { id: 'auth-status' }, [title]),
              h('p', { id: 'auth-description', hidden: !waiting && phase !== 'expired' }, [
                waiting
                  ? m.value.welcomeAuthWaitingDescription
                  : m.value.welcomeAuthExpiredDescription,
              ]),
              h(
                'button',
                {
                  id: 'auth-copy',
                  class: 'copy-link',
                  type: 'button',
                  hidden: !waiting,
                  disabled: !waiting || copyState.value === 'busy' || copyState.value === 'copied',
                  onClick: () => {
                    void copyLink()
                  },
                },
                [
                  copyState.value === 'copied'
                    ? m.value.welcomeAuthCopied
                    : copyState.value === 'failed'
                      ? m.value.welcomeAuthCopyFailed
                      : m.value.welcomeAuthCopyLink,
                ],
              ),
            ],
          ),
          h('div', { id: 'auth-actions', class: 'actions', hidden: page.value !== 'account' }, [
            h(
              'button',
              {
                id: 'auth-loading',
                class: 'primary',
                type: 'button',
                hidden: failed,
                disabled: true,
                'aria-label': m.value.welcomeAuthExchanging,
              },
              [
                h(
                  StateDot,
                  { state: 'ongoing', size: 16, className: 'welcome-loading' },
                  { default: () => [] },
                ),
              ],
            ),
            h(
              'button',
              {
                id: 'auth-retry',
                class: 'primary',
                type: 'button',
                hidden: !failed,
                onClick: () => {
                  void props.api.analytics?.('auth_page_click', { button_name: 'sign_in' })
                  void start()
                },
              },
              [m.value.welcomeAuthRetry],
            ),
            h(
              'button',
              {
                id: 'auth-api-key',
                class: 'secondary',
                type: 'button',
                hidden: !failed,
                onClick: () => {
                  void props.api.analytics?.('auth_page_click', { button_name: 'api-key' })
                  navigate('key')
                },
              },
              [m.value.welcomeApiKey],
            ),
            h(
              'button',
              {
                id: 'auth-cancel',
                class: 'secondary',
                type: 'button',
                hidden: failed,
                disabled:
                  cancelling.value ||
                  phase === 'committing' ||
                  phase === 'succeeded' ||
                  (phase === 'initializing' && !attempt.value?.id),
                onClick: () => {
                  void cancel()
                },
              },
              [m.value.welcomeAuthCancel],
            ),
          ]),
          h('div', { id: 'entry-actions', class: 'actions', hidden: page.value !== 'entry' }, [
            h(
              'button',
              {
                id: 'sign-in',
                class: 'primary',
                type: 'button',
                onClick: () => {
                  void props.api.analytics?.('auth_page_click', { button_name: 'sign_in' })
                  void start()
                },
              },
              [m.value.welcomeSignIn],
            ),
            h(
              'button',
              {
                ref: keyButton,
                id: 'api-key',
                class: 'secondary',
                type: 'button',
                onClick: () => {
                  void props.api.analytics?.('auth_page_click', { button_name: 'api-key' })
                  navigate('key')
                },
              },
              [m.value.welcomeApiKey],
            ),
          ]),
          h('div', { id: 'key-actions', class: 'actions', hidden: page.value !== 'key' }, [
            h(
              'button',
              {
                id: 'save-key',
                class: 'primary',
                type: 'submit',
                form: 'key-form',
                disabled: busy.value || draft.value.trim() === '',
              },
              [m.value.welcomeKeySave],
            ),
            h(
              'button',
              {
                id: 'skip-key',
                class: 'secondary',
                type: 'button',
                disabled: busy.value,
                onClick: () => {
                  void skip()
                },
              },
              [m.value.welcomeKeyLater],
            ),
            h(
              'button',
              {
                id: 'back-to-login',
                class: 'back',
                type: 'button',
                disabled: busy.value,
                onClick: () => {
                  if (busy.value) return
                  draft.value = ''
                  error.value = ''
                  focusEntry.value = true
                  navigate('entry')
                },
              },
              [m.value.welcomeKeyBack],
            ),
          ]),
        ]),
      ]
    }
  },
  { name: 'Welcome', props: ['api'], inheritAttrs: false },
)
