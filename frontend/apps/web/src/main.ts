import { createApp } from "vue";
import { applyTheme, DEFAULT_THEME } from "@eap/style";
import { tablePlugin } from "@eap/plugin-table";
import "@eap/ui/styles.css";
import "@eap/plugin-table/styles.css";
import App from "./App.vue";
import "./style.css";
import "./work-pages.css";
import { i18n } from "./lib/i18n";

applyTheme(DEFAULT_THEME);

createApp(App).use(tablePlugin).use(i18n).mount("#app");
