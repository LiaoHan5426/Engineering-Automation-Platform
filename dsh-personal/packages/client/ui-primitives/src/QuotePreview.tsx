/** Shared compact presentation for draft and sent text quotes. */
import { defineComponent, h, Fragment, shallowRef, watch, type PropType } from 'vue';
import { IconCloseOutlineRegular } from './icons/index.tsx';
import { HoverCard } from './HoverCard.tsx';
import css from './QuotePreview.module.css';
function QuoteMarkIcon({ className }: {
    readonly className?: string | undefined;
}) {
    return (h("svg", { "width": 16, "height": 16, "class": className, "viewBox": "0 0 16 16", "fill": "none", "aria-hidden": true }, [h("g", { "transform": "translate(6.8 2.4)" }, [h("path", { "d": "M2.8125 0.583008L3.2002 1.16602C2.43912 1.6713 1.88491 2.41238 1.60547 3.25684H2.98926V6.70605H0V4.52148C1.96593e-05 2.70313 0.9109 1.00575 2.42578 0L2.8125 0.583008Z", "fill": "currentColor" }, undefined), h("path", { "d": "M7.50781 0.583008L7.89551 1.16602C7.13443 1.6713 6.58022 2.41238 6.30078 3.25684H7.68457V6.70605H4.69531V4.52148C4.69533 2.70313 5.60621 1.00575 7.12109 0L7.50781 0.583008Z", "fill": "currentColor" }, undefined)])]));
}
/** Optional whole-quote removal control supplied by an editable owner. */
export interface QuotePreviewRemoval {
    /** Localized accessible name for the removal button. */
    readonly label: string;
    /** Remove the complete owning quote node. */
    readonly onRemove: () => void;
}
/** Owner-supplied readable form of a quote whose exact text is long structured content. */
export interface QuoteSummary {
    /** Short inline label shown before `body` in place of the exact text; assistive technology reads `title` and `detail` instead. */
    readonly label: string;
    /** First popover line, such as a file path; also the label's accessible text. */
    readonly title: string;
    /** Secondary popover line, such as a line range. */
    readonly detail?: string | undefined;
    /** Main text, such as a user's comment, shown inline after `label` and in full in the popover. */
    readonly body: string;
}
/** Presentation inputs for one compact quote excerpt. */
export interface QuotePreviewProps {
    /** Exact selected text rendered inline and exposed in a popover while clipped, unless `summary` replaces it. */
    readonly text: string;
    /** Readable replacement for `text`: its label renders inline and its popover opens on every hover. */
    readonly summary?: QuoteSummary | undefined;
    /** Composer-only removal action; omit for inert sent quotes. */
    readonly removal?: QuotePreviewRemoval | undefined;
}
/**
 * Render one width-capped quote preview shared by editable drafts and sent messages.
 * Clipped excerpts open a content-sized, scrollable popover that fits within the viewport.
 * @param props - selected text, optional summary, and optional localized removal action.
 * @returns a non-navigating quote preview with a full-text popover only while clipped, or a summary popover.
 */
export const QuotePreview = defineComponent({ name: 'QuotePreview', props: { text: { type: String, required: true }, summary: Object as PropType<QuoteSummary>, removal: Object as PropType<QuotePreviewRemoval> }, setup(props) {
        const sourceRef = shallowRef<HTMLSpanElement | null>(null);
        const truncated = shallowRef(false);
        watch([sourceRef, () => props.text], (_, __, onCleanup) => {
            const source = sourceRef.value;
            /* v8 ignore next -- the ref is attached before layout effects run. */
            if (source === null)
                return;
            const measure = () => {
                const clipped = source.scrollWidth > source.clientWidth;
                truncated.value = clipped;
            };
            measure();
            if (typeof ResizeObserver === 'undefined')
                return;
            const observer = new ResizeObserver(measure);
            observer.observe(source);
            onCleanup(() => { observer.disconnect(); });
        }, { immediate: true, flush: 'post' });
        return () => {
            const { text, summary, removal } = props;
            const remove = (event: MouseEvent): void => {
                event.preventDefault();
                event.stopPropagation();
                removal?.onRemove();
            };
            const preview = (h("span", { "class": css.quote, "data-quote-preview": "", "data-removable": removal === undefined ? undefined : '' }, [removal === undefined
                    ? (h("span", { "class": css.marker, "aria-hidden": true }, [h(QuoteMarkIcon, { "className": css.quoteMark }, undefined)]))
                    : (h("button", { "type": "button", "class": css.remove, "aria-label": removal.label, "onPointerdown": (event: PointerEvent) => { event.preventDefault(); event.stopPropagation(); }, "onKeydown": (event: KeyboardEvent) => { event.stopPropagation(); }, "onClick": remove }, [h(QuoteMarkIcon, { "className": css.quoteMark }, undefined), h(IconCloseOutlineRegular, { "size": 12, "className": css.closeMark ?? '' }, undefined)])), h("span", { "ref": sourceRef, "class": css.source, "data-quote-preview-text": "" }, [summary === undefined ? text : (h(Fragment, null, [h("span", { "aria-hidden": "true" }, [summary.label]), h("span", { "class": css.visuallyHidden }, [summary.detail === undefined ? summary.title : `${summary.title} ${summary.detail}`]), ' ', h("span", { "class": css.inlineBody }, [summary.body])]))])]));
            return h(HoverCard, { inline: true, grouped: true, fitContent: true, openDelayMs: 0, disabled: summary === undefined && !truncated.value }, { anchor: () => preview, default: () => summary === undefined ? h("span", { "class": css.popoverText, "data-quote-popover": "", "aria-hidden": "true" }, [text]) : h("span", { "class": css.summary, "data-quote-popover": "", "aria-hidden": "true" }, [h("span", { "class": css.summaryTitle }, [summary.title]), summary.detail !== undefined && h("span", { "class": css.summaryDetail }, [summary.detail]), h("span", { "class": css.summaryBody }, [summary.body])]) });
        };
    } });
