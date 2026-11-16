import { computed, defineComponent, h } from 'vue';
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
/** Render saved detail text with Harness's shared, compact Markdown component. */
export const Markdown = defineComponent((props: {
    text: string;
} & PropsLocale<'timeline'>) => {
    const labels = computed(() => ({
        code: {
            copyLabel: props.t('markdownCopy'),
            copiedLabel: props.t('markdownCopied'),
            toolbarLabels: {
                codeLabel: props.t('markdownCode'),
                wrapLabel: props.t('markdownWrap'),
                unwrapLabel: props.t('markdownUnwrap'),
            },
        },
        footnotes: props.t('markdownFootnotes'),
    }));
    return () => {
        return (h("div", { "class": "timeline-markdown" }, [
            h(MarkdownText, { "text": props.text, "labels": labels.value, "variant": "compact" })
        ]));
    };
}, { name: "Markdown", inheritAttrs: false, props: ["text", "t"] });
