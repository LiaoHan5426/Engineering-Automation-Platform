import { defineComponent, h, ref } from 'vue';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { TeamTaskView, TeamTaskId } from '@deepseek-ai/dsh-agent-team/client';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import { IconChecklistOutlineRegular, IconChevronDownOutlineRegular, StateDot, Tooltip, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-subagent/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import { NS, type TeamKey } from './locales.ts';
import css from './TeamBoard.module.css';
/** Full props of the task board below the shared subagent catalog. */
export type TeamBoardProps = PropsRuntime<'conversation.session.header.actions.subagent.footer'> & PropsLocale<typeof NS>;
type VisibleTask = TeamTaskView & {
    status: Exclude<TeamTaskView['status'], 'deleted'>;
};
const statusKeys = {
    pending: 'status.pending', in_progress: 'status.in_progress', completed: 'status.completed',
} satisfies Record<VisibleTask['status'], TeamKey>;
const dotStates = {
    pending: 'idle', in_progress: 'ongoing', completed: 'done',
} satisfies Record<VisibleTask['status'], StateDotState>;
function progressLabel(tasks: readonly VisibleTask[], t: TeamBoardProps['t']): string {
    const completed = tasks.filter(task => task.status === 'completed').length;
    const active = tasks.filter(task => task.status === 'in_progress').length;
    const pending = tasks.length - completed - active;
    return [
        ...completed > 0 ? [t('progress.completed', { count: completed })] : [],
        ...active > 0 ? [t('progress.active', { count: active })] : [],
        ...pending > 0 ? [t('progress.pending', { count: pending })] : [],
    ].join('\u2002·\u2002');
}
const TaskRow = defineComponent((props: Pick<TeamBoardProps, 't'> & {
    task: VisibleTask;
    rootId: SessionId;
    expanded: boolean;
    onToggle: () => void;
}) => {
    return () => {
        const { task, rootId, expanded, onToggle, t } = props;
        const owner = task.ownerName ?? task.ownerId ?? t('unowned');
        const blocked = task.status === 'pending' && !task.ready;
        const detailsId = `team-task-${rootId}-${task.id}`;
        return (h("li", { "class": css.task, "data-team-task": task.id, "data-status": task.status, "data-expanded": expanded }, [
            h(Tooltip, { "label": task.subject, "onlyWhenClipped": true, "disabled": expanded, "delayMs": 500, "portal": true, "side": "top" }, { default: () => [
                    h("button", { "type": "button", "class": css.taskRow, "aria-expanded": expanded, "aria-controls": detailsId, "onClick": onToggle }, [
                        h("span", { "class": css.glyph, "role": "img", "aria-label": blocked ? t('blocked') : t(statusKeys[task.status]) }, [
                            h(StateDot, { "state": blocked ? 'warning' : dotStates[task.status] })
                        ]),
                        h("span", { "class": css.subject }, [
                            task.subject
                        ]),
                        h("span", { "class": css.chevron, "aria-hidden": true }, [
                            h(IconChevronDownOutlineRegular, { "size": 14 })
                        ])
                    ])
                ] }),
            expanded && (h("div", { "class": css.details, "id": detailsId, "data-team-task-details": true }, [
                task.description && h("p", { "class": css.description }, [
                    task.description
                ]),
                h("p", { "class": css.owner, "data-team-task-owner": true }, [
                    h("span", { "class": css.ownerLabel }, [
                        t('owner'),
                        ": "
                    ]),
                    h(Tooltip, { "label": owner, "onlyWhenClipped": true, "delayMs": 500, "portal": true, "side": "top" }, { default: () => [
                            h("span", { "class": css.ownerValue }, [
                                owner
                            ])
                        ] })
                ])
            ]))
        ]));
    };
}, { name: "TaskRow", inheritAttrs: false, props: ["task", "rootId", "expanded", "onToggle", "t"] });
/** Render read-only tasks in source order; the enclosing subagent menu owns scrolling. */
export const TeamBoard = defineComponent((props: TeamBoardProps) => {
    const team = props.useProjection('agentTeam');
    const hasMembers = props.useSessions(state => (state.projectionsBySession[props.sessionId]?.values.subagentCatalog?.length ?? 0) > 0);
    const expandedTaskId = ref<TeamTaskId | null>(null);
    return () => {
        const { sessionId, t } = props;
        if (!team.value?.enabled)
            return null;
        const tasks = team.value.tasks.filter((task): task is VisibleTask => task.status !== 'deleted');
        const failure = team.value.failure === undefined ? null : (h("div", { "class": css.error, "role": "alert" }, [
            h(StateDot, { "state": "error" }),
            t('failure', { message: team.value.failure })
        ]));
        if (tasks.length === 0)
            return failure === null ? null : h("div", { "class": css.board }, [
                failure
            ]);
        return (h("section", { "class": css.board, "data-with-members": hasMembers.value, "aria-label": t('trigger'), "data-team-panel": true }, [
            h("h3", { "class": css.header }, [
                h("span", { "class": css.lead, "aria-hidden": true }, [
                    h(IconChecklistOutlineRegular, { "size": 14 })
                ]),
                h("span", { "class": css.title }, [
                    t('tasks')
                ]),
                h("span", { "class": css.progress }, [
                    progressLabel(tasks, t)
                ])
            ]),
            failure,
            h("ul", { "class": css.tasks }, [
                tasks.map(task => (h(TaskRow, { "key": task.id, "task": task, "rootId": sessionId, "expanded": expandedTaskId.value === task.id, "onToggle": () => { expandedTaskId.value = (current => current === task.id ? null : task.id)(expandedTaskId.value); }, "t": t })))
            ])
        ]));
    };
}, { name: "TeamBoard", inheritAttrs: false, props: ["sessionId", "useProjection", "useSessions", "t"] });
