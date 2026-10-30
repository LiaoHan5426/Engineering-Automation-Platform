import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { VueMcp } from "vite-plugin-vue-mcp";
import { mockBackend } from "./mock/plugin";
import { useMockServer } from "./mock/mode";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const useMock = useMockServer({ command, mode, flag: process.env.VITE_USE_MOCK || env.VITE_USE_MOCK });
  return {
    plugins: [vue(), tailwindcss(), ...(useMock ? [mockBackend()] : []), ...(command === "serve" && process.env.EAP_VUE_MCP === "true"
      ? [VueMcp({ host: "127.0.0.1", updateCursorMcpJson: false })] : [])],
    ...(command === "serve" && mode !== "test" ? { define: {
      "import.meta.env.VITE_API_URL": JSON.stringify(env.VITE_API_URL || process.env.VITE_API_URL || "/api"),
      "import.meta.env.VITE_USE_MOCK": JSON.stringify(useMock ? "true" : "false"),
    } } : {}),
    server: {
      host: "127.0.0.1",
      proxy: useMock ? undefined : { "/api": { target: "http://127.0.0.1:8080", changeOrigin: true } },
    },
  };
});
