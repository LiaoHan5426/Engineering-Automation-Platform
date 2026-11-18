// @vitest-environment jsdom
import { h } from "vue";
import { screen } from "@testing-library/dom";
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from "./vue-render.ts";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { UserMessageBubble } from "../src/UserMessageBubble.tsx";
afterEach(cleanup);
describe("UserMessageBubble", () => {
  it("preserves caller content, attributes, and layout class", async () => {
    await act(async () =>
      render(
        h(
          UserMessageBubble,
          { className: "owner-layout", role: "group", "aria-label": "answer" },
          {
            default: () => [
              h("dl", null, [h("dt", null, ["Which color?"]), h("dd", null, ["Blue"])]),
            ],
          },
        ),
      ),
    );
    const surface = screen.getByRole("group", { name: "answer" });
    expect(surface.classList.contains("owner-layout")).toBe(true);
    expect(screen.getByText("Which color?").tagName).toBe("DT");
    expect(screen.getByText("Blue").tagName).toBe("DD");
  });
  it("renders a plain surface without additional interaction", async () => {
    await act(async () =>
      render(h(UserMessageBubble, null, { default: () => ["Plain user text"] })),
    );
    expect(screen.getByText("Plain user text").tagName).toBe("DIV");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
