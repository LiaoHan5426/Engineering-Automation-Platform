import { defineComponent, h } from 'vue';
/** Localized cards for `cordis_stop` and `cordis_undefine`. */
import { IconInspectOutlineRegular, IconStopFillRegular, IconTrashOutlineRegular, } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client';
import { cordisActionCard } from './card-model.ts';
import css from './CordisRunRow.module.css';
import { CordisPreparingRow } from './CordisPreparingRow.tsx';
/** Full action-card props composed by the keyed Tool slot. */
export type CordisActionRowProps = ToolCallViewProps & PropsLocale<'cordis'>;
type ViewProps<T = CordisActionRowProps> = T extends CordisActionRowProps ? Pick<T, 'phase' | 'toolName' | 'callId' | 'block' | 'inspect' | 't'> : never;
/** Render one Stop or Remove call with Cordis-owned localized copy. */
export const CordisActionRow = defineComponent((props: ViewProps) => () => {
    if (props.phase === 'preparing') {
        const remove = props.toolName === 'cordis_undefine';
        return h(CordisPreparingRow, {
            ...props,
            "icon": remove ? h(IconTrashOutlineRegular, {
                "size": 14
            }) : h(IconStopFillRegular, {
                "size": 14
            }),
            "title": props.t(remove ? 'row.removeTitle' : 'row.stopTitle'),
            "className": css.card,
            "rowClassName": css.row,
            "titleClassName": css.title
        });
    }
    return h(StartedCordisActionRow, {
        ...props
    });
}, { name: 'CordisActionRow', inheritAttrs: false, props: ["phase", "toolName", "callId", "block", "inspect", "t"] });
function StartedCordisActionRow({ callId, toolName, block, inspect, t }: Exclude<ViewProps, {
    phase: 'preparing';
}>) {
    const card = cordisActionCard(block);
    const remove = toolName === 'cordis_undefine';
    const summary = card.errorSummary ?? card.pluginId ?? callId;
    return (h("div", {
        "class": css.card,
        "data-tool": toolName,
        "data-state": card.state
    }, [h("div", {
            "class": css.row
        }, [h("span", {
                "class": css.icon
            }, [remove ? h(IconTrashOutlineRegular, {
                    "size": 14
                }) : h(IconStopFillRegular, {
                    "size": 14
                })]), h("span", {
                "class": css.title
            }, [t(remove ? 'row.removeTitle' : 'row.stopTitle')]), h("span", {
                "class": css.separator,
                "aria-hidden": true
            }), h("span", {
                "class": card.errorSummary === null ? css.summary : css.error
            }, [summary]), inspect !== undefined && (h("button", {
                "type": "button",
                "class": css.inspect,
                "aria-label": t('action.inspect'),
                "onClick": inspect
            }, [h(IconInspectOutlineRegular, {})]))]), card.output !== null && h("pre", {
            "class": css.output
        }, [card.output])]));
}
