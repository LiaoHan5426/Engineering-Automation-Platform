// @vitest-environment jsdom
import { h as vueH, Fragment, defineComponent } from 'vue';
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
/** Global panel rows and DOM focus through the production slot renderer. */
import type { Context } from '@deepseek-ai/cordis';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, waitFor, within } from '@testing-library/dom';
import { act, cleanup } from '../../../test-support/client-runtime/src/vue-test.ts';
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime';
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client';
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts';
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts';
import { IconGlobeOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ILayout, MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type { PropsRenderFactories, PropsRenderSlots, PropsRuntime, SlotLabel } from '@deepseek-ai/dsh-client-ui-slots';
import type { TrackProductEvent } from '@deepseek-ai/dsh-client-product-analytics/client';
import { apply, inject } from '../src/client/index.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'sidebar-panel-test': 'alpha';
    }
}
const ALPHA = 'sidebar-test-alpha' as MainPanelId;
const BETA = 'sidebar-test-beta' as MainPanelId;
const PLUGINS = 'plugins' as MainPanelId;
const SCHEDULES = 'schedules' as MainPanelId;
const runtimes = new Set<SlotTestRuntime>();
afterEach(async () => {
    try {
        for (const runtime of runtimes)
            await runtime.dispose();
    }
    finally {
        runtimes.clear();
        cleanup();
        localStorage.clear();
    }
});
async function bench(collapsed = false, track?: TrackProductEvent) {
    const runtime = await SlotTestRuntime.create();
    runtimes.add(runtime);
    const locale = new LocaleRuntime(runtime.ctx);
    locale.setLocale('en');
    const layout = {
        panelInfo: runtime.panelInfo,
        beginNavigation: vi.fn(() => new AbortController().signal),
        toggleSidebar: vi.fn(),
        selectPanel: vi.fn((activePanelId: MainPanelId | null) => { runtime.panelInfo.set({ activePanelId }); }),
        openRightbar: vi.fn(),
        closeRightbar: vi.fn(),
    } satisfies ILayout;
    await runtime.mount({
        inject: ['slots'],
        apply(ctx: Context) {
            ctx.provide('shortcuts', { catalog: createSnapshotStore([]) } as never);
            ctx.provide('layout', layout);
            ctx.provide('uiWorkspace', { startSession: vi.fn() } as never);
            ctx.provide('locale', locale);
            if (track !== undefined)
                ctx.provide('productAnalytics', { track } as never);
            ctx.effect(() => locale.register('common', { zh: commonZh, en: commonEn }), 'panel test: common locale');
            ctx.effect(() => locale.register('sidebar-panel-test', {
                zh: { alpha: '甲面板' }, en: { alpha: 'Alpha panel' },
            }), 'panel test: panel locale');
            ctx.slots.installLocale(locale);
            ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'conversation' }, () => (vueH("p", null, ["Conversation content"]))));
        },
    });
    const Frame = defineComponent((props: PropsRuntime<'root'> & PropsRenderSlots<'sidebar' | 'main'> & PropsRenderFactories) => {
        const activePanelId = props.usePanelInfo(info => info.activePanelId);
        return () => { const { renderSlot } = props;
        return (vueH(Fragment, null, [vueH("aside", null, [renderSlot('sidebar', { collapsed, width: collapsed ? 56 : 300, drawer: false })]), vueH("main", null, [renderSlot('main', {}, { entryKey: activePanelId.value ?? 'conversation' })])]));
    }}, {props: ['usePanelInfo','renderSlot'], inheritAttrs:false});
    await runtime.root.declare({
        sidebar: { kind: 'single', scope: 'root' },
        main: { kind: 'keyed', scope: 'root' },
    }, Frame);
    const sidebar = await runtime.mount({ inject: [...inject], apply });
    const view = runtime.renderRoot();
    return { runtime, locale, layout, sidebar, view };
}
/** A More menu occupant that exposes each owner callback as a plain button. */
function ProbeActions({ entries, onOpen, onPinnedChange, onDismiss }: PropsRuntime<'sidebar.panellist.actions'>) {
    return (vueH(Fragment, null, [entries.map(entry => (vueH("span", { "key": entry.id }, [vueH("button", { "type": "button", "role": "menuitem", "aria-current": entry.active ? 'page' : undefined, "onClick": () => { onOpen(entry.id); } }, [`Open ${entry.label}`]), vueH("button", { "type": "button", "role": "menuitem", "onClick": () => { onPinnedChange(entry.id, !entry.pinned); } }, [`${entry.pinned ? 'Unpin' : 'Pin'} ${entry.label}`])]))), vueH("button", { "type": "button", "role": "menuitem", "onClick": onDismiss }, ["Dismiss"])]));
}
/** Requests a panel id that the test unregisters while the menu is open. */
function StaleOpen({ onOpen }: PropsRuntime<'sidebar.panellist.actions'>) {
    return vueH("button", { "type": "button", "role": "menuitem", "onClick": () => { onOpen(ALPHA); } }, ["Open removed panel"]);
}
/** Requests the official panels by id, including Plugins, which the menu entries omit. */
function OfficialOpen({ onOpen }: PropsRuntime<'sidebar.panellist.actions'>) {
    return (vueH(Fragment, null, [vueH("button", { "type": "button", "role": "menuitem", "onClick": () => { onOpen(PLUGINS); } }, ["Open Plugins by id"]), vueH("button", { "type": "button", "role": "menuitem", "onClick": () => { onOpen(SCHEDULES); } }, ["Open Automation by id"])]));
}
async function mountProbeActions(runtime: SlotTestRuntime, id = 'probe', component = ProbeActions) {
    return runtime.mount({
        inject: ['slots'],
        apply(ctx: Context) {
            ctx.slots.inject('sidebar.panellist.actions', () => ctx.slots.register({ name: 'sidebar.panellist.actions', id }, component));
        },
    });
}
interface TestPanel {
    id: MainPanelId;
    heading: string;
    order?: number;
    label?: SlotLabel;
}
async function mountPanel(runtime: SlotTestRuntime, { heading, ...metadata }: TestPanel) {
    function Icon({ size, active }: PropsRuntime<'sidebar.panellist'>) {
        return (vueH("span", { "data-testid": `${metadata.id}-icon`, "data-active": active }, [vueH(IconGlobeOutlineRegular, { "size": size }, { default: () => [] })]));
    }
    function Body() {
        return (vueH("section", null, [vueH("h1", null, [heading]), vueH("input", { "aria-label": `${heading} input` }, []), vueH("button", { "type": "button" }, [`${heading} action`])]));
    }
    return runtime.mount({
        inject: ['slots'],
        apply(ctx: Context) {
            ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: metadata.id }, Body));
            ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', ...metadata }, Icon));
        },
    });
}
async function mountPanels(runtime: SlotTestRuntime, locale: LocaleRuntime, betaOrder = 10) {
    const t = locale.bind('sidebar-panel-test');
    const alpha = await mountPanel(runtime, { id: ALPHA, heading: 'Alpha content', label: () => t('alpha'), order: 20 });
    const beta = await mountPanel(runtime, { id: BETA, heading: 'Beta content', label: 'Beta panel', order: betaOrder });
    return { alpha, beta };
}
describe('sidebar global panels', () => {
    it('adds late registrations, removes each plugin contribution, and leaves no empty panel-list DOM', async () => {
        const { runtime, locale, view } = await bench();
        expect(runtime.slots.entries('sidebar.panellist')).toEqual([]);
        expect(view.queryByRole('navigation')).toBeNull();
        expect(view.container.querySelector('[data-slot="sidebar.panellist"]')).toBeNull();
        expect(view.getByText('Conversation content')).toBeTruthy();
        const { alpha, beta } = await mountPanels(runtime, locale);
        const navigation = await view.findByRole('navigation', { name: 'Global panels' });
        expect(within(navigation).getAllByRole('button')).toHaveLength(2);
        await act(async () => fireEvent.click(within(navigation).getByRole('button', { name: 'Alpha panel' })));
        expect(view.getByRole('heading', { name: 'Alpha content' })).toBeTruthy();
        await alpha.dispose();
        await waitFor(() => {
            expect(view.queryByRole('button', { name: 'Alpha panel' })).toBeNull();
            expect(view.queryByRole('heading', { name: 'Alpha content' })).toBeNull();
        });
        expect(runtime.slots.entries('main').map(entry => entry.options.key)).toEqual(['conversation', BETA]);
        await act(async () => fireEvent.click(within(navigation).getByRole('button', { name: 'Beta panel' })));
        expect(view.getByRole('heading', { name: 'Beta content' })).toBeTruthy();
        await beta.dispose();
        await waitFor(() => { expect(view.queryByRole('navigation')).toBeNull(); });
        expect(view.queryByRole('heading', { name: 'Beta content' })).toBeNull();
        expect(view.container.querySelector('[data-slot="sidebar.panellist"]')).toBeNull();
        expect(runtime.slots.entries('sidebar.panellist')).toEqual([]);
        expect(runtime.slots.entries('main').map(entry => entry.options.key)).toEqual(['conversation']);
    });
    it.each([false, true])('renders ordered rows, icon sizes, and tooltip labels with collapsed=%s', async (collapsed) => {
        const { runtime, locale, view } = await bench(collapsed);
        await mountPanels(runtime, locale);
        const navigation = await view.findByRole('navigation', { name: 'Global panels' });
        const rows = within(navigation).getAllByRole('button');
        expect(rows.map(row => row.getAttribute('aria-label'))).toEqual(['Beta panel', 'Alpha panel']);
        for (const [id, label] of [[BETA, 'Beta panel'], [ALPHA, 'Alpha panel']] as const) {
            const row = within(navigation).getByRole('button', { name: label });
            expect(row.getAttribute('aria-current')).toBeNull();
            expect(row.textContent).toBe(collapsed ? '' : label);
            expect(row.querySelectorAll('svg')).toHaveLength(1);
            const icon = within(row).getByTestId(`${id}-icon`);
            expect(icon.getAttribute('data-active')).toBe('false');
            expect(icon.querySelector('svg')?.getAttribute('width')).toBe(collapsed ? '18' : '16');
            expect(icon.querySelector('svg')?.getAttribute('height')).toBe(collapsed ? '18' : '16');
            await act(() => { row.focus(); });
            expect(document.activeElement).toBe(row);
            if (collapsed)
                expect(view.getByRole('tooltip').textContent).toBe(label);
            else
                expect(view.queryByRole('tooltip')).toBeNull();
            await act(() => { row.blur(); });
            expect(document.activeElement).not.toBe(row);
            expect(view.queryByRole('tooltip')).toBeNull();
        }
    });
    it('keeps registration order when panel rows have equal order', async () => {
        const { runtime, locale, view } = await bench();
        await mountPanels(runtime, locale, 20);
        const navigation = await view.findByRole('navigation', { name: 'Global panels' });
        expect(within(navigation).getAllByRole('button').map(row => row.textContent)).toEqual(['Alpha panel', 'Beta panel']);
    });
    it('selects registered main content and keeps a repeated selection active', async () => {
        const { runtime, locale, layout, view } = await bench();
        await mountPanels(runtime, locale);
        const navigation = await view.findByRole('navigation', { name: 'Global panels' });
        const alpha = within(navigation).getByRole('button', { name: 'Alpha panel' });
        const beta = within(navigation).getByRole('button', { name: 'Beta panel' });
        await act(async () => fireEvent.click(alpha));
        expect(layout.selectPanel).toHaveBeenLastCalledWith(ALPHA);
        expect(runtime.panelInfo.getSnapshot()).toEqual({ activePanelId: ALPHA });
        expect(alpha.getAttribute('aria-current')).toBe('page');
        expect(beta.getAttribute('aria-current')).toBeNull();
        expect(within(alpha).getByTestId(`${ALPHA}-icon`).getAttribute('data-active')).toBe('true');
        expect(view.getByRole('heading', { name: 'Alpha content' })).toBeTruthy();
        expect(view.queryByRole('heading', { name: 'Beta content' })).toBeNull();
        await act(async () => fireEvent.click(alpha));
        expect(layout.selectPanel).toHaveBeenLastCalledWith(ALPHA);
        expect(alpha.getAttribute('aria-current')).toBe('page');
        expect(view.getByRole('heading', { name: 'Alpha content' })).toBeTruthy();
        await act(async () => fireEvent.click(beta));
        expect(layout.selectPanel).toHaveBeenLastCalledWith(BETA);
        expect(runtime.panelInfo.getSnapshot()).toEqual({ activePanelId: BETA });
        expect(alpha.getAttribute('aria-current')).toBeNull();
        expect(beta.getAttribute('aria-current')).toBe('page');
        expect(within(alpha).getByTestId(`${ALPHA}-icon`).getAttribute('data-active')).toBe('false');
        expect(within(beta).getByTestId(`${BETA}-icon`).getAttribute('data-active')).toBe('true');
        expect(view.queryByRole('heading', { name: 'Alpha content' })).toBeNull();
        expect(view.getByRole('heading', { name: 'Beta content' })).toBeTruthy();
    });
    it('refreshes locale labels without re-registering icons or changing plain labels', async () => {
        const { runtime, locale, view } = await bench();
        await mountPanels(runtime, locale);
        const navigation = await view.findByRole('navigation', { name: 'Global panels' });
        const entries = runtime.slots.entries('sidebar.panellist');
        await act(() => { locale.setLocale('zh'); });
        await waitFor(() => {
            expect(within(navigation).getByRole('button', { name: '甲面板' }).textContent).toBe('甲面板');
        });
        expect(within(navigation).getByRole('button', { name: 'Beta panel' }).textContent).toBe('Beta panel');
        expect(runtime.slots.entries('sidebar.panellist')).toBe(entries);
    });
    it('uses an omitted label and order as the panel id and order zero', async () => {
        const { runtime, view } = await bench();
        await mountPanel(runtime, { id: ALPHA, heading: 'Alpha content', label: 'Alpha panel', order: 20 });
        await mountPanel(runtime, { id: BETA, heading: 'Beta content' });
        const navigation = await view.findByRole('navigation', { name: 'Global panels' });
        expect(within(navigation).getAllByRole('button').map(row => row.textContent)).toEqual([BETA, 'Alpha panel']);
        await act(async () => fireEvent.click(within(navigation).getByRole('button', { name: BETA })));
        expect(view.getByRole('heading', { name: 'Beta content' })).toBeTruthy();
    });
    it.each([false, true])('keeps main selection while DOM focus moves between controls with collapsed=%s', async (collapsed) => {
        const { runtime, locale, layout, view } = await bench(collapsed);
        await mountPanels(runtime, locale);
        const navigation = await view.findByRole('navigation', { name: 'Global panels' });
        const alpha = within(navigation).getByRole('button', { name: 'Alpha panel' });
        const beta = within(navigation).getByRole('button', { name: 'Beta panel' });
        await act(() => { alpha.focus(); });
        expect(document.activeElement).toBe(alpha);
        expect(runtime.panelInfo.getSnapshot()).toEqual({ activePanelId: null });
        expect(alpha.getAttribute('aria-current')).toBeNull();
        expect(layout.selectPanel).not.toHaveBeenCalled();
        await act(async () => fireEvent.click(alpha));
        const selected = runtime.panelInfo.getSnapshot();
        const textbox = view.getByRole('textbox', { name: 'Alpha content input' });
        const action = view.getByRole('button', { name: 'Alpha content action' });
        for (const target of [textbox, action, beta, alpha]) {
            await act(() => { target.focus(); });
            expect(document.activeElement).toBe(target);
            expect(runtime.panelInfo.getSnapshot()).toBe(selected);
            expect(alpha.getAttribute('aria-current')).toBe('page');
            expect(beta.getAttribute('aria-current')).toBeNull();
            expect(view.getByRole('heading', { name: 'Alpha content' })).toBeTruthy();
            expect(view.queryByRole('heading', { name: 'Beta content' })).toBeNull();
        }
        expect(layout.selectPanel).toHaveBeenCalledExactlyOnceWith(ALPHA);
    });
    it('disposes the sidebar while retaining independently owned main panel bodies', async () => {
        const { runtime, locale, sidebar, view } = await bench();
        await mountPanels(runtime, locale);
        await act(async () => fireEvent.click(await view.findByRole('button', { name: 'Alpha panel' })));
        await sidebar.dispose();
        expect(view.queryByRole('navigation')).toBeNull();
        expect(runtime.slots.spec('sidebar.panellist')).toBeUndefined();
        expect(runtime.slots.entries('sidebar.panellist')).toEqual([]);
        expect(view.getByRole('heading', { name: 'Alpha content' })).toBeTruthy();
        await act(() => { locale.setLocale('zh'); });
        expect(view.queryByRole('navigation')).toBeNull();
        await runtime.mount({ inject: [...inject], apply });
        const restored = await view.findByRole('button', { name: '甲面板' });
        expect(restored.getAttribute('aria-current')).toBe('page');
        const icon = within(restored).getByTestId(`${ALPHA}-icon`);
        expect(icon.getAttribute('data-active')).toBe('true');
        expect(icon.querySelector('svg')?.getAttribute('width')).toBe('16');
        expect(runtime.slots.entries('sidebar.panellist').map(entry => entry.options.id)).toEqual([BETA, ALPHA]);
    });
});
describe('sidebar launcher pins', () => {
    const PINS_KEY = 'dsh.slot.manual-order.sidebar.panellist.v1';
    it('ignores stored unpinned panels and shows all registered launchers', async () => {
        localStorage.setItem(PINS_KEY, JSON.stringify({ unpinned: [ALPHA, BETA, PLUGINS, 'removed-plugin'] }));
        const { runtime, locale, view } = await bench();
        await mountPanels(runtime, locale);
        const navigation = await view.findByRole('navigation', { name: 'Global panels' });
        expect(within(navigation).getAllByRole('button').map(row => row.textContent)).toEqual(['Beta panel', 'Alpha panel']);
        await mountPanel(runtime, { id: PLUGINS, heading: 'Plugins content', label: 'Plugins', order: 0 });
        await waitFor(() => {
            expect(within(navigation).getAllByRole('button').map(row => row.textContent)).toEqual(['Plugins', 'Beta panel', 'Alpha panel']);
        });
        expect(runtime.slots.entries('main').map(entry => entry.options.key)).toEqual(['conversation', ALPHA, BETA, PLUGINS]);
    });
    it('shows every panel when the stored list is not a string array', async () => {
        localStorage.setItem(PINS_KEY, JSON.stringify({ unpinned: [ALPHA, 1] }));
        const { runtime, locale, view } = await bench();
        await mountPanels(runtime, locale);
        const navigation = await view.findByRole('navigation', { name: 'Global panels' });
        expect(within(navigation).getAllByRole('button').map(row => row.textContent)).toEqual(['Beta panel', 'Alpha panel']);
    });
    it('shows More and hides unpinned rows only while the actions list has registrations', async () => {
        const { runtime, locale, view } = await bench();
        const probe = await mountProbeActions(runtime);
        expect(view.queryByRole('navigation')).toBeNull();
        await mountPanels(runtime, locale);
        const navigation = await view.findByRole('navigation', { name: 'Global panels' });
        expect(within(navigation).getAllByRole('button').map(row => row.getAttribute('aria-label')))
            .toEqual(['Beta panel', 'Unpin Beta panel from sidebar', 'Alpha panel', 'Unpin Alpha panel from sidebar', 'More']);
        await act(async () => fireEvent.click(within(navigation).getByRole('button', { name: 'Unpin Alpha panel from sidebar' })));
        expect(within(navigation).queryByRole('button', { name: 'Alpha panel' })).toBeNull();
        expect(document.activeElement).toBe(within(navigation).getByRole('button', { name: 'More' }));
        await probe.dispose();
        await waitFor(() => { expect(within(navigation).queryByRole('button', { name: 'More' })).toBeNull(); });
        expect(within(navigation).getAllByRole('button').map(row => row.getAttribute('aria-label'))).toEqual(['Beta panel', 'Alpha panel']);
        await mountProbeActions(runtime);
        await waitFor(() => { expect(within(navigation).queryByRole('button', { name: 'Alpha panel' })).toBeNull(); });
        expect(within(navigation).getByRole('button', { name: 'More' })).toBeTruthy();
    });
    it.each([false, true])('opens, pins, and dismisses through the More menu with collapsed=%s', async (collapsed) => {
        const { runtime, locale, layout, view } = await bench(collapsed);
        await mountPanels(runtime, locale);
        await mountPanel(runtime, { id: PLUGINS, heading: 'Plugins content', label: 'Plugins', order: 0 });
        await mountProbeActions(runtime);
        const navigation = await view.findByRole('navigation', { name: 'Global panels' });
        const more = await within(navigation).findByRole('button', { name: 'More' });
        expect(more.textContent).toBe(collapsed ? '' : 'More');
        expect(more.getAttribute('aria-haspopup')).toBe('menu');
        await act(async () => fireEvent.click(more));
        expect(more.getAttribute('aria-expanded')).toBe('true');
        const menu = within(view.getByRole('menu'));
        expect(menu.getAllByRole('menuitem').map(row => row.textContent))
            .toEqual(['Open Beta panel', 'Unpin Beta panel', 'Open Alpha panel', 'Unpin Alpha panel', 'Dismiss']);
        await act(async () => fireEvent.click(menu.getByRole('menuitem', { name: 'Unpin Alpha panel' })));
        expect(localStorage.getItem(PINS_KEY)).toBeNull();
        await waitFor(() => { expect(within(navigation).queryByRole('button', { name: 'Alpha panel' })).toBeNull(); });
        expect(menu.getByRole('menuitem', { name: 'Pin Alpha panel' })).toBeTruthy();
        await act(async () => fireEvent.click(menu.getByRole('menuitem', { name: 'Open Alpha panel' })));
        expect(layout.selectPanel).toHaveBeenLastCalledWith(ALPHA);
        expect(view.getByRole('heading', { name: 'Alpha content' })).toBeTruthy();
        await waitFor(() => { expect(within(navigation).queryByRole('button', { name: 'Alpha panel' })).toBeNull(); });
        await act(async () => fireEvent.click(menu.getByRole('menuitem', { name: 'Pin Alpha panel' })));
        const alphaRow = await within(navigation).findByRole('button', { name: 'Alpha panel' });
        expect(alphaRow.getAttribute('aria-current')).toBe('page');
        await act(async () => fireEvent.click(menu.getByRole('menuitem', { name: 'Unpin Beta panel' })));
        await act(async () => fireEvent.click(menu.getByRole('menuitem', { name: 'Pin Beta panel' })));
        expect(within(navigation).getAllByRole('button').map(row => row.getAttribute('aria-label'))
            .filter(label => !label?.startsWith('Unpin ')))
            .toEqual(['Plugins', 'Beta panel', 'Alpha panel', 'More']);
        await act(async () => fireEvent.click(menu.getByRole('menuitem', { name: 'Unpin Alpha panel' })));
        await waitFor(() => { expect(within(navigation).queryByRole('button', { name: 'Alpha panel' })).toBeNull(); });
        expect(view.getByRole('heading', { name: 'Alpha content' })).toBeTruthy();
        expect(menu.getByRole('menuitem', { name: 'Open Alpha panel' }).getAttribute('aria-current')).toBe('page');
        await act(() => { layout.selectPanel(BETA); });
        await waitFor(() => {
            expect(menu.getByRole('menuitem', { name: 'Open Alpha panel' }).hasAttribute('aria-current')).toBe(false);
            expect(menu.getByRole('menuitem', { name: 'Open Beta panel' }).getAttribute('aria-current')).toBe('page');
        });
        await waitFor(() => { expect(within(navigation).queryByRole('button', { name: 'Alpha panel' })).toBeNull(); });
        await act(async () => fireEvent.click(menu.getByRole('menuitem', { name: 'Pin Alpha panel' })));
        await waitFor(() => { expect(within(navigation).getByRole('button', { name: 'Alpha panel' })).toBeTruthy(); });
        await act(async () => fireEvent.click(menu.getByRole('menuitem', { name: 'Dismiss' })));
        expect(view.queryByRole('menu')).toBeNull();
        expect(more.getAttribute('aria-expanded')).toBe('false');
    });
    it('ignores an open request for a panel that is no longer registered', async () => {
        const { runtime, locale, layout, view } = await bench();
        const { alpha } = await mountPanels(runtime, locale);
        await runtime.mount({
            inject: ['slots'],
            apply(ctx: Context) {
                ctx.slots.inject('sidebar.panellist.actions', () => ctx.slots.register({ name: 'sidebar.panellist.actions', id: 'stale' }, StaleOpen));
            },
        });
        await act(async () => fireEvent.click(await view.findByRole('button', { name: 'More' })));
        await alpha.dispose();
        await act(async () => fireEvent.click(view.getByRole('menuitem', { name: 'Open removed panel' })));
        expect(layout.selectPanel).not.toHaveBeenCalled();
    });
});
describe('sidebar entry click analytics', () => {
    const MORE_CLICK = ['sidebar_menu_click', { menu_name: 'more', position: 'sidebar' }];
    async function analyticsBench() {
        const track = vi.fn<TrackProductEvent>();
        const b = await bench(false, track);
        await mountPanels(b.runtime, b.locale);
        await mountPanel(b.runtime, { id: PLUGINS, heading: 'Plugins content', label: 'Plugins', order: 0 });
        const schedules = await mountPanel(b.runtime, { id: SCHEDULES, heading: 'Automation content', label: 'Automation', order: 5 });
        const navigation = await b.view.findByRole('navigation', { name: 'Global panels' });
        await within(navigation).findByRole('button', { name: 'Automation' });
        return { ...b, track, schedules, navigation };
    }
    it('reports the Plugins and Automation rows and leaves other panel rows unreported', async () => {
        const { layout, track, navigation } = await analyticsBench();
        for (const name of ['Plugins', 'Automation', 'Alpha panel', 'Beta panel']) {
            await act(async () => fireEvent.click(within(navigation).getByRole('button', { name })));
        }
        expect(track.mock.calls).toEqual([
            ['sidebar_menu_click', { menu_name: 'plugin', position: 'sidebar' }],
            ['sidebar_menu_click', { menu_name: 'cron', position: 'sidebar' }],
        ]);
        expect(layout.selectPanel.mock.calls).toEqual([[PLUGINS], [SCHEDULES], [ALPHA], [BETA]]);
        expect(track.mock.invocationCallOrder[0]).toBeLessThan(layout.selectPanel.mock.invocationCallOrder[0]!);
    });
    it('reports every More button click, whether it opens or closes the menu', async () => {
        const { runtime, track, navigation } = await analyticsBench();
        await mountProbeActions(runtime);
        const more = await within(navigation).findByRole('button', { name: 'More' });
        await act(async () => fireEvent.click(more));
        expect(more.getAttribute('aria-expanded')).toBe('true');
        await act(async () => fireEvent.click(more));
        expect(more.getAttribute('aria-expanded')).toBe('false');
        await act(async () => fireEvent.click(more));
        expect(track.mock.calls).toEqual([MORE_CLICK, MORE_CLICK, MORE_CLICK]);
    });
    it('reports official panels opened from the More menu at the sidebar_more position', async () => {
        const { runtime, layout, track, navigation, view } = await analyticsBench();
        await mountProbeActions(runtime);
        await mountProbeActions(runtime, 'official', OfficialOpen);
        await act(async () => fireEvent.click(await within(navigation).findByRole('button', { name: 'More' })));
        const menu = within(view.getByRole('menu'));
        await act(async () => fireEvent.click(menu.getByRole('menuitem', { name: 'Open Automation' })));
        await act(async () => fireEvent.click(menu.getByRole('menuitem', { name: 'Open Alpha panel' })));
        await act(async () => fireEvent.click(menu.getByRole('menuitem', { name: 'Open Plugins by id' })));
        expect(track.mock.calls).toEqual([
            MORE_CLICK,
            ['sidebar_menu_click', { menu_name: 'cron', position: 'sidebar_more' }],
            ['sidebar_menu_click', { menu_name: 'plugin', position: 'sidebar_more' }],
        ]);
        expect(layout.selectPanel.mock.calls).toEqual([[SCHEDULES], [ALPHA], [PLUGINS]]);
    });
    it('reports an official menu request whose panel unregistered without selecting it', async () => {
        const { runtime, layout, track, schedules, navigation, view } = await analyticsBench();
        await mountProbeActions(runtime, 'official', OfficialOpen);
        await act(async () => fireEvent.click(await within(navigation).findByRole('button', { name: 'More' })));
        await schedules.dispose();
        await waitFor(() => { expect(within(navigation).queryByRole('button', { name: 'Automation' })).toBeNull(); });
        await act(async () => fireEvent.click(view.getByRole('menuitem', { name: 'Open Automation by id' })));
        expect(track).toHaveBeenLastCalledWith('sidebar_menu_click', { menu_name: 'cron', position: 'sidebar_more' });
        expect(layout.selectPanel).not.toHaveBeenCalled();
    });
});
