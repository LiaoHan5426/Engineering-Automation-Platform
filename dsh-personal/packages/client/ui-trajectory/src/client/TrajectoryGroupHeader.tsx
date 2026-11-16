import { defineComponent, h } from 'vue';
// TrajectoryGroupHeader: "Message" or "Step N" row with optional description.
import css from './TrajectoryGroupHeader.module.css';
export interface TrajectoryGroupHeaderProps {
    /** Group title (`Message`, `Step 1`, …). */
    title: string;
    /** Secondary summary (`49 s`, `2.2 s skill`, …). */
    description?: string;
}
/**
 * Render a Message/Step group header inside a turn body.
 * @param props - title and optional description.
 * @returns the group header element.
 */
export const TrajectoryGroupHeader = defineComponent((props: TrajectoryGroupHeaderProps) => {
    return () => {
        const { title, description } = props;
        return (h("div", { "class": css.root }, [
            h("span", { "class": css.title }, [
                title
            ]),
            description !== undefined && description !== ''
                ? h("span", { "class": css.description }, [
                    description
                ]) : null
        ]));
    };
}, { name: "TrajectoryGroupHeader", inheritAttrs: false, props: ["title", "description"] });
