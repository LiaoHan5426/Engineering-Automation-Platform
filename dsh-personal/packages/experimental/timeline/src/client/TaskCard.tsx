import { computed, defineComponent, Fragment, h, useId } from 'vue';
import { Button, DisclosureRow, IconCheckOutlineRegular, IconChevronRightOutlineRegular, IconClockOutlineRegular, IconRightUpOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client';
import { z } from 'zod';
import type { Config } from '../config.ts';
import { taskReceiptSchema } from '../records.ts';
import type { Task, Tree } from '../records.ts';
import { MINUTE_MS } from '../policy.ts';
import { formatProgress } from './Progress.tsx';
import { TimelineIcon } from './TimelineIcon.tsx';
export interface TaskCardInjected {
    hooks: {
        locale: ObservableSnapshot<{
            active: string;
        }>;
        settings: ObservableSnapshot<ConfigFormSnapshot<Config>>;
    };
    openTask: (tree: Tree['id'], task?: Task['id']) => void;
}
type PickEach<T, K extends keyof T> = T extends T ? Pick<T, K> : never;
type TaskCardProps = ToolCallViewProps & PropsLocale<'timeline'> & InjectFace<TaskCardInjected>;
const metadataSchema = z.object({ timeline: taskReceiptSchema.nullable() });
/** Render a fixed saved receipt; pending, rejected and older calls keep their ordinary tool details. */
export const TaskCard = defineComponent((props: PickEach<TaskCardProps, 'phase' | 'block' | 'useDisclosure' | 'useSettings' | 'useLocale' | 'openTask' | 'inspect' | 't'>) => {
    const disclosure = props.useDisclosure();
    const descriptionId = useId();
    const locale = props.useLocale(value => value.active);
    const decimals = props.useSettings(value => value.value?.progressDecimals ?? 2);
    const receipt = computed(() => {
        if (props.phase !== 'result' || props.block.isError)
            return null;
        return metadataSchema.safeParse(props.block.meta).data?.timeline ?? null;
    });
    const failed = computed(() => props.phase === 'result' && props.block.isError);
    const pending = computed(() => props.phase !== 'result');
    const text = computed(() => props.phase === 'result'
        ? props.block.content
            .filter(item => item.type === 'text')
            .map(item => item.text)
            .join('\n')
        : '');
    const gap = computed(() => {
        const receiptSnapshot = receipt.value;
        return receiptSnapshot?.previousAt == null ? null : receiptSnapshot.at - receiptSnapshot.previousAt;
    });
    const minutes = computed(() => gap.value === null ? 0 : Math.floor(gap.value / MINUTE_MS));
    const hours = computed(() => Math.floor(minutes.value / 60));
    const duration = computed(() => minutes.value < 1
        ? `< 1 ${props.t('minutes')}`
        : [hours.value > 0 ? `${hours.value} ${props.t('hours')}` : '', minutes.value % 60 > 0 ? `${minutes.value % 60} ${props.t('minutes')}` : '']
            .filter(Boolean)
            .join(' '));
    const gapLabel = computed(() => props.t('taskUpdateGap', { duration: duration.value }));
    const percent = computed(() => (value: number) => `${formatProgress(value, decimals.value)}%`);
    const change = computed(() => (before: number, after: number) => percent.value(before) === percent.value(after) ? percent.value(after) : `${percent.value(before)} → ${percent.value(after)}`);
    return () => {
        const receiptSnapshot = receipt.value;
        return (h(DisclosureRow, { "className": "timeline-tool-update", "icon": h(TimelineIcon, { "size": 14 }), "title": props.t(failed.value ? 'taskUpdateFailed' : props.phase === 'start' ? 'taskUpdatePending' : 'taskUpdate'), "open": disclosure.value.expanded, "expandable": !pending.value, "onToggle": () => disclosure.value.toggle(), "running": pending.value, "expandOnRowClick": true, "collapsedContent": receiptSnapshot === null ? null : (h("span", { "class": "timeline-tool-summary" }, [
                h("span", null, [
                    receiptSnapshot.title
                ]),
                h("span", null, [
                    change.value(receiptSnapshot.before, receiptSnapshot.after)
                ])
            ])), "headerAccessory": receiptSnapshot === null ? null : (h(Button, { "size": "sm", "className": "timeline-card-open", "aria-label": props.t('openTaskTree'), "title": props.t('openTaskTree'), "onClick": () => { props.openTask(receiptSnapshot.tree); } }, { default: () => [
                    h(IconRightUpOutlineRegular, { "size": 14 })
                ] })) }, { default: () => [
                receiptSnapshot === null ? (h("pre", { "class": failed.value ? 'timeline-card-failure' : 'timeline-card-raw' }, [
                    text.value
                ])) : (h("section", { "class": "timeline-task-card", "aria-label": receiptSnapshot.title, "data-increased": receiptSnapshot.after > receiptSnapshot.before }, [
                    h("header", { "class": "timeline-card-heading" }, [
                        h("strong", { "title": receiptSnapshot.title }, [
                            h(TimelineIcon, { "size": 14 }),
                            h("span", null, [
                                receiptSnapshot.title
                            ])
                        ]),
                        h("div", { "class": "timeline-card-progress", "aria-label": `${props.t('progress')}: ${change.value(receiptSnapshot.before, receiptSnapshot.after)}` }, [
                            percent.value(receiptSnapshot.before) === percent.value(receiptSnapshot.after) ? null : (h(Fragment, null, [
                                h("strong", null, [
                                    formatProgress(receiptSnapshot.before, decimals.value),
                                    h("span", null, [
                                        "%"
                                    ])
                                ]),
                                h(IconChevronRightOutlineRegular, { "size": 12 })
                            ])),
                            h("strong", null, [
                                formatProgress(receiptSnapshot.after, decimals.value),
                                h("span", null, [
                                    "%"
                                ])
                            ])
                        ])
                    ]),
                    h("div", { "class": "timeline-card-meta" }, [
                        h("span", null, [
                            receiptSnapshot.branch
                        ]),
                        h("span", { "title": new Date(receiptSnapshot.at).toLocaleString(locale.value) }, [
                            h("time", { "datetime": new Date(receiptSnapshot.at).toISOString() }, [
                                new Date(receiptSnapshot.at).toLocaleTimeString(locale.value, {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: false,
                                })
                            ]),
                            gap.value !== null && gap.value >= 0 ? h(Fragment, null, [
                                " \u00B7 ",
                                gapLabel.value
                            ]) : null
                        ])
                    ]),
                    h("ul", { "class": "timeline-card-tasks" }, [
                        receiptSnapshot.tasks.map((task, index) => (h("li", { "key": task.id }, [
                            h(Tooltip, { "label": `${task.title}\n${props.t(task.status)}${task.note ? ` · ${task.note}` : ''}`, "side": "top", "portal": true, "delayMs": 500 }, { default: () => [
                                    h("button", { "type": "button", "class": "timeline-card-task", "data-status": task.status, "aria-label": `${task.title} · ${props.t(task.status)} · ${change.value(task.before, task.after)}`, "aria-describedby": task.note ? `${descriptionId}-${index}` : undefined, "onClick": () => { props.openTask(receiptSnapshot.tree, task.id); } }, [
                                        h("span", { "class": "timeline-card-status", "aria-hidden": "true" }, [
                                            task.status === 'done' ? (h(IconCheckOutlineRegular, { "size": 14 })) : task.status === 'active' ? (h(IconClockOutlineRegular, { "size": 14 })) : (h("span", { "class": "timeline-status-dot" }))
                                        ]),
                                        h("span", { "class": "timeline-card-task-copy" }, [
                                            h("span", null, [
                                                task.title
                                            ]),
                                            h("span", { "id": `${descriptionId}-${index}` }, [
                                                task.note
                                            ])
                                        ]),
                                        ['blocked', 'paused', 'retired'].includes(task.status) ? (h("span", { "class": "timeline-card-state" }, [
                                            props.t(task.status)
                                        ])) : null,
                                        h("span", { "class": "timeline-card-task-progress" }, [
                                            percent.value(task.before) === percent.value(task.after) ? null : (h(Fragment, null, [
                                                h("span", null, [
                                                    percent.value(task.before)
                                                ]),
                                                h(IconChevronRightOutlineRegular, { "size": 10 })
                                            ])),
                                            h("span", null, [
                                                percent.value(task.after)
                                            ])
                                        ])
                                    ])
                                ] })
                        ])))
                    ]),
                    receiptSnapshot.total > receiptSnapshot.tasks.length ? (h("button", { "type": "button", "class": "timeline-card-more", "onClick": () => { props.openTask(receiptSnapshot.tree); } }, [
                        props.t('taskUpdateMore', { count: receiptSnapshot.total - receiptSnapshot.tasks.length }),
                        h(IconRightUpOutlineRegular, { "size": 14 })
                    ])) : null
                ])),
                receiptSnapshot !== null || props.inspect === undefined ? null : (h(Button, { "size": "sm", "className": "timeline-card-inspect", "onClick": props.inspect }, { default: () => [
                        props.t('details')
                    ] }))
            ] }));
    };
}, { name: "TaskCard", inheritAttrs: false, props: ["phase", "block", "useDisclosure", "useSettings", "useLocale", "openTask", "inspect", "t"] });
