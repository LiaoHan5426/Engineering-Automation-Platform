import { defineComponent, h } from 'vue';
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots';
import type { ChatNodeViewProps } from '../contract/slots.ts';
import { CompactionCommandCard } from './CompactionCommandCard.tsx';
import { GenericCommandCard } from './GenericCommandCard.tsx';
import css from './ChatView.module.css';
type CommandNodeViewProps = ChatNodeViewProps<'command'> & PropsRenderSlots<'conversation.chat.commandview'>;
/** Ordinary command lifecycle renderer with command-name keyed specialization. */
export const CommandNodeView = defineComponent((props: CommandNodeViewProps) => {
    return () => {
        const { node, renderSlot, t } = props;
        const command = node.data;
        const owner = (() => ({ node: command }))();
        return (h("div", { "class": css.callRow }, [
            renderSlot('conversation.chat.commandview', owner, {
                entryKey: command.name ?? '',
                fallback: h(GenericCommandCard, { ...owner, "t": t }),
            })
        ]));
    };
}, { name: "CommandNodeView", inheritAttrs: false, props: ["node", "renderSlot", "t"] });
/** One integrated `/compact` command and compaction transaction renderer. */
export const ManualCompactionNodeView = defineComponent((props: ChatNodeViewProps<'manual-compaction'>) => {
    return () => {
        const { node, t, } = props;
        const data = node.data;
        return (h("div", { "class": css.callRow }, [
            h(CompactionCommandCard, { "node": data.command, ...data.compaction === null ? {} : { compaction: data.compaction }, "t": t })
        ]));
    };
}, { name: "ManualCompactionNodeView", inheritAttrs: false, props: ["node", "t"] });
