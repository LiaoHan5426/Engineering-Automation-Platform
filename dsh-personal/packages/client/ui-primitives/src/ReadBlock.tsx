import { h, defineComponent, shallowRef, onScopeDispose, type CSSProperties } from 'vue';
import clsx from 'clsx';
import { FoldToggle } from './FoldToggle.tsx';
import { writeClipboard } from './clipboard.ts';
import { CodeToolbar, type CodeToolbarLabels } from './CodeToolbar.tsx';
import cardCss from './CodeCard.module.css';
import { grammarLoadCount, highlightLines, subscribeGrammarLoaded, type HighlightSpan, } from './markdown/highlight.ts';
import { useViewportHighlighting } from './markdown/useViewportHighlighting.ts';
import css from './ReadBlock.module.css';
/**
 * Content lines shown before the height cap collapses the middle. Matches
 * TerminalBlock's default so a long read and a long command output cut at the
 * same place in the same flow.
 */
export const DEFAULT_READ_MAX_LINES = 16;
/** One line of the read window: its file line number and its text (no trailing newline). */
export interface ReadBlockLine {
    /** 1-based line number in the file (a window past an offset keeps the file's own numbering). */
    number: number;
    /** The line's text, already truncated to the read tool's per-line cap. */
    text: string;
}
export interface ReadBlockProps {
    /** Banner label (the file path, or a tool-supplied replacement title); omitted draws no label. */
    label?: string | undefined;
    /** The returned window's lines, in file order, each keeping its file line number. */
    lines: readonly ReadBlockLine[];
    /** Localized chrome supplied by the owning render site. */
    labels: ReadBlockLabels;
    /** Exact total line count in the file, for the "showing N of M" note when the read is a window. */
    totalLines: number;
    /** Grammar hint (a file-extension-derived language id); unknown or absent = plain monospace. */
    lang?: string | undefined;
    /** Height cap in content lines before the middle collapses (default {@link DEFAULT_READ_MAX_LINES}). */
    maxLines?: number | undefined;
    /** Extra class merged onto the wrapper (callers position; this component draws). */
    className?: string | undefined;
}
/** Localized chrome for {@link ReadBlock}. */
export interface ReadBlockLabels extends CodeToolbarLabels {
    window: (shown: number, total: number) => string;
    copy: string;
    copied: string;
    collapseAria: string;
    expandAria: (hidden: number) => string;
    collapse: string;
    expand: (hidden: number) => string;
}
function renderSpans(spans: readonly HighlightSpan[]) {
    return spans.map((span, index) => h("span", { "key": index, "style": span.style }, [span.text]));
}
/**
 * Render a read tool result as a line-numbered, optionally syntax-highlighted
 * file view.
 * @param props - see {@link ReadBlockProps}.
 * @returns the read block element.
 */
export const ReadBlock = defineComponent((props: ReadBlockProps) => {
    const rootRef = shallowRef<HTMLDivElement | null>(null);
    const highlighting = useViewportHighlighting(rootRef, () => props.lang);
    const loaded = shallowRef(grammarLoadCount());
    onScopeDispose(subscribeGrammarLoaded(() => {
        loaded.value = grammarLoadCount();
    }));
    const expanded = shallowRef(false);
    const copied = shallowRef(false);
    const wrapped = shallowRef(false);
    return () => {
        // Grammar registration invalidates the render even when source text is unchanged.
        void loaded.value;
        const { label, labels, lines, totalLines, lang, maxLines = DEFAULT_READ_MAX_LINES, className, } = props;
        // Whole-window highlighting preserves multiline grammar context; copy uses
        // the same text without gutter or banner chrome.
        const raw = (() => lines.map(line => line.text).join('\n'))();
        const highlighted = (() => highlighting.value ? highlightLines(raw, lang) : undefined)();
        const onCopy = () => {
            if (copied.value)
                return;
            void writeClipboard(raw).then((ok) => {
                if (!ok)
                    return;
                copied.value = true;
                window.setTimeout(() => { copied.value = false; }, 1000);
            });
        };
        const onToggle = () => { expanded.value = (value => !value)(expanded.value); };
        const hidden = lines.length - maxLines;
        const capped = hidden > 0 && !expanded.value;
        const headLines = Math.ceil(maxLines / 2);
        const tailLines = maxLines - headLines;
        // A read is a window when its returned lines are fewer than the file's total;
        // the note states that so a reader is not misled that the file ends here.
        const windowed = lines.length < totalLines;
        const rows = (slice: readonly (readonly [
            ReadBlockLine,
            readonly HighlightSpan[] | undefined
        ])[]) => slice.map(([line, spans]) => (h("div", { "key": line.number, "class": css.line }, [h("span", { "class": css.gutter, "aria-hidden": true }, [line.number]), h("span", { "class": css.content }, [spans === undefined ? line.text : renderSpans(spans)])])));
        const gutterDigits = lines.reduce((digits, line) => Math.max(digits, String(line.number).length), 3);
        const gutterStyle = { '--dsl-read-gutter': `${gutterDigits}ch` } as CSSProperties;
        const paired = lines.map((line, index): readonly [
            ReadBlockLine,
            readonly HighlightSpan[] | undefined
        ] => [line, highlighted?.[index]]);
        return (h("div", { "ref": rootRef, "class": clsx(cardCss.card, css.block, className), "data-read": "", "data-code-wrap": wrapped.value, "style": gutterStyle }, [h(CodeToolbar, { "lang": lang, "title": label, "status": windowed ? labels.window(lines.length, totalLines) : undefined, "labels": labels, "copyLabel": labels.copy, "copiedLabel": labels.copied, "copied": copied.value, "wrapped": wrapped.value, "onCopy": lines.length > 0 ? onCopy : undefined, "onWrap": () => { wrapped.value = (value => !value)(wrapped.value); } }), h("div", { "class": cardCss.body }, [rows(capped ? paired.slice(0, headLines) : paired), hidden > 0 && (h(FoldToggle, { "className": css.expand, "expanded": expanded.value, "hidden": hidden, "labels": labels, "onToggle": onToggle })), capped && rows(paired.slice(paired.length - tailLines))])]));
    };
}, { "name": "ReadBlock", "props": ["label", "labels", "lines", "totalLines", "lang", "maxLines", "className"] });
