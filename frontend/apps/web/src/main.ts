import { createApp } from "vue";
import "@eap/ui/styles.css";
import App from "./App.vue";
import "./style.css";
import { i18n } from "./lib/i18n";

createApp(App).use(i18n).mount("#app");
