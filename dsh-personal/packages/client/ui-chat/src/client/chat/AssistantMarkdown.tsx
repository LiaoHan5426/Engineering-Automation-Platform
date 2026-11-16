import { computed, defineComponent, Fragment, h, type VNodeChild } from 'vue';
import { fileMediaUrl } from '@deepseek-ai/dsh-util-workspace-path';
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots';
import { JsonBlock, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MarkdownFileMentions } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ChatNodeOwnerProps, ChatViewSlotProps, UseDisclosure, UsePresentation, UseGroupAction } from '../contract/slots.ts';
import type { AssistantBlock } from '../contract/snapshot.ts';
import { markdownLabels } from '../markdown-labels.ts';
import { ReasoningRow } from './ReasoningRow.tsx';
import css from './AssistantMarkdown.module.css';
/**
 * Standalone fallback for image destinations (query/fragment suffixes are ignored).
 * Chat fileImages resolves decoded file references against cwd; pathImages also
 * serves this component outside that provider and accepts legacy image URL suffixes.
 * Resolve an authored absolute image path against the document's file API.
 * @param base - canonical `document.baseURI` at render time.
 * @param value - authored Markdown destination; URL escapes are decoded once.
 * @returns an absolute Web or Desktop file-API URL, or undefined for unsupported
 * protocols and non-local paths.
 */
export function localPathMediaUrl(base: string, value: string): string | undefined {
    let path: string;
    try {
        path = decodeURIComponent(value.split(/[?#]/u)[0] ?? '');
    }
    catch {
        return undefined;
    } // Malformed URL escapes cannot identify a file.
    return fileMediaUrl(base, path);
}
export interface AssistantMarkdownProps extends Pick<PropsRenderSlots<'conversation.chat.reasoning.body' | 'conversation.chat.message.images'>, 'renderSlot'>, Pick<ChatNodeOwnerProps, 'loadImage'> {
    /** Render only the requested business portion, preserving original block indexes. */
    groupPart?: string | undefined;
    /** Stable Hook forwarded to each independently expandable reasoning block. */
    useDisclosure: UseDisclosure;
    blocks: readonly AssistantBlock[];
    streaming: boolean;
    /** Only finalized durable Assistant messages supply selection sources. */
    textInteractionSource?: boolean;
    /** Frozen partial of an aborted turn: rendered with a stopped marker. */
    interrupted?: boolean | undefined;
    /** Hide reasoning that belongs to the Turn-level process disclosure. */
    reasoningHidden?: boolean | undefined;
    /** Process hiding bound by the node slot to its current viewport. */
    useGroupAction: UseGroupAction;
    /** Live display policy for reasoning summaries. */
    usePresentation: UsePresentation;
    /** Reveal the disclosure that hides this reasoning. */
    revealProcess?: (() => void) | undefined;
    /** Resolved prose file mentions for this Assistant's closing turn. */
    mentions?: MarkdownFileMentions | undefined;
    /** The owning view's locale seat, passed down as a plain prop. */
    t: ChatViewSlotProps['t'];
}
/** Renders non-blank reasoning blocks as independent disclosures alongside the response. */
export const AssistantMarkdown = defineComponent((props: AssistantMarkdownProps) => {
    const localizedLabels = computed(() => markdownLabels(props.t));
    const pathImages = { resolve: (value: string) => localPathMediaUrl(document.baseURI, value) };

    return () => {
        const { blocks, streaming, textInteractionSource = false, interrupted, loadImage, groupPart, useDisclosure, reasoningHidden = false, usePresentation, revealProcess, mentions, renderSlot, useGroupAction, t, } = props;
        const labels = localizedLabels.value;
        const last = blocks.length - 1;
        // Tool-call heads render as tool rows in the chat view's grouping pass, so
        // a node that is only those heads (or empty) would paint an empty root
        // between tool groups — skip the shell unless something visible remains.
        const hasVisible = streaming
            || interrupted === true
            || blocks.some(block => block.kind !== 'tool-call');
        if (!hasVisible)
            return null;
        const rendered: VNodeChild[] = [];
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            if (block === undefined)
                continue;
            if (groupPart === 'reasoning' && block.kind !== 'reasoning')
                continue;
            if (groupPart === 'response' && block.kind === 'reasoning')
                continue;
            switch (block.kind) {
                case 'text':
                    rendered.push(h(MarkdownText, { "key": i, "text": block.text, "streaming": streaming, "labels": labels, "fileMentions": mentions, "pathImages": pathImages, "textInteractionSource": textInteractionSource }));
                    break;
                case 'reasoning':
                    if (block.text.trim() === '')
                        break;
                    rendered.push(h(ProcessReasoning, { "key": i, "hidden": reasoningHidden, "reveal": revealProcess, "useGroupAction": useGroupAction }, { default: () => [
                            h(ReasoningRow, { "text": block.text, "running": streaming && i === last, "usePresentation": usePresentation, "useDisclosure": useDisclosure, "renderSlot": renderSlot, "textInteractionSource": textInteractionSource, "t": t })
                        ] }));
                    break;
                case 'image': {
                    // Consecutive image blocks share one gallery so several images tile
                    // into rows instead of each opening a one-image group of its own.
                    // Keyed by the group's FIRST block index: a streaming append that
                    // extends the group then only grows `images` instead of remounting
                    // the gallery under a shifted key.
                    const start = i;
                    const group = [block];
                    while (i + 1 < blocks.length) {
                        const next = blocks[i + 1];
                        if (next === undefined || next.kind !== 'image')
                            break;
                        group.push(next);
                        i += 1;
                    }
                    rendered.push(h(Fragment, { "key": start }, [
                        renderSlot('conversation.chat.message.images', {
                            images: group.map(({ attachment }) => ({ attachment })), loadImage, align: 'start',
                        })
                    ]));
                    break;
                }
                // Grouped into tool rows by ChatView; hasVisible above skips an empty shell.
                case 'tool-call':
                    break;
                default:
                    rendered.push(h(JsonBlock, { "key": i, "label": t('message.unknownBlock'), "payload": block.block, "truncatedLabel": total => t('json.truncated', { total }) }));
            }
        }
        return (h("div", { "class": css.root, "data-streaming": streaming || undefined }, [
            h("div", { "class": css.body }, [
                rendered,
                interrupted && (groupPart === undefined || groupPart === 'response'
                    || !blocks.some(block => block.kind !== 'reasoning' && block.kind !== 'tool-call'))
                    && h("span", { "class": css.stopped }, [
                        t('message.stopped')
                    ])
            ])
        ]));
    };
}, { name: "AssistantMarkdown", inheritAttrs: false, props: ["blocks", "streaming", "textInteractionSource", "interrupted", "loadImage", "groupPart", "useDisclosure", "reasoningHidden", "usePresentation", "revealProcess", "mentions", "renderSlot", "useGroupAction", "t"] });
const ProcessReasoning = defineComponent((props: {
    hidden: boolean;
    reveal?: (() => void) | undefined;
    useGroupAction: UseGroupAction;
}, { slots }) => {
    const ref = props.useGroupAction(() => props.hidden, () => (props.reveal ?? NOOP)());
    return () => {
        const { hidden } = props;
        return h("div", { "ref": ref, "data-turn-process-inline": hidden || undefined }, [
            slots.default?.()
        ]);
    };
}, { name: "ProcessReasoning", inheritAttrs: false, props: ["hidden", "reveal", "useGroupAction"] });
const NOOP = (): void => { };
