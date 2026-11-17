import { computed, defineComponent, Fragment, h } from 'vue'
import { Button, IconListPenOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { IntervalReport, TimelineView } from '../records.ts'
import { formatDuration, formatPeriod, savedPeriod } from '../periods.ts'
import { DetailHeader } from './DetailHeader.tsx'
import { AnnotationEditor, Annotations, useAnnotationDraft } from './Annotations.tsx'
import type { AnnotationDraftControl } from './store.ts'
import type { AnnotationRequest } from './actions.ts'
interface ReportDetailsProps extends PropsLocale<'timeline'> {
  view: TimelineView
  locale?: string
  reportId: IntervalReport['id'] | null
  openReport: (id: IntervalReport['id']) => void
  back: () => void
  annotate: (request: AnnotationRequest) => Promise<{
    notified: boolean
  }>
  annotationDraft?: AnnotationDraftControl | undefined
}
/** Short report content, with actual duration and links to the included reports. */
export const ReportDetails = defineComponent((props: ReportDetailsProps) => {
  const draft = useAnnotationDraft(() => props.annotationDraft)
  const noteOpen = computed(() => draft.value.draft.open)
  const report = computed(() => props.view.reports.find(item => item.id === props.reportId))
  const period = computed(() => {
    const reportSnapshot = report.value
    return reportSnapshot === undefined ? undefined : savedPeriod(reportSnapshot)
  })
  return () => {
    const reportSnapshot = report.value
    return (h('section', { 'class': 'timeline-details timeline-summary timeline-detail-layout', 'data-level': reportSnapshot?.level, 'aria-label': props.t('details') }, [
      reportSnapshot === undefined ? (h(Fragment, null, [
        h(DetailHeader, { 'title': props.t('details'), 'back': props.back, 't': props.t }),
        h('p', { 'class': 'timeline-muted' }, [
          props.t('selectReport'),
        ]),
      ])) : (h(Fragment, null, [
        h(DetailHeader, { 'title': `${props.t('rollup')} · ${props.t('level')} ${reportSnapshot.level + 1}`, 'back': props.back, 't': props.t }, { default: () => [
          h('span', { 'class': 'timeline-muted' }, [
            formatDuration(reportSnapshot.end - reportSnapshot.start),
          ]),
        ] }),
        h('div', { 'class': 'timeline-detail-scroll' }, [
          h('p', { 'class': 'timeline-muted' }, [
            h('time', { 'datetime': new Date(reportSnapshot.start).toISOString() }, [
              new Date(reportSnapshot.start).toLocaleString((props.locale ?? 'en')),
            ]),
            ' ',
            '\u2013',
            ' ',
            h('time', { 'datetime': new Date(reportSnapshot.end).toISOString() }, [
              new Date(reportSnapshot.end).toLocaleString((props.locale ?? 'en')),
            ]),
          ]),
          h('p', { 'class': 'timeline-report-meta' }, [
            reportSnapshot.toolCount,
            ' ',
            props.t('toolCalls'),
            period.value === undefined ? null : ` · ${props.t('savedPeriod')}: ${formatPeriod(period.value)}`,
            reportSnapshot.workMs === undefined || reportSnapshot.workMs === period.value
              ? null
              : ` · ${props.t('coveredWork')}: ${formatDuration(reportSnapshot.workMs)}`,
          ]),
          (['progress', 'uncertainties', 'userActions'] as const).map(key => reportSnapshot.summary[key].length === 0 ? null : (h('section', { 'key': key, 'data-section': key }, [
            h('h4', null, [
              props.t(key === 'progress' ? 'reportProgress' : key),
            ]),
            h('ul', null, [
              reportSnapshot.summary[key].map(line => (h('li', { 'key': line }, [
                line,
              ]))),
            ]),
          ]))),
          reportSnapshot.children.length === 0 ? null : (h('details', null, [
            h('summary', null, [
              props.t('children'),
              ' \u00B7 ',
              reportSnapshot.children.length,
            ]),
            reportSnapshot.children.map((id) => {
              const child = props.view.reports.find(item => item.id === id)
              return child === undefined ? null : (h('button', { 'class': 'timeline-report-link', 'data-report-id': id, 'key': id, 'data-level': child.level, 'onClick': () => { props.openReport(id) } }, [
                h('span', { 'class': 'timeline-level-dot' }),
                child.summary.progress[0],
              ]))
            }),
          ])),
          h(Annotations, { 'locale': (props.locale ?? 'en'), 'annotations': props.view.annotations.filter(annotation => annotation.target.kind === 'report' && annotation.target.report === reportSnapshot.id), 't': props.t }),
        ]),
        h('footer', { 'class': 'timeline-detail-actions' }, [
          h(AnnotationEditor, { draft: draft.value.draft, update: draft.value.update,
            'target': { kind: 'report', report: reportSnapshot.id }, 'save': props.annotate, 't': props.t }),
          h(Button, { 'className': 'timeline-task-action timeline-report-note', 'aria-pressed': noteOpen.value, 'aria-expanded': noteOpen.value, 'onClick': () => { draft.value.update({ open: !noteOpen.value }) } }, { default: () => [
            h(IconListPenOutlineRegular, { 'size': 18 }),
            h('span', null, [
              props.t('addAnnotation'),
            ]),
          ] }),
        ]),
      ])),
    ]))
  }
}, { name: 'ReportDetails', inheritAttrs: false, props: ['view', 'locale', 'reportId', 'openReport', 'back', 'annotate', 'annotationDraft', 't'] })
