import { defineComponent, Fragment, h, Teleport, type VNodeChild } from 'vue';
/** Completed-Turn token usage action and its accounting details dialog. */
import { IconDatabaseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import type { TurnTokenUsage } from '../contract/chat-nodes.ts';
import type { ChatViewSlotProps } from '../contract/slots.ts';
import { formatCacheHitPercent, formatExactTokens, formatTokens } from './token-format.ts';
import { useStatDialog } from './stat-dialog.ts';
import css from './TurnUsagePanel.module.css';
import dialogCss from './stat-dialog.module.css';
export interface TurnUsagePanelProps {
    usage: TurnTokenUsage;
    /** The owning view's locale seat, passed down as a plain prop. */
    t: ChatViewSlotProps['t'];
}
function formatCompactCount(value: number, t: ChatViewSlotProps['t']): string {
    return t('message.turnUsage.count', { count: formatTokens(value, t) });
}
function formatExactCount(value: number, t: ChatViewSlotProps['t']): string {
    return t('message.turnUsage.count', { count: formatExactTokens(value, t) });
}
/**
 * Turn-usage IconActions pill with a click-open Turn-usage details dialog.
 * @param props - Turn usage buckets and locale seat.
 * @returns The trigger and, while open, its portaled dialog anchored above the trigger.
 */
export const TurnUsagePanel = defineComponent((props: TurnUsagePanelProps) => {
    const { open, setOpen, rootRef, panelRef, anchorName } = useStatDialog();
    return () => {
        const { usage, t } = props;
        const cacheHit = usage.cacheReadTokens === undefined
            ? null
            : formatCacheHitPercent(usage.cacheReadTokens, usage.totalTokens - usage.outputTokens, 1);
        const total = formatCompactCount(usage.totalTokens, t);
        const routes = usage.routes?.map(route => `${route.provider}/${route.model}`).join(', ') ?? '';
        return (h("span", { "ref": rootRef, "style": { anchorName }, "class": css.root }, [
            h("button", { "type": "button", "class": css.trigger, "aria-haspopup": "dialog", "aria-expanded": open.value, "onClick": () => { setOpen(!open.value); } }, [
                h(IconDatabaseOutlineRegular, null),
                h("span", { "class": css.label }, [
                    t('message.turnUsage.consumed', { total })
                ])
            ]),
            open.value && portal(h("div", { "ref": panelRef, "class": dialogCss.panel, "role": "dialog", "aria-label": t('message.turnUsage.title'), "style": { positionAnchor: anchorName } }, [
                h("div", { "class": dialogCss.title }, [
                    h("span", { "class": dialogCss.titleLabel }, [
                        h(IconDatabaseOutlineRegular, null),
                        t('message.turnUsage.title')
                    ]),
                    h("span", { "class": dialogCss.titleValue }, [
                        formatExactCount(usage.totalTokens, t)
                    ])
                ]),
                h("div", { "class": dialogCss.titleRule, "aria-hidden": true }),
                h("dl", { "class": dialogCss.details, "data-turn-usage-details": true }, [
                    routes !== '' && (h(Fragment, null, [
                        h("dt", null, [
                            t('message.turnUsage.model')
                        ]),
                        h("dd", { "class": dialogCss.route }, [
                            routes
                        ])
                    ])),
                    cacheHit !== null && (h(Fragment, null, [
                        h("dt", null, [
                            t('message.turnUsage.cacheHit')
                        ]),
                        h("dd", null, [
                            `${cacheHit}%`
                        ])
                    ])),
                    h("dt", null, [
                        t('message.turnUsage.input')
                    ]),
                    h("dd", null, [
                        formatExactCount(usage.uncachedInputTokens, t)
                    ]),
                    usage.cacheReadTokens !== undefined && (h(Fragment, null, [
                        h("dt", null, [
                            t('message.turnUsage.cacheRead')
                        ]),
                        h("dd", null, [
                            formatExactCount(usage.cacheReadTokens, t)
                        ])
                    ])),
                    usage.cacheWriteTokens !== undefined && (h(Fragment, null, [
                        h("dt", null, [
                            t('message.turnUsage.cacheWrite')
                        ]),
                        h("dd", null, [
                            formatExactCount(usage.cacheWriteTokens, t)
                        ])
                    ])),
                    h("dt", null, [
                        t('message.turnUsage.output')
                    ]),
                    h("dd", null, [
                        formatExactCount(usage.outputTokens, t),
                        usage.reasoningTokens !== undefined && (h("span", { "class": dialogCss.reasoning }, [
                            t('message.turnUsage.reasoning', { tokens: formatExactCount(usage.reasoningTokens, t) })
                        ]))
                    ])
                ])
            ]), document.body)
        ]));
    };
}, { name: "TurnUsagePanel", inheritAttrs: false, props: ["usage", "t"] });
function portal(content: VNodeChild, target: Element): VNodeChild { return h(Teleport, { to: target }, [content]); }
