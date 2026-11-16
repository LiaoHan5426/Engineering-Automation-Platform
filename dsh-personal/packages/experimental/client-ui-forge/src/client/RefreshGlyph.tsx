/** Refresh glyph that turns while a refresh runs. */
import { defineComponent, h, shallowRef } from 'vue';
import { IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './RefreshGlyph.module.css';
/** Props of the refresh glyph. */
export interface RefreshGlyphProps {
    /** Whether the refresh runs. */
    readonly busy: boolean;
    /** Glyph size in pixels. */
    readonly size: number;
}
/**
 * Render the refresh glyph. It turns while `busy` and, once `busy` ends,
 * completes the turn under way, so a quick refresh still shows a whole turn
 * and the glyph stops upright. Under reduced motion it dims and returns instead of turning.
 * @param props - whether the refresh runs, and the glyph size.
 * @returns the glyph.
 */
export const RefreshGlyph = defineComponent((props: RefreshGlyphProps) => {
    const turning = shallowRef(false);
    return () => {
        return (h("span", {
            "class": css.glyph,
            "data-turning": props.busy || turning.value ? '' : undefined,
            "onAnimationstart": () => { turning.value = true; },
            "onAnimationiteration": () => { if (!props.busy)
                turning.value = false; }
        }, [h(IconRefreshOutlineRegular, {
                "size": props.size
            })]));
    };
}, { name: 'RefreshGlyph', inheritAttrs: false, props: ["busy", "size"] });
