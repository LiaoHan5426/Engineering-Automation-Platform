import { defineComponent, h } from 'vue'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FactoryComponentPropsOf, PropsRenderFactories, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { markdownLabels } from '../markdown-labels.ts'
type ReasoningBodyProps = PropsRuntime<'conversation.chat.reasoning.body'> & PropsRenderFactories
/**
 * Render compact reasoning with caller-supplied labels or Chat's defaults.
 * @param props - display text, streaming state, optional localized labels, and the Factory's locale seat; no Session is required.
 * @returns the standard reasoning content; supplied labels are used without merging defaults.
 */
export const ReasoningContent = defineComponent((props: FactoryComponentPropsOf<'conversation.chat.reasoning.content'>) => {
  return () => {
    const { text, running, labels, t } = props
    const resolvedLabels = (() => labels ?? markdownLabels(t))()
    return h(MarkdownText, { 'text': text, 'streaming': running, 'labels': resolvedLabels, 'variant': 'compact' })
  }
}, { name: 'ReasoningContent', inheritAttrs: false, props: ['text', 'running', 'labels', 't'] })
/**
 * Render the default Body through the same Factory available to third-party wrappers.
 * @param props - display-ready reasoning and the framework's Factory renderer.
 * @returns an occurrence of the official reasoning Content Factory.
 */
export const DefaultReasoningBody = defineComponent((props: ReasoningBodyProps) => {
  return () => {
    const { text, running, renderFactorySlot } = props
    return renderFactorySlot('conversation.chat.reasoning.content', { text, running })
  }
}, { name: 'DefaultReasoningBody', inheritAttrs: false, props: ['text', 'running', 'renderFactorySlot'] })
