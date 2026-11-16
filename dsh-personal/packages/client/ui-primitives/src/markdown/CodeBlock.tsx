import { h, Fragment, defineComponent, shallowRef, onScopeDispose, type VNodeChild, type CSSProperties } from 'vue';
import clsx from 'clsx';
import { writeClipboard } from '../clipboard.ts';
import { CodeToolbar, type CodeToolbarLabels } from '../CodeToolbar.tsx';
import { diffFenceTokens, isDiffContent, isDiffFenceLanguage, parseDiffFence, } from './diff-fence.ts';
import type { DiffRow } from './diff-fence.ts';
import { StreamingHighlightSession, grammarLoadCount, highlightToHtml, subscribeGrammarLoaded, } from './highlight.ts';
import type { HighlightSpan, StreamingHighlightFrame } from './highlight.ts';
import { useViewportHighlighting } from './useViewportHighlighting.ts';
import css from './CodeBlock.module.css';
export interface CodeBlockProps {
    /** The source text, rendered verbatim (trailing newline trimmed for display). */
    code: string;
    /** Grammar hint (markdown fence info string or a fixed caller id); unknown = plain. */
    lang?: string | undefined;
    /**
     * Render unified-diff rows: row colors by marker column, and each file's
     * removed and added sides tokenized with the language its header names.
     * Omitted, a `diff` or `patch` `lang` selects them; `true` or `false` forces
     * the choice for any `lang`.
     */
    diff?: boolean | undefined;
    /**
     * The code is still growing (a streaming markdown fence): highlight through
     * a per-instance {@link StreamingHighlightSession}, which re-tokenizes only
     * appended text and keeps completed line groups (and DOM) untouched. The
     * caller must keep the component instance stable across growth (a
     * stream-stable Vue key); an unchanged streamed fence also retains that
     * tree when it settles. Cold settled callers get shiki's HTML.
     */
    streaming?: boolean | undefined;
    /** Extra class merged onto the wrapper (callers position; this component draws). */
    className?: string | undefined;
    /** Ref for the stable source-content wrapper, for owners that use it as a scrollport. */
    contentRef?: ((element: HTMLDivElement | null) => void) | undefined;
    /** Show a numbered gutter without adding numbers to copied source. Defaults to false. */
    lineNumbers?: boolean | undefined;
    /** Show the language and copy header; false when the caller supplies a toolbar. Defaults to true. */
    showHeader?: boolean | undefined;
    /** Copy-button idle label; the owner passes localized copy (this package is cordis-free, so copy arrives via props). */
    copyLabel: string;
    /** Copy-button label during the post-copy confirmation window. */
    copiedLabel: string;
    /** Enable the shared card toolbar and spacing; omit for custom toolbar layouts. */
    toolbarLabels?: CodeToolbarLabels | undefined;
    /** With toolbarLabels, use the owner's wrapping preference and omit the toolbar's local wrap action. */
    wrap?: boolean | undefined;
}
/**
 * The `pre` attributes shiki's HTML arm emits for the css-variables theme,
 * mirrored so the streaming arm's tree is interchangeable with the settled
 * swap (`tests/streaming-code-block.client.spec.tsx` pins the two arms'
 * parity).
 */
const SHIKI_PRE_PROPS = { class: 'shiki css-variables',
    style: { backgroundColor: 'var(--shiki-background)', color: 'var(--shiki-foreground)' },
    tabIndex: 0,
} as const;
/** Completed-line group size; Vue reconciles groups while the DOM remains line-for-line identical. */
const STREAMING_LINE_GROUP_SIZE = 32;
/** Line class per row kind; context rows keep the block's default ink. */
const DIFF_ROW_CLASS: Record<DiffRow['kind'], string | undefined> = {
    add: css.diffAdd,
    del: css.diffDel,
    hunk: css.diffHunk,
    meta: css.diffMeta,
    context: css.diffContext,
};
/** One diff row: optional marker column, then the body with its token colors. */
function renderDiffRow(row: DiffRow, index: number, tokens: readonly HighlightSpan[] | undefined): VNodeChild {
    const kindClass = DIFF_ROW_CLASS[row.kind];
    return (h(Fragment, { "key": index }, [index > 0 && '\n', h("span", { "class": clsx('line', css.diffLine, kindClass) }, [isDiffContent(row)
                ? h(Fragment, null, [h("span", { "class": css.diffMarker }, [row.marker]), tokens === undefined
                        ? row.body
                        : tokens.map((span, spanIndex) => h("span", { "key": spanIndex, "style": span.style }, [span.text]))]) : row.raw])]));
}
function renderLine(line: readonly HighlightSpan[], index: number): VNodeChild {
    return (h(Fragment, { "key": index }, [index > 0 && '\n', h("span", { "class": "line" }, [line.map((span, spanIndex) => h("span", { "key": spanIndex, "style": span.style }, [span.text]))])]));
}
export const CodeBlock = defineComponent((props: CodeBlockProps) => {
    const rootRef = shallowRef<HTMLDivElement | null>(null);
    const highlighting = useViewportHighlighting(rootRef, () => props.diff === true || ['diff', 'patch'].includes(props.lang ?? '') ? 'diff' : props.lang);
    const loaded = shallowRef(grammarLoadCount());
    onScopeDispose(subscribeGrammarLoaded(() => { loaded.value = grammarLoadCount(); }));
    const sessionRef: {
        value: StreamingHighlightSession | null;
    } = { value: null };
    const lineCacheRef: {
        value: {
            code: string;
            lang: string | undefined;
            generation: number;
            frame: StreamingHighlightFrame;
            groups: VNodeChild[];
            pending: VNodeChild[];
            nextLine: number;
            body: VNodeChild;
        } | null;
    } = { value: null };
    const settledRef = { "value": false };
    const copied = shallowRef(false);
    const localWrapped = shallowRef(true);
    return () => {
        // Grammar registration invalidates the render even when source text is unchanged.
        void loaded.value;
        const { code, lang, diff, streaming, className, contentRef, lineNumbers = false, showHeader = true, copyLabel, copiedLabel, toolbarLabels, wrap, } = props;
        const trimmed = code.endsWith('\n') ? code.slice(0, -1) : code;
        const diffRows = (() => ((diff ?? isDiffFenceLanguage(lang)) ? parseDiffFence(trimmed) : undefined))();
        const sourceLines = lineNumbers ? trimmed.split('\n') : undefined;
        // Each file's old and new sides are tokenized separately; a growing fence
        // re-tokenizes per chunk because that grouping has no incremental path, and
        // diffs in a fence are short enough to accept it.
        const diffTokens = (() => (diffRows === undefined || !highlighting.value ? undefined : diffFenceTokens(diffRows)))();
        const streamedBody = (() => {
            // A diff fence draws its own rows; the session's single-language stream is unused.
            if (!highlighting.value || diffRows !== undefined) {
                sessionRef.value = null;
                lineCacheRef.value = null;
                settledRef.value = false;
                return undefined;
            }
            if (streaming !== true) {
                const previous = lineCacheRef.value;
                if (previous !== null && previous.code === trimmed && previous.lang === lang) {
                    settledRef.value = true;
                    return previous.body;
                }
                sessionRef.value = null;
                lineCacheRef.value = null;
                settledRef.value = true;
                return undefined;
            }
            if (settledRef.value) {
                sessionRef.value = null;
                lineCacheRef.value = null;
                settledRef.value = false;
            }
            sessionRef.value ??= new StreamingHighlightSession();
            const frame = sessionRef.value.updateFrame(trimmed, lang);
            if (frame === undefined) {
                lineCacheRef.value = null;
                return undefined;
            }
            const previous = lineCacheRef.value;
            if (previous?.frame === frame && previous.code === trimmed && previous.lang === lang) {
                return previous.body;
            }
            const sameGeneration = previous?.generation === frame.generation;
            const groups = sameGeneration ? [...previous.groups] : [];
            let pending = sameGeneration ? [...previous.pending] : [];
            let nextLine = sameGeneration ? previous.nextLine : 0;
            for (const line of frame.appended) {
                pending.push(renderLine(line, nextLine));
                nextLine += 1;
                if (pending.length !== STREAMING_LINE_GROUP_SIZE)
                    continue;
                const start = nextLine - pending.length;
                groups.push(h(Fragment, { "key": start }, [pending]));
                pending = [];
            }
            const tail = frame.tail.map((line, index) => renderLine(line, nextLine + index));
            const tailGroup = h(Fragment, { "key": nextLine - pending.length }, [[...pending, ...tail]]);
            const body = h("pre", { ...SHIKI_PRE_PROPS }, [h("code", null, [groups, tailGroup])]);
            lineCacheRef.value = {
                code: trimmed, lang, generation: frame.generation, frame, groups, pending, nextLine, body,
            };
            return body;
        })();
        const html = (() => (diffRows === undefined && highlighting.value && streaming !== true && streamedBody === undefined
            ? highlightToHtml(trimmed, lang)
            : undefined))();
        const wrapped = wrap ?? localWrapped.value;
        const onCopy = () => {
            if (copied.value)
                return;
            /* v8 ignore next -- both arms always mount a <pre>; trimmed is the
               typed fallback if the DOM shape ever diverges. */
            const text = rootRef.value?.querySelector('pre')?.textContent ?? trimmed;
            void writeClipboard(text).then((ok) => {
                if (!ok)
                    return;
                copied.value = true;
                window.setTimeout(() => { copied.value = false; }, 1000);
            });
        };
        // shiki's HTML output is a static span tree it generated from `code` (no
        // user HTML passes through), the sanctioned innerHTML consumption path per
        // shiki's own docs.
        const body = diffRows !== undefined
            ? (h("pre", { "class": css.plain }, [h("code", null, [diffRows.rows.map((row, index) => renderDiffRow(row, index, diffTokens?.get(index)))])]))
            : streamedBody !== undefined
                ? streamedBody
                : html === undefined
                    ? (h("pre", { "class": css.plain }, [h("code", null, [sourceLines === undefined ? trimmed : sourceLines.map((line, index) => (h(Fragment, { "key": index }, [index > 0 && '\n', h("span", { "class": "line" }, [line])])))])]))
                    : (h("div", { "innerHTML": html }, []));
        return (h("div", { "ref": rootRef, "class": clsx(css.block, 'md-code-block', lineNumbers && css.numbered, diffRows !== undefined && !lineNumbers && css.diffFence, toolbarLabels !== undefined && css.card, className), "data-line-numbers": lineNumbers || undefined, "data-code-wrap": toolbarLabels === undefined ? undefined : wrapped, "style": sourceLines === undefined ? undefined : {
                '--dsl-code-block-line-number-width': `${Math.max(2, String(sourceLines.length).length)}ch`,
            } as CSSProperties }, [showHeader && h("div", { "class": css.bannerWrap }, [toolbarLabels !== undefined ? h(CodeToolbar, { "lang": lang, "labels": toolbarLabels, "copyLabel": copyLabel, "copiedLabel": copiedLabel, "copied": copied.value, "wrapped": wrapped, "onCopy": onCopy, "onWrap": wrap === undefined ? () => { localWrapped.value = (value => !value)(localWrapped.value); } : undefined }) : h("div", { "class": css.banner, "data-code-block-banner": true }, [h("div", { "class": css.infostring, "data-text-interaction-exclude": "" }, [lang ?? '']), h("div", { "class": css.action }, [h("button", { "type": "button", "class": css.copyButton, "onClick": onCopy }, [copied.value ? copiedLabel : copyLabel])])])]), h("div", { "ref": (element) => contentRef?.(element as HTMLDivElement | null), "class": css.content, "data-code-block-content": true }, [body])]));
    };
}, { "name": "CodeBlock", "props": ["code", "lang", "diff", "streaming", "className", "contentRef", "lineNumbers", "showHeader", "copyLabel", "copiedLabel", "toolbarLabels", "wrap"] });
