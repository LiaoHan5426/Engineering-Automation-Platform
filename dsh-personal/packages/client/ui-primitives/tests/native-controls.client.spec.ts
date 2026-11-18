// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/dom";
import { describe, expect, it, vi } from "vite-plus/test";
import { h } from "vue";
import { renderVue as render } from "./vue-render.ts";
import { Button } from "../src/Button.tsx";
import { Input } from "../src/Input.tsx";
import { Pill } from "../src/Pill.tsx";
import buttonCss from "../src/Button.module.css";
describe("Button", () => {
  it("exposes its native button for focus and releases the ref on unmount", () => {
    const ref = { current: null as HTMLButtonElement | null };
    const { unmount } = render(
      h(
        Button,
        {
          elementRef: (element) => {
            ref.current = element;
          },
        },
        () => ["Focus"],
      ),
    );
    expect(ref.current).toBe(screen.getByRole("button", { name: "Focus" }));
    ref.current?.focus();
    expect(document.activeElement).toBe(ref.current);
    unmount();
    expect(ref.current).toBeNull();
  });
  it("renders children, icon, and forwards clicks", () => {
    const onClick = vi.fn();
    render(
      h(
        Button,
        { variant: "primary", onClick },
        { icon: () => h("svg", { "data-testid": "ic" }), default: () => "Go" },
      ),
    );
    const button = screen.getByRole("button", { name: "Go" });
    expect(screen.getByTestId("ic")).toBeDefined();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it("disabled blocks interaction", () => {
    const onClick = vi.fn();
    render(h(Button, { disabled: true, onClick: onClick }, () => ["No"]));
    screen.getByRole<HTMLButtonElement>("button").click();
    expect(onClick).not.toHaveBeenCalled();
  });
  it("selects the outline stylesheet for outlined actions only", () => {
    const { rerender } = render(h(Button, { variant: "outline" }, () => ["Cancel"]));
    const button = screen.getByRole("button", { name: "Cancel" });
    expect(button.classList.contains(buttonCss.outline!)).toBe(true);
    for (const variant of ["primary", "ghost", "toolbar"] as const) {
      rerender(h(Button, { variant: variant }, () => ["Cancel"]));
      expect(button.classList.contains(buttonCss.outline!)).toBe(false);
    }
  });
  it("keeps the native element and focus when the variant changes", () => {
    const ref = { current: null as HTMLButtonElement | null };
    const { rerender } = render(
      h(
        Button,
        {
          elementRef: (element) => {
            ref.current = element;
          },
          variant: "outline",
        },
        () => ["Open"],
      ),
    );
    const button = screen.getByRole("button");
    button.focus();
    rerender(
      h(
        Button,
        {
          elementRef: (element) => {
            ref.current = element;
          },
          variant: "primary",
        },
        () => ["Open"],
      ),
    );
    expect(ref.current).toBe(button);
    expect(document.activeElement).toBe(button);
    rerender(
      h(
        Button,
        {
          elementRef: (element) => {
            ref.current = element;
          },
          variant: "outline",
        },
        () => ["Open"],
      ),
    );
    expect(ref.current).toBe(button);
    expect(document.activeElement).toBe(button);
  });
});
it("keeps native form attributes and listener ownership on the actual controls", () => {
  const onSubmit = vi.fn((event: Event) => {
    event.preventDefault();
  });
  const onInput = vi.fn((event: Event) => {
    expect(event.target).toBe(screen.getByRole("textbox"));
  });
  const view = render(
    h("form", { onSubmit }, [
      h(Button, { "aria-label": "Apply", title: "Apply changes", name: "action", value: "apply" }),
      h(Input, {
        name: "query",
        "aria-label": "Query",
        onInput,
        disabled: true,
        class: "native-input",
        className: "input-wrap",
      }),
    ]),
  );
  const button = screen.getByRole<HTMLButtonElement>("button", { name: "Apply" });
  expect(button.type).toBe("button");
  expect(button.name).toBe("action");
  expect(button.value).toBe("apply");
  expect(button.title).toBe("Apply changes");
  button.click();
  expect(onSubmit).not.toHaveBeenCalled();
  const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Query" });
  expect(input.disabled).toBe(true);
  expect(input.name).toBe("query");
  expect(input.classList.contains("native-input")).toBe(true);
  expect(input.parentElement?.classList.contains("input-wrap")).toBe(true);
  view.rerender(h(Input, { "aria-label": "Query", onInput }));
  fireEvent.input(screen.getByRole("textbox"), { target: { value: "updated" } });
  expect(onInput).toHaveBeenCalledOnce();
});

describe("Pill", () => {
  it("is a span when static, a button when clickable", () => {
    const { rerender } = render(h(Pill, { active: true }, () => ["tab"]));
    expect(screen.queryByRole("button")).toBeNull();
    rerender(h(Pill, { onClick: () => {} }, () => ["tab"]));
    expect(screen.getByRole("button", { name: "tab" })).toBeDefined();
  });
  it("active and className land on both static and interactive forms", () => {
    const { container, rerender } = render(h(Pill, { className: "x" }, () => ["tab"]));
    const asSpan = container.firstElementChild as HTMLElement;
    expect(asSpan.classList.contains("x")).toBe(true);
    rerender(h(Pill, { active: true, className: "x", onClick: () => {} }, () => ["tab"]));
    const asButton = screen.getByRole("button");
    expect(asButton.classList.contains("x")).toBe(true);
  });
});
describe("Input", () => {
  it("exposes its native input for focus and releases the ref on unmount", () => {
    const ref = { current: null as HTMLInputElement | null };
    const { unmount } = render(
      h(Input, {
        elementRef: (element) => {
          ref.current = element;
        },
        "aria-label": "Search",
      }),
    );
    expect(ref.current).toBe(screen.getByRole("textbox", { name: "Search" }));
    ref.current?.focus();
    expect(document.activeElement).toBe(ref.current);
    unmount();
    expect(ref.current).toBeNull();
  });
  it("forwards value/onChange and renders the leading icon", () => {
    const onChange = vi.fn();
    render(
      h(
        Input,
        { value: "q", onChange, placeholder: "search" },
        { icon: () => h("svg", { "data-testid": "ic" }) },
      ),
    );
    const input = screen.getByPlaceholderText<HTMLInputElement>("search");
    expect(input.value).toBe("q");
    fireEvent.change(input, { target: { value: "qq" } });
    expect(onChange).toHaveBeenCalledOnce();
    expect(screen.getByTestId("ic")).toBeDefined();
  });
});
