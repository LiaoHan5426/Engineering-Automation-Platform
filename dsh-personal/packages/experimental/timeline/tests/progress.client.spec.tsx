// @vitest-environment jsdom
import { cloneVNode, defineComponent, h } from 'vue';
import { act, cleanup, render } from '../../../test-support/client-runtime/src/vue-test.ts';
import { fireEvent, screen } from '@testing-library/dom';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatProgress, Progress } from '../src/client/Progress.tsx';
import { en, dictionaries } from '../src/client/locales.ts';
import { patchSchema } from '../src/records.ts';
import { measureAll, patchTasks } from '../src/tasks.ts';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
    const actual = await vi.importActual<typeof import('@deepseek-ai/dsh-client-ui-primitives')>('@deepseek-ai/dsh-client-ui-primitives');
    return { ...actual,
        MarkdownText: defineComponent((props: {
            text: string;
        }) => () => h('div', props.text), { props: ['text'] }),
        Tag: defineComponent((props: {
            tone: string;
        }, { slots }) => () => h('span', { 'data-tone': props.tone }, slots.default?.()), { props: ['tone'] }),
        IconPauseOutlineRegular: () => h('span', { 'data-icon': 'pause' }),
        IconPlayOutlineRegular: () => h('span', { 'data-icon': 'play' }),
        Tooltip: defineComponent((props: {
            label: string;
            disabled?: boolean;
        }, { slots }) => () => { const child = slots.default?.()[0]; return child ? cloneVNode(child, { 'data-tooltip': props.disabled ? undefined : props.label }) : null; }, { props: ['label', 'disabled'], inheritAttrs: false }),
    };
});
const labels: Readonly<Record<string, string>> = en;
const t: TranslateNS<'timeline'> = (key, params) => (labels[key] ?? key).replace(/\{(\w+)\}/gu, (match: string, name: string) => typeof params?.[name] === 'number' || typeof params?.[name] === 'string' ? `${params[name]}` : match);
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});
function activeTasks(count: number) {
    return patchTasks([], patchSchema.array().parse(Array.from({ length: count }, (_, index) => ({
        id: `work-${index}`,
        title: `Work ${index + 1}`,
        status: 'active',
    }))), 1, 20);
}
function segment(bar: HTMLElement, state: string): Element {
    const element = bar.querySelector(`[data-part=${state}]`);
    if (element === null)
        throw new Error(`Missing ${state} segment`);
    return element;
}
describe('progress display precision', () => {
    it('ignores segment shortcuts for a single bar and starts at the first segment from an unfocused bar', async () => {
        const { rerender } = await (async () => {
            const mounted = render(h(Progress, { "value": 0, "status": "pending", "label": "Progress", "t": t }));
            await act(() => { });
            return mounted;
        })();
        await fireEvent.focus(screen.getByRole('progressbar'));
        expect(await fireEvent.keyDown(screen.getByRole('progressbar'), { key: 'ArrowRight' })).toBe(true);
        const parts = measureAll(activeTasks(1), true).get(null)?.parts;
        await rerender(h(Progress, { "value": 0, "status": "active", "label": "Progress", "parts": parts, "t": t }));
        const bar = screen.getByRole('progressbar');
        await fireEvent.keyDown(bar, { key: 'ArrowRight' });
        expect(bar.getAttribute('data-tooltip')).toBe('Active work: 1 (100.00%)');
    });
    it('formats zero to three decimal places and reserves 100 for completion', () => {
        expect(formatProgress(1 / 3)).toBe('33.33');
        expect([0, 1, 2, 3].map(decimals => formatProgress(1 / 3, decimals as 0 | 1 | 2 | 3))).toEqual([
            '33',
            '33.3',
            '33.33',
            '33.333',
        ]);
        expect(formatProgress(0.99999, 0)).toBe('99');
        expect(formatProgress(0.99999, 3)).toBe('99.999');
        expect(formatProgress(1)).toBe('100.00');
    });
    it('exposes the configured precision through the accessible progress value', async () => {
        await (async () => {
            const mounted = render(h(Progress, { "value": 1 / 3, "decimals": 3, "status": "active", "label": "Review progress", "t": t }));
            await act(() => { });
            return mounted;
        })();
        expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toBe('33.333%');
        expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('33.333');
    });
    it('keeps all four segments mounted through updates and exposes hover and keyboard details', async () => {
        const tasks = patchTasks([], patchSchema.array().parse([
            { id: 'done', title: 'Done', status: 'done', timeShare: 1 },
            { id: 'active', title: 'Active', done: [1, 2], timeShare: 2 },
            { id: 'pending', title: 'Pending', timeShare: 1 },
            { id: 'blocked', title: 'Blocked', status: 'blocked', timeShare: 1, note: 'Waiting for access.' },
        ]), 1, 10);
        const parts = measureAll(tasks, true).get(null)?.parts;
        const { rerender } = await (async () => {
            const mounted = render(h(Progress, { "value": 0.4, "status": "active", "label": "Review", "parts": parts, "t": t }));
            await act(() => { });
            return mounted;
        })();
        const bar = screen.getByRole('progressbar');
        const segments = [...bar.querySelectorAll('[data-part]')];
        expect(bar.tabIndex).toBe(0);
        expect(bar.querySelector('[data-tip=true]')?.getAttribute('data-part')).toBe('active');
        expect((bar.querySelector('.timeline-progress-highlight') as HTMLElement).style.width).toBe('60%');
        expect(segments.map(node => node.getAttribute('data-part'))).toEqual([
            'done',
            'active',
            'pending',
            'blocked',
        ]);
        expect(segments.map(node => (node as HTMLElement).style.width)).toEqual(['40%', '20%', '20%', '20%']);
        expect(bar.getAttribute('aria-valuetext')).toContain('Completed work: 1 (40.00%)');
        const blocked = segments[3];
        if (blocked === undefined)
            throw new Error('Missing blocked segment');
        await fireEvent.mouseEnter(blocked);
        expect(bar.getAttribute('data-tooltip')).toBe('Blocked work: 1 (20.00%)');
        await fireEvent.focus(bar);
        expect(bar.getAttribute('data-tooltip')).toBe('Completed work: 1 (40.00%)');
        const finished = measureAll(patchTasks(tasks, patchSchema.array().parse(tasks.map(task => ({ id: task.id, status: 'done', note: 'Verified.' }))), 2, 10), true).get(null)?.parts;
        await rerender(h(Progress, { "value": 1, "status": "done", "label": "Review", "parts": finished, "t": t }));
        for (const [index, node] of [...bar.querySelectorAll('[data-part]')].entries())
            expect(node).toBe(segments[index]);
        expect((segments[0] as HTMLElement).style.width).toBe('100%');
        expect((segments[3] as HTMLElement).style.width).toBe('0%');
        expect(bar.querySelector('[data-tip=true]')?.getAttribute('data-part')).toBe('done');
        expect(bar.querySelector('[data-flow]')).toBeNull();
        await rerender(h(Progress, { "value": 1, "status": "done", "label": "Review", "t": t }));
        expect(screen.getByRole('progressbar').hasAttribute('data-segmented')).toBe(false);
        expect(screen.getByRole('progressbar').tabIndex).toBe(-1);
        expect(screen.getByRole('progressbar').children).toHaveLength(1);
    });
    it('keeps an incomplete completed-work tooltip below 100 at low precision', async () => {
        const tasks = patchTasks([], patchSchema.array().parse([{ id: 'check', title: 'Check', status: 'active', done: [1, 1] }]), 1, 10);
        const measure = measureAll(tasks, true).get(null);
        await (async () => {
            const mounted = render(h(Progress, { "value": measure?.progress ?? 0, "status": "active", "label": "Review", "decimals": 0, "parts": measure?.parts, "t": t }));
            await act(() => { });
            return mounted;
        })();
        expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('99');
        expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toContain('Completed work: 0 (99%)');
    });
    it('uses the short Chinese count and percentage for each work state', async () => {
        const parts = measureAll(activeTasks(2), true).get(null)?.parts;
        const chinese: Readonly<Record<string, string>> = dictionaries.zh;
        const translate: TranslateNS<'timeline'> = (key, params) => (chinese[key] ?? key).replace(/\{(\w+)\}/gu, (match: string, name: string) => typeof params?.[name] === 'number' || typeof params?.[name] === 'string' ? `${params[name]}` : match);
        await (async () => {
            const mounted = render(h(Progress, { "value": 0, "status": "active", "label": "Progress", "parts": parts, "t": translate }));
            await act(() => { });
            return mounted;
        })();
        const bar = screen.getByRole('progressbar');
        expect(bar.getAttribute('aria-valuetext')).toBe('0 项已完成的工作 (0.00%)\n2 项进行中的工作 (100.00%)\n0 项待开始的工作 (0.00%)\n0 项阻塞的工作 (0.00%)');
        await fireEvent.mouseEnter(segment(bar, 'active'));
        expect(bar.getAttribute('data-tooltip')).toBe('2 项进行中的工作 (100.00%)');
    });
    it.each([5, 6, 7])('shows a bounded list after 0.5 seconds for %s tasks', async (count) => {
        vi.useFakeTimers();
        const parts = measureAll(activeTasks(count), true).get(null)?.parts;
        await (async () => {
            const mounted = render(h(Progress, { "value": 0, "status": "active", "label": "Progress", "parts": parts, "t": t }));
            await act(() => { });
            return mounted;
        })();
        const bar = screen.getByRole('progressbar');
        await fireEvent.mouseEnter(segment(bar, 'active'));
        await act(() => {
            vi.advanceTimersByTime(499);
        });
        expect(bar.getAttribute('data-tooltip')).toBe(`Active work: ${count} (100.00%)`);
        await act(() => {
            vi.advanceTimersByTime(1);
        });
        const lines = bar.getAttribute('data-tooltip')?.split('\n');
        const visible = count > 6 ? 5 : count;
        expect(lines).toEqual([
            `Active work: ${count} (100.00%)`,
            ...Array.from({ length: visible }, (_, index) => `- Work ${index + 1}`),
            ...(count > 6 ? ['- ...'] : []),
        ]);
    });
    it('restarts the delay between segments and cancels it on leave, disabling, and unmount', async () => {
        vi.useFakeTimers();
        const tasks = patchTasks(activeTasks(1), patchSchema.array().parse([{ id: 'blocked', title: 'Waiting', status: 'blocked', note: 'No access.' }]), 2, 20);
        const parts = measureAll(tasks, true).get(null)?.parts;
        const { rerender, unmount } = await (async () => {
            const mounted = render(h(Progress, { "value": 0, "status": "active", "label": "Progress", "parts": parts, "t": t }));
            await act(() => { });
            return mounted;
        })();
        const bar = screen.getByRole('progressbar');
        await fireEvent.mouseEnter(segment(bar, 'active'));
        await act(() => {
            vi.advanceTimersByTime(200);
        });
        await fireEvent.mouseEnter(segment(bar, 'blocked'));
        await act(() => {
            vi.advanceTimersByTime(499);
        });
        expect(bar.getAttribute('data-tooltip')).toBe('Blocked work: 1 (50.00%)');
        await act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(bar.getAttribute('data-tooltip')).toBe('Blocked work: 1 (50.00%)\n- Waiting');
        await fireEvent.mouseLeave(bar);
        await fireEvent.mouseEnter(segment(bar, 'active'));
        expect(vi.getTimerCount()).toBe(1);
        await rerender(h(Progress, { "value": 0, "status": "active", "label": "Progress", "t": t }));
        expect(vi.getTimerCount()).toBe(0);
        await rerender(h(Progress, { "value": 0, "status": "active", "label": "Progress", "parts": parts, "t": t }));
        await fireEvent.mouseEnter(segment(screen.getByRole('progressbar'), 'active'));
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });
    it('keeps the new segment collapsed when its selection and the old timer settle together', async () => {
        vi.useFakeTimers();
        const parts = measureAll(activeTasks(1), true).get(null)?.parts;
        await (async () => {
            const mounted = render(h(Progress, { "value": 0, "status": "active", "label": "Progress", "parts": parts, "t": t }));
            await act(() => { });
            return mounted;
        })();
        const bar = screen.getByRole('progressbar');
        await fireEvent.mouseEnter(segment(bar, 'active'));
        await act(() => {
            segment(bar, 'pending').dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            vi.advanceTimersByTime(500);
        });
        expect(bar.getAttribute('data-tooltip')).toBe('Work to start: 0 (0.00%)');
    });
    it('keeps each title on one bullet and uses current data without extending the hover delay', async () => {
        vi.useFakeTimers();
        const tasks = activeTasks(1);
        const parts = measureAll(tasks, true).get(null)?.parts;
        const { rerender } = await (async () => {
            const mounted = render(h(Progress, { "value": 0, "status": "active", "label": "Progress", "parts": parts, "t": t }));
            await act(() => { });
            return mounted;
        })();
        const bar = screen.getByRole('progressbar');
        await fireEvent.mouseEnter(segment(bar, 'active'));
        await act(() => {
            vi.advanceTimersByTime(200);
        });
        const changed = patchTasks(tasks, patchSchema.array().parse([{ id: 'work-0', title: 'Check\n  saved\tprogress' }]), 2, 20);
        await rerender(h(Progress, { "value": 0, "status": "active", "label": "Progress", "parts": measureAll(changed, true).get(null)?.parts, "t": t }));
        await act(() => {
            vi.advanceTimersByTime(300);
        });
        expect(bar.getAttribute('data-tooltip')).toBe('Active work: 1 (100.00%)\n- Check saved progress');
    });
    it('allows keyboard users to inspect segments and dismiss the delayed list', async () => {
        vi.useFakeTimers();
        const tasks = patchTasks(activeTasks(1), patchSchema.array().parse([{ id: 'done', title: 'Verified', status: 'done' }]), 2, 20);
        const parts = measureAll(tasks, true).get(null)?.parts;
        await (async () => {
            const mounted = render(h(Progress, { "value": 0.5, "status": "active", "label": "Progress", "parts": parts, "t": t }));
            await act(() => { });
            return mounted;
        })();
        const bar = screen.getByRole('progressbar');
        await fireEvent.focus(bar);
        expect(bar.getAttribute('data-tooltip')).toBe('Completed work: 1 (50.00%)');
        await fireEvent.keyDown(bar, { key: 'ArrowRight' });
        await act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(bar.getAttribute('data-tooltip')).toBe('Active work: 1 (50.00%)\n- Work 1');
        await fireEvent.keyDown(bar, { key: 'Escape' });
        expect(bar.hasAttribute('data-tooltip')).toBe(false);
        await fireEvent.keyDown(bar, { key: 'ArrowLeft' });
        expect(vi.getTimerCount()).toBe(0);
        await fireEvent.blur(bar);
        await fireEvent.focus(bar);
        expect(vi.getTimerCount()).toBe(1);
        await fireEvent.blur(bar);
        expect(vi.getTimerCount()).toBe(0);
    });
    it('keeps Escape dismissal through the pending deadline and restores a fresh hover', async () => {
        vi.useFakeTimers();
        const parts = measureAll(activeTasks(1), true).get(null)?.parts;
        const { rerender } = await (async () => {
            const mounted = render(h(Progress, { "value": 0, "status": "active", "label": "Progress", "parts": parts, "t": t }));
            await act(() => { });
            return mounted;
        })();
        const bar = screen.getByRole('progressbar');
        await fireEvent.mouseEnter(segment(bar, 'active'));
        await fireEvent.keyDown(bar, { key: 'Escape' });
        await act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(bar.hasAttribute('data-tooltip')).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
        await fireEvent.mouseLeave(bar);
        await fireEvent.mouseEnter(segment(bar, 'active'));
        expect(bar.getAttribute('data-tooltip')).toBe('Active work: 1 (100.00%)');
        await act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(bar.getAttribute('data-tooltip')).toBe('Active work: 1 (100.00%)\n- Work 1');
        await fireEvent.keyDown(bar, { key: 'Escape' });
        await rerender(h(Progress, { "value": 0, "status": "active", "label": "Progress", "t": t }));
        await rerender(h(Progress, { "value": 0, "status": "active", "label": "Progress", "parts": parts, "t": t }));
        const restored = screen.getByRole('progressbar');
        await fireEvent.mouseEnter(segment(restored, 'active'));
        expect(restored.getAttribute('data-tooltip')).toBe('Active work: 1 (100.00%)');
    });
});
