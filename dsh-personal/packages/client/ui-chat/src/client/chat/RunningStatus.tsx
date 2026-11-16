import { defineComponent, h, ref, watchEffect } from 'vue';
import { TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ChatViewSlotProps } from '../contract/slots.ts';
import { formatRunDuration, LIVE_RUN_CLOCK_INTERVAL_MS } from './message-chrome.ts';
import { RunningWhaleTail } from './RunningWhaleTail.tsx';
import a11yCss from './accessibility.module.css';
import css from './ChatView.module.css';
interface RunningStatusProps {
    readonly startTime: number | undefined;
    /** Freeze the shown duration while the Client cannot observe the Session. */
    readonly paused: boolean;
    /** Keep the slot without showing or announcing the status: the Session stopped before its Turn closed. */
    readonly holding?: boolean;
    readonly t: ChatViewSlotProps['t'];
}
/**
 * Show live elapsed time after the current Turn's content without announcing ticks.
 * @param props - Current Turn start time, pause state, and localized copy.
 * @returns the blue running indicator; mount while the Session is running, or holding its slot hidden until the
 * Turn's actions row replaces it.
 */
export const RunningStatus = defineComponent((props: RunningStatusProps) => {
    const now = ref(Date.now());
    watchEffect(onCleanup => {
        if (props.startTime === undefined || props.paused || props.holding)
            return;
        now.value = Date.now();
        const timer = setInterval(() => { now.value = Date.now(); }, LIVE_RUN_CLOCK_INTERVAL_MS);
        onCleanup(() => clearInterval(timer));
    });
    return () => {
        const { startTime, holding = false, t } = props;
        const label = startTime === undefined ? t('chat.deepDiving') : t('chat.deepDivingFor', {
            duration: formatRunDuration(Math.max(1000, now.value - startTime), t).map(part => part.text).join(''),
        });
        return (h("div", { "class": css.running, "data-chat-running": true, "data-holding": holding ? '' : undefined, "aria-hidden": holding || undefined }, [
            holding ? null : (h("span", { "class": a11yCss.visuallyHidden, "role": "status", "aria-live": "polite", "aria-atomic": "true" }, [
                t('chat.deepDiving')
            ])),
            h("span", { "class": css.runningDivider, "aria-hidden": "true" }),
            h("span", { "class": css.runningContent }, [
                h(RunningWhaleTail, null),
                h(TextShimmer, { "active": !holding, "className": css.runningText ?? "" }, { default: () => [
                        label
                    ] })
            ])
        ]));
    };
}, { name: "RunningStatus", inheritAttrs: false, props: ["startTime", "paused", "holding", "t"] });
