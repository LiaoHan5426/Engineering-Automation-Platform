import { h } from 'vue';
type ComponentProps<T extends abstract new (...args: never[]) => {
    $props: unknown;
}> = InstanceType<T>['$props'];
import { JsonBlock as LocalizedJsonBlock, MarkdownText as LocalizedMarkdownText, type MarkdownCodeLabels, type MarkdownLabels, } from '../src/index.ts';
import { markdownLabels as defaultMarkdownLabels } from './labels.client.ts';
type MarkdownTextProps = Omit<ComponentProps<typeof LocalizedMarkdownText>, 'labels'> & {
    labels?: MarkdownLabels;
    codeLabels?: MarkdownCodeLabels;
};
export function MarkdownText({ labels, codeLabels, ...props }: MarkdownTextProps) {
    const resolved = labels ?? (codeLabels === undefined
        ? defaultMarkdownLabels
        : { ...defaultMarkdownLabels, code: codeLabels });
    return h(LocalizedMarkdownText, { ...props, "labels": resolved });
}
type JsonBlockProps = Omit<ComponentProps<typeof LocalizedJsonBlock>, 'truncatedLabel'> & {
    truncatedLabel?: (total: number) => string;
};
export function JsonBlock({ truncatedLabel, ...props }: JsonBlockProps) {
    return (h(LocalizedJsonBlock, { ...props, "truncatedLabel": truncatedLabel ?? (total => `… 已截断，共 ${total} 字符`) }));
}
