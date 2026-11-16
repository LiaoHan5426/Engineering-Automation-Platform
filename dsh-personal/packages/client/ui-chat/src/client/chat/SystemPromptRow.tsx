import { defineComponent, h, ref } from 'vue';
import type { ChatNodeViewProps, ChatViewSlotProps } from '../contract/slots.ts';
import { DisclosureRow, IconBrowseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { OpaqueBody } from './ContextBody.tsx';
import css from './ContextInjectionRow.module.css';
/** Props for one complete system prompt disclosure. */
export interface SystemPromptRowProps {
    /** Complete model-visible prompt text. */
    text: string;
    /** True when the prompt replaced an earlier one from this position in the history. */
    update?: boolean;
    /** The owning view's locale seat. */
    t: ChatViewSlotProps['t'];
}
/**
 * Render one complete system prompt as a collapsed disclosure whose expanded
 * body is the same opaque context chrome: 141px code-block scrollport and
 * model-facing text with its real line breaks. An in-history update uses the
 * same row under its own title.
 * @param props - Complete prompt text, whether it is an update, and the locale seat.
 * @returns The system-prompt disclosure row.
 */
export const SystemPromptRow = defineComponent((props: SystemPromptRowProps) => {
    const open = ref(false);
    return () => {
        const { text, update = false, t } = props;
        return (h(DisclosureRow, { "className": css.root, "icon": h(IconBrowseOutlineRegular, { "size": 14 }), "chevronClassName": css.chevron, "title": t(update ? 'message.systemPromptUpdate' : 'message.systemPrompt'), "open": open.value, "expandable": true, "expandOnRowClick": true, "onToggle": () => { open.value = (value => !value)(open.value); } }, { default: () => [
                h("div", { "class": css.body, "data-system-prompt-body": true }, [
                    h(OpaqueBody, { "content": [{ type: 'text', text }], "source": null, "t": t })
                ])
            ] }));
    };
}, { name: "SystemPromptRow", inheritAttrs: false, props: ["text", "update", "t"] });
/** System-prompt keyed Chat renderer. */
export const SystemPromptNodeView = defineComponent((props: Pick<ChatNodeViewProps<'system-prompt'>, 'node' | 't'>) => {
    return () => {
        const { node, t, } = props;
        return h(SystemPromptRow, { "text": node.data.text, "update": node.data.update === true, "t": t });
    };
}, { name: "SystemPromptNodeView", inheritAttrs: false, props: ["node", "t"] });
