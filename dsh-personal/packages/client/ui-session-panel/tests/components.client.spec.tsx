// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@deepseek-ai/dsh-client-test-runtime/src/vue-test.ts';
import { fireEvent, screen } from '@testing-library/dom';
import { h, Fragment, computed, shallowRef, defineComponent, nextTick, type VNodeChild } from 'vue';
import { useModalLayer } from '@deepseek-ai/dsh-client-ui-primitives';
import { bindSnapshotSelector, contextMenuHook, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime';
import type { FactoryComponentPropsOf } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import { EnvironmentSection } from '../src/client/EnvironmentSection.tsx';
import { PanelDetails } from '../src/client/PanelDetails.tsx';
import { PanelFold } from '../src/client/PanelFold.tsx';
import { ProjectRow } from '../src/client/ProjectRow.tsx';
import { SessionPanel } from '../src/client/SessionPanel.tsx';
import { SessionPanelToggle } from '../src/client/SessionPanelToggle.tsx';
import type { EnvironmentSectionProps, PanelDetailsProps, ProjectRowProps, SessionPanelDockable, SessionPanelProbes, SessionPanelProps, SessionPanelSectionEntry, SessionPanelSectionOwnerProps, SessionPanelToggleProps, SessionPanelVisibility, } from '../src/client/slots.ts';
import { SessionPanelState } from '../src/client/visibility.ts';
import { en, zh } from '../src/client/locales.ts';
const SID = 'session-1' as SessionId;
const t = makeTranslate(zh) as SessionPanelToggleProps['t'];
const DOCKED: SessionPanelVisibility = { pinned: true, overlay: null };
function selectorOf<T>(value: T) {
    return <S,>(select: (current: T) => S) => computed(() => select(value));
}
beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
        observe(): void { }
        unobserve(): void { }
        disconnect(): void { }
    });
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener() { }, removeEventListener() { } })));
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});
/** Whether a hovered anchor's tooltip shows before and at 500ms of hover. */
async function tooltipAfterHover(anchor: Element): Promise<{
    readonly early: boolean;
    readonly at500: boolean;
}> {
    vi.useFakeTimers();
    fireEvent.pointerEnter(anchor, { pointerType: 'mouse' });
    await act(() => { vi.advanceTimersByTime(499); });
    const early = screen.queryByRole('tooltip', { hidden: true }) !== null;
    await act(() => { vi.advanceTimersByTime(1); });
    return { early, at500: screen.queryByRole('tooltip', { hidden: true }) !== null };
}
describe('SessionPanelToggle', () => {
    function toggleProps(dockable: boolean | undefined, visibility: SessionPanelVisibility, toggle = vi.fn()) {
        const renderSlot = vi.fn(() => h("span", null, ["\u9700\u8981\u5904\u7406"]));
        const entries: SessionPanelDockable = new Map(dockable === undefined ? [] : [[SID, dockable]]);
        const props = {
            sessionId: SID, useDockable: selectorOf(entries), useVisibility: selectorOf(visibility), toggle, renderSlot, t,
        } as SessionPanelToggleProps;
        return { props, toggle, renderSlot };
    }
    it('names the panel together with its indicators and reports the docked panel as expanded', async () => {
        const { props, renderSlot } = toggleProps(true, DOCKED);
        render(h(SessionPanelToggle, { ...props }));
        const button = screen.getByRole('button', { name: '会话面板 需要处理' });
        expect(button.getAttribute('aria-expanded')).toBe('true');
        expect(button.getAttribute('aria-controls')).toBe(`dsh-session-panel-${SID}`);
        expect(renderSlot).toHaveBeenCalledWith('conversation.session.panel.indicator', { panelShown: true });
    });
    it('flips docking with room to dock and opens the overlay without it', async () => {
        const wide = toggleProps(true, DOCKED);
        render(h(SessionPanelToggle, { ...wide.props }));
        await act(() => { fireEvent.click(screen.getByRole('button')); });
        expect(wide.toggle).toHaveBeenCalledWith(SID);
        cleanup();
        const narrow = toggleProps(false, DOCKED);
        render(h(SessionPanelToggle, { ...narrow.props }));
        const button = screen.getByRole('button');
        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect(button.hasAttribute('aria-controls')).toBe(false);
        await act(() => { fireEvent.click(button); });
        expect(narrow.toggle).toHaveBeenCalledWith(SID);
    });
    it('reports an open overlay as expanded', async () => {
        const { props } = toggleProps(false, { pinned: false, overlay: SID });
        render(h(SessionPanelToggle, { ...props }));
        expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true');
    });
    it('tells its indicators whether the panel shows', async () => {
        const { props, renderSlot } = toggleProps(false, DOCKED);
        render(h(SessionPanelToggle, { ...props }));
        expect(renderSlot).toHaveBeenCalledWith('conversation.session.panel.indicator', { panelShown: false });
    });
    it('shows its tooltip after 500ms of hover', async () => {
        const { props } = toggleProps(true, DOCKED);
        render(h(SessionPanelToggle, { ...props }));
        expect(await tooltipAfterHover(screen.getByRole('button'))).toEqual({ early: false, at500: true });
    });
    it('is unavailable and says why while no Chat View shows the Session', async () => {
        const { props } = toggleProps(undefined, { pinned: true, overlay: SID });
        render(h(SessionPanelToggle, { ...props }));
        const button = screen.getByRole('button');
        expect(button.getAttribute('aria-disabled')).toBe('true');
        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect(button.hasAttribute('aria-controls')).toBe(false);
        fireEvent.keyDown(document.body, { key: 'Tab' });
        await act(() => { fireEvent.focus(button); });
        expect(screen.getByRole('tooltip', { hidden: true }).textContent).toBe('切换到「对话」视图后可显示会话面板');
    });
});
describe('SessionPanel', () => {
    const SECTIONS: readonly SessionPanelSectionEntry[] = [
        { id: 'environment', label: '环境' },
        { id: 'change-requests', label: '变更请求' },
    ];
    /** Ids of the probes the rendered panels created, so a later props object answers for the mounted panel. */
    const probeIds = new Set<string>();
    const panelVisibility = shallowRef<SessionPanelVisibility>(DOCKED);
    const panelDockable = shallowRef(false);
    afterEach(() => { probeIds.clear(); });
    /** Panel props whose dock probes all have, or all lack, room to dock. */
    function panelProps(dockable: boolean, visibility: SessionPanelVisibility, closeOverlay = vi.fn()) {
        panelVisibility.value = visibility; panelDockable.value = dockable;
        const owners: SessionPanelSectionOwnerProps[] = [];
        const renderSlot = ((key: string, owner: object, opts?: {
            only?: string;
            entryKey?: string;
        }): VNodeChild => {
            if (key === 'conversation.session.panel.section.actions') {
                return opts?.entryKey === 'change-requests' ? h("button", { "type": "button" }, ["\u5237\u65B0"]) : null;
            }
            owners.push(owner as SessionPanelSectionOwnerProps);
            return h("p", null, [`${opts?.only ?? ''} body`]);
        }) as SessionPanelProps['renderSlot'];
        const attached = vi.fn<(element: HTMLElement | null) => void>();
        const createProbeRef = vi.fn((_sessionId: SessionId, probe: string) => {
            probeIds.add(probe);
            return attached;
        });
        const props = {
            sessionId: SID,
            useVisibility: <S,>(select: (value: SessionPanelVisibility) => S) => computed(() => select(panelVisibility.value)),
            useSections: selectorOf(SECTIONS),
            useProbes: <S,>(select: (probes: SessionPanelProbes) => S) => computed(() => select(new Map([...probeIds].map(id => [id, panelDockable.value])))),
            createProbeRef,
            closeOverlay,
            renderSlot,
            t,
        } as SessionPanelProps;
        return { props, owners, closeOverlay, createProbeRef, attached };
    }
    it('attaches its dock probe through the injected ref once and detaches it on unmount', async () => {
        const { props, createProbeRef, attached } = panelProps(true, DOCKED);
        const view = render(h(SessionPanel, { ...props }));
        const probe = view.container.querySelector('[data-session-panel-probe]');
        expect(probe).not.toBeNull();
        expect(createProbeRef.mock.calls).toEqual([[SID, expect.any(String)]]);
        expect(attached.mock.calls).toEqual([[probe]]);
        // A later render keeps the ref, so the probe is neither detached nor attached again.
        const next = panelProps(true, DOCKED);
        await view.rerender(h(SessionPanel, { ...next.props }));
        expect(next.createProbeRef).not.toHaveBeenCalled();
        expect(attached).toHaveBeenCalledTimes(1);
        view.unmount();
        expect(attached.mock.calls.at(-1)).toEqual([null]);
    });
    it('renders again only when its dock probe flips', async () => {
        const observed: {
            readonly element: Element;
            readonly callback: ResizeObserverCallback;
        }[] = [];
        vi.stubGlobal('ResizeObserver', class {
            private readonly callback: ResizeObserverCallback;
            constructor(callback: ResizeObserverCallback) { this.callback = callback; }
            observe(element: Element): void { observed.push({ element, callback: this.callback }); }
            unobserve(): void { }
            disconnect(): void { }
        });
        const state = new SessionPanelState();
        const base = panelProps(false, DOCKED);
        const props = {
            ...base.props,
            useProbes: bindSnapshotSelector(state.probes),
            createProbeRef: (sessionId: SessionId, probe: string) => state.createProbeRef(sessionId, probe),
        } as SessionPanelProps;
        const view = render(h(SessionPanel, { ...props }));
        const resize = async (width: number): Promise<void> => {
            await act(() => {
                for (const { element, callback } of observed) {
                    callback([{ target: element, contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver);
                }
            });
        };
        expect(observed.map(entry => entry.element)).toEqual([view.container.querySelector('[data-session-panel-probe]')]);
        expect(screen.queryByRole('complementary')).toBeNull();
        expect(state.dockable.getSnapshot().get(SID)).toBe(false);
        await resize(1);
        expect(screen.getByRole('complementary').getAttribute('data-session-panel')).toBe('docked');
        // CSS sizes the docked panel; no measured width reaches its style.
        expect(screen.getByRole('complementary').getAttribute('style')).toBeNull();
        const settled = base.owners.length;
        await resize(1);
        expect(base.owners).toHaveLength(settled);
        // A probe under 1px wide sits within a pixel below the gutter that docks the panel.
        await resize(0.5);
        expect(screen.queryByRole('complementary')).toBeNull();
        expect(state.dockable.getSnapshot().get(SID)).toBe(false);
        view.unmount();
        expect(state.dockable.getSnapshot().has(SID)).toBe(false);
    });
    it('renders only its dock probe while hidden', async () => {
        const { props } = panelProps(true, { pinned: false, overlay: null });
        const view = render(h(SessionPanel, { ...props }));
        expect(view.container.querySelector('[data-session-panel]')).toBeNull();
        expect(view.container.children).toHaveLength(1);
        expect(view.container.firstElementChild?.hasAttribute('data-session-panel-probe')).toBe(true);
    });
    it('docks with one titled region per section in roster order and each section body', async () => {
        const { props, owners } = panelProps(true, DOCKED);
        render(h(SessionPanel, { ...props }));
        const panel = screen.getByRole('complementary', { name: '会话面板' });
        expect(panel.getAttribute('data-session-panel')).toBe('docked');
        expect(panel.id).toBe(`dsh-session-panel-${SID}`);
        const regions = screen.getAllByRole('region');
        expect(regions.map(region => region.getAttribute('aria-labelledby'))).toEqual([
            `dsh-session-panel-${SID}-environment`, `dsh-session-panel-${SID}-change-requests`,
        ]);
        expect(screen.getByRole('heading', { name: '变更请求' })).toBeTruthy();
        expect(screen.getByText('environment body')).toBeTruthy();
        expect(screen.getByRole('button', { name: '刷新' })).toBeTruthy();
        expect(owners.every(owner => owner.presentation === 'docked')).toBe(true);
    });
    it('closes the overlay on Escape from inside and returns focus to the toggle', async () => {
        const { props, owners, closeOverlay } = panelProps(false, { pinned: true, overlay: SID });
        const toggle = document.createElement('button');
        toggle.id = `dsh-session-panel-toggle-${SID}`;
        document.body.append(toggle);
        try {
            render(h(SessionPanel, { ...props }));
            const panel = screen.getByRole('complementary');
            expect(panel.getAttribute('data-session-panel')).toBe('overlay');
            fireEvent.keyDown(document, { key: 'Enter' });
            expect(closeOverlay).not.toHaveBeenCalled();
            screen.getByRole('button', { name: '刷新' }).focus();
            fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
            expect(closeOverlay).toHaveBeenCalledWith(SID);
            expect(document.activeElement).toBe(toggle);
            owners[0]?.dismissOverlay();
            expect(closeOverlay).toHaveBeenCalledTimes(2);
        }
        finally {
            toggle.remove();
        }
    });
    it('closes the overlay on Escape from the page without moving focus', async () => {
        const { props, closeOverlay } = panelProps(false, { pinned: true, overlay: SID });
        render(h(SessionPanel, { ...props }));
        const outside = document.createElement('input');
        document.body.append(outside);
        try {
            outside.focus();
            fireEvent.keyDown(outside, { key: 'Escape' });
            expect(closeOverlay).toHaveBeenCalledWith(SID);
            expect(document.activeElement).toBe(outside);
        }
        finally {
            outside.remove();
        }
    });
    it('closes the overlay on an outside pointerdown but not on the panel, the toggle, or an open menu', async () => {
        const { props, closeOverlay } = panelProps(false, { pinned: true, overlay: SID });
        const toggle = document.createElement('button');
        toggle.id = `dsh-session-panel-toggle-${SID}`;
        const menu = document.createElement('div');
        menu.setAttribute('role', 'menu');
        const item = document.createElement('button');
        menu.append(item);
        document.body.append(toggle, menu);
        try {
            render(h(SessionPanel, { ...props }));
            fireEvent.pointerDown(screen.getByText('environment body'));
            fireEvent.pointerDown(toggle);
            fireEvent.pointerDown(item);
            expect(closeOverlay).not.toHaveBeenCalled();
            fireEvent.pointerDown(document.body);
            expect(closeOverlay).toHaveBeenCalledWith(SID);
        }
        finally {
            toggle.remove();
            menu.remove();
        }
    });
    it('leaves Escape to other handlers while docked, after another handler took it, or behind a modal', async () => {
        const docked = panelProps(true, DOCKED);
        render(h(SessionPanel, { ...docked.props }));
        fireEvent.keyDown(document, { key: 'Escape' });
        fireEvent.pointerDown(document.body);
        expect(docked.closeOverlay).not.toHaveBeenCalled();
        cleanup();
        const overlay = panelProps(false, { pinned: true, overlay: SID });
        render(h(SessionPanel, { ...overlay.props }));
        const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        event.preventDefault();
        document.dispatchEvent(event);
        expect(overlay.closeOverlay).not.toHaveBeenCalled();
        // A modal opened over the overlay registers its Escape after the panel's, so the panel sees it first.
        const Modal = defineComponent(() => {
            const dialog = shallowRef<HTMLDivElement | null>(null);
            useModalLayer(dialog, true, () => { });
            return () => h("div", { "ref": dialog, "role": "dialog", "aria-modal": "true" });
        });
        const modal = render(h(Modal, null));
        await nextTick();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(overlay.closeOverlay).not.toHaveBeenCalled();
        modal.unmount();
        await nextTick();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(overlay.closeOverlay).toHaveBeenCalledWith(SID);
    });
    it('leaves Escape to an input method composing text, including the key that ends the composition', async () => {
        const { props, closeOverlay } = panelProps(false, { pinned: true, overlay: SID });
        render(h(SessionPanel, { ...props }));
        fireEvent(document, new Event('compositionstart'));
        fireEvent.keyDown(document, { key: 'Escape', isComposing: true });
        fireEvent(document, new Event('compositionend'));
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(closeOverlay).not.toHaveBeenCalled();
        fireEvent.keyUp(document, { key: 'Escape' });
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(closeOverlay).toHaveBeenCalledWith(SID);
    });
    it('hands focus to the toggle when the panel hides with the keyboard inside it', async () => {
        const toggle = document.createElement('button');
        toggle.id = `dsh-session-panel-toggle-${SID}`;
        const outside = document.createElement('button');
        document.body.append(toggle, outside);
        try {
            const docked = panelProps(true, DOCKED);
            const view = render(h(SessionPanel, { ...docked.props }));
            const control = screen.getByRole('button', { name: '刷新' });
            control.focus();
            // Moves within the panel, and blurs that name no next target, keep the keyboard inside.
            fireEvent.focusOut(control, { relatedTarget: screen.getByRole('complementary') });
            fireEvent.focusOut(control, { relatedTarget: null });
            await view.rerender(h(SessionPanel, { ...panelProps(false, DOCKED).props }));
            expect(document.activeElement).toBe(toggle);
            // Focus that already left the panel stays where it went.
            panelDockable.value = true; panelVisibility.value = DOCKED;
            await view.rerender(h(SessionPanel, { ...docked.props }));
            screen.getByRole('button', { name: '刷新' }).focus();
            outside.focus();
            await view.rerender(h(SessionPanel, { ...panelProps(false, DOCKED).props }));
            expect(document.activeElement).toBe(outside);
            // A panel that hides without having held focus moves nothing.
            await view.rerender(h(SessionPanel, { ...docked.props }));
            await view.rerender(h(SessionPanel, { ...panelProps(false, DOCKED).props }));
            expect(document.activeElement).toBe(outside);
        }
        finally {
            toggle.remove();
            outside.remove();
        }
    });
});
describe('EnvironmentSection', () => {
    it('renders its rows straight into the section body with the section owner values', async () => {
        const renderSlot = vi.fn(() => h("span", null, ["row"]));
        const dismissOverlay = vi.fn<() => void>();
        render(h(Fragment, null, [h(EnvironmentSection, { presentation: 'overlay', dismissOverlay, renderSlot } as Pick<EnvironmentSectionProps, 'presentation' | 'dismissOverlay' | 'renderSlot'> as EnvironmentSectionProps)]));
        expect(renderSlot).toHaveBeenCalledWith('conversation.session.panel.environment.row', { presentation: 'overlay', dismissOverlay });
        expect(screen.getByText('row')).toBeTruthy();
    });
});
describe('ProjectRow', () => {
    function scopedSelectorOf<T>(value: T) {
        const source = { getSnapshot: () => value, subscribe: () => () => {} };
        return bindSnapshotSelector(source);
    }
    function rowProps(over: {
        workingDirectory?: string | null;
        workspacePath?: string;
        cwd?: string;
        home?: string;
    }, open = vi.fn()) {
        const renderFactorySlot = vi.fn((_name: string, input: {
            label: string;
        }) => h("button", { "type": "button" }, [input.label]));
        const props = {
            sessionId: SID,
            useProjection: (key: string) => scopedSelectorOf(over.workingDirectory)(value => key === 'workingDirectory' ? value : undefined),
            useWorkspaces: scopedSelectorOf({
                items: over.workspacePath === undefined ? [] : [{ path: over.workspacePath, sessionIds: [SID] }],
            }),
            useSessions: scopedSelectorOf({ byId: over.cwd === undefined ? {} : { [SID]: { cwd: over.cwd } } }),
            useHost: scopedSelectorOf({ home: over.home, isLoopback: true }),
            useContextMenu: contextMenuHook(open),
            renderFactorySlot,
            t,
        } as ProjectRowProps;
        return { props, renderFactorySlot, open };
    }
    function folderOf(container: HTMLElement): {
        name: string | null;
        parent: string | null;
    } {
        const folder = container.querySelector('[data-session-panel-project] [tabindex="0"]') as HTMLElement;
        const [name, parent] = [...folder.children];
        return { name: name?.textContent ?? null, parent: parent?.textContent ?? null };
    }
    it('follows working directory updates while mounted and releases the observer on unmount', async () => {
        let directory = '/srv/first';
        const listeners = new Set<() => void>();
        const projection = bindSnapshotSelector({
            getSnapshot: () => directory,
            subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
        });
        const { props } = rowProps({ cwd: '/srv/fallback' });
        const view = render(h(ProjectRow, { ...props, useProjection: (key: string) => projection(value => key === 'workingDirectory' ? value : undefined) }));
        expect(folderOf(view.container)).toEqual({ name: 'first', parent: '/srv' });
        expect(listeners.size).toBe(1);
        await act(() => { directory = '/srv/second'; for (const listener of listeners) listener(); });
        expect(folderOf(view.container)).toEqual({ name: 'second', parent: '/srv' });
        view.unmount();
        expect(listeners.size).toBe(0);
    });
    it('shows the working directory as its name and parent folder, with the label and full path in the tooltip', async () => {
        const { props, renderFactorySlot } = rowProps({
            workingDirectory: '/Users/me/projects/app/.worktrees/fix',
            cwd: '/Users/me/projects/app',
            workspacePath: '/Users/me/projects/app',
            home: '/Users/me',
        });
        const view = render(h(ProjectRow, { ...props }));
        expect(folderOf(view.container)).toEqual({ name: 'fix', parent: '~/projects/app/.worktrees' });
        fireEvent.keyDown(document.body, { key: 'Tab' });
        await act(() => { fireEvent.focus(view.container.querySelector('[data-session-panel-project] [tabindex="0"]') as HTMLElement); });
        expect(screen.getByRole('tooltip', { hidden: true }).textContent).toBe('工作目录\n~/projects/app/.worktrees/fix');
        await act(() => { fireEvent.blur(view.container.querySelector('[data-session-panel-project] [tabindex="0"]') as HTMLElement); });
        expect(await tooltipAfterHover(view.container.querySelector('[data-session-panel-project] [tabindex="0"]') as HTMLElement))
            .toEqual({ early: false, at500: true });
        expect(renderFactorySlot).toHaveBeenCalledWith('contextMenu.button', expect.objectContaining({
            target: { kind: 'directory', value: { sessionId: SID, path: '/Users/me/projects/app/.worktrees/fix' } },
            label: '工作目录操作',
        }));
        expect(renderFactorySlot.mock.calls[0]?.[1]).not.toHaveProperty('size');
        expect(screen.getByRole('button', { name: '工作目录操作' })).toBeTruthy();
    });
    it('marks its parts for the panel\'s row rules: icon and folder in the body, then the More button as the row menu', async () => {
        const view = render(h(ProjectRow, { ...rowProps({ cwd: '/srv/app' }).props }));
        const row = view.container.querySelector('[data-session-panel-row]') as HTMLElement;
        expect(row.hasAttribute('data-session-panel-project')).toBe(true);
        expect([...row.children].map(part => part.getAttribute('data-row-part'))).toEqual(['body', 'menu']);
        const [body, menu] = [...row.children] as [
            HTMLElement,
            HTMLElement
        ];
        expect(body.tagName).toBe('SPAN');
        expect([...body.children].map(part => part.getAttribute('data-row-part'))).toEqual(['icon', 'content']);
        expect(body.children[0]?.getAttribute('aria-hidden')).toBe('true');
        expect(body.children[1]?.textContent).toBe('app/srv');
        expect(menu.querySelector('button')?.textContent).toBe('工作目录操作');
    });
    it('falls back to the directory the Session was created in and opens the directory menu on right-click', async () => {
        const { props, open } = rowProps({ cwd: '/srv/app', workspacePath: '/srv' });
        const view = render(h(ProjectRow, { ...props }));
        expect(folderOf(view.container)).toEqual({ name: 'app', parent: '/srv' });
        fireEvent.contextMenu(view.container.querySelector('[data-session-panel-project]') as HTMLElement);
        expect(open).toHaveBeenCalledWith({ kind: 'directory', value: { sessionId: SID, path: '/srv/app' } }, expect.anything());
    });
    it('falls back to the listing Workspace when no directory is recorded, keeping a root parent and omitting an absent one', async () => {
        const atRoot = render(h(ProjectRow, { ...rowProps({ workingDirectory: null, workspacePath: '/srv' }).props }));
        expect(folderOf(atRoot.container)).toEqual({ name: 'srv', parent: '/' });
        atRoot.unmount();
        const atHome = render(h(ProjectRow, { ...rowProps({ workingDirectory: '/Users/me', home: '/Users/me' }).props }));
        expect(folderOf(atHome.container)).toEqual({ name: '~', parent: null });
    });
    it('renders nothing before the Session directory is known', async () => {
        const { props } = rowProps({});
        const view = render(h(ProjectRow, { ...props }));
        expect(view.container.children).toHaveLength(0);
        expect(view.container.textContent).toBe('');
    });
});
describe('PanelFold', () => {
    type FoldProps = FactoryComponentPropsOf<'conversation.session.panel.fold'>;
    /** Render the control with the props a list passes; the renderer's standard seats are left out, as the control reads none. */
    function fold(expanded: boolean) {
        const onToggle = vi.fn<() => void>();
        const props = {
            expanded, onToggle,
            label: expanded ? 'Show less' : 'Show 14 more',
            name: expanded ? 'Show less (subagents)' : 'Show 14 more (subagents)',
        } as Pick<FoldProps, 'expanded' | 'label' | 'name' | 'onToggle'> as FoldProps;
        const view = render(h(PanelFold, { ...props }));
        return { onToggle, row: view.container.firstElementChild as HTMLElement };
    }
    it('is a panel row whose body is the button, with a down chevron in the icon part while rows are held back', async () => {
        const { row, onToggle } = fold(false);
        expect(row.getAttribute('data-session-panel-row')).toBe('fold');
        expect([...row.children].map(part => `${part.tagName}:${part.getAttribute('data-row-part') ?? ''}`)).toEqual(['BUTTON:body']);
        const button = screen.getByRole('button', { name: 'Show 14 more (subagents)' });
        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect([...button.children].map(part => part.getAttribute('data-row-part'))).toEqual(['icon', 'content']);
        expect(button.children[0]?.getAttribute('aria-hidden')).toBe('true');
        expect(button.querySelector('svg')?.getAttribute('data-icon')).toBe('dsw-icon-chevron-down-outline-regular');
        expect(button.children[1]?.textContent).toBe('Show 14 more');
        await act(() => { fireEvent.click(button); });
        expect(onToggle).toHaveBeenCalledOnce();
    });
    it('points the chevron up and reports expanded once the list shows every row', async () => {
        const { row } = fold(true);
        const button = screen.getByRole('button', { name: 'Show less (subagents)' });
        expect(button.getAttribute('aria-expanded')).toBe('true');
        expect(row.querySelector('svg')?.getAttribute('data-icon')).toBe('dsw-icon-chevron-up-outline-regular');
        expect(row.querySelector('[data-row-part="content"]')?.textContent).toBe('Show less');
    });
});
describe('PanelDetails', () => {
    /** Render the details with the props a row passes; the renderer's standard seats are left out, as the details read none. */
    function details(input: PanelDetailsProps): HTMLElement {
        const view = render(h(PanelDetails, { ...input as FactoryComponentPropsOf<'conversation.session.panel.details'> }));
        return view.container.querySelector('[data-session-panel-details]') as HTMLElement;
    }
    it('stacks the title, lines, state, and measures in order, each measure after the icon of its kind', async () => {
        const root = details({
            title: 'Survey open-source harnesses',
            lines: ['Owner: open-source-arch'],
            status: { state: 'done', label: 'Completed' },
            facts: [{ kind: 'tokens', label: '3.3M tok' }, { kind: 'duration', label: '6m 56s' }],
        });
        expect([...root.children].map(child => child.textContent))
            .toEqual(['Survey open-source harnesses', 'Owner: open-source-arch', 'Completed', '3.3M tok6m 56s']);
        expect(root.children[2]?.querySelector('[data-state="done"]')).not.toBeNull();
        const facts = [...(root.children[3] as HTMLElement).children];
        expect(facts.map(fact => [fact.getAttribute('data-fact'), fact.querySelector('svg')?.getAttribute('data-icon')])).toEqual([
            ['tokens', 'dsw-icon-database-outline-regular'],
            ['duration', 'dsw-icon-clock-outline-regular'],
        ]);
        expect(facts.every(fact => fact.firstElementChild?.getAttribute('aria-hidden') === 'true')).toBe(true);
    });
    it('renders only the title when nothing else is given', async () => {
        expect(details({ title: 'sleep 30' }).children).toHaveLength(1);
    });
    it('starts with the lines when the title is omitted', async () => {
        const root = details({ lines: ['bash'], status: { state: 'ongoing', label: 'running' } });
        expect([...root.children].map(child => child.textContent)).toEqual(['bash', 'running']);
    });
});
describe('dictionaries', () => {
    it('keeps the English dictionary key-identical to the Chinese source of truth', async () => {
        expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
    });
});
