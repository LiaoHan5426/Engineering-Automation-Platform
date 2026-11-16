// @vitest-environment jsdom
/**
 * `useAnchoredMaxHeight` clamps a bottom-anchored overlay to the space above
 * its bottom edge, keeping a 12px viewport margin that widens to the frame's
 * published `--dsh-frame-top-clearance` (the macOS window strip).
 */
import { defineComponent, shallowRef } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h } from 'vue';
import { screen } from '@testing-library/dom';
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from './vue-render.ts';
import { useAnchoredMaxHeight } from '../src/useAnchoredMaxHeight.ts';
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.documentElement.style.removeProperty('--dsh-frame-top-clearance');
});
/** Render the hook against an element whose bottom edge sits at `bottom`. */
const Probe = defineComponent(({ cap, margin }: {
    cap: number;
    margin?: number;
}) => {
    const ref = shallowRef<HTMLDivElement | null>(null);
    const maxHeight = useAnchoredMaxHeight(ref, cap, () => 0, margin);
    return () => h("div", { "ref": ref, "data-testid": "probe", "data-max-height": maxHeight.value }, undefined);
}, { props: ['cap', 'margin'] });
/** Pin jsdom's zero-size layout to a fixed bottom edge. */
function stubBottom(bottom: number): void {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, bottom - 100, 200, 100));
}
describe('useAnchoredMaxHeight', () => {
    it('clamps to the space above the bottom edge minus the 12px margin', async () => {
        stubBottom(300);
        await act(async () => render(h(Probe, { "cap": 400 }, undefined)));
        expect(screen.getByTestId('probe').dataset.maxHeight).toBe('288');
    });
    it('widens the margin to the frame top clearance when published', async () => {
        document.documentElement.style.setProperty('--dsh-frame-top-clearance', '48px');
        stubBottom(300);
        await act(async () => render(h(Probe, { "cap": 400 }, undefined)));
        expect(screen.getByTestId('probe').dataset.maxHeight).toBe('232');
    });
    it('keeps a caller-raised margin over a published smaller clearance', async () => {
        document.documentElement.style.setProperty('--dsh-frame-top-clearance', '48px');
        stubBottom(300);
        await act(async () => render(h(Probe, { "cap": 400, "margin": 84 }, undefined)));
        expect(screen.getByTestId('probe').dataset.maxHeight).toBe('216');
    });
    it('never exceeds the design cap', async () => {
        stubBottom(300);
        await act(async () => render(h(Probe, { "cap": 100 }, undefined)));
        expect(screen.getByTestId('probe').dataset.maxHeight).toBe('100');
    });
});
