import { computed, h, type ComputedRef, type VNodeChild } from 'vue'
import { Button } from './Button.tsx'
import { MarkdownText, type MarkdownLabels, type MarkdownPathImages } from './markdown/MarkdownText.tsx'
import { StateDot } from './StateDot.tsx'
import css from './DetailDocument.module.css'
/** One read of a long Markdown description, such as a plugin's detail document. */
export type DetailDocumentState = {
  readonly status: 'loading'
} | {
  readonly status: 'found'
  readonly markdown: string
} | {
  readonly status: 'none'
} | {
  readonly status: 'error'
  readonly message: string
}
/** A read as owners track it: in flight, settled with a document or none, or failed with a localized message. */
export type DetailDocumentRead = undefined | {
  readonly status: 'loading'
} | {
  readonly status: 'ready'
  readonly markdown: string | undefined
} | {
  readonly status: 'error'
  readonly message: string
}
/**
 * The state {@link DetailDocument} shows for an owner's read: loading until it settles, then the document, none, or the
 * failure.
 * @param read - the owner's read; undefined before it starts.
 * @returns the state to show.
 */
export function detailDocumentState(read: DetailDocumentRead): DetailDocumentState {
  if (read?.status === 'ready')
    return read.markdown === undefined ? { status: 'none' } : { status: 'found', markdown: read.markdown }
  return read?.status === 'error' ? read : { status: 'loading' }
}
/** Translated strings of a detail document's chrome, as an owner's dictionary supplies them. */
export interface DetailDocumentCopy {
  readonly title: string
  readonly loading: string
  readonly retry: string
  readonly copy: string
  readonly copied: string
  readonly codeBlock: string
  readonly wrap: string
  readonly unwrap: string
  readonly footnotes: string
}
/**
 * Assemble reference-stable labels for {@link DetailDocument} from translated strings.
 * @param copy - the translated strings.
 * @returns labels that keep their identity while the strings stay equal.
 */
export function useDetailDocumentLabels(copy: () => DetailDocumentCopy): ComputedRef<DetailDocumentLabels> {
  const markdown = computed<MarkdownLabels>((previous) => {
    const { copy: copyLabel, copied: copiedLabel, codeBlock: codeLabel, wrap: wrapLabel, unwrap: unwrapLabel, footnotes } = copy()
    if (previous !== undefined && previous.code.copyLabel === copyLabel && previous.code.copiedLabel === copiedLabel
            && previous.code.toolbarLabels?.codeLabel === codeLabel && previous.code.toolbarLabels.wrapLabel === wrapLabel
            && previous.code.toolbarLabels.unwrapLabel === unwrapLabel && previous.footnotes === footnotes) return previous
    return { code: { copyLabel, copiedLabel, toolbarLabels: { codeLabel, wrapLabel, unwrapLabel } }, footnotes }
  })
  return computed<DetailDocumentLabels>((previous) => {
    const { title, loading, retry } = copy()
    const contentLabels = markdown.value
    if (previous !== undefined && previous.title === title && previous.loading === loading &&
      previous.retry === retry && previous.markdown === contentLabels) return previous
    return { title, loading, retry, markdown: contentLabels }
  })
}
/** Localized chrome of a detail document. */
export interface DetailDocumentLabels {
  /** Accessible name of the scrollable document region; the section shows no heading of its own. */
  readonly title: string
  /** Accessible name of the loading placeholder. */
  readonly loading: string
  /** Retry button text. */
  readonly retry: string
  readonly markdown: MarkdownLabels
}
/**
 * A section showing a long Markdown description, without a heading of its own: three skeleton lines while it loads, the
 * document once found, or the owner's failure message with a retry. Nothing renders for `none`. A document taller than
 * the section's height limit scrolls inside it, and the scroll region, named by `labels.title`, takes keyboard focus.
 * Raw HTML is omitted, relative links stay text, and only images the owner's `images` resolver accepts, or absolute
 * HTTP(S) images, load.
 * @param props.state - the read to show.
 * @param props.labels - localized region name, placeholder name, retry text, and Markdown chrome; keep `markdown` reference-stable.
 * @param props.images - resolves the document's relative image destinations to displayable URLs.
 * @param props.onRetry - reads the document again after a failure.
 * @returns the section, or null.
 */
export function DetailDocument({ state, labels, images, onRetry }: {
  readonly state: DetailDocumentState
  readonly labels: DetailDocumentLabels
  readonly images?: MarkdownPathImages | undefined
  readonly onRetry: () => void
}): VNodeChild {
  if (state.status === 'none')
    return null
  let body: VNodeChild
  switch (state.status) {
    case 'found':
      body = (h('div', { 'class': css.document, 'role': 'region', 'aria-label': labels.title, 'tabIndex': 0 }, [h(MarkdownText, { 'text': state.markdown, 'labels': labels.markdown, ...(images === undefined ? {} : { pathImages: images }), 'omitHtml': true }, undefined)]))
      break
    case 'error':
      body = (h('div', { 'class': css.failure }, [h('p', { 'class': css.error, 'role': 'alert' }, [h(StateDot, { 'state': 'error' }, undefined), state.message]), h(Button, { 'variant': 'outline', 'size': 'sm', 'onClick': onRetry }, { default: () => [labels.retry] })]))
      break
    case 'loading':
      body = (h('div', { 'class': css.skeleton, 'role': 'status', 'aria-label': labels.loading, 'aria-busy': 'true' }, [h('span', { 'class': `${css.bar} ${css.long}` }, undefined), h('span', { 'class': `${css.bar} ${css.long}` }, undefined), h('span', { 'class': `${css.bar} ${css.short}` }, undefined)]))
      break
  }
  return (h('section', { 'class': css.section, 'data-detail-document': true }, [body]))
}
