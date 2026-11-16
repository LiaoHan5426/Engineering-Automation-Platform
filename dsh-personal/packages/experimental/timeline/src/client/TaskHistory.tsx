import { defineComponent, h, shallowRef } from 'vue';
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { ProgressPrecision } from '../policy.ts';
import type { Task } from '../records.ts';
import { formatProgress, formatWeight } from './Progress.tsx';
import { statusTones } from './status.ts';
import { Markdown } from './Markdown.tsx';
/** Read-only revisions stay folded and unmounted until the user opens them. */
export const TaskHistory = defineComponent((props: {
    task: Task;
    locale?: string;
    decimals: ProgressPrecision;
} & PropsLocale<'timeline'>) => {
    const open = shallowRef(false);
    return () => {
        return (h("details", { "class": "timeline-task-history", "open": open.value, "onToggle": (event: Event & {
                currentTarget: HTMLDetailsElement;
            }) => { open.value = event.currentTarget.open; } }, [
            h("summary", null, [
                props.t('taskHistory'),
                " ",
                h("span", { "class": "timeline-tab-count" }, [
                    props.task.history.length
                ])
            ]),
            !open.value ? null : props.task.history.length === 0 ? (h("p", { "class": "timeline-muted" }, [
                props.t('emptyTaskHistory')
            ])) : (h("ol", { "class": "timeline-annotation-list" }, [
                props.task.history.toReversed().map((revision, index) => (h("li", { "key": props.task.history.length - index, "class": "timeline-annotation" }, [
                    h("div", { "class": "timeline-annotation-heading" }, [
                        h("time", { "datetime": new Date(revision.at).toISOString() }, [
                            new Date(revision.at).toLocaleString((props.locale ?? 'en'))
                        ]),
                        h(Tag, { "tone": statusTones[revision.status] }, { default: () => [
                                props.t(revision.status)
                            ] })
                    ]),
                    revision.title === props.task.title ? null : h("p", null, [
                        revision.title
                    ]),
                    h("dl", { "class": "timeline-task-metrics" }, [
                        h("div", null, [
                            h("dt", null, [
                                props.t('progress')
                            ]),
                            h("dd", null, [
                                revision.previousProgress === null ||
                                    formatProgress(revision.previousProgress, props.decimals) === formatProgress(revision.progress, props.decimals)
                                    ? ''
                                    : `${formatProgress(revision.previousProgress, props.decimals)}% → `,
                                formatProgress(revision.progress, props.decimals),
                                "%"
                            ])
                        ]),
                        h("div", null, [
                            h("dt", null, [
                                props.t('durationWeight')
                            ]),
                            h("dd", null, [
                                formatWeight(revision.weight)
                            ])
                        ])
                    ]),
                    revision.description ? h(Markdown, { "text": revision.description, "t": props.t }) : null,
                    revision.note ? h(Markdown, { "text": revision.note, "t": props.t }) : null,
                    revision.details ? h(Markdown, { "text": revision.details, "t": props.t }) : null
                ])))
            ]))
        ]));
    };
}, { name: "TaskHistory", inheritAttrs: false, props: ["task", "decimals", "locale", "t"] });
