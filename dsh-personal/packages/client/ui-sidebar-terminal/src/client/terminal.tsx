import { h, Fragment, shallowRef, defineComponent, watch, watchEffect } from 'vue';
/** Sidebar terminal screen and connection recovery. */
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Button, IconPlusOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import type { TerminalViewState, TerminalView } from '@deepseek-ai/dsh-api-terminal-controller/client';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client';
import type { TerminalBodyInjected } from './face.ts';
import '@xterm/xterm/css/xterm.css';
import css from './terminal.module.css';
import { TerminalTheme } from './terminal-theme.ts';
import { observeTerminalCursor } from './terminal-cursor.ts';
/** Standard sidebar owner share plus terminal model and localized copy. */
export type TerminalBodyProps = Pick<PropsRuntime<'sidebar.right.pane.tab'>, 'useTabInfo'> & PropsLocale<'sidebarTerminal'> & InjectFace<TerminalBodyInjected>;
/**
 * Render the retained terminal with the application theme.
 * @param props - sidebar occurrence, model lookup and translated copy.
 * @returns the terminal screen and any pending or exceptional state.
 */
export const TerminalBody = defineComponent((props: TerminalBodyProps) => {
    const tabInfo = props.useTabInfo();
    const key = tabInfo.value.tab.id;
    const themeRef = props.useTheme(value => value);
    const model = props.view(key);
    const stateRef = props.useTerminal(key);
    watch(() => model, (current, _old, cleanup) => { cleanup(current.mount()); }, { immediate: true });
    return () => {
        const { t } = props, tab = tabInfo.value.tab, state = stateRef.value, theme = themeRef.value;
        if (state === undefined)
            return null;
        const newTerminal = h(Button, { "variant": "primary", "size": state.issue === 'missingTerminal' ? 'md' : 'sm', "icon": h("span", { "class": css.actionIcon, "aria-hidden": "true" }, [
                h(IconPlusOutlineRegular, null)
            ]), "onClick": () => { tab.actions.openTab('terminal', { replaceTab: true }); } }, { default: () => [
                t('new')
            ] });
        if (state.issue === 'missingTerminal')
            return h("section", { "class": css.root, "data-sidebar-terminal": true }, [
                h("div", { "class": css.empty }, [
                    h("svg", { "width": "36", "height": "36", "viewBox": "0 0 28 28", "fill": "none", "aria-hidden": "true" }, [
                        h("rect", { "x": "3", "y": "5", "width": "22", "height": "19", "rx": "3", "fill": "#17191d" }),
                        h("path", { "d": "m8 10 4 4-4 4M15 18h5", "stroke": "#fff", "stroke-width": "1.7", "strokeLinecap": "round", "strokeLinejoin": "round" })
                    ]),
                    h("p", { "class": css.emptyMessage, "role": "alert" }, [
                        t('missingTerminal')
                    ]),
                    newTerminal
                ])
            ]);
        const error = state.phase === 'disconnected' ? undefined : state.issue === undefined ? state.error ?? state.info?.error : t(state.issue);
        let status: string | undefined;
        if (state.phase === 'idle' || state.phase === 'loading')
            status = t('loading');
        else if (state.phase === 'creating' || state.phase === 'connecting' || state.phase === 'disconnected')
            status = t(state.phase);
        else if (state.info?.state === 'exited')
            status = t('exited', { code: String(state.info.exitCode ?? '—') });
        else if (state.info?.state === 'failed')
            status = t('unavailable');
        else if (state.phase === 'closed')
            status = t('closed');
        const ended = state.info?.state === 'exited' || state.phase === 'closed';
        const retry = !ended && (state.phase === 'failed' || state.phase === 'disconnected');
        const readOnly = state.phase === 'connected' && state.info?.state === 'running' && !state.writable;
        return (h("section", { "class": css.root, "data-sidebar-terminal": true }, [
            (status !== undefined || retry || readOnly) && h("div", { "class": css.status, "role": "status" }, [
                status,
                readOnly && h(Fragment, null, [
                    t('readonly'),
                    h(Button, { "variant": "outline", "size": "sm", "onClick": () => { model.connect(); } }, { default: () => [
                            t('control')
                        ] })
                ]),
                retry && (state.info === undefined
                    ? h(Button, { "variant": "outline", "size": "sm", "onClick": () => { void model.refresh(); } }, { default: () => [
                            t(state.phase === 'disconnected' ? 'reconnect' : 'retry')
                        ] }) : h(Button, { "variant": "outline", "size": "sm", "onClick": () => { model.connect(); } }, { default: () => [
                        t('reconnect')
                    ] })),
                ended && newTerminal
            ]),
            state.info !== undefined && h(TerminalScreen, { "state": state, "model": model, "visible": tab.visible, "label": t('title'), "theme": theme }),
            error !== undefined && h("p", { "class": css.error, "role": "alert" }, [
                t('failed', { message: error })
            ])
        ]));
    };
}, { props: ['useTabInfo', 'useTerminal', 'useTheme', 'view', 't'], inheritAttrs: false });
/**
 * xterm.js reports the person's input and terminal-protocol replies through the same data event, so input that
 * follows a person's gesture within this window counts as typed; IME commits arrive in a later task. Scrolling is
 * not a gesture: xterm turns the wheel into arrow keys on the alternate screen, and reading must not take over.
 */
const TYPED_INPUT_WINDOW_MS = 250;
const INPUT_GESTURES = ['keydown', 'beforeinput', 'paste', 'compositionend', 'drop', 'mousedown', 'touchstart'] as const;
/** Focus-in and focus-out reports (DECSET 1004) that xterm.js sends when a click focuses the screen. */
const FOCUS_REPORTS = new Set(['\x1b[I', '\x1b[O']);
const TerminalScreen = defineComponent((props: {
    state: TerminalViewState;
    model: TerminalView;
    visible: boolean;
    label: string;
    theme: ThemeSnapshot;
}) => {
    const element = shallowRef<HTMLDivElement | null>(null);
    const terminal = shallowRef<Terminal>(), fit = shallowRef<FitAddon>(), colors = shallowRef<TerminalTheme>();
    let lastRevision = 0;
    watch([element, () => props.model], ([node, model], _old, cleanup) => {
        if (node === null)
            return;
        const xterm = new Terminal({ minimumContrastRatio: 4.5, cursorBlink: true,
            fontSize: props.theme.fontSizes.terminal, fontFamily: terminalFontFamily(props.theme.fontFamilies.terminal),
            scrollback: props.state.environment?.scrollback ?? 0 });
        const addon = new FitAddon();
        xterm.loadAddon(addon);
        xterm.open(node);
        const palette = new TerminalTheme(xterm);
        const cursor = observeTerminalCursor(xterm, node, () => palette.cursor);
        terminal.value = xterm;
        fit.value = addon;
        colors.value = palette;
        lastRevision = 0;
        let gestureAt = Number.NEGATIVE_INFINITY;
        const gesture = () => { gestureAt = performance.now(); };
        for (const type of INPUT_GESTURES)
            node.addEventListener(type, gesture, { capture: true, passive: true });
        const input = xterm.onData(data => { model.write(data, performance.now() - gestureAt < TYPED_INPUT_WINDOW_MS && !FOCUS_REPORTS.has(data)); });
        const measure = () => {
            if (!props.visible || !props.state.writable || node.clientWidth === 0 || node.clientHeight === 0)
                return;
            fitScreen(xterm, addon, props.state, model);
        };
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        cleanup(() => {
            observer.disconnect();
            for (const type of INPUT_GESTURES)
                node.removeEventListener(type, gesture, { capture: true });
            input.dispose();
            cursor.dispose();
            palette.dispose();
            xterm.dispose();
            terminal.value = undefined;
            fit.value = undefined;
            colors.value = undefined;
        });
    }, { flush: 'post' });
    watchEffect(() => {
        if (!element.value || !colors.value)
            return;
        void props.theme;
        const style = getComputedStyle(element.value);
        colors.value.update(style.backgroundColor, style.color);
    }, { flush: 'post' });
    watchEffect(() => {
        const xterm = terminal.value, addon = fit.value, node = element.value;
        if (!xterm || !addon || !node)
            return;
        const fontFamily = terminalFontFamily(props.theme.fontFamilies.terminal), fontSize = props.theme.fontSizes.terminal;
        if (xterm.options.fontFamily === fontFamily && xterm.options.fontSize === fontSize)
            return;
        xterm.options.fontFamily = fontFamily;
        xterm.options.fontSize = fontSize;
        if (props.visible && props.state.writable && node.clientWidth && node.clientHeight)
            fitScreen(xterm, addon, props.state, props.model);
    }, { flush: 'post' });
    watchEffect(() => {
        const xterm = terminal.value, render = props.state.render;
        if (!xterm || render === undefined || render.revision <= lastRevision)
            return;
        lastRevision = render.revision;
        if (render.frame.type === 'snapshot') {
            xterm.reset();
            xterm.resize(render.frame.info.cols, render.frame.info.rows);
        }
        const model = props.model;
        xterm.write(render.frame.type === 'snapshot' ? render.frame.screen : render.frame.data, () => { model.acknowledge(render.revision); });
    }, { flush: 'post' });
    watch([() => terminal.value, () => props.visible, () => props.state.writable, () => props.state.writable ? undefined : props.state.info?.cols, () => props.state.writable ? undefined : props.state.info?.rows, () => props.model], () => {
        const xterm = terminal.value, addon = fit.value, node = element.value, state = props.state;
        if (!xterm || !addon || !node)
            return;
        xterm.options.disableStdin = !state.writable;
        if (props.visible && state.writable && node.clientWidth && node.clientHeight)
            fitScreen(xterm, addon, state, props.model);
        else if (state.info !== undefined && !state.writable)
            xterm.resize(state.info.cols, state.info.rows);
    }, { flush: 'post' });
    watchEffect(() => { terminal.value?.textarea?.setAttribute('aria-label', props.label); }, { flush: 'post' });
    watch([() => terminal.value, () => props.visible, () => props.state.writable], () => {
        if (props.visible && props.state.writable)
            terminal.value?.focus();
    }, { flush: 'post' });
    return () => h('div', { class: css.screen, ref: element });
}, { props: ['state', 'model', 'visible', 'label', 'theme'], inheritAttrs: false });
/** Built-in terminal stack placed after the user's normalized list. */
const TERMINAL_FONT_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
function terminalFontFamily(list: string): string {
    return list === '' ? TERMINAL_FONT_STACK : `${list}, ${TERMINAL_FONT_STACK}`;
}
function fitScreen(xterm: Terminal, fit: FitAddon, state: TerminalViewState, model: TerminalView): void {
    const dimensions = fit.proposeDimensions();
    const environment = state.environment;
    if (dimensions === undefined || environment === undefined)
        return;
    const cols = Math.min(dimensions.cols, environment.maxCols);
    const rows = Math.min(dimensions.rows, environment.maxRows);
    if (cols < 2 || rows < 1)
        return;
    xterm.resize(cols, rows);
    model.resize(cols, rows);
}
