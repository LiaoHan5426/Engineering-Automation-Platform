/** Chat's language layers for Markdown fences: display math and unified-diff rows. */
import { defineComponent, h } from 'vue'
import { FenceCodeBlock, FenceMathBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HocShare, PropsLocale, PropsRuntime, SlotMap } from '@deepseek-ai/dsh-client-ui-slots'
import { markdownLabels } from '../markdown-labels.ts'

/** Props of the math layer: the fence and the next inner content. */
export type MathFenceLayerProps = PropsRuntime<'conversation.chat.markdown.fence'> & HocShare<SlotMap['conversation.chat.markdown.fence']>

/** Props of the diff layer: the fence and the Chat locale seat. */
export type DiffFenceLayerProps = PropsRuntime<'conversation.chat.markdown.fence'> & PropsLocale<'chat'>

/** Display settled TeX; preserve the inner code presentation while streaming. */
export const MathFenceLayer = defineComponent((props: MathFenceLayerProps, { slots }) => () =>
  props.streaming ? slots.default?.() : h(FenceMathBlock, { code: props.code }),
{ name: 'MathFenceLayer', inheritAttrs: false, props: ['code', 'streaming'] })

/** Render diff fences with locale-owned code controls. */
export const DiffFenceLayer = defineComponent((props: DiffFenceLayerProps) => () => h(FenceCodeBlock, {
  lang: props.lang, code: props.code, streaming: props.streaming, labels: markdownLabels(props.t).code, diff: true,
}), { name: 'DiffFenceLayer', inheritAttrs: false, props: ['lang', 'code', 'streaming', 't'] })
