/** Lifecycle glyphs of change requests and outcome glyphs of their checks. */
import { h, Fragment, type VNodeChild } from 'vue';
import clsx from 'clsx';
import { IconCheckCircleFillRegular, IconCloseCircleFillRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import type { CheckState, ChecksRollup } from '@deepseek-ai/dsh-experimental-forge/types';
import type { ChangeRequestTone } from './status.ts';
import css from './ForgeTab.module.css';
const BRANCH_ENDS = () => (h(Fragment, null, [h("circle", {
        "cx": "4",
        "cy": "3.5",
        "r": "1.6"
    }), h("circle", {
        "cx": "4",
        "cy": "12.5",
        "r": "1.6"
    }), h("circle", {
        "cx": "12",
        "cy": "12.5",
        "r": "1.6"
    })]));
/** The head branch line that bends back toward the base, shared by the open and blocked shapes. */
const TOWARD_BASE = () => (h(Fragment, null, [h("path", {
        "d": "M12 10.9V6.6C12 5.5 11.1 4.6 10 4.6H8.2"
    }), h("path", {
        "d": "M9.6 3L8 4.6L9.6 6.2"
    })]));
const OPEN = () => (h(Fragment, null, [BRANCH_ENDS(), h("path", {
        "d": "M4 5.1V10.9"
    }), TOWARD_BASE()]));
const SHAPES: Record<ChangeRequestTone, () => VNodeChild> = {
    open: OPEN,
    unknown: OPEN,
    blocked: () => (h(Fragment, null, [h("path", {
            "d": "M2.6 2.1L5.4 4.9M5.4 2.1L2.6 4.9"
        }), h("circle", {
            "cx": "4",
            "cy": "12.5",
            "r": "1.6"
        }), h("circle", {
            "cx": "12",
            "cy": "12.5",
            "r": "1.6"
        }), h("path", {
            "d": "M4 5.6V10.9"
        }), TOWARD_BASE()])),
    draft: () => (h(Fragment, null, [BRANCH_ENDS(), h("path", {
            "d": "M4 5.1V10.9M12 10.4V9.6M12 7.9V7.1M12 5.4V4.6"
        })])),
    merged: () => (h(Fragment, null, [h("circle", {
            "cx": "4.5",
            "cy": "3.5",
            "r": "1.6"
        }), h("circle", {
            "cx": "4.5",
            "cy": "12.5",
            "r": "1.6"
        }), h("circle", {
            "cx": "11.5",
            "cy": "8",
            "r": "1.6"
        }), h("path", {
            "d": "M4.5 5.1V10.9M4.5 5.1C4.5 7 6.5 8 9.9 8"
        })])),
    closed: () => (h(Fragment, null, [BRANCH_ENDS(), h("path", {
            "d": "M4 5.1V10.9M12 10.9V8.6M10.4 3.2L13.6 6.4M13.6 3.2L10.4 6.4"
        })])),
};
/** Center of each shape's head branch end, which a checks mark covers. */
const HEAD: Record<ChangeRequestTone, readonly [
    number,
    number
]> = {
    open: [12, 12.5],
    unknown: [12, 12.5],
    blocked: [12, 12.5],
    draft: [12, 12.5],
    merged: [11.5, 8],
    closed: [12, 12.5],
};
/**
 * Draw a change request in its lifecycle shape: open, open with a cross for
 * one that needs its author, draft, merged, closed, or the open shape for an
 * unknown state.
 * @param props.tone - lifecycle state that picks the shape and, when tinted, the color.
 * @param props.tinted - whether the state picks the color; otherwise the glyph uses the current text color.
 * @param props.size - width and height in pixels, 15 by default.
 * @param props.label - accessible name; omit it for a decorative glyph.
 * @param props.checks - checks outcome drawn as a filled head branch end in its state color; omit it for the plain end.
 * @returns the SVG glyph.
 */
export function ChangeRequestGlyph({ tone, tinted = true, size = 15, label, checks }: {
    readonly tone: ChangeRequestTone;
    readonly tinted?: boolean | undefined;
    readonly size?: number | undefined;
    readonly label?: string | undefined;
    readonly checks?: Exclude<ChecksRollup, 'none'> | undefined;
}): VNodeChild {
    return (h("svg", {
        "width": size,
        "height": size,
        "viewBox": "0 0 16 16",
        "fill": "none",
        "stroke": "currentColor",
        "strokeWidth": 1.3,
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "class": clsx(css.glyph, tinted && css.tinted),
        "data-tone": tone,
        "data-forge-glyph": tone,
        ...label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label }
    }, [SHAPES[tone](), checks !== undefined && h("circle", {
            "cx": HEAD[tone][0],
            "cy": HEAD[tone][1],
            "r": "2.3",
            "stroke": "none",
            "class": css.checksMark,
            "data-checks": checks
        })]));
}
const CHECK_TONE: Record<CheckState, string | undefined> = {
    success: css.pass,
    failure: css.fail,
    pending: css.running,
    neutral: undefined,
    skipped: undefined,
    cancelled: undefined,
};
/**
 * Draw the decorative outcome of one check beside its text: a filled circle
 * for success or failure, a half-filled ring while it runs, and an empty ring
 * for neutral, skipped, and cancelled checks.
 * @param props.state - check outcome.
 * @param props.size - width and height in pixels, 16 by default.
 * @returns the glyph.
 */
export function CheckGlyph({ state, size = 16 }: {
    readonly state: CheckState;
    readonly size?: number | undefined;
}): VNodeChild {
    const running = state === 'pending';
    return (h("span", {
        "class": clsx(css.checkGlyph, CHECK_TONE[state]),
        "data-forge-check": state,
        "aria-hidden": "true"
    }, [state === 'success' && h(IconCheckCircleFillRegular, {
            "size": size
        }), state === 'failure' && h(IconCloseCircleFillRegular, {
            "size": size
        }), state !== 'success' && state !== 'failure' && (h("svg", {
            "width": size,
            "height": size,
            "viewBox": "0 0 16 16",
            "fill": "none"
        }, [h("circle", {
                "cx": "8",
                "cy": "8",
                "r": "6.25",
                "stroke": "currentColor",
                "strokeWidth": 1.5
            }), running
                ? h("path", {
                    "d": "M8 3.5A4.5 4.5 0 0 1 8 12.5Z",
                    "fill": "currentColor"
                }) : h("path", {
                "d": "M5.5 8H10.5",
                "stroke": "currentColor",
                "strokeWidth": 1.5,
                "strokeLinecap": "round"
            })]))]));
}
