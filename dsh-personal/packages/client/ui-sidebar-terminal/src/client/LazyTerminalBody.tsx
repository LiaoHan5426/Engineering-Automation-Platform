/** Load xterm only after a terminal body is mounted. */
import { defineAsyncComponent } from 'vue';
/** Native asynchronous component retaining the package-local xterm chunk. */
export const LazyTerminalBody = defineAsyncComponent(async () => (await import('./terminal.tsx')).TerminalBody);
