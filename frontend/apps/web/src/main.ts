import { createApp } from "vue";
import { applyTheme, DEFAULT_THEME } from "@eap/style";
import "@eap/ui/styles.css";
import App from "./App.vue";
import "./style.css";
import { i18n } from "./lib/i18n";

applyTheme(DEFAULT_THEME);

createApp(App).use(i18n).mount("#app");
