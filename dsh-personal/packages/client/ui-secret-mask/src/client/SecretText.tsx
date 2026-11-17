/** Masked credential presentation with a per-value reveal control in interactive text. */
import { defineComponent, h, shallowRef } from 'vue'
import type { UserTextNodeProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { NS } from './locales.ts'
import { MASK } from './credential-masks.ts'
import css from './SecretText.module.css'

const EYE_CONTOUR = 'M1.5 8C2.9 5.25 5.25 3.5 8 3.5C10.75 3.5 13.1 5.25 14.5 8C13.1 10.75 10.75 12.5 8 12.5C5.25 12.5 2.9 10.75 1.5 8Z'
const EYE_PATH = `${EYE_CONTOUR}M10 8C10 9.1 9.1 10 8 10C6.9 10 6 9.1 6 8C6 6.9 6.9 6 8 6C9.1 6 10 6.9 10 8Z`
/** The struck-through glyph drops the pupil so it stays distinct at text size. */
const EYE_OFF_PATH = `${EYE_CONTOUR}M2.5 2.5L13.5 13.5`
const MASK_RUNS = new RegExp(`(\\${MASK}+)`, 'u')
function eyeGlyph(path: string) {
  return h('svg', { class: css.icon, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3, 'stroke-linecap': 'round', 'aria-hidden': 'true' }, [h('path', { d: path })])
}
/** Keep mask characters copyable and accessible while drawing centered marks. */
function maskedText(masked: string) {
  let offset = 0
  return masked.split(MASK_RUNS).map((part) => {
    const key = offset
    offset += part.length
    if (part === '') return null
    return h('span', { key, ...(part.startsWith(MASK) ? { class: css.mask } : {}) }, part)
  })
}
type SecretTextProps = UserTextNodeProps<'secret'> & PropsLocale<typeof NS>
/** Each mount and each different credential at the same position starts masked. */
export const SecretText = defineComponent((props: SecretTextProps) => {
  const revealedRaw = shallowRef<string | undefined>()
  return () => {
    const revealed = props.interactive && revealedRaw.value === props.raw
    return h('span', { class: css.secret, 'data-secret': '' }, [
      h('span', { class: css.value }, revealed ? props.raw : maskedText(props.node.data.masked)),
      props.interactive ? h('button', {
        type: 'button', class: css.toggle, 'aria-pressed': revealed,
        'aria-label': props.t(revealed ? 'secret.hide' : 'secret.reveal'),
        onClick: () => { revealedRaw.value = revealed ? undefined : props.raw },
      }, [eyeGlyph(revealed ? EYE_OFF_PATH : EYE_PATH)]) : null,
    ])
  }
}, { props: ['node', 'raw', 'interactive', 't'] })
