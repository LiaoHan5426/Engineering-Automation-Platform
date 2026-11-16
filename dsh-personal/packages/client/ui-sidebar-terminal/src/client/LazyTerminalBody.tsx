/** Load xterm only after a terminal body is mounted. */
import { defineAsyncComponent, defineComponent, h } from 'vue';
import type { TerminalBodyProps } from './terminal.tsx';

const AsyncTerminalBody = defineAsyncComponent(async () => (await import('./terminal.tsx')).TerminalBody);

/** Declare the terminal's framework props before its deferred implementation loads. */
export const LazyTerminalBody = defineComponent((props: TerminalBodyProps, { attrs, slots }) => {
    return () => h(AsyncTerminalBody, { ...attrs, ...props }, slots);
}, { props: ['useTabInfo', 'useTerminal', 'useTheme', 'view', 't'], inheritAttrs: false });
