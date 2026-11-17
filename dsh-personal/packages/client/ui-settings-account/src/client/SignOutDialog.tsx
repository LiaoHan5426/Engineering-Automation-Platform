import { normalizeClass, defineComponent, h, shallowRef } from 'vue'
/** Account sign-out confirmation with the current task impact. */
import { Button, IconCloseOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AccountKey } from './locales.ts'
import css from './SignInDialog.module.css'
/** @param props - task impact at opening, localized copy, and account actions. @returns sign-out confirmation. */
export const SignOutDialog = defineComponent(
  (componentProps: {
    running: boolean | 'unknown'
    signOut: () => Promise<void>
    close: () => void
    t: (key: AccountKey) => string
  }) => {
    const busyRef = shallowRef(false)
    const setBusy = (
      value: typeof busyRef.value | ((previous: typeof busyRef.value) => typeof busyRef.value),
    ): void => {
      busyRef.value = typeof value === 'function' ? value(busyRef.value) : value
    }
    const failedRef = shallowRef(false)
    const setFailed = (
      value:
        | typeof failedRef.value
        | ((previous: typeof failedRef.value) => typeof failedRef.value),
    ): void => {
      failedRef.value = typeof value === 'function' ? value(failedRef.value) : value
    }
    const dismiss = () => {
      if (!busyRef.value) componentProps.close()
    }
    const confirm = async () => {
      setBusy(true)
      setFailed(false)
      try {
        await componentProps.signOut()
        componentProps.close()
      } catch {
        setFailed(true)
      } finally {
        setBusy(false)
      }
    }
    return () => {
      const render_busyRef = busyRef.value
      const render_failedRef = failedRef.value
      const render_prop_t = componentProps.t
      const render_prop_running = componentProps.running
      return h(
        Modal,
        {
          open: true,
          headless: true,
          title: render_prop_t('signOut'),
          onClose: dismiss,
          className: normalizeClass(css.dialog),
        },
        {
          default: () => [
            h('div', { class: css.content }, [
              h('div', { class: css.header }, [
                h('h2', { class: css.title }, [render_prop_t('signOut')]),
                h(
                  'button',
                  {
                    type: 'button',
                    class: css.close,
                    'aria-label': render_prop_t('close'),
                    disabled: render_busyRef,
                    onClick: dismiss,
                  },
                  [h(IconCloseOutlineRegular, { size: 14 })],
                ),
              ]),
              h('p', { class: css.description }, [
                render_prop_t(
                  render_prop_running === 'unknown'
                    ? 'signOutUnknownDescription'
                    : render_prop_running
                      ? 'signOutRunningDescription'
                      : 'signOutDescription',
                ),
              ]),
              render_failedRef &&
                h('p', { class: css.description, role: 'alert' }, [render_prop_t('failed')]),
            ]),
            h('div', { class: css.actions }, [
              h(
                Button,
                {
                  variant: 'outline',
                  className: normalizeClass(css.secondaryButton),
                  disabled: render_busyRef,
                  onClick: dismiss,
                },
                {
                  default: () => render_prop_t('cancel'),
                },
              ),
              h(
                Button,
                {
                  variant: 'primary',
                  className: normalizeClass(css.primaryButton),
                  disabled: render_busyRef,
                  onClick: () => {
                    void confirm()
                  },
                },
                {
                  default: () => render_prop_t('signOut'),
                },
              ),
            ]),
          ],
        },
      )
    }
  },
  { inheritAttrs: false, props: ['running', 'signOut', 'close', 't'] },
)
