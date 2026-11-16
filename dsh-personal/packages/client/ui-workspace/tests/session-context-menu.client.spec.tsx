// @vitest-environment jsdom
import { h as vueH } from "vue";
/** Existing Session actions receive the captured owner and one dismissal context. */
import { cleanup, render } from "./vue-render.client.ts";
import { afterEach, expect, it, vi } from "vitest";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import { SessionMenu } from "../src/client/session-actions/SessionMenu.tsx";
import { brandString } from "@deepseek-ai/dsh-brand";
afterEach(cleanup);
it("ignores other targets and forwards close requests from legacy Session actions", async () => {
  const dismiss = vi.fn();
  const slot = vi.fn(
    (
      _slot: string,
      _owner: unknown,
      _options?: {
        hookContext?: unknown;
      },
    ) => null,
  );
  const renderSlot = slot as InstanceType<typeof SessionMenu>["$props"]["renderSlot"];
  const view = render(
    vueH(SessionMenu, {
      target: { kind: "image", value: { url: "blob:image" } },
      dismiss: dismiss,
      renderSlot: renderSlot,
    }),
  );
  expect(slot).not.toHaveBeenCalled();
  await view.rerender(
    vueH(SessionMenu, {
      target: {
        kind: "session",
        value: { sessionId: brandString<SessionId>("captured"), displayTitle: "Captured" },
      },
      dismiss: dismiss,
      renderSlot: renderSlot,
    }),
  );
  expect(slot.mock.calls[0]?.[1]).toEqual({ sessionId: "captured", displayTitle: "Captured" });
  const [open, setOpen] = slot.mock.calls[0]?.[2]?.hookContext as readonly [
    boolean,
    (value: boolean) => void,
  ];
  expect(open).toBe(true);
  setOpen(true);
  expect(dismiss).not.toHaveBeenCalled();
  setOpen(false);
  expect(dismiss).toHaveBeenCalledOnce();
});
