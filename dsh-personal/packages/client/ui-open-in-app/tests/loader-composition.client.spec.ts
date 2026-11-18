// @vitest-environment jsdom
/** Native opening entries use the shipped roster and Loader lifecycle. */
import { expect } from "vite-plus/test";
import {
  createClientTest,
  webApp,
} from "@deepseek-ai/dsh-client-test-runtime/src/assembly/index.ts";

const OPEN_IN_APP = "@deepseek-ai/dsh-client-ui-open-in-app";
const test = createClientTest({
  roster: webApp.closure([
    OPEN_IN_APP,
    "@deepseek-ai/dsh-client-ui-layout",
    "@deepseek-ai/dsh-client-ui-chat",
    "@deepseek-ai/dsh-client-ui-tool",
    "@deepseek-ai/dsh-client-ui-sidebar-files",
    "@deepseek-ai/dsh-client-ui-sidebar-documentpreview",
    "@deepseek-ai/dsh-client-ui-deliverables",
  ]),
});

test("loads native opening controls and removes them on unload", async ({ start }) => {
  const client = await start();
  const positions = [
    "sidebar.right.tab.files.actions",
    "sidebar.right.tab.document.actions",
    "sidebar.right.tab.document.unpreviewable",
    "deliverables.file.actions",
    "deliverables.review.file.actions",
  ] as const;
  for (const name of positions) {
    expect(client.ctx.slots.entries(name).some((entry) => entry.options.id === "open-in-app")).toBe(
      true,
    );
  }
  expect(
    client.ctx.slots
      .entries("shell.overlay")
      .some((entry) => entry.options.id === "open-in-app.toast"),
  ).toBe(true);
  await client.unload(OPEN_IN_APP);
  for (const name of positions) {
    expect(client.ctx.slots.entries(name).some((entry) => entry.options.id === "open-in-app")).toBe(
      false,
    );
  }
  expect(
    client.ctx.slots
      .entries("shell.overlay")
      .some((entry) => entry.options.id === "open-in-app.toast"),
  ).toBe(false);
}, 60_000);
