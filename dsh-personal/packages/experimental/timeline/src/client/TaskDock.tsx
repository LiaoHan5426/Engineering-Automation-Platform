import { computed, defineComponent, h, shallowRef } from 'vue';
import { Button, IconCloseOutlineRegular, IconRightUpOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { ObservableSnapshot, PropsStore } from '@deepseek-ai/dsh-client-store';
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '@deepseek-ai/dsh-client-ui-session/client';
import type { Config } from '../config.ts';
import type { Tree } from '../records.ts';
import { measureAll } from '../tasks.ts';
import { Progress, formatProgress } from './Progress.tsx';
import type { createViewStore } from './store.ts';
import type { TreeTransferActions } from './TreeTransfer.tsx';
export interface TaskDockInjected extends Pick<TreeTransferActions, 'removeTree'> {
    hooks: {
        settings: ObservableSnapshot<ConfigFormSnapshot<Config>>;
    };
    toggleSidebar: (showingTree: boolean) => void;
}
type TaskDockProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'timeline'> & PropsStore<ReturnType<typeof createViewStore>> & InjectFace<TaskDockInjected>;
/** Keep the active plan visible beside the composer using the sidebar's shared view. */
export const TaskDock = defineComponent((props: Pick<TaskDockProps, 'sessionId' | 'useProjection' | 'useStore' | 'actions' | 'useSettings' | 'useSession' | 'toggleSidebar' | 'removeTree' | 't'>) => {
    const view = props.useProjection('timeline');
    const tree = computed(() => {
        const viewSnapshot = view.value;
        return viewSnapshot?.trees.find(item => item.id === viewSnapshot.activeTreeId);
    });
    const state = props.useStore(value => value);
    const settings = props.useSettings(value => value.value);
    const decimals = computed(() => settings.value?.progressDecimals ?? 2);
    const segmented = computed(() => settings.value?.segmentedProgress ?? true);
    const overall = computed(() => {
        const treeSnapshot = tree.value;
        return measureAll(treeSnapshot?.tasks ?? [], segmented.value).get(null);
    });
    const draft = props.useSession(value => value.blank &&
        !value.running &&
        !value.awaitingFirstTurn &&
        value.pendingSubmissions.length === 0);
    const removing = shallowRef(false);
    const failed = shallowRef<{
        sessionId: TaskDockProps['sessionId'];
        tree: Tree['id'];
    }>();
    const removeFailed = computed(() => {
        const treeSnapshot = tree.value;
        return failed.value?.sessionId === props.sessionId && failed.value.tree === treeSnapshot?.id;
    });
    const showingTree = computed(() => {
        const treeSnapshot = tree.value;
        const viewSnapshot = view.value;
        return treeSnapshot !== undefined &&
            (state.value.tree ?? viewSnapshot?.activeTreeId) === treeSnapshot.id &&
            state.value.tab === 'tasks' &&
            state.value.details.tasks.length === 0;
    });
    const toggle = computed(() => (tree: Tree) => {
        props.actions.update({
            tree: tree.id,
            tab: 'tasks',
            details: { ...state.value.details, tasks: [] },
        });
        props.toggleSidebar(showingTree.value);
    });
    const progress = computed(() => overall.value?.progress ?? 0);
    return () => {
        const viewSnapshot = view.value;
        const treeSnapshot = tree.value;
        if (viewSnapshot === undefined || treeSnapshot === undefined)
            return null;
        return (h("section", { "class": "timeline-dock", "aria-label": props.t('tasks'), "data-current-tree": showingTree.value }, [
            h("div", { "class": "timeline-dock-bar", "data-status": overall.value?.status ?? 'pending' }, [
                h(Tooltip, { "label": treeSnapshot.title, "side": "top", "portal": true, "delayMs": 500 }, { default: () => [
                        h("span", { "class": "timeline-dock-title" }, [
                            treeSnapshot.title
                        ])
                    ] }),
                h(Progress, { "value": progress.value, "status": overall.value?.status ?? 'pending', "label": props.t('progress'), "decimals": decimals.value, "parts": overall.value?.parts, "t": props.t }),
                h("span", { "class": "timeline-dock-percent" }, [
                    formatProgress(progress.value, decimals.value),
                    "%"
                ]),
                h(Tooltip, { "label": props.t('tasks'), "side": "top", "align": "end", "portal": true, "delayMs": 500 }, { default: () => [
                        h(Button, { "size": "sm", "className": "timeline-dock-action", "onClick": () => { toggle.value(treeSnapshot); } }, { default: () => [
                                h("span", { "class": "timeline-dock-label timeline-dock-open" }, [
                                    props.t('openTaskTree')
                                ]),
                                h("span", { "class": "timeline-dock-label timeline-dock-close" }, [
                                    props.t('closeTaskTree')
                                ]),
                                h(IconRightUpOutlineRegular, { "size": 16 })
                            ] })
                    ] }),
                draft.value ? (h(Tooltip, { "label": props.t(removeFailed.value ? 'draftRemoveFailed' : 'removeDraftTree'), "side": "top", "portal": true }, { default: () => [
                        h(Button, { "size": "sm", "className": "timeline-dock-action", "aria-label": props.t(removeFailed.value ? 'draftRemoveFailed' : 'removeDraftTree'), "disabled": removing.value, "onClick": () => {
                                removing.value = true;
                                failed.value = undefined;
                                void props.removeTree(treeSnapshot.id)
                                    .then(() => { props.actions.forgetTree(treeSnapshot.id); })
                                    .catch(() => { failed.value = { sessionId: props.sessionId, tree: treeSnapshot.id }; })
                                    .finally(() => { removing.value = false; });
                            } }, { default: () => [
                                h(IconCloseOutlineRegular, { "size": 16 })
                            ] })
                    ] })) : null
            ])
        ]));
    };
}, { name: "TaskDock", inheritAttrs: false, props: ["sessionId", "useProjection", "useStore", "actions", "useSettings", "useSession", "toggleSidebar", "removeTree", "t"] });
