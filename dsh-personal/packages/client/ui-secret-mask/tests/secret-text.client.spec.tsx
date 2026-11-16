import { h, nextTick } from "vue";
// @vitest-environment jsdom
/** The masked credential renderer: reveal control, accessible names, and reset to masked. */
import { render, cleanup } from "@deepseek-ai/dsh-client-test-runtime/src/vue-test.ts";
import { fireEvent } from "@testing-library/dom";
type ComponentProps<
  T extends abstract new (...args: never[]) => {
    $props: unknown;
  },
> = InstanceType<T>["$props"];
import { afterEach, describe, expect, it } from "vitest";
import { makeTranslate } from "@deepseek-ai/dsh-client-test-runtime";
import { SecretText } from "../src/client/SecretText.tsx";
import { en, zh } from "../src/client/locales.ts";
afterEach(cleanup);
type Props = ComponentProps<typeof SecretText>;
// Assembled at run time so the repository holds no literal in a credential format.
const KEY = ["sk", "-", "0123456789abcdef0123456789abcdef"].join("");
const OTHER = ["sk", "-", "fedcba9876543210fedcba9876543210"].join("");
const masked = (value: string): string => value.slice(0, 8) + "*".repeat(value.length - 8);
function props(raw: string, interactive: boolean, dictionary: Record<string, string> = zh): Props {
  // The component reads only these owner and locale seats.
  return {
    node: { id: "secret", start: 0, end: raw.length, data: { masked: masked(raw) } },
    raw,
    interactive,
    t: makeTranslate(dictionary),
  } as Props;
}
describe("SecretText", () => {
  it("draws only the masked form without a control in non-interactive text", async () => {
    const view = render(h("div", { "data-host": true }, [h(SecretText, { ...props(KEY, false) })]));
    await nextTick();
    const run = view.container.querySelector("[data-secret]")!;
    expect(run.textContent).toBe(masked(KEY));
    expect(view.container.querySelector("button")).toBeNull();
  });
  it("reveals and hides the value from its own control", async () => {
    const view = render(h(SecretText, { ...props(KEY, true) }));
    await nextTick();
    const run = view.container.querySelector("[data-secret]")!;
    const reveal = view.getByRole("button", { name: "显示密钥" });
    expect(run.textContent).toBe(masked(KEY));
    expect(reveal.getAttribute("aria-pressed")).toBe("false");
    expect(reveal.querySelector("svg")).not.toBeNull();
    await fireEvent.click(reveal);
    expect(run.textContent).toBe(KEY);
    const hide = view.getByRole("button", { name: "隐藏密钥" });
    expect(hide.getAttribute("aria-pressed")).toBe("true");
    await fireEvent.click(hide);
    expect(run.textContent).toBe(masked(KEY));
  });
  it("starts masked again when a different credential reuses the same element", async () => {
    const view = render(h(SecretText, { ...props(KEY, true, en) }));
    await nextTick();
    await fireEvent.click(view.getByRole("button", { name: "Show secret" }));
    view.rerender(h(SecretText, { ...props(OTHER, true, en) }));
    await nextTick();
    expect(view.container.querySelector("[data-secret]")!.textContent).toBe(masked(OTHER));
    expect(view.getByRole("button", { name: "Show secret" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });
});
