import { h, computed, ref } from 'vue';
// @vitest-environment jsdom
/** Terminal startup, title editing and xterm's screen lifetime. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '../../../test-support/client-runtime/src/vue-test.ts';
import { fireEvent } from '@testing-library/dom';
import { shallowRef, type VNodeChild } from 'vue';
import type { ITheme } from '@xterm/xterm';
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client';
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime';
import type { TerminalViewState } from '@deepseek-ai/dsh-api-terminal-controller/client';
import type { WebTerminalId } from '@deepseek-ai/dsh-api-terminal-controller/types';
import { TerminalBody, type TerminalBodyProps } from '../src/client/terminal.tsx';
import { TerminalTitle } from '../src/client/TerminalTitle.tsx';
import { en, zh } from '../src/client/locales.ts';
const fake = vi.hoisted(() => ({
    terminals: [] as FakeTerminal[],
    dimensions: { cols: 120, rows: 40 } as {
        cols: number;
        rows: number;
    } | undefined,
}));
class FakeTerminal {
    options: {
        disableStdin?: boolean;
        theme?: ITheme;
        fontFamily?: string;
        fontSize?: number;
    };
    textarea: HTMLTextAreaElement | undefined = document.createElement('textarea');
    input: ((data: string) => void) | undefined;
    readonly disposeInput = vi.fn();
    readonly parser = { registerOscHandler: vi.fn(() => ({ dispose: vi.fn() })) };
    renderFrame: (() => void) | undefined;
    readonly disposeRender = vi.fn(() => { this.renderFrame = undefined; });
    readonly onRender = vi.fn((listener: () => void) => {
        this.renderFrame = listener;
        return { dispose: this.disposeRender };
    });
    readonly resize = vi.fn();
    readonly reset = vi.fn();
    readonly focus = vi.fn();
    readonly dispose = vi.fn();
    readonly write = vi.fn((_data: string, callback: () => void) => { callback(); });
    readonly loadAddon = vi.fn();
    constructor(options: object) { this.options = options; fake.terminals.push(this); }
    open(node: HTMLElement) { node.appendChild(this.textarea!); }
    onData(input: (data: string) => void) { this.input = input; return { dispose: this.disposeInput }; }
}
vi.mock('@xterm/xterm', () => ({ Terminal: vi.fn(function (options: object) { return new FakeTerminal(options); }) }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class {
        proposeDimensions() { return fake.dimensions; }
    } }));
let measure: (() => void) | undefined;
const disconnect = vi.fn();
let boxWidth = 800;
let boxHeight = 600;
beforeEach(() => {
    fake.terminals.length = 0;
    fake.dimensions = { cols: 120, rows: 40 };
    boxWidth = 800;
    boxHeight = 600;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => boxWidth);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => boxHeight);
    vi.stubGlobal('ResizeObserver', class {
        constructor(callback: () => void) { measure = callback; }
        observe() { }
        disconnect = disconnect;
    });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); disconnect.mockClear(); measure = undefined; });
const info = { id: 'terminal' as WebTerminalId, title: 'bash', shell: { path: '/bin/bash', name: 'bash', args: ['-i'] }, cwd: '/workspace', cols: 80, rows: 24, state: 'running' as const, exitCode: null, origin: 'user' as const, control: 'user' as const };
const environment = { cwd: '/workspace', maxCols: 200, maxRows: 100, scrollback: 1000, maxInputBytes: 1000, maxBufferedBytes: 100000 };
const idle: TerminalViewState = { phase: 'idle', writable: false, environment };
const titleSurfaces = [
    {
        name: 'docked tab', selector: '[data-dockkit-tab]',
        wrap: (title: VNodeChild) => h("div", { "role": "tab", "tabIndex": 0, "aria-selected": true, "data-dockkit-tab": "tab" }, [
            h("span", null, [
                title
            ])
        ]),
    },
    {
        name: 'floating grip', selector: '[data-dockkit-float-grip]',
        wrap: (title: VNodeChild) => h("header", { "data-dockkit-float-grip": "pane" }, [
            h("div", { "data-dockkit-float-title": true }, [
                h("span", null, [
                    title
                ])
            ])
        ]),
    },
];
async function mount(initial: TerminalViewState | undefined = idle, dictionary = en) {
    const stateRef = shallowRef<TerminalViewState | undefined>(initial);
    const visibleRef = ref(true);
    const themeRef = shallowRef<ThemeSnapshot>({
        preference: 'light', fontSizes: { text: 14, code: 11, terminal: 13 }, fontFamilies: { text: '', code: '', terminal: '' },
        active: { id: 'light', colorScheme: 'light', tokens: {} }, themes: [], revision: 0,
    });
    const detach = vi.fn();
    const model = {
        mount: vi.fn(() => detach), refresh: vi.fn(async () => { }),
        rename: vi.fn(async () => { }), connect: vi.fn(), write: vi.fn(), resize: vi.fn(), acknowledge: vi.fn(),
    };
    const openTab = vi.fn();
    const tab = () => ({ tab: { id: 'tab', title: 'Terminal', visible: visibleRef.value, actions: { openTab } } });
    // The test supplies the owner and model hooks consumed here; the remaining slot props are framework-owned.
    const props = {
        view: () => model,
        useTerminal: (_key: string, select?: (value: TerminalViewState | undefined) => unknown) => computed(() => select === undefined ? stateRef.value : select(stateRef.value)),
        useTheme: (select: (value: ThemeSnapshot) => unknown) => computed(() => select(themeRef.value)),
        useTabInfo: () => computed(tab), t: makeTranslate(dictionary),
    } as unknown as TerminalBodyProps;
    const view = render(h(TerminalBody, { ...props }));
    await act(() => { });
    return {
        view, props, model, detach, openTab,
        async changeTheme(next: Partial<ThemeSnapshot> = {}) {
            themeRef.value = { ...themeRef.value, ...next, revision: themeRef.value.revision + 1 };
            await view.rerender(h(TerminalBody, { ...props }));
        },
        async update(next: TerminalViewState | undefined, shown = visibleRef.value) {
            stateRef.value = next;
            visibleRef.value = shown;
            await view.rerender(h(TerminalBody, { ...props }));
        },
    };
}
it('mounts automatic startup and offers retry only when startup fails', async () => {
    const harness = await mount({ ...idle, phase: 'loading', environment: undefined });
    expect(harness.model.mount).toHaveBeenCalledOnce();
    expect(harness.view.getByRole('status').textContent).toBe(en.loading);
    expect(harness.view.queryByRole('combobox')).toBeNull();
    expect(harness.view.queryByRole('button')).toBeNull();
    await harness.update({ ...idle, phase: 'failed', error: 'unavailable' });
    expect(harness.view.getByRole('alert').textContent).toContain('unavailable');
    await fireEvent.click(harness.view.getByRole('button', { name: en.retry }));
    expect(harness.model.refresh).toHaveBeenCalledOnce();
    await harness.update({ ...idle, phase: 'disconnected' });
    await fireEvent.click(harness.view.getByRole('button', { name: en.reconnect }));
    expect(harness.model.refresh).toHaveBeenCalledTimes(2);
    await harness.update({ ...idle, phase: 'creating' });
    expect(harness.view.getByRole('status').textContent).toBe(en.creating);
    await harness.update({ ...idle, phase: 'closing' });
    expect(harness.view.queryByRole('status')).toBeNull();
    expect(harness.view.queryByRole('button')).toBeNull();
    await harness.update(undefined);
    expect(harness.view.container.childElementCount).toBe(0);
    expect(harness.model.mount).toHaveBeenCalledOnce();
});
it('shows only the terminal screen while connected and detaches on unmount', async () => {
    const harness = await mount({ ...idle, info, phase: 'connected', writable: true });
    expect(harness.view.getByRole('textbox', { name: en.title })).toBeDefined();
    expect(harness.view.queryByRole('status')).toBeNull();
    expect(harness.view.queryByRole('button')).toBeNull();
    expect(harness.view.queryByRole('combobox')).toBeNull();
    expect(harness.view.queryByRole('heading')).toBeNull();
    expect(harness.view.queryByText('/workspace')).toBeNull();
    expect(harness.view.container.querySelector('header')).toBeNull();
    harness.view.unmount();
    expect(harness.detach).toHaveBeenCalledOnce();
});
it('keeps one emulator across rename and locale updates, applies snapshots and output once, and releases listeners', async () => {
    const snapshot: TerminalViewState = { ...idle, info, phase: 'connected', writable: true, render: { revision: 1, frame: { type: 'snapshot', writable: true, sequence: 0, info, screen: 'restored' } } };
    const harness = await mount(snapshot);
    const terminal = fake.terminals[0]!;
    expect(terminal.reset).toHaveBeenCalledOnce();
    expect(terminal.write).toHaveBeenCalledWith('restored', expect.any(Function));
    expect(harness.model.acknowledge).toHaveBeenCalledWith(1);
    expect(terminal.focus).toHaveBeenCalledOnce();
    terminal.input?.('help\t');
    expect(harness.model.write).toHaveBeenCalledWith('help\t', false);
    await harness.update({ ...snapshot, render: { revision: 2, frame: { type: 'output', sequence: 1, data: 'live' } } });
    expect(terminal.write).toHaveBeenCalledWith('live', expect.any(Function));
    await harness.update({ ...snapshot, render: { revision: 2, frame: { type: 'output', sequence: 1, data: 'duplicate' } } });
    expect(terminal.write).toHaveBeenCalledTimes(2);
    await harness.update({ ...snapshot, info: { ...info, title: 'Development' } });
    await harness.view.rerender(h(TerminalBody, { ...harness.props, "t": makeTranslate(zh) }));
    expect(fake.terminals).toHaveLength(1);
    expect(terminal.textarea?.getAttribute('aria-label')).toBe(zh.title);
    harness.view.unmount();
    expect(terminal.dispose).toHaveBeenCalledOnce();
    expect(terminal.disposeInput).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
});
it('marks emulator input as typed only shortly after a person gesture, never for focus reports or scrolling', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const snapshot: TerminalViewState = { ...idle, info, phase: 'connected', writable: true };
    const harness = await mount(snapshot);
    const terminal = fake.terminals[0]!;
    terminal.input?.('\x1b[?1;2c');
    expect(harness.model.write).toHaveBeenLastCalledWith('\x1b[?1;2c', false);
    await fireEvent.keyDown(terminal.textarea!, { key: 'l' });
    now.mockReturnValue(1100);
    terminal.input?.('l');
    expect(harness.model.write).toHaveBeenLastCalledWith('l', true);
    now.mockReturnValue(1400);
    terminal.input?.('\x1b[I');
    expect(harness.model.write).toHaveBeenLastCalledWith('\x1b[I', false);
    await fireEvent.paste(terminal.textarea!);
    terminal.input?.('pasted');
    expect(harness.model.write).toHaveBeenLastCalledWith('pasted', true);
    now.mockReturnValue(2000);
    await fireEvent.mouseDown(terminal.textarea!);
    terminal.input?.('\x1b[I');
    expect(harness.model.write).toHaveBeenLastCalledWith('\x1b[I', false);
    terminal.input?.('\x1b[O');
    expect(harness.model.write).toHaveBeenLastCalledWith('\x1b[O', false);
    terminal.input?.('\x1b[<0;3;4M');
    expect(harness.model.write).toHaveBeenLastCalledWith('\x1b[<0;3;4M', true);
    now.mockReturnValue(3000);
    await fireEvent.wheel(terminal.textarea!);
    terminal.input?.('\x1b[B');
    expect(harness.model.write).toHaveBeenLastCalledWith('\x1b[B', false);
    harness.view.unmount();
    now.mockReturnValue(1450);
    await fireEvent.keyDown(terminal.textarea!, { key: 'x' });
});
it('displays disconnect, close and exit states and offers explicit reconnection and takeover', async () => {
    const harness = await mount({ ...idle, info, phase: 'connecting' });
    expect(harness.view.getByRole('status').textContent).toBe(en.connecting);
    await harness.update({ ...idle, info, phase: 'connected' });
    expect(harness.view.getByRole('status').textContent).toContain(en.readonly);
    expect(fake.terminals[0]!.options.disableStdin).toBe(true);
    await fireEvent.click(harness.view.getByRole('button', { name: en.control }));
    expect(harness.model.connect).toHaveBeenCalledOnce();
    for (const phase of ['disconnected', 'failed'] as const) {
        await harness.update({ ...idle, info, phase });
        await fireEvent.click(harness.view.getByRole('button', { name: en.reconnect }));
    }
    expect(harness.model.connect).toHaveBeenCalledTimes(3);
    await harness.update({ ...idle, info, phase: 'closing' });
    expect(harness.view.queryByRole('status')).toBeNull();
    await harness.update({ ...idle, info, phase: 'closed' });
    expect(harness.view.getByRole('status').textContent).toContain(en.closed);
    await harness.update({ ...idle, info: { ...info, state: 'exited', exitCode: 5 }, phase: 'connected' });
    expect(harness.view.getByRole('status').textContent).toContain('Process exited (5)');
    await harness.update({ ...idle, info: { ...info, state: 'exited', error: 'provider stopped' }, phase: 'connected' });
    expect(harness.view.getByRole('status').textContent).toContain('Process exited (—)');
    expect(harness.view.getByRole('alert').textContent).toContain('provider stopped');
    await harness.update({ ...idle, info: { ...info, state: 'failed', error: 'provider unreachable' }, phase: 'connected' });
    expect(harness.view.getByRole('status').textContent).toBe(en.unavailable);
});
it('updates screen, cursor and selection colors without replacing the terminal or clearing output', async () => {
    const colors = { backgroundColor: 'rgb(255, 255, 255)', color: 'rgb(23, 25, 29)' };
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => colors as CSSStyleDeclaration);
    const harness = await mount({ ...idle, info, phase: 'connected', writable: true });
    const terminal = fake.terminals[0]!;
    expect(terminal.options.theme).toMatchObject({
        background: colors.backgroundColor, foreground: colors.color, cursor: colors.color, selectionForeground: colors.backgroundColor,
    });
    const appliedTheme = terminal.options.theme;
    await harness.changeTheme();
    expect(terminal.options.theme).toBe(appliedTheme);
    colors.backgroundColor = 'rgb(23, 25, 29)';
    colors.color = 'rgb(231, 233, 238)';
    await harness.changeTheme();
    expect(terminal.options.theme).toEqual({
        background: colors.backgroundColor, foreground: colors.color, cursor: colors.color, cursorAccent: colors.backgroundColor,
        selectionBackground: colors.color, selectionForeground: colors.backgroundColor, selectionInactiveBackground: colors.color,
    });
    expect(fake.terminals).toEqual([terminal]);
    expect(terminal.reset).not.toHaveBeenCalled();
    expect(terminal.dispose).not.toHaveBeenCalled();
    expect(harness.model.mount).toHaveBeenCalledOnce();
    expect(harness.detach).not.toHaveBeenCalled();
});
it('applies the terminal font list and size and refits without replacing the terminal', async () => {
    const state: TerminalViewState = { ...idle, info, phase: 'connected', writable: true };
    const harness = await mount(state);
    const terminal = fake.terminals[0]!;
    const stack = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    expect(terminal.options.fontFamily).toBe(stack);
    harness.model.resize.mockClear();
    await harness.changeTheme({ fontFamilies: { text: '"Inter"', code: '', terminal: '' } });
    expect(harness.model.resize).not.toHaveBeenCalled();
    fake.dimensions = { cols: 100, rows: 30 };
    await harness.changeTheme({ fontFamilies: { text: '', code: '', terminal: '"MesloLGS NF"' } });
    expect(terminal.options.fontFamily).toBe(`"MesloLGS NF", ${stack}`);
    expect(harness.model.resize).toHaveBeenCalledWith(100, 30);
    harness.model.resize.mockClear();
    await harness.update(state, false);
    await harness.changeTheme({ fontFamilies: { text: '', code: '', terminal: '' } });
    expect(terminal.options.fontFamily).toBe(stack);
    expect(harness.model.resize).not.toHaveBeenCalled();
    await harness.update(state, true);
    expect(terminal.options.fontSize).toBe(13);
    fake.dimensions = { cols: 90, rows: 25 };
    await harness.changeTheme({ fontSizes: { text: 14, code: 11, terminal: 16 } });
    expect(terminal.options.fontSize).toBe(16);
    expect(harness.model.resize).toHaveBeenCalledWith(90, 25);
    expect(fake.terminals).toEqual([terminal]);
    expect(terminal.dispose).not.toHaveBeenCalled();
});
it('reads the current theme on xterm render and releases the cursor listener on unmount', async () => {
    const colors = { backgroundColor: 'rgb(255, 255, 255)', color: 'rgb(23, 25, 29)' };
    const cursor = document.createElement('span');
    cursor.className = 'xterm-cursor';
    cursor.style.backgroundColor = 'black';
    cursor.style.color = 'cyan';
    const readStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(element => element === cursor ? readStyle(element) : colors as CSSStyleDeclaration);
    const harness = await mount({ ...idle, info, phase: 'connected', writable: true });
    const terminal = fake.terminals[0]!;
    const screen = terminal.textarea!.parentElement!;
    screen.append(cursor);
    const appliedTheme = terminal.options.theme;
    terminal.renderFrame?.();
    expect(screen.style.getPropertyValue('--terminal-cursor')).toBe('#ffffff');
    expect(screen.style.getPropertyValue('--terminal-cursor-accent')).toBe('#000000');
    expect(terminal.options.theme).toBe(appliedTheme);
    colors.backgroundColor = 'rgb(23, 25, 29)';
    colors.color = 'rgb(231, 233, 238)';
    await harness.changeTheme();
    terminal.renderFrame?.();
    expect(screen.style.getPropertyValue('--terminal-cursor')).toBe(colors.color);
    expect(fake.terminals).toEqual([terminal]);
    harness.view.unmount();
    expect(terminal.disposeRender).toHaveBeenCalledOnce();
    expect(terminal.renderFrame).toBeUndefined();
});
it('fits only visible writable terminals with measurable dimensions and clamps the provider limits', async () => {
    const state: TerminalViewState = { ...idle, info, phase: 'connected', writable: true };
    const harness = await mount(state);
    const terminal = fake.terminals[0]!;
    expect(harness.model.resize).toHaveBeenCalledWith(120, 40);
    harness.model.resize.mockClear();
    fake.dimensions = { cols: 500, rows: 300 };
    measure?.();
    expect(harness.model.resize).toHaveBeenCalledWith(200, 100);
    harness.model.resize.mockClear();
    await harness.update(state, false);
    measure?.();
    await harness.update({ ...state, writable: false }, true);
    measure?.();
    expect(harness.model.resize).not.toHaveBeenCalled();
    expect(terminal.resize).toHaveBeenLastCalledWith(80, 24);
    boxWidth = 0;
    await harness.update(state);
    measure?.();
    boxWidth = 800;
    boxHeight = 0;
    measure?.();
    await harness.update({ ...state, info: { ...info, cols: 81 } });
    expect(harness.model.resize).not.toHaveBeenCalled();
    boxHeight = 600;
    fake.dimensions = undefined;
    measure?.();
    await harness.update({ ...state, environment: undefined });
    fake.dimensions = { cols: 40, rows: 20 };
    measure?.();
    await harness.update(state);
    for (const dimensions of [{ cols: 1, rows: 20 }, { cols: 40, rows: 0 }]) {
        fake.dimensions = dimensions;
        measure?.();
    }
    expect(harness.model.resize).not.toHaveBeenCalled();
});
it.each(titleSurfaces)('shows saved and attached terminal names in the $name', async (surface) => {
    const harness = await mount(idle);
    const chip = () => surface.wrap(h(TerminalTitle, { ...harness.props }));
    const title = render(chip());
    expect(title.container.textContent).toBe('Terminal');
    await harness.update({ ...idle, title: 'Saved terminal' });
    await title.rerender(chip());
    expect(title.container.textContent).toBe('Saved terminal');
    await harness.update({ ...idle, info });
    await title.rerender(chip());
    expect(title.container.textContent).toBe('bash');
    expect(title.container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(title.container.querySelector('svg rect')).toBeNull();
});
it.each(titleSurfaces)('badges agent control in the $name and, after takeover, a confined sandbox', async (surface) => {
    const agentInfo = { ...info, origin: 'agent' as const, control: 'agent' as const, sandboxMode: 'workspace-write' as const };
    const harness = await mount({ ...idle, info: agentInfo });
    const chip = () => surface.wrap(h(TerminalTitle, { ...harness.props }));
    const title = render(chip());
    const hint = (text: string) => title.getByText(text).closest('[title]')?.getAttribute('title');
    expect(title.container.textContent).toBe(`${en['badge.agent']}bash`);
    expect(hint(en['badge.agent'])).toBe(`${en['badge.agentHint']} ${en['badge.workspaceWriteHint']}`);
    await harness.update({ ...idle, info: { ...agentInfo, control: 'user' } });
    await title.rerender(chip());
    expect(title.container.textContent).toBe(`${en['badge.sandbox']}bash`);
    expect(hint(en['badge.sandbox'])).toBe(en['badge.workspaceWriteHint']);
    await harness.update({ ...idle, info: { ...agentInfo, control: 'user', sandboxMode: 'read-only' } });
    await title.rerender(chip());
    expect(hint(en['badge.sandbox'])).toBe(en['badge.readOnlyHint']);
    await harness.update({ ...idle, info: { ...agentInfo, sandboxMode: 'danger-full-access' } });
    await title.rerender(chip());
    expect(hint(en['badge.agent'])).toBe(en['badge.agentHint']);
    await harness.update({ ...idle, info: { ...agentInfo, control: 'user', sandboxMode: 'danger-full-access' } });
    await title.rerender(chip());
    expect(title.container.textContent).toBe('bash');
});
it.each(titleSurfaces)('renames from the $name pointer target, preserving dragging and isolating editor shortcuts', async (surface) => {
    const harness = await mount({ ...idle, title: 'Saved terminal' });
    const outer = vi.fn();
    const title = render(h("div", { "onPointerdown": outer, "onClick": outer, "onDblclick": outer, "onKeydown": outer }, [
        surface.wrap(h(TerminalTitle, { ...harness.props }))
    ]));
    await fireEvent.pointerDown(title.getByText('Saved terminal'));
    expect(outer).toHaveBeenCalledOnce();
    outer.mockClear();
    await fireEvent.doubleClick(title.container.querySelector(surface.selector)!);
    const input = title.getByRole('textbox', { name: en.rename }) as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('Saved terminal'.length);
    await fireEvent.pointerDown(input);
    await fireEvent.click(input);
    await fireEvent.doubleClick(input);
    await fireEvent.keyDown(input, { key: 'ArrowLeft' });
    await fireEvent.change(input, { target: { value: ' Development ' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(harness.model.rename).toHaveBeenCalledWith('Development');
    expect(harness.model.rename).toHaveBeenCalledOnce();
    expect(title.queryByRole('textbox', { name: en.rename })).toBeNull();
    expect(outer).not.toHaveBeenCalled();
});
it.each(titleSurfaces)('handles Escape, unchanged names and IME composition while editing the $name', async (surface) => {
    const harness = await mount({ ...idle, info });
    const title = render(surface.wrap(h(TerminalTitle, { ...harness.props })));
    const edit = async () => {
        await fireEvent.doubleClick(title.container.querySelector(surface.selector)!);
        return title.getByRole('textbox', { name: en.rename });
    };
    let input = await edit();
    await fireEvent.change(input, { target: { value: 'Cancelled' } });
    await fireEvent.keyDown(input, { key: 'Escape' });
    expect(harness.model.rename).not.toHaveBeenCalled();
    input = await edit();
    await fireEvent.blur(input);
    expect(harness.model.rename).not.toHaveBeenCalled();
    input = await edit();
    await fireEvent.change(input, { target: { value: '   ' } });
    await fireEvent.blur(input);
    expect(harness.model.rename).not.toHaveBeenCalled();
    input = await edit();
    await fireEvent.change(input, { target: { value: '开发' } });
    await fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    await fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    expect(title.getByRole('textbox', { name: en.rename })).toBe(input);
    expect(harness.model.rename).not.toHaveBeenCalled();
    await fireEvent.blur(input);
    expect(harness.model.rename).toHaveBeenCalledWith('开发');
});
it.each(titleSurfaces)('removes the native $name listener when its title unmounts', async (surface) => {
    const harness = await mount({ ...idle, info });
    const outer = vi.fn();
    const seat = (shown: boolean) => h("div", { "onDblclick": outer }, [
        surface.wrap(shown && h(TerminalTitle, { ...harness.props }))
    ]);
    const title = render(seat(false));
    const chip = title.container.querySelector(surface.selector)!;
    const add = vi.spyOn(chip, 'addEventListener');
    const remove = vi.spyOn(chip, 'removeEventListener');
    await title.rerender(seat(true));
    const listener = add.mock.calls.find(([type]) => type === 'dblclick')?.[1];
    expect(listener).toBeTypeOf('function');
    await title.rerender(seat(false));
    expect(remove).toHaveBeenCalledExactlyOnceWith('dblclick', listener);
    await fireEvent.doubleClick(chip);
    expect(outer).toHaveBeenCalledOnce();
    expect(harness.model.rename).not.toHaveBeenCalled();
});
it('starts a recovered screen with no local history when environment discovery is unavailable', async () => {
    await mount({ ...idle, info, environment: undefined });
    expect(fake.terminals[0]!.options).toHaveProperty('scrollback', 0);
});
it.each([en, zh])('translates known terminal failures while retaining unknown Host diagnostics', async (dictionary) => {
    const harness = await mount(idle, dictionary);
    for (const issue of ['missingTerminal', 'inputFull', 'attachmentEnded', 'invalidOutput', 'terminalLimit'] as const) {
        await harness.update({ ...idle, phase: 'failed', issue, error: 'raw diagnostic' });
        expect(harness.view.getByRole('alert').textContent).toContain(dictionary[issue]);
        expect(harness.view.getByRole('alert').textContent).not.toContain('raw diagnostic');
    }
    await harness.update({ ...idle, phase: 'failed', error: 'Host permission denied' });
    expect(harness.view.getByRole('alert').textContent).toContain('Host permission denied');
});
it.each([en, zh])('offers an explicit new terminal for missing instances without retrying the lost process', async (dictionary) => {
    const harness = await mount({ ...idle, phase: 'failed', issue: 'missingTerminal', error: 'raw Host diagnostic' }, dictionary);
    expect(harness.view.getByRole('alert').textContent).toBe(dictionary.missingTerminal);
    expect(harness.view.queryByRole('button', { name: dictionary.reconnect })).toBeNull();
    expect(harness.view.queryByRole('button', { name: dictionary.retry })).toBeNull();
    expect(harness.view.queryByRole('textbox')).toBeNull();
    await fireEvent.click(harness.view.getByRole('button', { name: dictionary.new }));
    expect(harness.openTab).toHaveBeenCalledExactlyOnceWith('terminal', { replaceTab: true });
    expect(harness.model.refresh).not.toHaveBeenCalled();
    expect(harness.model.connect).not.toHaveBeenCalled();
});
it('removes a stale emulator when the Host confirms the terminal is missing', async () => {
    const harness = await mount({ ...idle, info, phase: 'connected', writable: true });
    const terminal = fake.terminals[0]!;
    await harness.update({ ...idle, info, phase: 'failed', issue: 'missingTerminal' });
    expect(terminal.dispose).toHaveBeenCalledOnce();
    expect(harness.view.queryByRole('textbox')).toBeNull();
    expect(harness.view.getByRole('button', { name: en.new })).toBeDefined();
});
it('keeps the screen on a temporary disconnect and presents reconnection without transport diagnostics', async () => {
    const harness = await mount({ ...idle, info, phase: 'disconnected', error: 'Remote mux WebSocket closed: 1006' });
    expect(harness.view.queryByRole('alert')).toBeNull();
    expect(harness.view.getByRole('status').textContent).toContain(en.disconnected);
    expect(harness.view.getByRole('textbox')).toBeDefined();
    expect(harness.view.queryByRole('button', { name: en.new })).toBeNull();
    await fireEvent.click(harness.view.getByRole('button', { name: en.reconnect }));
    expect(harness.model.connect).toHaveBeenCalledOnce();
    expect(harness.openTab).not.toHaveBeenCalled();
});
it('offers a new terminal after process exit while preserving its final output for reading', async () => {
    const harness = await mount({ ...idle, info: { ...info, state: 'exited', exitCode: 0 }, phase: 'failed' });
    expect(harness.view.getByRole('textbox')).toBeDefined();
    expect(harness.view.queryByRole('button', { name: en.reconnect })).toBeNull();
    await fireEvent.click(harness.view.getByRole('button', { name: en.new }));
    expect(harness.openTab).toHaveBeenCalledExactlyOnceWith('terminal', { replaceTab: true });
});
