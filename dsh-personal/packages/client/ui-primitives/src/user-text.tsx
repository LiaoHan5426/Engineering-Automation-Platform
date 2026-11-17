/** Inline text and reference presentation; business rules supply resolved JSON data and actions. */
import { h, Fragment, type HTMLAttributes, type VNodeChild } from 'vue'
import clsx from 'clsx'
import { ReferenceIconRegular, type ReferenceIconKind } from './ReferenceIcon.tsx'
import css from './user-text.module.css'
import markdownCss from './markdown/MarkdownText.module.css'
/** Plain text follows the wrapping and typography of its host. */
export interface UserTextRunProps {
  readonly text: string
}
/**
 * Render an uninterpreted inline text run.
 * @param props - text retained verbatim from the caller's document.
 * @returns one inline run without Markdown or reference recognition.
 */
export function UserTextRun({ text }: UserTextRunProps): VNodeChild {
  return h('span', { 'class': css.plainRun }, [text])
}
/** Presentation selected by a reference renderer, independent of its matching grammar. */
export interface ReferenceChipProps {
  readonly appearance: ReferenceIconKind | 'skill' | 'command'
  /** Explicit object-menu gesture bindings; absent for display-only references. */
  readonly contextMenuProps?: Pick<HTMLAttributes, 'onContextmenu' | 'onKeydown' | 'tabindex'>
  readonly label: string
  readonly title: string
  /** Absent for display-only references and previews. */
  readonly onActivate?: () => void
}
/**
 * Render a reference label or its explicitly supplied activation action.
 * Text selection and repeated pointer clicks do not activate the reference.
 * @param props - resolved visual fields and optional action from the owning renderer.
 * @returns an inline label, or a keyboard-accessible button when activation is supplied.
 */
export function ReferenceChip({ appearance, label, title, onActivate, contextMenuProps }: ReferenceChipProps): VNodeChild {
  const slash = appearance === 'skill' || appearance === 'command'
  const contents = h(Fragment, null, [!slash && h(ReferenceIconRegular, { 'kind': appearance, 'size': 16, 'className': css.refIcon }, undefined), label])
  const className = clsx(css.refChip, slash && css.slashChip)
  return onActivate === undefined
    ? h('span', { ...contextMenuProps, 'class': className, 'data-ref-chip': appearance, 'title': title }, [contents]) : h('button', { 'type': 'button', ...contextMenuProps, 'class': clsx(className, markdownCss.fileMention), 'data-ref-chip': appearance, 'title': title, 'onClick': (event: MouseEvent) => {
      if (event.detail > 1 || (event.detail !== 0 && (
        event.currentTarget as HTMLButtonElement).ownerDocument.getSelection()?.isCollapsed === false))
        return
      onActivate()
    } }, [contents])
}
