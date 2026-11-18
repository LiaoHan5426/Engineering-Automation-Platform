/** Loading skeleton of the changes view. */
import { h, Fragment, type VNodeChild } from 'vue'
import clsx from 'clsx'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { NS } from './locales.ts'
import css from './ChangesLoading.module.css'
const CODE_WIDTHS = [62, 48, 74, 35, 81, 56, 44, 69, 28, 52, 77, 39] as const
const FILES = [{ path: 46, lines: 7, sides: 2 }, { path: 34, lines: 4, sides: 1 }, { path: 52, lines: 0, sides: 1 }, { path: 28, lines: 0, sides: 1 }] as const
function Column({ lines, offset }: { readonly lines: number; readonly offset: number }): VNodeChild {
  return h('div', { class: css.column }, Array.from({ length: lines }, (_, index) => h('div', { key: index, class: css.line }, [h('span', { class: clsx(css.fill, css.number) }), h('span', { class: clsx(css.fill, css.code), style: { width: CODE_WIDTHS[(index + offset) % CODE_WIDTHS.length] + '%' } })])))
}
export function ChangesLoading({ split, t }: { readonly split: boolean } & PropsLocale<typeof NS>): VNodeChild {
  return h(Fragment, null, [h('div', { class: css.status, role: 'status' }, t('diff.loading')), h('div', { 'aria-hidden': 'true', 'data-forge-changes-skeleton': '' }, FILES.map((file, index) => {
    const columns = split && file.sides === 2
    return h('div', { key: index, class: clsx(css.file, file.lines === 0 && css.folded) }, [h('div', { class: css.header }, [h('span', { class: clsx(css.fill, css.icon) }), h('span', { class: clsx(css.fill, css.path), style: { width: file.path + '%' } }), h('span', { class: clsx(css.fill, css.counts) }), h('span', { class: clsx(css.fill, css.box) })]), file.lines > 0 && h('div', { class: clsx(css.lines, columns && css.split) }, [h(Column, { lines: file.lines, offset: index * 5 }), columns && h(Column, { lines: file.lines, offset: index * 5 + 4 })])])
  }))])
}
