// @vitest-environment jsdom
import { defineComponent, ref } from 'vue';
import { fireEvent, screen } from '@testing-library/dom';
import { h } from 'vue';
import { cleanupVue as cleanup, flushVue as act, renderVue } from './vue-render.ts';
import { within as queriesWithin } from '@testing-library/dom';
import { nextTick } from 'vue';
function render(node: Parameters<typeof renderVue>[0]) { const view = renderVue(node); return { ...view, ...queriesWithin(document.body) }; }
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SegmentedTabs } from '../src/SegmentedTabs.tsx';
afterEach(cleanup);
const items = [
    { value: 'details', label: 'Details', id: 'details-tab', panelId: 'details-panel' },
    { value: 'examples', label: 'Examples', id: 'examples-tab', panelId: 'examples-panel' },
    { value: 'limits', label: 'Limits', id: 'limits-tab', panelId: 'limits-panel' },
] as const;
describe('SegmentedTabs', () => {
    it('requests a selection while the caller owns its value and panels', async () => {
        const onChange = vi.fn();
        const { rerender } = render(h(SegmentedTabs, {
            "items": items,
            "value": "details",
            "onChange": onChange,
            "label": "Help"
        }));
        const examples = screen.getByRole('tab', { name: 'Examples' });
        {
            fireEvent.click(examples);
            await nextTick();
        }
        expect(onChange).toHaveBeenCalledWith('examples');
        expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Details');
        expect(screen.queryByRole('tabpanel')).toBeNull();
        await act(() => rerender(h(SegmentedTabs, {
            "items": items,
            "value": "examples",
            "onChange": onChange,
            "label": "Help"
        })));
        expect(examples.getAttribute('aria-selected')).toBe('true');
        expect(examples.id).toBe('examples-tab');
        expect(examples.getAttribute('aria-controls')).toBe('examples-panel');
        expect(examples.tabIndex).toBe(0);
        expect(screen.getByRole('tab', { name: 'Details' }).tabIndex).toBe(-1);
        expect(screen.getByRole('tablist', { name: 'Help' })).toBeTruthy();
    });
    it.each(['sm', 'md'] as const)('%s moves focus and selection with arrows, Home, and End, and leaves Tab alone', async (size) => {
        const onKeyDown = vi.fn();
        const Harness = defineComponent(() => {
            const value = ref<string>('details');
            return () => h('div', { onKeydown: onKeyDown }, [h(SegmentedTabs, { size, items, value: value.value, onChange: (next: string) => { value.value = next; }, label: 'Help' })]);
        });
        render(h(Harness, {}));
        const details = screen.getByRole('tab', { name: 'Details' });
        const examples = screen.getByRole('tab', { name: 'Examples' });
        const limits = screen.getByRole('tab', { name: 'Limits' });
        details.focus();
        for (const [from, key, to] of [
            [details, 'ArrowLeft', limits],
            [limits, 'ArrowRight', details],
            [details, 'ArrowRight', examples],
            [examples, 'End', limits],
            [limits, 'Home', details],
        ] as const) {
            {
                fireEvent.keyDown(from, { key });
                await nextTick();
            }
            expect(document.activeElement).toBe(to);
            expect(to.getAttribute('aria-selected')).toBe('true');
            expect(to.tabIndex).toBe(0);
        }
        expect(onKeyDown).not.toHaveBeenCalled();
        {
            fireEvent.keyDown(details, { key: 'Tab' });
            await nextTick();
        }
        expect(onKeyDown).toHaveBeenCalledOnce();
        expect(screen.getByRole('tab', { selected: true })).toBe(details);
    });
});
