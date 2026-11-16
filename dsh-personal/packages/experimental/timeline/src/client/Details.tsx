import { computed, defineComponent, Fragment, h } from 'vue';
import { Button, IconQuestionOutlineRegular, Tag, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { ProgressPrecision } from '../policy.ts';
import type { TimelineView } from '../records.ts';
import { measureAll } from '../tasks.ts';
import type { DetailTarget } from './navigation.ts';
import { ReportDetails } from './ReportDetails.tsx';
import { statusTones } from './status.ts';
import { formatProgress, formatWeight } from './Progress.tsx';
import { DetailHeader } from './DetailHeader.tsx';
import { TaskActions } from './TaskActions.tsx';
import { TaskHistory } from './TaskHistory.tsx';
import { Markdown } from './Markdown.tsx';
import type { PlaybackState } from './TaskActions.tsx';
import { AnnotationEditor, Annotations, useAnnotationDraft } from './Annotations.tsx';
import type { AnnotationDraftControl } from './store.ts';
import type { AnnotationRequest, PriorityRequest, TaskRequest } from './actions.ts';
type TaskDetailsProps = {
    view: TimelineView;
    locale?: string;
    target: Extract<DetailTarget, {
        kind: 'task';
    }>;
    decimals: ProgressPrecision;
    back: () => void;
    requestTask: (request: TaskRequest) => Promise<void>;
    playback: PlaybackState;
    setPriority: (request: PriorityRequest) => Promise<void>;
    annotate: (request: AnnotationRequest) => Promise<{
        notified: boolean;
    }>;
    annotationDraft?: AnnotationDraftControl | undefined;
} & PropsLocale<'timeline'>;
/** The active Task Tree or Timeline tab owns this detail page and its return history. */
export const Details = defineComponent((props: Omit<TaskDetailsProps, 'target'> & {
    target: DetailTarget;
    open: (target: DetailTarget) => void;
}) => {
    return () => {
        return (h("div", { "class": "timeline-detail-page" }, [
            props.target.kind === 'report' ? (h(ReportDetails, { "locale": (props.locale ?? 'en'), "key": props.target.report, "view": props.view, "reportId": props.target.report, "openReport": (report) => { props.open({ kind: 'report', report }); }, "t": props.t, "back": props.back, "annotate": props.annotate, "annotationDraft": props.annotationDraft })) : (h(TaskDetails, { "locale": (props.locale ?? 'en'), "key": `${props.target.tree}:${props.target.task}`, "view": props.view, "target": props.target, "decimals": props.decimals, "back": props.back, "requestTask": props.requestTask, "playback": props.playback, "setPriority": props.setPriority, "annotate": props.annotate, "annotationDraft": props.annotationDraft, "t": props.t }))
        ]));
    };
}, { name: "Details", inheritAttrs: false, props: ["view", "locale", "target", "decimals", "back", "open", "requestTask", "playback", "setPriority", "annotate", "annotationDraft", "t"] });
const TaskDetails = defineComponent((props: TaskDetailsProps) => {
    const draft = useAnnotationDraft(() => props.annotationDraft);
    const noteOpen = computed(() => draft.value.draft.open);
    const tree = computed(() => props.view.trees.find(tree => tree.id === props.target.tree));
    const task = computed(() => {
        const treeSnapshot = tree.value;
        return treeSnapshot?.tasks.find(task => task.id === props.target.task);
    });
    const measure = computed(() => {
        const treeSnapshot = tree.value;
        const taskSnapshot = task.value;
        return treeSnapshot === undefined || taskSnapshot === undefined ? undefined : measureAll(treeSnapshot.tasks).get(taskSnapshot.id);
    });
    const group = computed(() => {
        const treeSnapshot = tree.value;
        const taskSnapshot = task.value;
        return treeSnapshot !== undefined && taskSnapshot !== undefined && treeSnapshot.tasks.some(child => child.parent === taskSnapshot.id && child.status !== 'retired');
    });
    return () => {
        const treeSnapshot = tree.value;
        const taskSnapshot = task.value;
        if (treeSnapshot === undefined || taskSnapshot === undefined)
            return (h(Fragment, null, [
                h(DetailHeader, { "title": props.t('details'), "back": props.back, "t": props.t }),
                h("p", { "role": "status" }, [
                    props.t('detailUnavailable')
                ])
            ]));
        return (h("article", { "class": "timeline-detail-layout", "aria-label": props.t('details') }, [
            h(DetailHeader, { "title": taskSnapshot.title, "back": props.back, "t": props.t }, { default: () => [
                    h(Tag, { "tone": statusTones[measure.value?.status ?? taskSnapshot.status] }, { default: () => [
                            props.t(measure.value?.status ?? taskSnapshot.status)
                        ] })
                ] }),
            h("div", { "class": "timeline-detail-scroll" }, [
                h("p", { "class": "timeline-eyebrow" }, [
                    treeSnapshot.title
                ]),
                taskSnapshot.description ? h(Markdown, { "text": taskSnapshot.description, "t": props.t }) : null,
                taskSnapshot.note ? h(Markdown, { "text": taskSnapshot.note, "t": props.t }) : null,
                h("dl", { "class": "timeline-task-metrics" }, [
                    h("div", null, [
                        h("dt", null, [
                            props.t('progress')
                        ]),
                        h("dd", null, [
                            formatProgress(measure.value?.progress ?? 0, props.decimals),
                            "%"
                        ])
                    ]),
                    h("div", null, [
                        h("dt", null, [
                            props.t('durationWeight'),
                            h(Tooltip, { "label": props.t('weightHint'), "side": "top", "maxWidth": 320, "portal": true, "openOnClick": true }, { default: () => [
                                    h(Button, { "className": "timeline-icon-button timeline-estimate-help", "aria-label": props.t('weightHint') }, { default: () => [
                                            h(IconQuestionOutlineRegular, { "size": 14 })
                                        ] })
                                ] })
                        ]),
                        h("dd", null, [
                            formatWeight(taskSnapshot.timeShare)
                        ])
                    ]),
                    group.value ? null : (h("div", null, [
                        h("dt", null, [
                            props.t('completedUnits')
                        ]),
                        h("dd", null, [
                            taskSnapshot.done[0],
                            " / ",
                            taskSnapshot.done[1]
                        ])
                    ]))
                ]),
                taskSnapshot.details ? h(Markdown, { "text": taskSnapshot.details, "t": props.t }) : null,
                h(Annotations, { "locale": (props.locale ?? 'en'), "annotations": props.view.annotations.filter(annotation => annotation.target.kind === 'task' &&
                        annotation.target.tree === treeSnapshot.id &&
                        annotation.target.task === taskSnapshot.id), "t": props.t }),
                h(TaskHistory, { "locale": (props.locale ?? 'en'), "task": taskSnapshot, "decimals": props.decimals, "t": props.t })
            ]),
            h("footer", { "class": "timeline-detail-actions" }, [
                h(AnnotationEditor, { draft: draft.value.draft, update: draft.value.update,
                    "target": { kind: 'task', tree: treeSnapshot.id, task: taskSnapshot.id }, "save": props.annotate, "t": props.t }),
                h(TaskActions, { "playback": props.playback, "key": `${treeSnapshot.id}:${taskSnapshot.id}`, "tree": treeSnapshot, "task": taskSnapshot, "status": measure.value?.status ?? taskSnapshot.status, "request": props.requestTask, "setPriority": priority => props.setPriority({ tree: treeSnapshot.id, task: taskSnapshot.id, priority }), "annotationOpen": noteOpen.value, "annotate": () => { draft.value.update({ open: !noteOpen.value }); }, "t": props.t })
            ])
        ]));
    };
}, { name: "TaskDetails", inheritAttrs: false, props: ["view", "locale", "target", "decimals", "back", "requestTask", "playback", "setPriority", "annotate", "annotationDraft", "t"] });
