import { onMounted, computed, defineComponent, Fragment, h, watch, shallowRef } from 'vue';
import { randomUUID } from '@deepseek-ai/dsh-util-crypto';
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { Checkpoint, CHECKPOINT_BYTES } from '../checkpoint.ts';
import type { Tree, TimelineView } from '../records.ts';
import type { ImportRequest } from './actions.ts';
import type { UserEditResult } from '../protocol.ts';
import { measureAll } from '../tasks.ts';
import { formatProgress } from './Progress.tsx';
import type { ProgressPrecision } from '../policy.ts';
export interface TreeTransferActions {
    importTree: (request: ImportRequest) => Promise<Extract<UserEditResult, {
        action: 'import';
    }>>;
    removeTree: (tree: Tree['id']) => Promise<Extract<UserEditResult, {
        action: 'remove';
    }>>;
}
/** Download the acknowledged plan; no model request or host filesystem write is needed. */
export function exportTree(tree: Tree, annotations: TimelineView['annotations'], sessionId: string): void {
    const text = Checkpoint.fromTree(tree, annotations, Date.now(), sessionId, process.env.DSH_CLIENT_VERSION).toString();
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${tree.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 80)}.timeline.json`;
        anchor.click();
    }
    finally {
        URL.revokeObjectURL(url);
    }
}
/** Review a local checkpoint or confirm deletion through the same user-owned storage path. */
export const TreeTransfer = defineComponent((props: {
    mode: 'import' | 'remove' | null;
    sessionId: string;
    tree: Tree | undefined;
    view: TimelineView;
    running: boolean;
    decimals: ProgressPrecision;
    close: () => void;
    imported: (tree: Tree['id'], warning: boolean) => void;
    removed: (warning: boolean) => void;
} & TreeTransferActions & PropsLocale<'timeline'>) => {
    const input = shallowRef<HTMLInputElement | null>(null);
    const version = shallowRef(0);
    const requestId = shallowRef(randomUUID());
    const saving = shallowRef(false);
    const file = shallowRef<{
        name: string;
        content: string;
        checkpoint: Checkpoint;
    } | null>(null);
    const proceed = shallowRef(false);
    const copy = shallowRef(false);
    const busy = shallowRef(false);
    const error = shallowRef<string | null>(null);
    onMounted(() => watch(() => [], (_next, _previous, cleanup) => {
        const dispose0 = (() => () => { version.value++; })();
        if (typeof dispose0 === "function")
            cleanup(dispose0);
    }, { immediate: true, flush: "post" }));
    const read = computed(() => async (selected: File) => {
        const current = ++version.value;
        busy.value = true;
        file.value = null;
        error.value = null;
        try {
            if (selected.size > CHECKPOINT_BYTES)
                throw new Error('Timeline checkpoint exceeds 2 MiB');
            const content = await selected.text();
            if (version.value !== current)
                return;
            const checkpoint = Checkpoint.fromString(content);
            file.value = { name: selected.name, content, checkpoint };
            requestId.value = randomUUID();
        }
        catch (caught: unknown) {
            if (version.value === current)
                error.value = caught instanceof Error ? caught.message.slice(0, 1000) : props.t('treeTransferFailed');
        }
        finally {
            if (version.value === current)
                busy.value = false;
        }
    });
    const remove = computed(() => props.mode === 'remove' && props.tree !== undefined);
    const submit = computed(() => {
        const tree = props.tree;
        const selected = file.value;
        if (props.mode === 'remove' && tree !== undefined)
            return async () => { const result = await props.removeTree(tree.id); props.removed(result.removed && !result.notified && !result.draft); };
        if (props.mode === 'import' && selected !== null)
            return async () => { const result = await props.importTree({ id: requestId.value, content: selected.content, copy: copy.value, continue: proceed.value }); props.imported(result.tree, proceed.value && !result.notified); };
        return undefined;
    });
    const perform = computed(() => async (submit: () => Promise<void>) => {
        if (saving.value)
            return;
        saving.value = true;
        busy.value = true;
        error.value = null;
        try {
            await submit();
            props.close();
        }
        catch (caught: unknown) {
            error.value = caught instanceof Error ? caught.message.slice(0, 1000) : props.t('treeTransferFailed');
        }
        finally {
            saving.value = false;
            busy.value = false;
        }
    });
    const progress = computed(() => file.value === null ? 0 : (measureAll(file.value.checkpoint.tasks).get(null)?.progress ?? 0));
    return () => {
        const submitRendered = submit.value;
        return (h(Modal, {
            "open": props.mode !== null, "onClose": () => {
                if (!busy.value)
                    props.close();
            }, "title": props.t(props.mode === 'remove' ? 'deleteTree' : 'importTree'), "closeLabel": props.t('cancel'), "className": "timeline-transfer", "description": props.mode === 'remove' && props.tree !== undefined ? props.t('deleteTreeHint', { title: props.tree.title }) : props.t('checkpointHint')
        }, { default: () => [
                props.mode === 'import' ? (h("div", { "class": "timeline-transfer-options" }, [
                    h("input", { "ref": input, "type": "file", "accept": ".json,application/json", "hidden": true, "aria-label": props.t('chooseCheckpoint'), "onChange": (event: Event & {
                            currentTarget: HTMLInputElement;
                        }) => {
                            const selected = event.currentTarget.files?.[0];
                            event.currentTarget.value = '';
                            if (selected !== undefined)
                                void read.value(selected);
                        } }),
                    h(Button, { "variant": "outline", "disabled": busy.value, "data-modal-autofocus": true, "onClick": () => input.value?.click() }, { default: () => [
                            props.t('chooseCheckpoint')
                        ] }),
                    file.value === null ? null : (h("div", null, [
                        h("strong", null, [
                            file.value.checkpoint.toJson().title
                        ]),
                        h("p", { "class": "timeline-muted" }, [
                            file.value.name
                        ]),
                        h("p", null, [
                            props.t('taskCount', { count: file.value.checkpoint.tasks.length }),
                            " \u00B7",
                            ' ',
                            formatProgress(progress.value, props.decimals),
                            "%"
                        ])
                    ])),
                    h("label", null, [
                        h("input", { "type": "checkbox", "disabled": busy.value, "checked": proceed.value, "onChange": (event: Event & {
                                currentTarget: HTMLInputElement;
                            }) => {
                                proceed.value = event.currentTarget.checked;
                                requestId.value = randomUUID();
                            } }),
                        props.t('continueCheckpoint')
                    ]),
                    h("label", null, [
                        h("input", { "type": "checkbox", "disabled": busy.value, "checked": copy.value, "onChange": (event: Event & {
                                currentTarget: HTMLInputElement;
                            }) => {
                                copy.value = event.currentTarget.checked;
                                requestId.value = randomUUID();
                            } }),
                        props.t('copyCheckpoint')
                    ])
                ])) : null,
                props.running ? h("p", { "role": "status" }, [
                    props.t('treeIdleRequired')
                ]) : null,
                error.value === null ? null : (h("p", { "class": "timeline-error", "role": "alert" }, [
                    error.value
                ]))
            ], footer: () => h(Fragment, null, [
                remove.value ? (h(Button, { "disabled": busy.value, "onClick": () => {
                        try {
                            props.tree !== undefined && exportTree(props.tree, props.view.annotations, props.sessionId);
                        }
                        catch (caught: unknown) {
                            error.value = caught instanceof Error ? caught.message : props.t('treeTransferFailed');
                        }
                    } }, { default: () => [
                        props.t('exportTree')
                    ] })) : null,
                h(Button, { "disabled": busy.value, "onClick": props.close }, { default: () => [
                        props.t('cancel')
                    ] }),
                h(Button, { "variant": props.mode === 'remove' ? 'outline' : 'primary', "className": props.mode === 'remove' ? 'timeline-delete' : '', "disabled": busy.value || props.running || submitRendered === undefined, "onClick": submitRendered === undefined ? undefined : () => { void perform.value(submitRendered); } }, { default: () => [
                        props.t(busy.value ? 'saving' : props.mode === 'remove' ? 'deleteTree' : 'importTree')
                    ] })
            ]) }));
    };
}, { name: "TreeTransfer", inheritAttrs: false, props: ["mode", "sessionId", "tree", "view", "running", "decimals", "close", "imported", "removed", "importTree", "removeTree", "t"] });
