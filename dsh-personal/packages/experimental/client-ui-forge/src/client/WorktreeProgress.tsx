/**
 * Card above the composer while a Session's worktree is created, while a message
 * waits after a failed or stopped attempt, and when its worktree is gone or
 * being restored.
 */
import { defineComponent, h, Fragment, shallowRef, type VNodeChild } from 'vue';
import { Button, IconBranchOutlineRegular, IconCheckOutlineRegular, IconChevronRightOutlineRegular, IconCloseOutlineRegular, StateDot, } from '@deepseek-ai/dsh-client-ui-primitives';
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import { assertNever } from '@deepseek-ai/dsh-util-values';
import { branchLabel } from '../branch-name.ts';
import type { ForgeMissingWorktree, ForgePanelWorktree, ForgeSessionWorktree, ForgeWorktreeRestoration } from '../types.ts';
import type { ForgePanelKey, NS } from './locales.ts';
import type { PanelSnapshot } from './source.ts';
import { WorktreeNameDialog, type WorktreeRequestResult } from './WorktreeNameDialog.tsx';
import css from './WorktreeProgress.module.css';
/** Business face of the card. */
export interface WorktreeProgressInjected {
    /** Panel snapshot of the Session; the renderer binds it as `usePanel`. */
    readonly hooks: {
        readonly panel: HostObservable<PanelSnapshot>;
    };
    /** Stop the running attempt a message waits for; the message keeps waiting. */
    readonly stop: () => void;
    /**
     * Make another attempt at the worktree a message waits for.
     * @param fetch - false starts from the remote base branch as last fetched, without fetching it.
     */
    readonly retry: (fetch: boolean) => void;
    /**
     * Request the worktree again from the same base on another branch name, before another attempt.
     * @param from - base of the open request, or null for HEAD.
     * @param name - new branch name.
     * @returns the outcome; a failure other than a refused name is already reported.
     */
    readonly request: (from: string | null, name: string | null) => Promise<WorktreeRequestResult>;
    /** Withdraw the worktree request, so the waiting message goes on without a worktree. */
    readonly withdraw: () => void;
    /**
     * Check out the removed worktree again.
     * @returns the failure text, or undefined once it is restored.
     */
    readonly restore: () => Promise<string | undefined>;
    /** Move the Session back to the source checkout of its removed worktree. */
    readonly leave: () => void;
}
/** Full props of the card. */
export type WorktreeProgressProps = InjectFace<WorktreeProgressInjected> & PropsLocale<typeof NS>;
type Translate = WorktreeProgressProps['t'];
type StepState = 'done' | 'running' | 'waiting' | 'failed';
type Phase = 'fetch' | 'prepare' | 'checkout';
/** Steps in the order they run, each with its label. */
type StepList = readonly {
    readonly phase: Phase;
    readonly label: VNodeChild;
}[];
function stepState(steps: StepList, current: Phase, failed: boolean, phase: Phase): StepState {
    const at = steps.findIndex(step => step.phase === current);
    const index = steps.findIndex(step => step.phase === phase);
    if (index === at)
        return failed ? 'failed' : 'running';
    return index < at ? 'done' : 'waiting';
}
const Steps = defineComponent((props: {
    readonly steps: StepList;
    readonly phase: Phase;
    readonly failed: boolean;
}) => {
    return () => {
        const { steps, phase, failed } = props;
        return (h("ul", { "class": css.steps }, [steps.map((step) => {
                const state = stepState(steps, phase, failed, step.phase);
                return (h("li", { "key": step.phase, "class": css.step, "data-state": state, "data-forge-step": step.phase }, [h(StepIcon, { "state": state }, {}), h("span", {}, [step.label])]));
            })]));
    };
}, { props: ["steps", "phase", "failed"], inheritAttrs: false });
/** The steps of a creation, which fetches a remote base branch first when it asks to. */
function creationSteps(creation: CreationView, t: Translate): StepList {
    const from = creation.from === null ? null : branchLabel(creation.from);
    return [
        ...creation.fetch && from !== null
            ? [{ phase: 'fetch' as const, label: t('creation.fetch', { branch: from }) }]
            : [],
        { phase: 'prepare', label: t('creation.prepare') },
        { phase: 'checkout', label: t('creation.checkout') },
    ];
}
function restorationSteps(t: Translate): StepList {
    return [
        { phase: 'prepare', label: t('restoration.prepare') },
        { phase: 'checkout', label: t('creation.checkout') },
    ];
}
const StepIcon = defineComponent((props: {
    readonly state: StepState;
}) => {
    return () => {
        const { state } = props;
        switch (state) {
            case 'done': return h(IconCheckOutlineRegular, { "size": 14, "className": css.done ?? '' }, {});
            case 'running': return h(StateDot, { "state": "ongoing", "size": 14 }, {});
            case 'failed': return h(IconCloseOutlineRegular, { "size": 14, "className": css.failed ?? '' }, {});
            case 'waiting': return h("span", { "class": css.waiting, "aria-hidden": "true" }, []);
            /* v8 ignore next -- closed StepState union exhaustiveness guard */
            default: return assertNever(state, 'StepState');
        }
    };
}, { props: ["state"], inheritAttrs: false });
/** One creation as the card shows it: the running attempt, or the failed or stopped one a message waits after. */
interface CreationView {
    readonly state: 'running' | 'failed' | 'stopped';
    readonly phase: Phase;
    readonly branch: string | null;
    readonly from: string | null;
    /** Whether the attempt fetches its remote base branch first. */
    readonly fetch: boolean;
    /** Failure text, or null unless the attempt failed. */
    readonly message: string | null;
    /** Whether the failed attempt found its branch or checkout directory taken. */
    readonly exists: boolean;
    /** Whether a message waits for the running attempt, which can then be stopped. */
    readonly held: boolean;
}
/** The running attempt, else the failed or stopped one a message waits after, or undefined without either. */
function creationOf(worktree: ForgePanelWorktree): CreationView | undefined {
    const { creation, failure, waiting } = worktree;
    if (creation !== null)
        return { ...creation, state: 'running', message: null, exists: false };
    if (waiting !== 'creation')
        return undefined;
    if (failure !== null)
        return { ...failure, state: 'failed', held: false };
    return {
        state: 'stopped', phase: 'prepare', branch: null, from: worktree.request?.from ?? null, fetch: false, message: null, exists: false, held: false,
    };
}
const Details = defineComponent((props: {
    readonly creation: CreationView;
    readonly t: Translate;
}) => {
    return () => {
        const { creation, t } = props;
        return (h("dl", { "class": css.details }, [creation.branch !== null && (h(Fragment, {}, [h("dt", {}, [t('creation.branch')]), h("dd", { "class": css.code }, [creation.branch])])), h("dt", {}, [t('creation.base')]), h("dd", { "class": css.code }, [creation.from === null ? t('creation.head') : branchLabel(creation.from)]), creation.message !== null && (h(Fragment, {}, [h("dt", {}, [t('creation.error')]), h("dd", { "class": css.message }, [creation.message])]))]));
    };
}, { props: ["creation", "t"], inheritAttrs: false });
const CREATION_TITLE: Record<CreationView['state'], ForgePanelKey> = {
    running: 'creation.title',
    failed: 'creation.failed',
    stopped: 'creation.stopped',
};
/** The buttons of a failed or stopped attempt before withdrawing; the first one is the primary action. */
function waitingActions(creation: CreationView, named: boolean, retry: WorktreeProgressInjected['retry'], rename: () => void, t: Translate): VNodeChild {
    const again = { key: 'retry', label: t('creation.retry'), act: () => { retry(true); } };
    const actions = creation.state === 'failed' && creation.phase === 'fetch'
        ? [again, { key: 'fetched', label: t('creation.useFetched'), act: () => { retry(false); } }]
        : creation.state === 'failed' && creation.exists && named
            ? [{ key: 'rename', label: t('creation.rename'), act: rename }, again]
            : [again];
    return actions.map((action, index) => (h(Button, { "key": action.key, "size": "sm", "variant": index === 0 ? 'primary' : 'ghost', "onClick": action.act }, { default: () => [action.label] })));
}
const CreationCard = defineComponent((props: {
    readonly creation: CreationView;
    /** The open request, whose base a rename keeps and whose branch name it replaces. */
    readonly open: ForgePanelWorktree['request'];
    /** Prefix of generated branch names. */
    readonly prefix: string;
    readonly stop: WorktreeProgressInjected['stop'];
    readonly retry: WorktreeProgressInjected['retry'];
    readonly withdraw: WorktreeProgressInjected['withdraw'];
    readonly request: WorktreeProgressInjected['request'];
    readonly t: Translate;
}) => {
    const open = shallowRef(false);
    const setOpen = (value: typeof open.value): void => { open.value = value; };
    const renaming = shallowRef(false);
    const setRenaming = (value: typeof renaming.value): void => { renaming.value = value; };
    return () => {
        const { creation, open: openRequest, prefix, stop, retry, withdraw, request, t } = props;
        const running = creation.state === 'running';
        const failed = creation.state === 'failed';
        const title = t(CREATION_TITLE[creation.state]);
        const name = openRequest?.name ?? null;
        const from = openRequest?.from ?? null;
        return (h("div", { "class": css.dock, "data-forge-creation": running ? creation.phase : creation.state }, [h("section", { "class": css.card, "aria-label": title, "aria-busy": running }, [h("div", { "class": css.header }, [h(IconBranchOutlineRegular, { "size": 14, "className": css.glyph ?? '' }, {}), h("span", { "class": css.title }, [title]), creation.branch !== null && h("span", { "class": css.branch }, [creation.branch])]), creation.state !== 'stopped' && h(Steps, { "steps": creationSteps(creation, t), "phase": creation.phase, "failed": failed }, {}), (open.value || failed) && h(Details, { "creation": creation, "t": t }, {}), !running && h("p", { "class": css.note }, [t('creation.waiting')]), h("div", { "class": css.footer }, [running && (h("button", { "type": "button", "class": css.disclosure, "aria-expanded": open.value, "onClick": () => { setOpen(!open.value); } }, [h(IconChevronRightOutlineRegular, { "size": 12, "className": (open.value ? css.chevronOpen : css.chevron) ?? '' }, {}), t('creation.details')])), !running && (h("span", { "class": css.actions }, [waitingActions(creation, name !== null, retry, () => { setRenaming(true); }, t), h(Button, { "size": "sm", "variant": "ghost", "onClick": withdraw }, { default: () => [t('creation.skip')] })])), creation.held && (h("span", { "class": css.actions }, [h(Button, { "size": "sm", "variant": "ghost", "onClick": stop }, { icon: () => h(IconCloseOutlineRegular, { "size": 14 }, {}), default: () => [t('creation.cancel')] })]))])]), renaming.value && name !== null && (h(WorktreeNameDialog, { "mode": "retry", "initial": name, "prefix": prefix, "from": from, "named": true, "submit": async (next) => {
                    const result = await request(from, next);
                    if (result === 'accepted')
                        retry(true);
                    return result;
                }, "close": () => { setRenaming(false); }, "t": t }, {}))]));
    };
}, { props: ["creation", "open", "prefix", "stop", "retry", "withdraw", "request", "t"], inheritAttrs: false });
const MissingCard = defineComponent((props: {
    readonly created: ForgeSessionWorktree;
    readonly missing: ForgeMissingWorktree;
    /** The running restoration, from whichever surface started it. */
    readonly restoration: ForgeWorktreeRestoration | null;
    /** Whether a message waits for the worktree to be restored or left. */
    readonly waiting: boolean;
    readonly restore: WorktreeProgressInjected['restore'];
    readonly leave: WorktreeProgressInjected['leave'];
    readonly t: Translate;
}) => {
    const restoring = shallowRef(false);
    const setRestoring = (value: typeof restoring.value): void => { restoring.value = value; };
    const error = shallowRef<string | null>(null);
    const setError = (value: typeof error.value): void => { error.value = value; };
    return () => {
        const { created, missing, restoration, waiting, restore, leave, t } = props;
        const start = (): void => {
            setRestoring(true);
            setError(null);
            void restore().then((failure) => {
                setRestoring(false);
                setError(failure ?? null);
            }, (failure: unknown) => {
                setRestoring(false);
                setError(failure instanceof Error ? failure.message : String(failure));
            });
        };
        const phase = restoration?.phase ?? (restoring.value ? 'prepare' : null);
        if (phase !== null) {
            return (h("div", { "class": css.dock, "data-forge-missing": "", "data-forge-restoration": phase }, [h("section", { "class": css.card, "aria-label": t('restoration.title'), "aria-busy": true }, [h("div", { "class": css.header }, [h(IconBranchOutlineRegular, { "size": 14, "className": css.glyph ?? '' }, {}), h("span", { "class": css.title }, [t('restoration.title')]), h("span", { "class": css.branch }, [created.branch])]), h(Steps, { "steps": restorationSteps(t), "phase": phase, "failed": false }, {})])]));
        }
        return (h("div", { "class": css.dock, "data-forge-missing": "" }, [h("section", { "class": css.card, "aria-label": t('missing.title') }, [h("div", { "class": css.header }, [h(IconBranchOutlineRegular, { "size": 14, "className": css.warning ?? '' }, {}), h("span", { "class": css.title }, [t('missing.title')]), h("span", { "class": css.branch }, [created.branch])]), h("p", { "class": css.note }, [t(missing.branchExists === null ? 'missing.unknown' : missing.branchExists ? 'missing.kept' : 'missing.recreated', { branch: created.branch })]), waiting && h("p", { "class": css.note }, [t('missing.waiting')]), error.value !== null && h("p", { "class": css.error }, [error.value]), h("div", { "class": css.footer }, [h("span", { "class": css.actions }, [h(Button, { "size": "sm", "variant": "primary", "onClick": start }, { default: () => [t('missing.restore')] }), h(Button, { "size": "sm", "variant": "ghost", "onClick": leave }, { default: () => [t('missing.leave')] })])])])]));
    };
}, { props: ["created", "missing", "restoration", "waiting", "restore", "leave", "t"], inheritAttrs: false });
/**
 * Render the worktree card of a Session: the running attempt at its
 * requested worktree, which can be stopped while a message waits for it; the
 * failed or stopped attempt a message waits after, with another attempt or
 * withdrawing the request so the message goes on without a worktree; or the
 * removal of the worktree the Session works in, with restoring it, whose
 * steps the card follows, and returning to the source checkout, after which
 * a waiting message goes on.
 * @param props - panel hook, actions, and copy.
 * @returns the card, or nothing while no attempt runs, no message waits, and the worktree exists.
 */
export const WorktreeProgress = defineComponent((props: WorktreeProgressProps) => {
    const { usePanel } = props;
    const worktree = usePanel(snapshot => snapshot.state?.worktree ?? null);
    return () => {
        const worktreeSnapshot = worktree.value;
        const { stop, retry, withdraw, request, restore, leave, t } = props;
        if (worktreeSnapshot === null)
            return null;
        const creation = creationOf(worktreeSnapshot);
        if (creation !== undefined) {
            return h(CreationCard, { "creation": creation, "open": worktreeSnapshot.request, "prefix": worktreeSnapshot.namePrefix, "stop": stop, "retry": retry, "withdraw": withdraw, "request": request, "t": t }, {});
        }
        if (worktreeSnapshot.missing === null || worktreeSnapshot.created === null)
            return null;
        return (h(MissingCard, { "created": worktreeSnapshot.created, "missing": worktreeSnapshot.missing, "restoration": worktreeSnapshot.restoration, "waiting": worktreeSnapshot.waiting === 'restoration', "restore": restore, "leave": leave, "t": t }, {}));
    };
}, { props: ["usePanel", "stop", "retry", "withdraw", "request", "restore", "leave", "t"], inheritAttrs: false });
