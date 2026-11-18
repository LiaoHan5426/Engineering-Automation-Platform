// @vitest-environment jsdom
/** Tool views follow the shipped client roster's Loader lifecycle. */
import { expect } from "vite-plus/test";
import {
  createClientTest,
  webApp,
} from "@deepseek-ai/dsh-client-test-runtime/src/assembly/index.ts";

const TOOL = "@deepseek-ai/dsh-client-ui-tool";
const test = createClientTest({
  roster: webApp.closure([
    TOOL,
    "@deepseek-ai/dsh-client-ui-layout",
    "@deepseek-ai/dsh-client-ui-chat",
  ]),
});

test("loads tool views through the production Loader and removes them on unload", async ({
  start,
}) => {
  const client = await start();
  const keys = () =>
    client.ctx.slots.entries("tool.call.toolview").map((entry) => entry.options.key);
  expect(keys()).toEqual(
    expect.arrayContaining([
      "bash",
      "read",
      "read_image",
      "ask_user_question",
      "todo_write",
      "web_fetch",
    ]),
  );
  await client.unload(TOOL);
  expect(keys()).not.toContain("bash");
  expect(keys()).not.toContain("read_image");
}, 60_000);
