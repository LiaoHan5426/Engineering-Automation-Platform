/** New Session option: start the Session in a new worktree, on a chosen or generated branch, from a local or remote branch. */
import { defineComponent, h, Fragment, shallowRef, type VNodeChild } from 'vue';
import clsx from 'clsx';
import { IconBranchOutlineRegular, IconCheckOutlineRegular, IconChevronDownOutlineRegular, IconEditOutlineRegular, IconPlusOutlineRegular, IconSearchOutlineRegular, Input, Menu, MenuItemButton, Tooltip, } from '@deepseek-ai/dsh-client-ui-primitives';
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import { branchLabel, LOCAL_REF_PREFIX, REMOTE_REF_PREFIX } from '../branch-name.ts';
import type { ForgeBaseBranch, ForgePanelState, ForgeWorktreeBases, ForgeWorktreeBlocker } from '../types.ts';
import { branchSearchStatus, useBranchSearch } from './branch-search.tsx';
import type { NS } from './locales.ts';
import { searchFieldKeyDown } from './menu-search.ts';
import type { PanelSnapshot } from './source.ts';
import { WorktreeNameDialog, type WorktreeRequestResult } from './WorktreeNameDialog.tsx';
import css from './WorktreeToggle.module.css';
/** Business face of the New Session option. */
export interface WorktreeToggleInjected {
    /** Panel snapshot of the Session; the renderer binds it as `usePanel`. */
    readonly hooks: {
        readonly panel: HostObservable<PanelSnapshot>;
    };
    /**
     * Request a worktree from a base on a branch name, replacing an open request.
     * @param from - full name of a local or remote-tracking base branch, or null for HEAD.
     * @param name - new branch name, or null for a generated one.
     * @returns the outcome; a failure other than a refused name is already reported.
     */
    readonly request: (from: string | null, name: string | null) => Promise<WorktreeRequestResult>;
    /**
     * Withdraw the open request.
     * @returns whether the Host accepted it.
     */
    readonly cancel: () => Promise<boolean>;
    /**
     * List the branches a worktree of the Session's checkout can start from whose names contain `query`.
     * @param query - search text; empty for every branch.
     * @param signal - aborts the read.
     * @returns the branches, or the failure the menu shows.
     */
    readonly bases: (query: string, signal: AbortSignal) => Promise<RemoteResult<ForgeWorktreeBases>>;
}
/** Full props of the New Session option. */
export type WorktreeToggleProps = InjectFace<WorktreeToggleInjected> & PropsLocale<typeof NS>;
type Translate = WorktreeToggleProps['t'];
/** One selectable branch row: the branch, the remote it belongs to, and the tag that names a pinned row. */
interface BaseRow {
    readonly branch: ForgeBaseBranch;
    readonly remote?: string;
    readonly tag?: string;
}
/** What the option says about a request's base. */
function baseTextOf(from: string | null, t: Translate): string {
    return from === null ? t('worktree.baseHead') : t('worktree.base', { branch: branchLabel(from) });
}
/** What the option says about a request that names its branch. */
function namedTipOf(name: string, from: string | null, t: Translate): string {
    return from === null ? t('worktree.namedTipHead', { name }) : t('worktree.namedTip', { name, branch: branchLabel(from) });
}
/** The full name of a request's base; earlier panels recorded local branches by their short names. */
function refOf(from: string | null): string | null {
    return from === null || from.startsWith('refs/') ? from : `${LOCAL_REF_PREFIX}${from}`;
}
/** A branch name split into a remote's prefix and the rest; local branches have no prefix. */
function nameParts(branch: ForgeBaseBranch, remote: string | undefined): {
    readonly prefix: string;
    readonly rest: string;
} {
    return remote !== undefined && branch.ref.startsWith(REMOTE_REF_PREFIX)
        ? { prefix: `${remote}/`, rest: branch.name.slice(remote.length + 1) }
        : { prefix: '', rest: branch.name };
}
const BranchRows = defineComponent((props: {
    readonly rows: readonly BaseRow[];
    readonly chosen: string | null;
    readonly pick: (ref: string) => void;
}) => {
    return () => {
        const { rows, chosen, pick } = props;
        return rows.map(({ branch, remote, tag }) => {
            const selected = branch.ref === chosen;
            const parts = nameParts(branch, remote);
            return (h(MenuItemButton, { "key": branch.ref, "current": selected, "onSelect": () => { pick(branch.ref); } }, { icon: () => h(IconBranchOutlineRegular, { "size": 14 }, {}), default: () => [h("span", { "class": css.option, "data-forge-worktree-base": branch.ref }, [h("span", { "class": css.optionName }, [parts.prefix !== '' && h("span", { "class": css.remotePrefix }, [parts.prefix]), parts.rest]), tag !== undefined && h("span", { "class": css.tag }, [tag]), selected && h(IconCheckOutlineRegular, { "size": 14, "className": css.check ?? '' }, {})])] }));
        });
    };
}, { props: ["rows", "chosen", "pick"], inheritAttrs: false });
const WorktreeMenu = defineComponent((props: {
    readonly from: string | null;
    readonly name: string | null;
    /** Whether the worktree is being created, which freezes the request. */
    readonly held: boolean;
    readonly bases: WorktreeToggleInjected['bases'];
    readonly choose: (ref: string) => void;
    readonly nameBranch: () => void;
    readonly t: Translate;
}) => {

    const open = shallowRef(false);
    const setOpen = (value: typeof open.value): void => { open.value = value; };
    const { query, setQuery, listing, retry, reset, field } = useBranchSearch(() => open.value, (query, signal) => props.bases(query, signal));
    return () => {
        const { from, name, held, choose, nameBranch, t } = props;
        const chosen = refOf(from);
        const close = (): void => {
            setOpen(false);
            reset();
        };
        const pick = (ref: string): void => {
            close();
            if (ref !== chosen)
                choose(ref);
        };
        const value = listing.value?.ok === true ? listing.value.value : null;
        const needle = query.value.trim().toLowerCase();
        const matches = (branch: ForgeBaseBranch): boolean => branch.name.toLowerCase().includes(needle);
        const pinned: BaseRow[] = value === null ? [] : [
            ...value.current === null ? [] : [{ branch: value.current, tag: t('worktree.currentBranch') }],
            ...value.defaults.map(({ remote, ...branch }) => ({ branch, remote, tag: t('worktree.remoteDefault') })),
        ].filter(row => matches(row.branch));
        const local = (value?.local ?? []).filter(matches).map(branch => ({ branch }));
        const remotes = (value?.remotes ?? []).map(remote => ({
            ...remote, rows: remote.branches.filter(matches).map(branch => ({ branch, remote: remote.name })),
        }))
            .filter(remote => remote.rows.length > 0);
        const first = pinned[0] ?? local[0] ?? remotes[0]?.rows[0];
        const body: VNodeChild = branchSearchStatus({ listing: listing.value, empty: first === undefined, retry, className: css.status, t }) ?? h(Fragment, {}, [pinned.length > 0 && h("div", { "role": "group", "aria-label": t('worktree.pinned') }, [h(BranchRows, { "rows": pinned, "chosen": chosen, "pick": pick }, {})]), local.length > 0 && (h("div", { "role": "group", "aria-label": t('diff.base.local') }, [h("div", { "class": css.groupLabel, "role": "presentation" }, [t('diff.base.local')]), h(BranchRows, { "rows": local, "chosen": chosen, "pick": pick }, {})])), remotes.map(remote => (h("div", { "key": remote.name, "role": "group", "aria-label": t('worktree.remoteGroup', { remote: remote.name }) }, [h("div", { "class": css.groupLabel, "role": "presentation" }, [h("span", { "class": css.groupName }, [t('worktree.remoteGroup', { remote: remote.name })]), remote.repository !== null && h("span", { "class": css.groupRepository }, [remote.repository])]), h(BranchRows, { "rows": remote.rows, "chosen": chosen, "pick": pick }, {})])))]);
        const baseText = baseTextOf(from, t);
        const label = name === null ? baseText : namedTipOf(name, from, t);
        return (h(Menu, { "open": open.value, "side": "bottom", "align": "end", "portal": true, "dense": true, "className": css.anchor ?? '', "listClassName": css.menu ?? '', "onClose": close }, { anchor: () => h(Tooltip, { "label": label, "side": "bottom", "portal": true, "delayMs": 500 }, { default: () => [h("button", { "type": "button", "class": clsx(css.base, name !== null && css.named), "aria-haspopup": "menu", "aria-expanded": open.value, "aria-label": label, "data-forge-base-branch": "", "disabled": held, "onClick": () => { if (open.value)
                            close();
                        else
                            setOpen(true); } }, [name === null
                            ? h("span", { "class": css.baseLabel }, [baseText])
                            : h(Fragment, {}, [h("span", { "class": css.nameLabel }, [name]), h("span", { "class": css.fromLabel }, [` · ${baseText}`])]), h(IconChevronDownOutlineRegular, { "size": 12, "className": clsx(css.chevron, open.value && css.chevronOpen) }, {})])] }), default: () => [h("div", { "class": css.menuRoot, "data-forge-worktree-menu": "" }, [h("div", { "class": css.search }, [h(Input, { "elementRef": (el: HTMLInputElement | null) => { field.value = el; }, "className": clsx(css.searchInput), "value": query.value, "aria-label": t('diff.base.search'), "placeholder": t('diff.base.search'), "onChange": (event: Event) => { setQuery((event.target as HTMLInputElement).value); }, "onInput": (event: Event) => { setQuery((event.target as HTMLInputElement).value); }, "onKeydown": (event: KeyboardEvent) => { searchFieldKeyDown(event, first === undefined ? undefined : () => { pick(first.branch.ref); }); } }, { icon: () => h(IconSearchOutlineRegular, { "size": 14 }, {}) })]), h("div", { "class": css.rows }, [body]), h("div", { "class": css.footer }, [h(MenuItemButton, { "onSelect": () => { close(); nameBranch(); } }, { icon: () => name === null ? h(IconPlusOutlineRegular, { "size": 14 }, {}) : h(IconEditOutlineRegular, { "size": 14 }, {}), default: () => [h("span", { "class": css.option, "data-forge-worktree-name-entry": "" }, [h("span", { "class": css.footerLabel }, [t(name === null ? 'worktree.name.add' : 'worktree.name.label')]), h("span", { "class": clsx(css.footerValue, name !== null && css.footerName) }, [name ?? t('worktree.name.auto')])])] })])])] }));
    };
}, { props: ["from", "name", "held", "bases", "choose", "nameBranch", "t"], inheritAttrs: false });
/** What the option shows for a panel state, or undefined while it stays hidden. */
function optionOf(state: ForgePanelState | null): {
    readonly blocker: Exclude<ForgeWorktreeBlocker, 'not-git'> | null;
    readonly current: string | null;
    readonly commit: string | null;
} | undefined {
    if (state === null || !state.worktree.editable)
        return undefined;
    const blocker = state.worktree.blocker;
    if (blocker === 'not-git')
        return undefined;
    const checkout = state.checkout;
    if (checkout.state !== 'ready')
        return undefined;
    return { blocker, current: checkout.checkout.branch, commit: checkout.checkout.commit };
}
/**
 * Render the worktree option while the Session can still start in a worktree:
 * the current branch, or the base and branch name menu once requested, then the
 * checkbox. The menu searches local branches and each remote's branches and
 * opens the naming dialog. A blocked request keeps its selected base visible
 * without a menu; the checkbox only withdraws it. Branch details support
 * pointer, touch, and keyboard access. The request stays fixed while the
 * worktree is being created.
 * @param props - panel snapshot hook, request actions, the base listing, and copy.
 * @returns the option, or nothing outside a known Git checkout, once a turn started,
 * the request settled, or no worktree service is mounted.
 */
export const WorktreeToggle = defineComponent((props: WorktreeToggleProps) => {
    const { usePanel } = props;
    const state = usePanel(snapshot => snapshot.state);
    const pending = shallowRef<boolean | null>(null);
    const setPending = (value: typeof pending.value): void => { pending.value = value; };
    const naming = shallowRef(false);
    const setNaming = (value: typeof naming.value): void => { naming.value = value; };
    return () => {
        const stateSnapshot = state.value;
        const { request, cancel, bases, t } = props;
        const option = optionOf(stateSnapshot);
        if (stateSnapshot === null || option === undefined)
            return null;
        const held = stateSnapshot.worktree.creation !== null;
        const requested = pending.value ?? stateSnapshot.worktree.request !== null;
        const usable = option.blocker === null;
        const disabled = held || pending.value !== null || (!usable && !requested);
        const currentRef = option.current === null ? null : `${LOCAL_REF_PREFIX}${option.current}`;
        const current = option.current ?? (option.commit === null ? t('checkout.detached') : t('worktree.detachedTip', { commit: option.commit }));
        const from = stateSnapshot.worktree.request === null ? currentRef : stateSnapshot.worktree.request.from;
        const name = stateSnapshot.worktree.request?.name ?? null;
        const requestedText = name === null ? baseTextOf(from, t) : namedTipOf(name, from, t);
        const branchText = requested ? requestedText : current;
        const branchTip = requested || option.current === null ? branchText : t('worktree.currentBranchTip', { branch: option.current });
        const change = (checked: boolean): void => {
            setPending(checked);
            void (checked ? request(currentRef, null) : cancel()).then(() => { setPending(null); });
        };
        return (h("span", { "class": css.root, "data-forge-worktree": "" }, [requested && usable ? (h(WorktreeMenu, { "from": from, "name": name, "held": held, "bases": bases, "t": t, "choose": (ref) => { void request(ref, name); }, "nameBranch": () => { setNaming(true); } }, {})) : (h(Tooltip, { "label": branchTip, "side": "bottom", "portal": true, "openOnClick": true }, { default: () => [h("button", { "type": "button", "class": css.current, "aria-label": branchTip, "data-forge-current-branch": requested ? undefined : '', "data-forge-base-branch": requested ? '' : undefined }, [h(IconBranchOutlineRegular, { "size": 14 }, {}), h("span", { "class": css.baseLabel }, [branchText])])] })), h(Tooltip, { "label": option.blocker === null ? t('worktree.hint') : t(`worktree.blocked.${option.blocker}`), "side": "bottom", "delayMs": 500 }, { default: () => [h("label", { "class": css.toggle, "data-disabled": disabled ? '' : undefined }, [h("input", { "type": "checkbox", "class": css.checkbox, "checked": requested, "disabled": disabled, "onChange": (event: Event) => { change((event.currentTarget as HTMLInputElement).checked); } }, []), t('worktree.label')])] }), naming.value && requested && (h(WorktreeNameDialog, { "mode": "name", "initial": name ?? stateSnapshot.worktree.namePrefix, "prefix": stateSnapshot.worktree.namePrefix, "from": from, "named": name !== null, "submit": next => request(from, next), "close": () => { setNaming(false); }, "t": t }, {}))]));
    };
}, { props: ["usePanel", "request", "cancel", "bases", "t"], inheritAttrs: false });
