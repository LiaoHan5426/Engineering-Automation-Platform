// @vitest-environment jsdom
/** Attachment galleries use the shipped roster and Loader lifecycle. */
import { expect } from "vitest";
import {
  createClientTest,
  webApp,
} from "@deepseek-ai/dsh-client-test-runtime/src/assembly/index.ts";

const ATTACHMENT = "@deepseek-ai/dsh-client-ui-attachment";
const test = createClientTest({
  roster: webApp.closure([
    ATTACHMENT,
    "@deepseek-ai/dsh-client-ui-layout",
    "@deepseek-ai/dsh-client-ui-chat",
    "@deepseek-ai/dsh-client-ui-tool",
  ]),
});

test("loads chat and tool image galleries and removes them on unload", async ({ start }) => {
  const client = await start();
  const positions = [
    "conversation.chat.message.images",
    "conversation.chat.user.images",
    "tool.call.images",
  ] as const;
  for (const name of positions) {
    expect(client.ctx.slots.entries(name)).toHaveLength(1);
    expect(client.ctx.slots.entries(name)[0]?.options.priority).toBe(100);
  }
  await client.unload(ATTACHMENT);
  for (const name of positions) expect(client.ctx.slots.entries(name)).toHaveLength(0);
}, 60_000);
