import { createApp } from "vue";
import { initializeAppearance } from "./features/settings/appearance";
import { tablePlugin } from "@eap/plugin-table";
import "@eap/ui/styles.css";
import "@eap/plugin-table/styles.css";
import App from "./App.vue";
import "./style.css";
import "./work-pages.css";
import { i18n } from "./lib/i18n";

const disposeAppearance = initializeAppearance();
if (import.meta.hot) import.meta.hot.dispose(disposeAppearance);

createApp(App).use(tablePlugin).use(i18n).mount("#app");
