/** Read-only Markdown viewer for logged plans and temporary review documents. */
import { computed, defineComponent, Fragment, h } from 'vue'
import { FileTypeIcon, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from './plan-resource.ts'
import { isReviewPreviewAddress } from './review-preview.ts'
import { planFailureLine } from './failure-line.ts'
import css from './PlanPreview.module.css'

type PlanPreviewProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'plan'>

/** Render complete submitted Markdown or its localized loading/failure state. */
export const PlanPreview = defineComponent((props: PlanPreviewProps) => {
  const tab = props.useTabInfo()
  const address = computed(() => tab.value.tab.navigation.address)
  const resource = props.useResource<'plan'>(address)
  const labels = computed(() => ({
    code: { copyLabel: props.t('copy'), copiedLabel: props.t('copied'), toolbarLabels: { codeLabel: props.t('codeBlock.title'), wrapLabel: props.t('codeBlock.wrap'), unwrapLabel: props.t('codeBlock.unwrap') } },
    footnotes: props.t('markdown.footnotes'),
  }))
  return () => {
    const temporary = isReviewPreviewAddress(address.value)
    const params = tab.value.tab.navigation.params
    const snapshot = resource.value
    const plan = temporary ? (params !== undefined && 'planReview' in params ? params.planReview : undefined) : snapshot?.value
    if (plan === undefined) return h('div', { class: css.message, role: 'status' }, [
      temporary ? props.t('preview.expired') : snapshot?.status === 'none' ? props.t('preview.unavailable') : snapshot?.status === 'failed' ? props.t('preview.failed') : props.t('preview.loading'),
      !temporary && snapshot?.failure !== undefined ? h('p', planFailureLine(props.t, snapshot.failure)) : null,
    ])
    return h('section', { class: css.preview, 'data-plan-preview': 'callId' in plan ? plan.callId : address.value, 'aria-label': plan.title }, [h('div', { class: css.document }, [h(MarkdownText, { text: plan.markdown, labels: labels.value })])])
  }
}, { name: 'PlanPreview', inheritAttrs: false, props: ['useTabInfo', 'useResource', 't'] })

/** Recovered plan title and file icon for the current tab. */
export const PlanTitle = defineComponent((props: PropsRuntime<'sidebar.right.pane.tab.title'>) => {
  const tab = props.useTabInfo()
  const address = computed(() => tab.value.tab.navigation.address)
  const resource = props.useResource<'plan'>(address)
  return () => {
    const params = tab.value.tab.navigation.params
    const plan = isReviewPreviewAddress(address.value) ? (params !== undefined && 'planReview' in params ? params.planReview : undefined) : resource.value?.value
    return h(Fragment, [h(FileTypeIcon, { kind: 'other', size: 16, className: css.titleIcon ?? '' }), plan?.title ?? tab.value.tab.title])
  }
}, { name: 'PlanTitle', inheritAttrs: false, props: ['useTabInfo', 'useResource'] })
