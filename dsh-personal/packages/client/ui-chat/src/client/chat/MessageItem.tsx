import { computed, defineComponent, h, ref, watchEffect, type VNodeChild } from 'vue';
import type { PendingSubmission } from '@deepseek-ai/dsh-api-session-controller/client';
import type { PropsRenderFactories, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots';
import type { UserTextFacts } from '@deepseek-ai/dsh-client-ui-conversation/client';
import { IconBranchOutlineRegular, JsonBlock, StateDot, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ChatNodeOwnerProps, ChatNodeViewProps, ChatViewSlotProps, UserContentAttachment, UserContentInput } from '../contract/slots.ts';
import type { ModelRetryNode, TurnErrorNode, UserMessageNode } from '../contract/snapshot.ts';
import { CompactionItem } from './CompactionItem.tsx';
import { ContextInjectionRow } from './ContextInjectionRow.tsx';
import { MessageIconActions } from './MessageIconActions.tsx';
import css from './MessageItem.module.css';
const EMPTY_TEXT_FACTS: Readonly<Partial<UserTextFacts>> = {};
type UserImage = Extract<UserMessageNode['content'][number], {
    type: 'image';
}>;
type UserFile = Extract<UserMessageNode['content'][number], {
    type: 'file';
}>;
function contentParts(content: readonly unknown[]): {
    text: string;
    attachments: UserContentAttachment[];
    rest: unknown[];
} {
    const texts: string[] = [];
    const attachments: UserContentAttachment[] = [];
    const rest: unknown[] = [];
    for (const block of content) {
        const b = block as {
            type?: string;
            text?: string;
            attachment?: unknown;
        };
        if (b.type === 'text' && typeof b.text === 'string')
            texts.push(b.text);
        else if (b.type === 'image' && b.attachment !== undefined) {
            attachments.push({ type: 'image' as const, image: { attachment: (b as UserImage).attachment } });
        }
        else if (b.type === 'file' && b.attachment !== undefined) {
            attachments.push({ type: 'file' as const, file: (b as UserFile).attachment });
        }
        else
            rest.push(block);
    }
    return { text: texts.join(''), attachments, rest };
}
function retrySeconds(milliseconds: number): number {
    return Math.max(1, Math.ceil(milliseconds / 1000));
}
function failureMessage(message: string, code: unknown, t: ChatViewSlotProps['t']): string {
    if (code === 'ACCOUNT_SIGNED_OUT')
        return t('message.failure.accountSignedOut');
    if (code === 'INTERRUPTED')
        return t('message.failure.interrupted');
    if (code === 'ACCOUNT_SIGN_IN_REQUIRED')
        return t('message.failure.accountSignInRequired');
    if (code === 'QUOTA' || code === 'ACCOUNT_QUOTA')
        return t('message.failure.quota');
    return code === 'AUTH' ? t('message.failure.auth') : message;
}
const ModelRetryItem = defineComponent((props: {
    node: ModelRetryNode;
    active: boolean;
    t: ChatViewSlotProps['t'];
}) => {
    const deadline = computed(() => { props.node.seq; return Date.now() + props.node.delayMs; });
    const countdown = ref(retrySeconds(deadline.value - Date.now()));
    watchEffect(onCleanup => {
        const until = deadline.value;
        if (!props.active)
            return;
        const update = (): number => { countdown.value = retrySeconds(until - Date.now()); return countdown.value; };
        if (update() === 1)
            return;
        const timer = window.setInterval(() => {
            if (update() === 1)
                window.clearInterval(timer);
        }, 250);
        onCleanup(() => window.clearInterval(timer));
    });
    return () => {
        const { node, active, t } = props;
        const scheduledSeconds = retrySeconds(node.delayMs);
        const maximum = node.mode === 'normal' ? node.maxRetries : '∞';
        const remainingSeconds = countdown.value;
        const label = active
            ? t('message.retry.active')
            : node.retryState === 'cancelled'
                ? t('message.retry.cancelled')
                : node.retryState === 'started'
                    ? t('message.retry.started')
                    : t('message.retry.scheduled');
        const seconds = active ? remainingSeconds : scheduledSeconds;
        return (h("details", { "class": css.retryRow, "data-active": active || undefined }, [
            h("summary", { "class": css.retrySummary }, [
                h("span", { "class": css.retryText, "role": "status" }, [
                    h(TextShimmer, { "active": active }, { default: () => [
                            t('message.retry.status', { label, retry: node.retry, maximum, seconds })
                        ] })
                ])
            ]),
            h("div", { "class": css.retryDetails }, [
                h("div", null, [
                    h("span", { "class": css.retryDetailLabel }, [
                        t('message.retry.delay')
                    ]),
                    t('duration.milliseconds', { milliseconds: Math.round(node.delayMs) })
                ]),
                h("div", null, [
                    h("span", { "class": css.retryDetailLabel }, [
                        t('message.retry.failure')
                    ]),
                    failureMessage(node.failure.message, node.failure.code, t)
                ])
            ])
        ]));
    };
}, { name: "ModelRetryItem", inheritAttrs: false, props: ["node", "active", "t"] });
const TurnErrorItem = defineComponent((props: {
    node: TurnErrorNode;
    t: ChatViewSlotProps['t'];
}) => {
    return () => {
        const { node, t } = props;
        return (h("div", { "class": css.turnErrorRow, "role": "status" }, [
            h(StateDot, { "state": "error", "className": css.turnErrorDot ?? "" }),
            h("div", { "class": css.turnErrorCopy }, [
                h("span", { "class": css.turnErrorTitle }, [
                    node.code === 'ACCOUNT_SIGNED_OUT' || node.code === 'INTERRUPTED' ? t('message.taskStopped') : t('message.turnError')
                ]),
                h("span", { "class": css.turnErrorMessage }, [
                    failureMessage(node.message, node.code, t)
                ])
            ]),
            node.code !== undefined && node.code !== 'INTERRUPTED' && h("code", { "class": css.turnErrorCode }, [
                node.code
            ])
        ]));
    };
}, { name: "TurnErrorItem", inheritAttrs: false, props: ["node", "t"] });
const TurnMaxTokensItem = defineComponent((props: {
    t: ChatViewSlotProps['t'];
}) => {
    return () => {
        const { t } = props;
        return (h("div", { "class": css.turnErrorRow, "role": "status" }, [
            h(StateDot, { "state": "warning", "className": css.turnErrorDot ?? "" }),
            h("div", { "class": css.turnErrorCopy }, [
                h("span", { "class": css.maxTokensTitle }, [
                    t('message.maxTokens')
                ]),
                h("span", { "class": css.turnErrorMessage }, [
                    t('message.maxTokens.hint')
                ])
            ])
        ]));
    };
}, { name: "TurnMaxTokensItem", inheritAttrs: false, props: ["t"] });
/**
 * A row the message-source seat decorates. A durable Chat node satisfies it;
 * pending and local-echo rows pass a source-less stand-in.
 */
interface DecoratedRow {
    readonly kind: 'user' | 'steering';
    readonly data: {
        readonly source: unknown;
    };
}
/** Pending and local-echo rows carry no durable source for the seat to elect. */
const UNDECORATED_ROW: DecoratedRow = { kind: 'user', data: { source: null } };
/** Occupant used by rows that do not own the message-source seat. */
const NO_MESSAGE_SOURCE: PropsRenderSlots<'conversation.chat.user.before'>['renderSlotChain'] = () => null;
const UserStyleBubble = defineComponent((props: {
    content: readonly unknown[];
    renderFactorySlot: PropsRenderFactories['renderFactorySlot'];
    /** Optional IconActions (or similar) below the bubble; receives the joined text. */
    actions?: (text: string) => VNodeChild;
    /** Row whose durable source the message-source seat elects above this bubble. */
    node: DecoratedRow;
    /** Seat renderer; rows that do not own the seat pass {@link NO_MESSAGE_SOURCE}. */
    renderSlotChain: PropsRenderSlots<'conversation.chat.user.before'>['renderSlotChain'];
    /** Whether this is the Host-authoritative pre-admission steering projection. */
    pending?: boolean;
    /** Whether this is a local submission echo (invisible marker; the echo renders exactly like its durable replacement). */
    echo?: boolean;
    /** Whether this admitted steering row starts its claim's batch and keeps the Turn tail slot above it. */
    batchStart?: boolean;
    /** Exact session mention labels associated by the adjacent recall node. */
    referenceLabels?: readonly string[];
    /** Skill names the step's `skill-invocation` injections loaded for this message. */
    skillNames?: readonly string[];
    /** Local submission-echo attachments replacing the content-derived attachment sequence. */
    previewAttachments?: readonly UserContentAttachment[];
    /** Inputs used by text transforms, separate from row and rendering props. */
    facts?: Readonly<Partial<UserTextFacts>>;
} & Pick<ChatNodeOwnerProps, 'loadImage'> & Pick<UserContentInput, 'interactive'>) => {
    return () => {
        const { node, renderSlotChain, content, loadImage, renderFactorySlot, actions, pending = false, echo = false, batchStart = false, referenceLabels, skillNames, previewAttachments, facts: inputFacts = EMPTY_TEXT_FACTS, interactive = false, } = props;
        const parts = (() => contentParts(content))();
        const prepared = (() => ({
            text: parts.text,
            attachments: previewAttachments ?? parts.attachments,
            extraBlocks: parts.rest,
            ...(referenceLabels === undefined ? {} : { referenceLabels }),
        }))();
        const facts = (() => ({
            ...inputFacts,
            ...(referenceLabels === undefined ? {} : { sessionLabels: referenceLabels }),
            ...(skillNames === undefined ? {} : { skillNames }),
        }))();
        return (h("div", { "class": css.userRow, "data-pending-steering": pending || undefined, "data-submission-echo": echo || undefined, "data-chat-steering-batch": batchStart ? 'start' : undefined }, [
            renderSlotChain('conversation.chat.user.before', { source: node.data.source, kind: node.kind }, { fallback: null }),
            renderFactorySlot('conversation.chat.user.content', {
                content: prepared,
                loadImage,
                facts,
                interactive,
            }),
            actions?.(prepared.text)
        ]));
    };
}, { name: "UserStyleBubble", inheritAttrs: false, props: ["node", "renderSlotChain", "content", "loadImage", "renderFactorySlot", "actions", "pending", "echo", "batchStart", "referenceLabels", "skillNames", "previewAttachments", "facts", "interactive"] });
/**
 * Render one Host-authoritative pending steering item with the same visual
 * language as its eventual durable transcript node.
 * @param props - pending content, authorized image loader, and Factory/locale seats.
 * @returns the pending steering bubble.
 */
export const PendingSteeringBubble = defineComponent((props: {
    content: readonly unknown[];
    renderFactorySlot: PropsRenderFactories['renderFactorySlot'];
    t: ChatViewSlotProps['t'];
} & Pick<ChatNodeOwnerProps, 'loadImage'>) => {
    return () => {
        const { content, loadImage, renderFactorySlot, t } = props;
        return (h(UserStyleBubble, { "node": UNDECORATED_ROW, "renderSlotChain": NO_MESSAGE_SOURCE, "content": content, "renderFactorySlot": renderFactorySlot, "loadImage": loadImage, "pending": true, "actions": text => (h(MessageIconActions, { "text": text, "clock": "start", "className": css.actions ?? "", "t": t })) }));
    };
}, { name: "PendingSteeringBubble", inheritAttrs: false, props: ["content", "loadImage", "renderFactorySlot", "t"] });
/**
 * Render one local transcript or steering submission echo with the same
 * visual language and surface marker as the Host occurrence that replaces
 * it: draft text plus object-URL previews, visible from the submit click
 * until the durable `user/message` or steering occurrence renders.
 * @param props - the pending submission, authorized image loader, and render seats.
 * @returns the echoed user bubble.
 */
export const PendingSubmissionBubble = defineComponent((props: {
    submission: PendingSubmission;
    renderFactorySlot: PropsRenderFactories['renderFactorySlot'];
    t: ChatViewSlotProps['t'];
} & Pick<ChatNodeOwnerProps, 'loadImage'>) => {
    return () => {
        const { submission, loadImage, renderFactorySlot, t } = props;
        const content = (() => (submission.text === '' ? [] : [{ type: 'text', text: submission.text }]))();
        const previewAttachments = (() => submission.attachments.map(attachment => attachment.type === 'image'
            ? {
                type: 'image' as const,
                image: {
                    preview: {
                        url: attachment.value.previewUrl,
                        ...(attachment.value.name === undefined ? {} : { name: attachment.value.name }),
                        ...(attachment.value.width === undefined ? {} : { width: attachment.value.width }),
                        ...(attachment.value.height === undefined ? {} : { height: attachment.value.height }),
                    },
                },
            }
            : { type: 'file' as const, file: attachment.value }))();
        return (h(UserStyleBubble, { "node": UNDECORATED_ROW, "renderSlotChain": NO_MESSAGE_SOURCE, "content": content, "previewAttachments": previewAttachments, "renderFactorySlot": renderFactorySlot, "loadImage": loadImage, "pending": submission.placement === 'steering', "echo": true, "actions": text => (h(MessageIconActions, { "text": text, "time": submission.time, "clock": "start", "className": css.actions ?? "", "t": t })) }));
    };
}, { name: "PendingSubmissionBubble", inheritAttrs: false, props: ["submission", "loadImage", "renderFactorySlot", "t"] });
/**
 * Official user and admitted-steering keyed Chat renderer.
 *
 * Renders the durable-message chain seat directly above the bubble. The seat is
 * declared by the `user` registration alone, so a steering row renders the same
 * bubble without asking for it.
 */
export const UserMessageNodeView = defineComponent((props: ChatNodeViewProps<'user' | 'steering'> & {
    /** Bound by the `user` keyed registration, the only entry that declares the seat. */
    renderSlotChain: PropsRenderSlots<'conversation.chat.user.before'>['renderSlotChain'];
}) => {
    return () => {
        const { node, renderFactorySlot, loadImage, renderSlotChain, t, } = props;
        const data = node.data;
        return (h(UserStyleBubble, { "node": node, "renderSlotChain": renderSlotChain, "content": data.content, "interactive": true, "renderFactorySlot": renderFactorySlot, "loadImage": loadImage, "batchStart": node.kind === 'steering' && node.data.batchStart === true, ...data.referenceLabels === undefined ? {} : { referenceLabels: data.referenceLabels }, ...data.skillNames === undefined ? {} : { skillNames: data.skillNames }, "actions": text => (h(MessageIconActions, { "text": text, "time": data.time, "clock": "start", "className": css.actions ?? "", "t": t })) }));
    };
}, { name: "UserMessageNodeView", inheritAttrs: false, props: ["node", "renderFactorySlot", "loadImage", "renderSlotChain", "t"] });
/** Injected-context keyed Chat renderer. */
export const ContextMessageNodeView = defineComponent((props: ChatNodeViewProps<'context'>) => {
    return () => {
        const { node, t } = props;
        const data = node.data;
        return (h(ContextInjectionRow, { "content": data.content, "source": data.source, "producer": data.producer, "form": data.form, "t": t }));
    };
}, { name: "ContextMessageNodeView", inheritAttrs: false, props: ["node", "t"] });
/** Automatic compaction keyed Chat renderer. */
export const CompactionNodeView = defineComponent((props: ChatNodeViewProps<'compaction'>) => {
    return () => {
        const { node, t } = props;
        return h(CompactionItem, { "node": node.data, "t": t });
    };
}, { name: "CompactionNodeView", inheritAttrs: false, props: ["node", "t"] });
/** Divider between a forked Session's inherited history and its own messages. */
export const InheritedHistoryNodeView = defineComponent((props: ChatNodeViewProps<'inherited-history'>) => {
    return () => {
        const { t } = props;
        return (h("div", { "class": css.inheritedHistoryRow, "role": "separator", "aria-label": t('message.inheritedHistory') }, [
            h("span", { "class": css.inheritedHistoryLine, "aria-hidden": true }),
            h("span", { "class": css.inheritedHistoryCaption, "aria-hidden": true }, [
                h(IconBranchOutlineRegular, { "className": css.inheritedHistoryIcon ?? "" }),
                h("span", { "class": css.inheritedHistoryLabel }, [
                    t('message.inheritedHistory')
                ])
            ]),
            h("span", { "class": css.inheritedHistoryLine, "aria-hidden": true })
        ]));
    };
}, { name: "InheritedHistoryNodeView", inheritAttrs: false, props: ["t"] });
/** Correlated retry-chain keyed Chat renderer. */
export const RetryNodeView = defineComponent((props: ChatNodeViewProps<'model-retry'>) => {
    return () => {
        const { node, t } = props;
        const data = node.data;
        return h(ModelRetryItem, { "node": data.current, "active": data.current.retryState === 'scheduled', "t": t });
    };
}, { name: "RetryNodeView", inheritAttrs: false, props: ["node", "t"] });
/** Terminal turn-error keyed Chat renderer. */
export const TurnErrorNodeView = defineComponent((props: ChatNodeViewProps<'turn-error'>) => {
    return () => {
        const { node, t } = props;
        return h(TurnErrorItem, { "node": node.data, "t": t });
    };
}, { name: "TurnErrorNodeView", inheritAttrs: false, props: ["node", "t"] });
/** Max-tokens turn-end notice keyed Chat renderer. */
export const TurnMaxTokensNodeView = defineComponent((props: ChatNodeViewProps<'turn-max-tokens'>) => {
    return () => {
        const { t } = props;
        return h(TurnMaxTokensItem, { "t": t });
    };
}, { name: "TurnMaxTokensNodeView", inheritAttrs: false, props: ["t"] });
/** Explicit unknown-surface keyed Chat renderer. */
export const UnknownNodeView = defineComponent((props: ChatNodeViewProps<'unknown'>) => {
    return () => {
        const { node, t } = props;
        const data = node.data;
        return (h("div", { "class": css.contextRow }, [
            h(JsonBlock, { "label": t('message.unknownSurface', { type: data.type }), "payload": data.data, "truncatedLabel": total => t('json.truncated', { total }) })
        ]));
    };
}, { name: "UnknownNodeView", inheritAttrs: false, props: ["node", "t"] });
