/** Environment section rows: the Session's checkout, its branch changes, and a lost panel stream. */
import { defineComponent, h, shallowRef, watchEffect, } from 'vue';
import { Button, IconBranchOutlineRegular, IconEllipsisOutlineRegular, IconFilesDiffOutlineRegular, IconWarningTriangleOutlineRegular, MarqueeText, Menu, StateDot, Tooltip, useHoverMarquee, } from '@deepseek-ai/dsh-client-ui-primitives';
import type { HostObservable, InjectFace, PropsLocale, PropsRenderFactories, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { RemoteHostFacts } from '@deepseek-ai/dsh-api-remotes/client';
import type {} from '@deepseek-ai/dsh-client-ui-context-menu/client';
import type {} from '@deepseek-ai/dsh-client-ui-session-panel/client';
import { checkoutLabel } from './checkout.ts';
import type { NS } from './locales.ts';
import type { PanelSnapshot } from './source.ts';
import { ReasonButton } from './ReasonButton.tsx';
import { openChangeRequestOf } from './status.ts';
import css from './Forge.module.css';
/** Business face of the checkout row. */
export interface CheckoutRowInjected {
    /** Panel snapshot of the Session and the Host facts; bound as `usePanel` and `useHost`. */
    readonly hooks: {
        readonly panel: HostObservable<PanelSnapshot>;
        readonly host: HostObservable<RemoteHostFacts>;
    };
    /**
     * Reinspect the checkout, probe sign-in, and poll the change requests,
     * unless an automatic refresh of this Session ran in the last 10 seconds.
     */
    readonly refreshIfStale: () => void;
    /** Check the removed worktree of the Session out again, reporting the outcome. */
    readonly restore: () => void;
}
/** Full props of the checkout row. */
export type CheckoutRowProps = PropsRuntime<'conversation.session.panel.environment.row'> & PropsRenderFactories & InjectFace<CheckoutRowInjected> & PropsLocale<typeof NS>;
/** Business face of the local changes row. */
export interface LocalChangesRowInjected {
    /** Panel snapshot of the Session; bound as `usePanel`. */
    readonly hooks: {
        readonly panel: HostObservable<PanelSnapshot>;
    };
    /** Open the local changes view in the right sidebar. */
    readonly viewLocalChanges: () => void;
    /** Ask the Session's Agent to create a change request for its changes, reporting the outcome. */
    readonly createChangeRequest: () => void;
}
/** Full props of the local changes row. */
export type LocalChangesRowProps = PropsRuntime<'conversation.session.panel.environment.row'> & InjectFace<LocalChangesRowInjected> & PropsLocale<typeof NS>;
/**
 * Render the branch the Session works on and the kind of its directory. The
 * row and its More button open the shared directory menu on the checkout
 * root; a removed worktree offers Restore instead, and a failed inspection
 * shows a warning whose tooltip carries the failure. Tooltips show after
 * 500ms of hover, and a branch name the row clips crawls into view while the
 * pointer rests on the row. The row is mounted
 * whenever the panel shows, so it refreshes the Session's forge state when
 * the panel opens and when the window regains focus, which picks up changes
 * made outside the Session.
 * @param props - panel snapshot and Host facts hooks, refresh, restore, menu bindings, and copy.
 * @returns the row, or null before the first inspection and outside a Git checkout.
 */
export const CheckoutRow = defineComponent((props: CheckoutRowProps) => {
    const { usePanel, useHost, useContextMenu, refreshIfStale } = props;
    const state = usePanel(snapshot => snapshot.state);
    const home = useHost(facts => facts.home);
    const { getTriggerProps } = useContextMenu();
    const nameRef = shallowRef<HTMLSpanElement | null>(null);
    const marquee = useHoverMarquee(nameRef);
    watchEffect((onCleanup) => {
        const cleanup = (() => {
            refreshIfStale();
            const onVisibility = (): void => { if (document.visibilityState === 'visible')
                refreshIfStale(); };
            window.addEventListener('focus', refreshIfStale);
            document.addEventListener('visibilitychange', onVisibility);
            return () => {
                window.removeEventListener('focus', refreshIfStale);
                document.removeEventListener('visibilitychange', onVisibility);
            };
        })();
        if (cleanup)
            onCleanup(cleanup);
    });
    return () => {
        const { sessionId, renderFactorySlot, restore, t } = props;
const stateSnapshot = state.value;
const homeSnapshot = home.value;
        if (stateSnapshot === null)
            return null;
        const label = checkoutLabel(stateSnapshot, homeSnapshot, t);
        if (label === undefined) {
            if (stateSnapshot.checkout.state !== 'failed')
                return null;
            return (h("div", { "class": css.envRow, "data-session-panel-row": "", "data-forge-checkout": "", "data-failed": "" }, [h("span", { "data-row-part": "body" }, [h("span", { "data-row-part": "icon", "aria-hidden": "true" }, [h(IconWarningTriangleOutlineRegular, { "size": 16 }, {})]), h("span", { "data-row-part": "content" }, [h("span", { "class": css.envName }, [t('checkout.failed')])])]), h("span", { "data-row-part": "trailing" }, [h(ReasonButton, { "reason": stateSnapshot.checkout.message, "label": t('reason.show') }, {})])]));
        }
        const target = { kind: 'directory', value: { sessionId, path: label.path } } as const;
        const name = [label.detached ? t('checkout.detached') : undefined, label.name ?? undefined]
            .filter(part => part !== undefined).join(' · ');
        return (h("div", { ...getTriggerProps(target), "class": css.envRow, "data-session-panel-row": "", "data-forge-checkout": "", "data-missing": label.missing ? '' : undefined, onPointerenter: marquee.onPointerEnter, onPointerleave: marquee.onPointerLeave }, [h("span", { "data-row-part": "body" }, [h("span", { "data-row-part": "icon", "aria-hidden": "true" }, [label.missing ? h(IconWarningTriangleOutlineRegular, { "size": 16 }, {}) : h(IconBranchOutlineRegular, { "size": 16 }, {})]), h("span", { "data-row-part": "content" }, [h(Tooltip, { "label": label.tooltip, "side": "left", "delayMs": 500 }, { default: () => [h(MarqueeText, { "elementRef": (el: HTMLSpanElement | null) => { nameRef.value = el; }, "className": css.envName ?? '', "tabIndex": 0 }, { default: () => [name] })] })])]), h("span", { "data-row-part": "trailing" }, [h("span", { "class": css.envNote }, [label.kind]), label.missing && (h(Button, { "size": "sm", "variant": "outline", "disabled": stateSnapshot.worktree.restoration !== null, "onClick": restore }, { icon: () => stateSnapshot.worktree.restoration === null ? undefined : h(StateDot, { "state": "ongoing", "size": 14 }, {}), default: () => [t('checkout.restore')] }))]), !label.missing && (h("span", { "data-row-part": "menu" }, [renderFactorySlot('contextMenu.button', {
                    target,
                    label: t(label.worktree ? 'checkout.worktreeActions' : 'checkout.projectActions'),
                })]))]));
    };
}, { props: ["sessionId", "usePanel", "useHost", "useContextMenu", "renderFactorySlot", "refreshIfStale", "restore", "t"], inheritAttrs: false });
/** Business face of the connection row. */
export interface ConnectionRowInjected {
    /** Panel snapshot of the Session; bound as `usePanel`. */
    readonly hooks: {
        readonly panel: HostObservable<PanelSnapshot>;
    };
    /** Open the stream again after it ended. */
    readonly reconnect: () => void;
}
/** Full props of the connection row. */
export type ConnectionRowProps = PropsRuntime<'conversation.session.panel.environment.row'> & InjectFace<ConnectionRowInjected> & PropsLocale<typeof NS>;
/**
 * Say that the Session's panel stream ended, so the Git and change request
 * details may be out of date, whether or not it delivered a state first; Retry
 * opens the stream again. Assistive technology announces the row when it shows.
 * @param props - panel snapshot hook, reconnect action, and copy.
 * @returns the row, or null while the stream is open.
 */
export const ConnectionRow = defineComponent((props: ConnectionRowProps) => {
    const { usePanel } = props;
    const disconnected = usePanel(snapshot => snapshot.disconnected);
    return () => {
        const disconnectedSnapshot = disconnected.value;
        const { reconnect, t } = props;
        if (!disconnectedSnapshot)
            return null;
        return (h("div", { "class": css.envRow, "role": "status", "data-session-panel-row": "", "data-forge-connection": "" }, [h("span", { "data-row-part": "body" }, [h("span", { "data-row-part": "icon", "aria-hidden": "true" }, [h(IconWarningTriangleOutlineRegular, { "size": 16 }, {})]), h("span", { "data-row-part": "lines" }, [h("span", { "data-row-part": "content" }, [h("span", { "class": css.statusTitle }, [t('connection.title')])]), h("span", { "data-row-part": "detail" }, [t('connection.detail')])])]), h("span", { "data-row-part": "trailing" }, [h(Button, { "size": "sm", "variant": "outline", "onClick": reconnect }, { default: () => [t('retry')] })])]));
    };
}, { props: ["usePanel", "reconnect", "t"], inheritAttrs: false });
/**
 * Render the size of the branch's changes; the row opens the local changes
 * view, and its menu offers the view and, without an open change request for
 * the branch, asking the Agent to create one. Opening the view closes the
 * panel's overlay.
 * @param props - panel snapshot hook, view and create actions, panel owner values, and copy.
 * @returns the row, or null while the branch changes no files.
 */
export const LocalChangesRow = defineComponent((props: LocalChangesRowProps) => {
    const { usePanel } = props;
    const local = usePanel(snapshot => snapshot.state?.local ?? null);
    const creatable = usePanel(snapshot => snapshot.state !== null && snapshot.state.repository !== null
        && openChangeRequestOf(snapshot.state) === undefined);
    const open = shallowRef(false);
    const setOpen = (value: typeof open.value): void => { open.value = value; };
    return () => {
        const { dismissOverlay, viewLocalChanges, createChangeRequest, t } = props;
        if (local.value === null || local.value.files.length === 0)
            return null;
        let additions = 0;
        let deletions = 0;
        for (const file of local.value.files) {
            additions += file.additions;
            deletions += file.deletions;
        }
        const count = local.value.files.length;
        const view = (): void => {
            viewLocalChanges();
            dismissOverlay();
        };
        return (h("div", { "class": css.envRow, "data-session-panel-row": "", "data-forge-local": "" }, [h("button", { "type": "button", "data-row-part": "body", "aria-label": t('changes.local.viewAria', { count, added: additions, deleted: deletions }), "onClick": view }, [h("span", { "data-row-part": "icon", "aria-hidden": "true" }, [h(IconFilesDiffOutlineRegular, { "size": 16 }, {})]), h("span", { "data-row-part": "content" }, [t('changes.local.summary', { count })])]), h("span", { "data-row-part": "trailing" }, [h("span", { "class": css.diff }, [h("span", { "class": css.added }, [`+${String(additions)}`]), h("span", { "class": css.deleted }, [`−${String(deletions)}`])])]), h("span", { "data-row-part": "menu" }, [h(Menu, { "open": open.value, "onClose": () => { setOpen(false); }, "portal": true, "align": "end", "items": [
                        { id: 'view', label: t('change.viewChanges') },
                        ...creatable.value ? [{ id: 'create', label: t('changes.local.create') }] : [],
                    ], "onSelect": (id) => {
                        setOpen(false);
                        if (id === 'create')
                            createChangeRequest();
                        else
                            view();
                    } }, { anchor: () => (h("button", { "type": "button", "aria-label": t('changes.local.actions'), "aria-haspopup": "menu", "aria-expanded": open.value, "onClick": () => { setOpen(!open.value); } }, [h(IconEllipsisOutlineRegular, {}, {})])) })])]));
    };
}, { props: ["usePanel", "dismissOverlay", "viewLocalChanges", "createChangeRequest", "t"], inheritAttrs: false });
