import { onMounted, computed, defineComponent, Fragment, h, useId, watch, shallowRef, type VNodeChild } from 'vue'
import { toValue, type MaybeRefOrGetter, type ComputedRef } from 'vue'
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Annotation, AnnotationTarget, TimelineView } from '../records.ts'
import { newId } from '../records.ts'
import { formatPeriod, savedPeriod } from '../periods.ts'
import type { AnnotationRequest } from './actions.ts'
import { Markdown } from './Markdown.tsx'
import { emptyDraft } from './store.ts'
import type { AnnotationDraftControl } from './store.ts'
/** Use the session-owned draft when mounted in the Timeline panel. */
export function useAnnotationDraft(control?: MaybeRefOrGetter<AnnotationDraftControl | undefined>): ComputedRef<AnnotationDraftControl> {
  const draft = shallowRef(emptyDraft)
  const update = (patch: Partial<AnnotationDraftControl['draft']>) => { draft.value = { ...draft.value, ...patch } }
  return computed(() => toValue(control) ?? { draft: draft.value, update })
}
const controlStatuses = {
  applied: { labelKey: 'controlApplied', tone: 'success' },
  completed: { labelKey: 'taskCompleted', tone: 'success' },
  unavailable: { labelKey: 'controlUnavailable', tone: 'warning' },
  answered: { labelKey: 'controlAnswered', tone: 'warning' },
  superseded: { labelKey: 'controlSuperseded', tone: 'neutral' },
  waiting: { labelKey: 'controlWaiting', tone: 'info' },
  unknown: { labelKey: 'controlDeliveryUnknown', tone: 'warning' },
} as const
function annotationStatus(annotation: Annotation) {
  if (annotation.control !== undefined)
    return controlStatuses[annotation.control.outcome?.status ??
            (annotation.control.delivery === 'unknown' ? 'unknown' : 'waiting')]
  return annotation.reply === null
    ? ({ labelKey: 'annotationOpen', tone: 'info' } as const)
    : ({ labelKey: 'annotationResolved', tone: 'success' } as const)
}
/** Append-only user feedback with one agent resolution. */
export const Annotations = defineComponent((props: {
  locale?: string
  annotations: readonly Annotation[]
  targetTitle?: (target: AnnotationTarget) => VNodeChild
} & PropsLocale<'timeline'>) => {
  const label = useId()
  return () => {
    return (h('section', { 'class': 'timeline-annotations', 'aria-labelledby': label }, [
      h('h3', { 'id': label }, [
        props.t('annotations'),
        ' ',
        h('span', { 'class': 'timeline-muted' }, [
          props.annotations.length,
        ]),
      ]),
      props.annotations.length === 0 ? (h('p', { 'class': 'timeline-muted' }, [
        props.t('emptyAnnotations'),
      ])) : (h('ol', { 'class': 'timeline-annotation-list', 'aria-live': 'polite' }, [
        props.annotations.map(annotation => (h('li', { 'key': annotation.id, 'class': 'timeline-annotation', 'data-resolved': annotation.reply !== null }, [
          props.targetTitle === undefined ? null : (h('p', { 'class': 'timeline-annotation-target' }, [
            props.targetTitle(annotation.target),
          ])),
          h('div', { 'class': 'timeline-annotation-heading' }, [
            h('strong', null, [
              props.t(annotation.control === undefined ? 'annotationUser' : 'controlRequest'),
            ]),
            h('time', { 'datetime': new Date(annotation.createdAt).toISOString() }, [
              new Date(annotation.createdAt).toLocaleString((props.locale ?? 'en')),
            ]),
            h(Tag, { 'tone': annotationStatus(annotation).tone }, { default: () => [
              props.t(annotationStatus(annotation).labelKey),
            ] }),
          ]),
          h(Markdown, { 'text': annotation.text, 't': props.t }),
          annotation.reply === null ? null : (h('div', { 'class': 'timeline-annotation-reply' }, [
            h('div', { 'class': 'timeline-annotation-heading' }, [
              h('strong', null, [
                props.t('annotationAgent'),
              ]),
              h('time', { 'datetime': new Date(annotation.reply.createdAt).toISOString() }, [
                new Date(annotation.reply.createdAt).toLocaleString((props.locale ?? 'en')),
              ]),
            ]),
            h(Markdown, { 'text': annotation.reply.text, 't': props.t }),
          ])),
        ]))),
      ])),
    ]))
  }
}, { name: 'Annotations', inheritAttrs: false, props: ['annotations', 'locale', 'targetTitle', 't'] })
/** One read-only Session history shared by the main pages; collapsed content stays unmounted. */
export const DiscussionHistory = defineComponent((props: {
  view: TimelineView
  locale?: string
  open: boolean
  onToggle: (open: boolean) => void
} & PropsLocale<'timeline'>) => {
  return () => {
    if (props.view.annotations.length === 0)
      return null
    return (h('details', { 'class': 'timeline-discussion-history', 'open': props.open, 'onToggle': (event: Event & {
      currentTarget: HTMLDetailsElement
    }) => {
      if (event.currentTarget.open !== props.open)
        props.onToggle(event.currentTarget.open)
    } }, [
      h('summary', null, [
        props.t('discussionHistory'),
        ' ',
        h('span', { 'class': 'timeline-tab-count' }, [
          props.view.annotations.length,
        ]),
      ]),
      props.open ? (h(Annotations, { 'locale': (props.locale ?? 'en'), 'annotations': props.view.annotations, 'targetTitle': (target) => {
        if (target.kind === 'report') {
          const report = props.view.reports.find(item => item.id === target.report)
          return report === undefined ? (props.t('detailUnavailable')) : (h(Fragment, null, [
            props.t('levelSummary', { level: report.level + 1, period: formatPeriod(savedPeriod(report) ?? report.end - report.start) }),
            ': ',
            new Date(report.start).toLocaleString((props.locale ?? 'en')),
            ' \u2013 ',
            new Date(report.end).toLocaleString((props.locale ?? 'en')),
          ]))
        }
        const tree = props.view.trees.find(item => item.id === target.tree)
        return target.kind === 'tree'
          ? `${props.t('tasks')}: ${tree?.title ?? props.t('detailUnavailable')}`
          : `${tree?.title ?? ''} · ${tree?.tasks.find(item => item.id === target.task)?.title ?? props.t('detailUnavailable')}`
      }, 't': props.t })) : null,
    ]))
  }
}, { name: 'DiscussionHistory', inheritAttrs: false, props: ['view', 'locale', 'open', 'onToggle', 't'] })
/** Edit a discussion draft and retain the same identity across failed saves. */
export const AnnotationEditor = defineComponent((props: {
  target: AnnotationTarget
  save: (request: AnnotationRequest) => Promise<{
    notified: boolean
  }>
} & AnnotationDraftControl & PropsLocale<'timeline'>) => {
  const label = useId()
  const input = shallowRef<HTMLTextAreaElement | null>(null)
  const open = computed(() => props.draft.open)
  const text = computed(() => props.draft.text)
  const id = computed(() => props.draft.id)
  const busy = computed(() => props.draft.busy)
  const messageKey = computed(() => props.draft.messageKey)
  const sending = shallowRef(false)
  onMounted(() => watch(() => [open.value], () => {
    if (open.value)
      input.value?.focus()
  }, { immediate: true, flush: 'post' }))
  const submit = computed(() => async (event: SubmitEvent) => {
    event.preventDefault()
    if (sending.value || busy.value || !text.value.trim())
      return
    sending.value = true
    const identity = id.value ?? newId('note')
    props.update({ id: identity, busy: true, messageKey: null })
    try {
      const result = await props.save({ id: identity, target: props.target, text: text.value.trim() })
      props.update({ ...emptyDraft, messageKey: result.notified ? 'annotationSaved' : 'annotationNotifyFailed' })
    }
    catch {
      props.update({ busy: false, messageKey: 'annotationSaveFailed' })
    }
    finally {
      sending.value = false
    }
  })
  return () => {
    return (h(Fragment, null, [
      open.value ? (h('form', { 'class': 'timeline-annotation-editor', 'onSubmit': (event) => {
        void submit.value(event)
      }, 'aria-busy': busy.value }, [
        h('label', { 'htmlFor': `${label}-input` }, [
          props.t('addAnnotation'),
        ]),
        h('textarea', { 'id': `${label}-input`, 'ref': input, 'value': text.value, 'maxLength': 4000, 'rows': 4, 'placeholder': props.t('annotationPlaceholder'), 'disabled': busy.value, 'onChange': (event: Event & {
          currentTarget: HTMLInputElement
        }) => {
          props.update({ text: event.currentTarget.value, id: null, messageKey: null })
        } }),
        h('div', null, [
          h('span', { 'class': 'timeline-annotation-count' }, [
            text.value.length,
            ' / 4,000',
          ]),
          h(Button, { 'type': 'button', 'disabled': busy.value, 'onClick': () => { props.update(emptyDraft) } }, { default: () => [
            props.t('cancelAnnotation'),
          ] }),
          h(Button, { 'type': 'submit', 'disabled': busy.value || !text.value.trim() }, { default: () => [
            props.t('saveAnnotation'),
          ] }),
        ]),
      ])) : null,
      messageKey.value === null ? null : (h('p', { 'class': messageKey.value === 'annotationSaveFailed' ? 'timeline-error' : 'timeline-muted', 'role': messageKey.value === 'annotationSaveFailed' ? 'alert' : 'status' }, [
        props.t(messageKey.value),
      ])),
    ]))
  }
}, { name: 'AnnotationEditor', inheritAttrs: false, props: ['target', 'draft', 'update', 'save', 't'] })
