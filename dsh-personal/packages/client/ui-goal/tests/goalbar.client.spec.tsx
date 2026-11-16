// @vitest-environment jsdom
import { createEvent, fireEvent, screen, waitFor } from '@testing-library/dom';
import { h } from 'vue';
import { cleanupVue as cleanup, flushVue as act, renderVue } from '../../ui-primitives/tests/vue-render.ts';
import { within as queriesWithin } from '@testing-library/dom';
import { nextTick } from 'vue';
function render(node: Parameters<typeof renderVue>[0]) { const view = renderVue(node); return { ...view, ...queriesWithin(document.body) }; }
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoalSnapshot } from '@deepseek-ai/dsh-goal/client';
import { makeTranslate, RemoteError } from '@deepseek-ai/dsh-client-test-runtime';
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts';
import { GoalBar } from '../src/client/GoalBar.tsx';
import type { GoalActionResult, GoalBarActions } from '../src/client/slots.ts';
import { zh } from '../src/client/locales.ts';
const t: InstanceType<typeof GoalBar>['$props']['t'] = makeTranslate(zh, commonZh);
afterEach(cleanup);
function makeGoal(over: Partial<GoalSnapshot> = {}): GoalSnapshot {
    return {
        id: 'g1' as GoalSnapshot['id'],
        revision: 1,
        objective: 'Ship the redesign',
        phase: 'active',
        maxGoalRounds: 4,
        ...over,
    };
}
function makeActions() {
    return {
        onEdit: vi.fn<GoalBarActions['onEdit']>(() => Promise.resolve({ ok: true, value: undefined })),
        onPause: vi.fn<GoalBarActions['onPause']>(() => Promise.resolve({ ok: true, value: undefined })),
        onResume: vi.fn<GoalBarActions['onResume']>(() => Promise.resolve({ ok: true, value: undefined })),
        onClear: vi.fn<GoalBarActions['onClear']>(() => Promise.resolve({ ok: true, value: undefined })),
    } satisfies GoalBarActions;
}
describe('GoalBar', () => {
    it('renders nothing while loading, absent, or when the goal is complete', async () => {
        const actions = makeActions();
        const loading = render(h(GoalBar, {
            "goal": undefined,
            ...actions,
            "t": t
        }));
        expect(loading.container.children).toHaveLength(0);
        cleanup();
        const absent = render(h(GoalBar, {
            "goal": null,
            ...actions,
            "t": t
        }));
        expect(absent.container.children).toHaveLength(0);
        cleanup();
        const complete = render(h(GoalBar, {
            "goal": makeGoal({ phase: 'complete' }),
            ...actions,
            "t": t
        }));
        expect(complete.container.children).toHaveLength(0);
    });
    it('active goal: goal glyph, "进行中的目标", truncated objective, edit and clear actions', async () => {
        const actions = makeActions();
        render(h(GoalBar, {
            "goal": makeGoal(),
            ...actions,
            "t": t
        }));
        expect(screen.getByText('进行中的目标')).toBeTruthy();
        expect(screen.getByText('Ship the redesign')).toBeTruthy();
        {
            fireEvent.click(screen.getByRole('button', { name: '清除目标' }));
            await nextTick();
        }
        expect(actions.onClear).toHaveBeenCalledTimes(1);
    });
    it('single-flights rapid clear clicks and hides the committed goal before its projection catches up', async () => {
        const actions = makeActions();
        let resolveClear!: (result: GoalActionResult) => void;
        actions.onClear.mockImplementation(() => new Promise((resolve) => { resolveClear = resolve; }));
        const { container, rerender } = render(h(GoalBar, {
            "goal": makeGoal(),
            ...actions,
            "t": t
        }));
        const clear = screen.getByRole<HTMLButtonElement>('button', { name: '清除目标' });
        await act(() => {
            clear.click();
            clear.click();
        });
        expect(actions.onClear).toHaveBeenCalledTimes(1);
        expect(clear.disabled).toBe(true);
        await act(async () => { resolveClear({ ok: true, value: undefined }); });
        expect(container.children).toHaveLength(0);
        await act(() => rerender(h(GoalBar, {
            "goal": makeGoal({ id: 'g2' as GoalSnapshot['id'], objective: 'Next goal' }),
            ...actions,
            "t": t
        })));
        expect(screen.getByText('Next goal')).toBeTruthy();
    });
    it('edit swaps the strip for a prefilled form; Enter saves, empty stays disabled', async () => {
        const actions = makeActions();
        render(h(GoalBar, {
            "goal": makeGoal(),
            ...actions,
            "t": t
        }));
        {
            fireEvent.click(screen.getByRole('button', { name: '编辑目标' }));
            await nextTick();
        }
        const box = screen.getByRole('textbox', { name: '目标内容' });
        expect(box).toHaveProperty('value', 'Ship the redesign');
        {
            fireEvent.input(box, { target: { value: '   ' } });
            await nextTick();
        }
        expect(screen.getByRole('button', { name: '保存目标' })).toHaveProperty('disabled', true);
        {
            fireEvent.input(box, { target: { value: 'Ship v2' } });
            await nextTick();
        }
        {
            fireEvent.keyDown(box, { key: 'Enter' });
            await nextTick();
        }
        expect(actions.onEdit).toHaveBeenCalledWith('Ship v2');
        await waitFor(() => { expect(screen.getByText('进行中的目标')).toBeTruthy(); });
    });
    it('edits a multi-line objective: Shift+Enter and IME confirmation do not save', async () => {
        const actions = makeActions();
        render(h(GoalBar, {
            "goal": makeGoal({ objective: 'Line one\nLine two' }),
            ...actions,
            "t": t
        }));
        {
            fireEvent.click(screen.getByRole('button', { name: '编辑目标' }));
            await nextTick();
        }
        const box = screen.getByRole('textbox', { name: '目标内容' });
        expect(box).toHaveProperty('value', 'Line one\nLine two');
        {
            fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
            await nextTick();
        }
        {
            fireEvent.keyDown(box, { key: 'Enter', isComposing: true });
            await nextTick();
        }
        {
            fireEvent.keyDown(box, { key: 'Enter', keyCode: 229 });
            await nextTick();
        }
        expect(actions.onEdit).not.toHaveBeenCalled();
        {
            fireEvent.input(box, { target: { value: 'Line one\nLine three' } });
            await nextTick();
        }
        const enter = createEvent.keyDown(box, { key: 'Enter' });
        fireEvent(box, enter);
        expect(enter.defaultPrevented).toBe(true);
        expect(actions.onEdit).toHaveBeenCalledWith('Line one\nLine three');
    });
    it('Esc cancels the edit without calling onEdit', async () => {
        const actions = makeActions();
        render(h(GoalBar, {
            "goal": makeGoal(),
            ...actions,
            "t": t
        }));
        {
            fireEvent.click(screen.getByRole('button', { name: '编辑目标' }));
            await nextTick();
        }
        {
            fireEvent.keyDown(screen.getByRole('textbox', { name: '目标内容' }), { key: 'Escape' });
            await nextTick();
        }
        expect(actions.onEdit).not.toHaveBeenCalled();
        expect(screen.getByText('进行中的目标')).toBeTruthy();
    });
    it('the cancel button exits the form and drops the draft (re-edit starts from the objective)', async () => {
        const actions = makeActions();
        render(h(GoalBar, {
            "goal": makeGoal(),
            ...actions,
            "t": t
        }));
        {
            fireEvent.click(screen.getByRole('button', { name: '编辑目标' }));
            await nextTick();
        }
        {
            fireEvent.input(screen.getByRole('textbox', { name: '目标内容' }), { target: { value: 'abandoned draft' } });
            await nextTick();
        }
        {
            fireEvent.click(screen.getByRole('button', { name: '取消编辑' }));
            await nextTick();
        }
        expect(actions.onEdit).not.toHaveBeenCalled();
        expect(screen.getByText('进行中的目标')).toBeTruthy();
        {
            fireEvent.click(screen.getByRole('button', { name: '编辑目标' }));
            await nextTick();
        }
        expect(screen.getByRole('textbox', { name: '目标内容' })).toHaveProperty('value', 'Ship the redesign');
    });
    it('Enter with a blank draft neither saves nor closes the form', async () => {
        const actions = makeActions();
        render(h(GoalBar, {
            "goal": makeGoal(),
            ...actions,
            "t": t
        }));
        {
            fireEvent.click(screen.getByRole('button', { name: '编辑目标' }));
            await nextTick();
        }
        const box = screen.getByRole('textbox', { name: '目标内容' });
        {
            fireEvent.input(box, { target: { value: '   ' } });
            await nextTick();
        }
        {
            fireEvent.keyDown(box, { key: 'Enter' });
            await nextTick();
        }
        expect(actions.onEdit).not.toHaveBeenCalled();
        expect(screen.getByRole('textbox', { name: '目标内容' })).toBeTruthy();
    });
    it('active goal: the pause action follows edit and clear, and pauses', async () => {
        const actions = makeActions();
        render(h(GoalBar, {
            "goal": makeGoal(),
            "activation": "armed",
            ...actions,
            "t": t
        }));
        expect(screen.getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['编辑目标', '清除目标', '暂停目标']);
        {
            fireEvent.click(screen.getByRole('button', { name: '暂停目标' }));
            await nextTick();
        }
        expect(actions.onPause).toHaveBeenCalledTimes(1);
    });
    it('active goal with unknown activation: keeps a disabled pause after edit and clear', async () => {
        const actions = makeActions();
        render(h(GoalBar, {
            "goal": makeGoal(),
            ...actions,
            "t": t
        }));
        expect(screen.getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['编辑目标', '清除目标', '暂停目标']);
        expect(screen.getByRole('button', { name: '暂停目标' }).hasAttribute('disabled')).toBe(true);
    });
    it('active disarmed goal: "待继续的目标" with a resume action instead of pause', async () => {
        const actions = makeActions();
        render(h(GoalBar, {
            "goal": makeGoal(),
            "activation": "disarmed",
            ...actions,
            "t": t
        }));
        expect(screen.getByText('待继续的目标')).toBeTruthy();
        expect(screen.queryByText('已暂停的目标')).toBeNull();
        {
            fireEvent.click(screen.getByRole('button', { name: '恢复目标' }));
            await nextTick();
        }
        expect(actions.onResume).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('button', { name: '暂停目标' })).toBeNull();
    });
    it('paused goal: "已暂停的目标" with a resume action after edit and clear', async () => {
        const actions = makeActions();
        render(h(GoalBar, {
            "goal": makeGoal({ phase: 'paused' }),
            ...actions,
            "t": t
        }));
        expect(screen.getByText('已暂停的目标')).toBeTruthy();
        expect(screen.getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['编辑目标', '清除目标', '恢复目标']);
        {
            fireEvent.click(screen.getByRole('button', { name: '恢复目标' }));
            await nextTick();
        }
        expect(actions.onResume).toHaveBeenCalledTimes(1);
    });
    it('portals an action tooltip out of the strip, where the input card cannot cover it', async () => {
        vi.useFakeTimers();
        try {
            render(h(GoalBar, {
                "goal": makeGoal(),
                "activation": "armed",
                ...makeActions(),
                "t": t
            }));
            {
                fireEvent.pointerEnter(screen.getByRole('button', { name: '暂停目标' }));
                await nextTick();
            }
            await act(() => { vi.advanceTimersByTime(500); });
            const tooltip = screen.getByRole('tooltip');
            expect(tooltip.textContent).toBe('暂停目标');
            expect(tooltip.parentElement).toBe(document.body);
        }
        finally {
            vi.useRealTimers();
        }
    });
    it('a new goal identity drops the edit form (no stale draft over the new goal)', async () => {
        const actions = makeActions();
        const { rerender } = render(h(GoalBar, {
            "goal": makeGoal(),
            ...actions,
            "t": t
        }));
        {
            fireEvent.click(screen.getByRole('button', { name: '编辑目标' }));
            await nextTick();
        }
        {
            fireEvent.input(screen.getByRole('textbox', { name: '目标内容' }), { target: { value: 'stale draft' } });
            await nextTick();
        }
        await act(() => rerender(h(GoalBar, {
            "goal": makeGoal({ id: 'g2' as GoalSnapshot['id'], objective: 'New goal' }),
            ...actions,
            "t": t
        })));
        expect(screen.queryByRole('textbox')).toBeNull();
        expect(screen.getByText('进行中的目标')).toBeTruthy();
        expect(screen.getByText('New goal')).toBeTruthy();
        await act(() => rerender(h(GoalBar, {
            "goal": null,
            ...actions,
            "t": t
        })));
        expect(screen.queryByText('进行中的目标')).toBeNull();
    });
    it('blocked goal: "受阻的目标" with the block reason as the strip tooltip', async () => {
        const actions = makeActions();
        const goal = makeGoal({ phase: 'blocked', blockedReason: { code: 'stalled', message: 'No progress in 3 rounds' } });
        render(h(GoalBar, {
            "goal": goal,
            ...actions,
            "t": t
        }));
        expect(screen.getByText('受阻的目标')).toBeTruthy();
        expect(screen.getByText('受阻的目标').closest('[title]')?.getAttribute('title')).toBe('No progress in 3 rounds');
    });
    it('blocked goal: offers resume and no pause', async () => {
        const actions = makeActions();
        render(h(GoalBar, {
            "goal": makeGoal({ phase: 'blocked' }),
            ...actions,
            "t": t
        }));
        expect(screen.queryByRole('button', { name: '暂停目标' })).toBeNull();
        {
            fireEvent.click(screen.getByRole('button', { name: '恢复目标' }));
            await nextTick();
        }
        expect(actions.onResume).toHaveBeenCalledTimes(1);
    });
    it('blocked goal without a reason carries no tooltip', async () => {
        const actions = makeActions();
        render(h(GoalBar, {
            "goal": makeGoal({ phase: 'blocked' }),
            ...actions,
            "t": t
        }));
        expect(screen.getByText('受阻的目标')).toBeTruthy();
        expect(screen.getByText('受阻的目标').closest('[title]')).toBeNull();
    });
    it('keeps the edit draft open and reports a failed save', async () => {
        const actions = makeActions();
        actions.onEdit.mockResolvedValue({
            ok: false, error: new RemoteError('session/agent-busy', 'stale revision', { reason: 'stale revision' }),
        });
        render(h(GoalBar, {
            "goal": makeGoal(),
            ...actions,
            "t": t
        }));
        {
            fireEvent.click(screen.getByRole('button', { name: '编辑目标' }));
            await nextTick();
        }
        const box = screen.getByRole('textbox', { name: '目标内容' });
        {
            fireEvent.input(box, { target: { value: 'retry this draft' } });
            await nextTick();
        }
        {
            fireEvent.click(screen.getByRole('button', { name: '保存目标' }));
            await nextTick();
        }
        expect((await screen.findByRole('alert')).textContent).toBe('stale revision (session/agent-busy)');
        expect(screen.getByRole('textbox', { name: '目标内容' })).toHaveProperty('value', 'retry this draft');
    });
    it('reports resume and clear failures without hiding the goal', async () => {
        const actions = makeActions();
        actions.onResume.mockResolvedValue({ ok: false, error: new RemoteError('gateway/internal', 'resume failed', {}) });
        const { rerender } = render(h(GoalBar, {
            "goal": makeGoal({ phase: 'paused' }),
            ...actions,
            "t": t
        }));
        {
            fireEvent.click(screen.getByRole('button', { name: '恢复目标' }));
            await nextTick();
        }
        expect((await screen.findByRole('alert')).textContent).toBe('resume failed (gateway/internal)');
        actions.onClear.mockResolvedValue({
            ok: false, error: new RemoteError('session/agent-busy', 'clear failed', { reason: 'clear failed' }),
        });
        await act(() => rerender(h(GoalBar, {
            "goal": makeGoal(),
            ...actions,
            "t": t
        })));
        {
            fireEvent.click(screen.getByRole('button', { name: '清除目标' }));
            await nextTick();
        }
        expect((await screen.findByRole('alert')).textContent).toBe('clear failed (session/agent-busy)');
        expect(screen.getByText('Ship the redesign')).toBeTruthy();
        {
            fireEvent.click(screen.getByRole('button', { name: '清除目标' }));
            await nextTick();
        }
        await waitFor(() => { expect(actions.onClear).toHaveBeenCalledTimes(2); });
    });
});
