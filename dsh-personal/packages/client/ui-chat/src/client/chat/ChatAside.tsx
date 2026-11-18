/** Session-level aside beside the transcript; its geometry is CSS-only. */
import { defineComponent, h } from 'vue'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ChatView.module.css'

/** Render the aside independently of transcript updates. */
export const ChatAside = defineComponent((props: Pick<PropsRenderSlots<'conversation.chat.aside'>, 'renderSlot'>) =>
  () => h('div', { class: css.asideSlot, 'data-chat-aside': '' }, [props.renderSlot('conversation.chat.aside', {})]),
{ props: ['renderSlot'], inheritAttrs: false })
