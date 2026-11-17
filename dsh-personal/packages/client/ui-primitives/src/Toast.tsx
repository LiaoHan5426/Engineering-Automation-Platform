import { defineComponent, Fragment, h, shallowRef, Teleport, watch, type VNodeChild } from 'vue'
import { IconCheckCircleOutlineRegular } from './icons/index.tsx'
import css from './Toast.module.css'

/** Full-opacity hold before the fade starts, when the owner names none. */
const HOLD_MS = 3000
/** Fade duration. Must agree with the stylesheet's toast-fade duration. */
const FADE_MS = 1000

/**
 * Transient top-center banner: slides in, holds at full opacity, fades out,
 * then reports done so the owner can unmount it. Re-showing the same text
 * restarts the cycle when the owner remounts the component (key it by a
 * per-show sequence). Rendered through a body portal so an owner inside a
 * transformed or filtered ancestor cannot trap the fixed banner in that
 * ancestor's box.
 * With unchanged holdMs, parent rerenders do not extend the lifetime.
 * Completion calls the latest onDone handler; fully faded actions receive no input.
 *
 * The hold is the owner's to set, because how long a banner has to stay
 * depends on how much there is to read: a one-line limit lands in the default
 * window, while a failure that names what broke does not. One value drives
 * both the unmount timer and the stylesheet's fade delay — the stylesheet
 * reads it as a custom property — so the two can no longer disagree and leave
 * the banner unmounting mid-fade.
 * @param props.text - resolved banner copy; the owner passes localized text.
 * @param props.icon - optional leading glyph (e.g. a warning icon); ignored
 * under `tone="success"`, which brings its own glyph.
 * @param props.tone - 'success' renders the design's circled green check as
 * the leading glyph; omitted, the icon seat keeps its warning tint.
 * @param props.actions - optional inline actions continuing the sentence:
 * each renders its plain-text `prefix` (a connective like 或) followed by its
 * localized `label` as blue clickable text, flowing after `text` as one
 * sentence. Each press is the owner's to handle (e.g. undo the reported
 * change, then unmount the toast). The banner surface stays click-through —
 * only the action text takes the pointer.
 * @param props.holdMs - full-opacity hold before the fade; defaults to 3000.
 * @param props.anchor - optional element whose horizontal center the banner
 * follows (e.g. the composer card, so the banner centers over the chat column
 * rather than the whole window); omitted, it centers on the viewport.
 * @param props.onDone - called once the fade completes; unmount the toast here.
 * @returns the floating banner.
 */
export const Toast = defineComponent((props: {
  text: string
  icon?: VNodeChild
  tone?: 'success'
  anchor?: HTMLElement | null
  holdMs?: number
  actions?: readonly { label: string; prefix?: string; onClick: () => void }[]
  onDone: () => void
}) => {
  watch(() => props.holdMs ?? HOLD_MS, (hold, _previous, onCleanup) => {
    const timer = setTimeout(() => { props.onDone() }, hold + FADE_MS)
    onCleanup(() => { clearTimeout(timer) })
  }, { immediate: true })
  const left = shallowRef<number | null>(null)
  watch(() => props.anchor, (anchor, _previous, onCleanup) => {
    if (anchor == null) { left.value = null; return }
    const measure = (): void => {
      const rect = anchor.getBoundingClientRect()
      left.value = rect.left + rect.width / 2
    }
    measure()
    window.addEventListener('resize', measure)
    onCleanup(() => { window.removeEventListener('resize', measure) })
  }, { immediate: true })
  return () => h(Teleport, { to: document.body }, h('div', {
    class: css.toast, role: 'alert', style: {
      ...(left.value === null ? {} : { left: `${String(left.value)}px` }),
      '--dsh-toast-hold': `${String(props.holdMs ?? HOLD_MS)}ms`,
    },
  }, [
    props.tone === 'success'
      ? h('span', { class: [css.icon, css.success], 'aria-hidden': 'true' }, [h(IconCheckCircleOutlineRegular)])
      : props.icon !== undefined && h('span', { class: css.icon, 'aria-hidden': 'true' }, [props.icon]),
    h('span', { class: css.text }, [props.text, ...props.actions?.map(action => h(Fragment, { key: action.label }, [
      action.prefix, h('button', { type: 'button', class: css.action, onClick: action.onClick }, action.label),
    ])) ?? []]),
  ]))
}, { name: 'Toast', props: ['text', 'icon', 'tone', 'anchor', 'holdMs', 'actions', 'onDone'] })
