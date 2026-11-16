// @vitest-environment jsdom
import { fireEvent } from '@testing-library/dom';
import { h } from 'vue';
import { cleanupVue as cleanup, flushVue as act, renderVue } from '../../ui-primitives/tests/vue-render.ts';
import { within as queriesWithin } from '@testing-library/dom';
import { nextTick } from 'vue';
function render(node: Parameters<typeof renderVue>[0]) { const view = renderVue(node); return { ...view, ...queriesWithin(document.body) }; }
import { Teleport, type VNode } from 'vue';
function createPortal(children: VNode, target: Element) { return h(Teleport, { to: target }, [children]); }
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WHALE_ARTWORK } from '../src/client/home-whale/artwork.ts';
import { PixelWhale } from '../src/client/home-whale/PixelWhale.tsx';
import { attachPixelWhale } from '../src/client/home-whale/renderer.ts';
vi.mock('../src/client/home-whale/renderer.ts', () => ({ attachPixelWhale: vi.fn() }));
const attach = vi.mocked(attachPixelWhale);
function handle() {
    const whale = { play: vi.fn(), dispose: vi.fn() };
    attach.mockReturnValueOnce(whale);
    return whale;
}
afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
    document.body.replaceChildren();
    attach.mockReset();
});
describe('pixel whale frame layer', () => {
    it('attaches the artwork to a canvas before its content and releases it on unmount', async () => {
        const whale = handle();
        const view = render(h(PixelWhale, {
            "hero": true
        }, { default: () => [h("p", {}, ["content"])] }));
        const canvas = view.container.querySelector('canvas');
        expect(canvas?.getAttribute('aria-hidden')).toBe('true');
        expect(canvas?.nextElementSibling?.textContent).toBe('content');
        expect(attach).toHaveBeenCalledExactlyOnceWith(canvas, WHALE_ARTWORK, expect.stringContaining('breach-atlas'));
        await act(() => view.rerender(h(PixelWhale, {
            "hero": true
        }, { default: () => [h("p", {}, ["updated"])] })));
        expect(attach).toHaveBeenCalledOnce();
        view.unmount();
        expect(whale.dispose).toHaveBeenCalledOnce();
    });
    it('wraps its content without decoration outside the blank home', async () => {
        const whale = handle();
        const view = render(h(PixelWhale, {
            "hero": true
        }, { default: () => [h("p", {}, ["content"])] }));
        await act(() => view.rerender(h(PixelWhale, {
            "hero": false
        }, { default: () => [h("p", {}, ["content"])] })));
        expect(view.container.querySelector('canvas')).toBeNull();
        expect(view.getByText('content')).toBeTruthy();
        expect(whale.dispose).toHaveBeenCalledOnce();
        {
            fireEvent.click(view.getByText('content'));
            await nextTick();
        }
        expect(whale.play).not.toHaveBeenCalled();
    });
    it('plays only for primary clicks on blank space inside its own frame', async () => {
        const whale = handle();
        const overlay = document.createElement('div');
        document.body.append(overlay);
        const view = render(h(PixelWhale, {
            "hero": true
        }, { default: () => [h("section", {
                    "data-testid": "blank"
                }, [h("button", {
                        "type": "button"
                    }, ["control"]), h("div", {
                        "data-composer-card": ""
                    }, [h("span", {}, ["card"])]), createPortal(h("span", {}, ["overlay"]), overlay)])] }));
        {
            fireEvent.click(view.getByText('control'));
            await nextTick();
        }
        {
            fireEvent.click(view.getByText('card'));
            await nextTick();
        }
        {
            fireEvent.click(view.getByText('overlay'));
            await nextTick();
        }
        {
            fireEvent.click(view.getByTestId('blank'), { button: 2 });
            await nextTick();
        }
        expect(whale.play).not.toHaveBeenCalled();
        {
            fireEvent.click(view.getByTestId('blank'));
            await nextTick();
        }
        expect(whale.play).toHaveBeenCalledOnce();
    });
    it('does not play when the click ends a text selection made inside its frame', async () => {
        const whale = handle();
        const outside = document.createElement('p');
        outside.textContent = 'elsewhere';
        document.body.append(outside);
        const view = render(h(PixelWhale, {
            "hero": true
        }, { default: () => [h("p", {
                    "data-testid": "text"
                }, ["selectable headline"])] }));
        const text = view.getByTestId('text');
        const selection = window.getSelection()!;
        selection.selectAllChildren(text);
        {
            fireEvent.click(text);
            await nextTick();
        }
        expect(whale.play).not.toHaveBeenCalled();
        // A selection left elsewhere in the document does not block playback.
        selection.selectAllChildren(outside);
        {
            fireEvent.click(text);
            await nextTick();
        }
        expect(whale.play).toHaveBeenCalledOnce();
        selection.removeAllRanges();
        {
            fireEvent.click(text);
            await nextTick();
        }
        expect(whale.play).toHaveBeenCalledTimes(2);
    });
    it('plays when the document exposes no selection', async () => {
        const whale = handle();
        vi.spyOn(window, 'getSelection').mockReturnValue(null);
        const view = render(h(PixelWhale, {
            "hero": true
        }, { default: () => [h("p", {
                    "data-testid": "text"
                }, ["headline"])] }));
        {
            fireEvent.click(view.getByTestId('text'));
            await nextTick();
        }
        expect(whale.play).toHaveBeenCalledOnce();
    });
});
