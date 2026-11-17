/** Notification extension rendered inside the sidebar account menu. */
import { defineComponent, h, shallowRef, watch, onScopeDispose } from 'vue'
import { Button, IconCloseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-account/client'
import type { AccountNotice } from './notification-controller.ts'
import type { NotificationKey } from './locales.ts'
import css from './AccountNotifications.module.css'
import { NoticeTransition } from './notice-transition.ts'

/** Notification view and interactions supplied by the notification plugin. */
export interface AccountNotificationsInjected {
  hooks: { notices: HostObservable<readonly AccountNotice[]> }
  /** @param id - notification that completed a displayed frame. */
  shown: (id: AccountNotice['id']) => void
  /** @param id - foreground notification whose non-dismiss action was clicked. */
  ctaClicked: (id: AccountNotice['id']) => void
  /** @param id - notification explicitly closed by the user. */
  dismiss: (id: AccountNotice['id']) => void
}

/** Notification component props derived from its parent-owned slot. */
export type AccountNotificationsProps = PropsRuntime<'settings.launcher.notifications'> &
  InjectFace<AccountNotificationsInjected> &
  PropsLocale<'account.notifications'>

/** Present retained notifications while the account menu permits their display. */
export const AccountNotifications = defineComponent(
  (props: AccountNotificationsProps) => {
    const notices = props.useNotices(value => value)
    return () =>
      props.active
        ? h(AccountNoticeStack, {
          notices: notices.value,
          closeLabel: props.t('close'),
          onOpenAccount: props.openAccount,
          onShown: props.shown,
          onCtaClicked: props.ctaClicked,
          onDismiss: props.dismiss,
        })
        : null
  },
  {
    name: 'AccountNotifications',
    inheritAttrs: false,
    props: ['active', 'openAccount', 'useNotices', 'shown', 'ctaClicked', 'dismiss', 't'],
  },
)

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'account.notifications': NotificationKey
  }
}

/* v8 ignore next 3 -- closed-union defaults only defend future source widening */
function assertNever(_value: never): never {
  throw new Error('unsupported account notification target')
}

/** @param displayUntil - server display deadline. @returns whether display remains eligible. */
function live(displayUntil: string | null): boolean {
  if (displayUntil === null) return true
  const expires = Date.parse(displayUntil)
  // An unparsable timestamp is not evidence of expiry, so the notice still shows.
  return Number.isNaN(expires) || expires > Date.now()
}

/** @param run - callback after a presented frame. @returns a canceller for a hidden card. */
function afterPaint(run: () => void): () => void {
  if (typeof requestAnimationFrame !== 'function') {
    const timer = setTimeout(run, 0)
    return () => {
      clearTimeout(timer)
    }
  }
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const frame = requestAnimationFrame(() => {
    timer = setTimeout(() => {
      if (!cancelled) run()
    }, 0)
  })
  return () => {
    cancelled = true
    cancelAnimationFrame(frame)
    if (timer !== undefined) clearTimeout(timer)
  }
}

interface NoticeCallbacks {
  closeLabel: string
  onOpenAccount: () => void
  onShown: (id: AccountNotice['id']) => void
  onCtaClicked: (id: AccountNotice['id']) => void
  onDismiss: (id: AccountNotice['id']) => void
}

/** Keep server ordering and stable card identities when the foreground card is dismissed. */
export const AccountNoticeStack = defineComponent(
  (props: NoticeCallbacks & { notices: readonly AccountNotice[] }) => {
    const transition = new NoticeTransition()
    const onDismissCard = transition.dismiss.bind(transition)
    onScopeDispose(() => {
      transition.dispose()
    })
    return () =>
      h(
        'div',
        { class: css.stack },
        props.notices
          .filter(notice => live(notice.displayUntil))
          .map((notice, depth) =>
            h(NoticeCard, {
              key: notice.id,
              notice,
              depth,
              closeLabel: props.closeLabel,
              onShown: props.onShown,
              onCtaClicked: props.onCtaClicked,
              onDismiss: props.onDismiss,
              onOpenAccount: props.onOpenAccount,
              onDismissCard,
            }),
          ),
      )
  },
  {
    name: 'AccountNoticeStack',
    inheritAttrs: false,
    props: ['notices', 'closeLabel', 'onOpenAccount', 'onShown', 'onCtaClicked', 'onDismiss'],
  },
)

/** One stable card owns its visibility observer and pending after-paint report. */
const NoticeCard = defineComponent(
  (
    props: NoticeCallbacks & {
      notice: AccountNotice
      depth: number
      onDismissCard: NoticeTransition['dismiss']
    },
  ) => {
    const card = shallowRef<HTMLElement | null>(null)
    let reported = false
    watch(
      [
        card,
        () => props.depth === 0,
        () => props.notice.id,
        () => props.notice.displayUntil,
        () => props.onShown,
      ],
      ([element, foreground], _previous, cleanup) => {
        if (!foreground || reported || !live(props.notice.displayUntil) || element === null) return
        let intersecting = false
        let cancel: (() => void) | undefined
        const visible = () =>
          intersecting &&
          document.visibilityState !== 'hidden' &&
          !element.closest('[hidden], [inert]')
        const attempt = () => {
          if (reported || cancel !== undefined || !live(props.notice.displayUntil) || !visible())
            return
          cancel = afterPaint(() => {
            cancel = undefined
            if (reported || !visible() || !live(props.notice.displayUntil)) return
            reported = true
            props.onShown(props.notice.id)
          })
        }
        const observer = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            intersecting = entry.isIntersecting
            attempt()
          }
        })
        observer.observe(element)
        document.addEventListener('visibilitychange', attempt)
        cleanup(() => {
          observer.disconnect()
          document.removeEventListener('visibilitychange', attempt)
          cancel?.()
        })
      },
      { flush: 'post', immediate: true },
    )
    const dismissCard = () => {
      if (card.value !== null)
        props.onDismissCard(card.value, () => {
          props.onDismiss(props.notice.id)
        })
    }
    return () => {
      const { notice, depth } = props
      const foreground = depth === 0
      const actionSlots = new Map<string, number>()
      return h(
        'aside',
        {
          ref: card,
          class: css.card,
          'data-front': foreground,
          'aria-hidden': !foreground,
          style: { '--notice-depth': depth, '--notice-scale': Math.pow(252 / 260, depth) },
        },
        [
          h('div', { role: 'status', class: css.copy }, [
            h('div', { class: css.title }, [
              h('span', { class: css.icon, 'aria-hidden': true }, [
                h('svg', { width: '14', height: '14', viewBox: '0 0 14 14', fill: 'none' }, [
                  h('path', {
                    d: 'M3.6355 6.93969C3.6355 4.8398 5.33779 3.1375 7.43768 3.1375C9.53757 3.1375 11.23987 4.8398 11.23987 6.93968V11.363H3.6355V6.93969Z',
                    fill: 'currentColor',
                    'fill-opacity': '0.2',
                    stroke: 'currentColor',
                    'stroke-width': '0.875',
                  }),
                  h('path', {
                    d: 'M1.641 11.3645H12.36M5.053 13.3095H8.9479M7.4375 4.27422V2.70137912',
                    stroke: 'currentColor',
                    'stroke-width': '0.875',
                  }),
                ]),
              ]),
              h('span', notice.title),
            ]),
            h('p', notice.body),
          ]),
          notice.actions.length > 0
            ? h(
              'div',
              { class: css.actions },
              notice.actions.map((action) => {
                const target = JSON.stringify(action.target)
                const occurrence = actionSlots.get(target) ?? 0
                actionSlots.set(target, occurrence + 1)
                return h(
                  Button,
                  {
                    key: `${target}:${occurrence}`,
                    size: 'sm',
                    className: css.action ?? '',
                    variant: action.style === 'primary' ? 'primary' : 'outline',
                    ...(foreground ? {} : { tabIndex: -1 }),
                    onClick: () => {
                      if (action.target.type !== 'dismiss') props.onCtaClicked(notice.id)
                      switch (action.target.type) {
                        case 'app_route':
                          props.onOpenAccount()
                          break
                        case 'dismiss':
                          dismissCard()
                          break
                          /* v8 ignore next -- the Host validates both supported target variants */
                        default:
                          assertNever(action.target)
                      }
                    },
                  },
                  { default: () => action.label },
                )
              }),
            )
            : null,
          h(
            'button',
            {
              type: 'button',
              ...(foreground ? {} : { tabindex: -1 }),
              class: css.close,
              'aria-label': props.closeLabel,
              onClick: dismissCard,
            },
            [h(IconCloseOutlineRegular, { size: 10 })],
          ),
        ],
      )
    }
  },
  {
    name: 'NoticeCard',
    inheritAttrs: false,
    props: [
      'notice',
      'depth',
      'closeLabel',
      'onOpenAccount',
      'onShown',
      'onCtaClicked',
      'onDismiss',
      'onDismissCard',
    ],
  },
)
