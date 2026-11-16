import { defineComponent, Fragment, h } from 'vue';
import type { FactoryComponentPropsOf } from '@deepseek-ai/dsh-client-ui-slots';
import { fileExtension, FileTypeIcon, fileSizeText, JsonBlock, UserMessageBubble } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './MessageItem.module.css';
type UserContentProps = Pick<FactoryComponentPropsOf<'conversation.chat.user.content'>,
 'content' | 'loadImage' | 'facts' | 'interactive' | 'ellipsis' | 'renderSlot' | 'renderFactorySlot' | 't'>;
const EMPTY_LABELS: readonly string[] = [];
/**
 * Render prepared text, ordered attachments, and references without message chrome.
 * The caller owns row identity, pending/echo state, time, and message actions.
 * @param props - prepared content, facts, authorized image loader, and framework Factory/locale seats.
 * @returns the content stack using the existing user-message layout.
 */
export const UserContent = defineComponent((props: UserContentProps) => {
    return () => {
        const { content, loadImage, facts, interactive = false, ellipsis = false, renderSlot, renderFactorySlot, t } = props;
        const { text, attachments, extraBlocks, referenceLabels = EMPTY_LABELS } = content;
        const compactImages = attachments.length > 1;
        const truncated = (total: number): string => t('json.truncated', { total });
        const showBubble = text !== '' || extraBlocks.length > 0;
        return (h("div", { "class": css.userStack }, [
            attachments.length > 0 && (h("div", { "class": css.attachmentRow, "data-message-attachments": true }, [
                attachments.map((attachment, index) => attachment.type === 'image'
                    ? (h(Fragment, { "key": `image:${index}` }, [
                        renderSlot('conversation.chat.user.images', {
                            images: [attachment.image], loadImage, align: 'end', compact: compactImages,
                        })
                    ]))
                    : (h("span", { "key": `file:${index}`, "class": css.fileCard, "title": attachment.file.name }, [
                        h(FileTypeIcon, { "path": attachment.file.name, "className": css.fileIcon }),
                        h("span", { "class": css.fileContent }, [
                            h("span", { "class": css.fileName }, [
                                attachment.file.name
                            ]),
                            h("span", { "class": css.fileMeta }, [
                                [fileExtension(attachment.file.name).toUpperCase().slice(0, 8), fileSizeText(attachment.file.bytes)]
                                    .filter(Boolean).join(' ')
                            ])
                        ])
                    ])))
            ])),
            showBubble && h(UserMessageBubble, { "data-message-bubble": "", "data-text-interaction-source": "" }, { default: () => [
                    renderFactorySlot('conversation.user.text', { text, facts, interactive, ellipsis }),
                    extraBlocks.map((block, index) => (h(JsonBlock, { "key": index, "label": t('message.extraBlock'), "payload": block, "truncatedLabel": truncated })))
                ] }),
            referenceLabels.length > 0 && (h("div", { "class": css.referenceSummary }, [
                t('message.referenceSummary', { labels: referenceLabels.join(t('message.referenceSeparator')) })
            ]))
        ]));
    };
}, { name: "UserContent", inheritAttrs: false, props: ["content", "loadImage", "facts", "interactive", "ellipsis", "renderSlot", "renderFactorySlot", "t"] });
