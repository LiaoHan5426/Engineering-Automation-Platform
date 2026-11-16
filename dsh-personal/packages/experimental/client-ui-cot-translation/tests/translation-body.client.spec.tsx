// @vitest-environment jsdom
/** Expanded reasoning keeps its original accessible across translation lifetimes. */
import { afterEach, expect, it, vi } from "vitest";
import { renderReasoningFactory as renderFactorySlot } from "../../../client/ui-chat/tests/reasoning-component-fixture.tsx";
import { fireEvent, within } from "@testing-library/dom";
import {
  cleanupVue as cleanup,
  flushVue as act,
  renderVue,
} from "../../../client/ui-primitives/tests/vue-render.ts";
import { h } from "vue";
function render(node: Parameters<typeof renderVue>[0]) {
  const view = renderVue(node);
  return { ...view, ...within(document.body) };
}
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import { bindSnapshotSelector, makeTranslate } from "@deepseek-ai/dsh-client-test-runtime";
import type { LocaleSnapshot } from "@deepseek-ai/dsh-client-locale/client";
import { TranslationBody, type TranslationBodyProps } from "../src/client/TranslationBody.tsx";
import type { CotTranslationPreferences } from "../src/preferences.ts";
import { en } from "../src/client/locales.ts";
import type { TranslateText } from "../src/client/translation.ts";
afterEach(cleanup);
function fixture(text = "Original paragraph") {
  const preferences = createSnapshotStore<CotTranslationPreferences>({
    provider: "google",
    targetLanguage: "auto",
  });
  const locale = createSnapshotStore<LocaleSnapshot>({ active: "zh", locales: [], revision: 0 });
  const translationLimit = createSnapshotStore(4000);
  const translate = vi.fn<TranslateText>(
    async (request) => `${request.provider}:${request.targetLanguage}:${request.text}`,
  );
  const props = {
    rawText: "Raw model reasoning",
    text,
    running: false,
    translate,
    renderFactorySlot,
    t: makeTranslate(en),
    usePreferences: bindSnapshotSelector(preferences),
    useTranslationLocale: bindSnapshotSelector(locale),
    useTranslationLimit: bindSnapshotSelector(translationLimit),
  } as TranslationBodyProps;
  return { props, preferences, locale, translationLimit, translate };
}
it("translates display text and switches to its original without another request", async () => {
  const b = fixture(),
    view = render(
      h(TranslationBody, {
        ...b.props,
      }),
    );
  await view.findByText("google:zh:Original paragraph");
  expect(b.translate).toHaveBeenCalledWith(
    { text: "Original paragraph", provider: "google", targetLanguage: "zh" },
    expect.any(AbortSignal),
  );
  const markdown = view.container.querySelector("[data-markdown-variant]");
  await fireEvent.click(view.getByRole("button", { name: "View original" }));
  expect(view.container.querySelector("[data-markdown-variant]")).toBe(markdown);
  expect(view.getByText("Original paragraph")).toBeTruthy();
  expect(view.container.textContent).not.toContain(b.props.rawText);
  await fireEvent.click(view.getByRole("button", { name: "View translation" }));
  expect(view.getByText("google:zh:Original paragraph")).toBeTruthy();
  expect(b.translate).toHaveBeenCalledTimes(1);
  expect(view.container.querySelector("[data-markdown-variant]")).toBe(markdown);
  expect(
    view.container.querySelector("[data-translation-view]")?.getAttribute("data-translation-view"),
  ).toBe("translated");
});
it("cancels stale provider or locale requests and honors an explicit language after locale changes", async () => {
  const b = fixture(),
    first = Promise.withResolvers<string>();
  b.translate.mockImplementationOnce(() => first.promise);
  const view = render(
    h(TranslationBody, {
      ...b.props,
    }),
  );
  const firstSignal = b.translate.mock.calls[0]![1];
  await act(() => {
    b.preferences.set({ provider: "bing", targetLanguage: "ja" });
  });
  expect(firstSignal.aborted).toBe(true);
  await view.findByText("bing:ja:Original paragraph");
  first.resolve("outdated translation");
  await act(async () => {
    await first.promise;
  });
  expect(view.queryByText("outdated translation")).toBeNull();
  await act(() => {
    b.locale.set({ active: "en", locales: [], revision: 1 });
  });
  expect(b.translate).toHaveBeenCalledTimes(2);
  await act(() => {
    b.preferences.set({ provider: "bing", targetLanguage: "auto" });
  });
  await view.findByText("bing:en:Original paragraph");
});
it("shows a generic failure with original text and retries only on the reader action", async () => {
  const b = fixture();
  b.translate.mockRejectedValueOnce(new Error("secret request text"));
  const view = render(
    h(TranslationBody, {
      ...b.props,
    }),
  );
  await view.findByText(en.failed);
  expect(view.getByText("Original paragraph")).toBeTruthy();
  expect(view.container.textContent).not.toContain(b.props.rawText);
  expect(view.queryByRole("button", { name: "View original" })).toBeNull();
  expect(view.getByRole("button", { name: "View translation" }).hasAttribute("disabled")).toBe(
    true,
  );
  expect(view.queryByText("secret request text")).toBeNull();
  await fireEvent.click(view.getByRole("button", { name: "Retry" }));
  await view.findByText("google:zh:Original paragraph");
  expect(view.queryByText(en.failed)).toBeNull();
  expect(view.getByRole("button", { name: "View original" }).hasAttribute("disabled")).toBe(false);
});
it("keeps the full original visible after a later paragraph fails and reuses completed translations on retry", async () => {
  const b = fixture("First\n\nSecond");
  b.translate
    .mockResolvedValueOnce("第一段")
    .mockRejectedValueOnce(new Error("provider unavailable"));
  const view = render(
    h(TranslationBody, {
      ...b.props,
    }),
  );
  await view.findByText(en.failed);
  expect(view.getByText("First")).toBeTruthy();
  expect(view.getByText("Second")).toBeTruthy();
  expect(view.queryByText("第一段")).toBeNull();
  const toggle = view.getByRole("button", { name: "View translation" });
  expect(toggle.hasAttribute("disabled")).toBe(true);
  await fireEvent.click(toggle);
  expect(
    view.container.querySelector("[data-translation-view]")?.getAttribute("data-translation-view"),
  ).toBe("original");
  expect(b.translate).toHaveBeenCalledTimes(2);
  await fireEvent.click(view.getByRole("button", { name: "Retry" }));
  await view.findByText("第一段");
  await view.findByText("google:zh:Second");
  expect(toggle.hasAttribute("disabled")).toBe(false);
  expect(b.translate).toHaveBeenCalledTimes(3);
  expect(b.translate.mock.calls[2]?.[0].text).toBe("Second");
});
it("keeps an unfinished streaming tail original and cancels the disclosure on unmount", async () => {
  const b = fixture("Unfinished"),
    pending = Promise.withResolvers<string>();
  b.translate.mockImplementationOnce(() => pending.promise);
  const view = render(
    h(TranslationBody, {
      ...b.props,
      running: true,
    }),
  );
  expect(b.translate).not.toHaveBeenCalled();
  await view.rerender(
    h(TranslationBody, {
      ...b.props,
      rawText: "Raw model reasoning",
      text: "First\n\nTail",
      running: true,
    }),
  );
  expect(view.getByRole("status", { name: en.translating })).toBeTruthy();
  expect(b.translate.mock.calls[0]?.[0].text).toBe("First");
  expect(view.getByText("Tail", { exact: false })).toBeTruthy();
  expect(view.container.textContent).not.toContain(b.props.rawText);
  const signal = b.translate.mock.calls[0]![1];
  view.unmount();
  expect(signal.aborted).toBe(true);
  pending.resolve("ignored");
  await pending.promise;
});
it("cancels the previous request and rechunks when the request limit changes", async () => {
  const b = fixture("abcdefghij"),
    first = Promise.withResolvers<string>();
  b.translate.mockImplementationOnce(() => first.promise);
  const view = render(
    h(TranslationBody, {
      ...b.props,
    }),
  );
  const firstSignal = b.translate.mock.calls[0]![1];
  await act(() => {
    b.translationLimit.set(4);
  });
  expect(firstSignal.aborted).toBe(true);
  await view.findByText("google:zh:abcdgoogle:zh:efghgoogle:zh:ij");
  expect(b.translate.mock.calls.slice(1).map(([request]) => request.text)).toEqual([
    "abcd",
    "efgh",
    "ij",
  ]);
  first.resolve("outdated long request");
  await act(async () => {
    await first.promise;
  });
  expect(view.queryByText("outdated long request")).toBeNull();
});
