import { defineComponent, h } from 'vue';
/** Shared connected-timeline glyph; its owner supplies the accessible label. */
export const TimelineIcon = defineComponent((props: {
    size?: number | undefined;
    className?: string | undefined;
}) => {
    return () => {
        return (h("svg", { "width": (props.size ?? 16), "height": (props.size ?? 16), "class": props.className, "viewBox": "0 0 16 16", "fill": "none", "stroke": "currentColor", "stroke-width": 1, "strokeLinecap": "round", "strokeLinejoin": "round", "aria-hidden": "true" }, [
            h("path", { "d": "M3.5 4.75v2M3.5 9.25v2" }),
            h("circle", { "cx": "3.5", "cy": "3.5", "r": "1.25" }),
            h("circle", { "cx": "3.5", "cy": "8", "r": "1.25" }),
            h("circle", { "cx": "3.5", "cy": "12.5", "r": "1.25" }),
            h("path", { "d": "M7 3.5h6M7 8h4M7 12.5h6" })
        ]));
    };
}, { name: "TimelineIcon", inheritAttrs: false, props: ["size", "className"] });
