import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { VueMcp } from "vite-plugin-vue-mcp";

export default defineConfig(({ command }) => ({
  plugins: [vue(), tailwindcss(), ...(command === "serve" && process.env.EAP_VUE_MCP === "true"
    ? [VueMcp({ host: "127.0.0.1", updateCursorMcpJson: false })] : [])],
  server: { host: "127.0.0.1" },
}));
