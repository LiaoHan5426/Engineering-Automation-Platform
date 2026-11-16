/** Mount the native Vue renderer before Electron reveals the welcome window. */
import "@deepseek-ai/dsh-client-ui-theme/src/styles/design-platform.css";
import "@deepseek-ai/dsh-client-ui-theme/src/styles/gradient-shadow-text.css";
import { createApp, h } from "vue";
import { Welcome } from "./WelcomePage.tsx";
import type { WelcomeApi } from "../welcome-api.ts";

declare global {
  interface Window {
    dshWelcome: WelcomeApi;
  }
}

const container = document.getElementById("root");
if (container === null) throw new Error("desktop welcome: missing welcome root");
const root = createApp({ render: () => h(Welcome, { api: window.dshWelcome }) });
root.mount(container);
window.addEventListener(
  "pagehide",
  () => {
    root.unmount();
  },
  { once: true },
);
