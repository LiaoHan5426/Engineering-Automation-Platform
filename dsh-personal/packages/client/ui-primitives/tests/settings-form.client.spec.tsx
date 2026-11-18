// @vitest-environment jsdom
/** The settings form frame: what it says in each state, and that leaving it discards. */
import { h } from "vue";
import { fireEvent, screen } from "@testing-library/dom";
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from "./vue-render.ts";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { SettingsForm } from "../src/settings-form/SettingsForm.tsx";
import type { SettingsFormShell } from "../src/settings-form/form-model.ts";
afterEach(cleanup);
const labels = {
  unavailable: "Not loaded.",
  readOnly: "Read-only.",
  saveFailed: "Not accepted.",
  save: "Save",
  saving: "Saving…",
};
const settled: SettingsFormShell = {
  available: true,
  writable: true,
  dirty: false,
  invalid: false,
  saving: false,
  failed: false,
};
async function renderForm(state: Partial<SettingsFormShell> = {}) {
  const onSave = vi.fn();
  const onDiscard = vi.fn();
  await act(async () =>
    render(
      h(
        SettingsForm,
        { labels: labels, state: { ...settled, ...state }, onSave: onSave, onDiscard: onDiscard },
        { default: () => [h("input", { "aria-label": "Field" }, undefined)] },
      ),
    ),
  );
  return { onSave, onDiscard };
}
it("says the namespace is not served in place of the controls", async () => {
  await renderForm({ available: false });
  expect(screen.getByRole("status").textContent).toBe(labels.unavailable);
  expect(screen.queryByLabelText("Field")).toBeNull();
});
it("keeps the save inert until something is staged, then saves on click", async () => {
  const { onSave } = await renderForm();
  expect(screen.getByRole("button", { name: labels.save })).toHaveProperty("disabled", true);
  cleanup();
  const dirty = await renderForm({ dirty: true });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: labels.save })));
  expect(dirty.onSave).toHaveBeenCalledOnce();
  expect(onSave).not.toHaveBeenCalled();
});
it("blocks the save while a draft is invalid or one is in flight, and reports a refused save", async () => {
  await renderForm({ dirty: true, invalid: true });
  expect(screen.getByRole("button", { name: labels.save })).toHaveProperty("disabled", true);
  cleanup();
  await renderForm({ dirty: true, saving: true });
  expect(screen.getByRole("button", { name: labels.saving })).toHaveProperty("disabled", true);
  cleanup();
  await renderForm({ dirty: true, failed: true });
  expect(screen.getByRole("status").textContent).toBe(labels.saveFailed);
});
it("says the document is read-only over the controls", async () => {
  await renderForm({ writable: false });
  expect(screen.getByRole("status").textContent).toBe(labels.readOnly);
  expect(screen.getByLabelText("Field")).toBeTruthy();
});
it("discards when it leaves the page, calling the latest discard it was given", async () => {
  const first = vi.fn();
  const second = vi.fn();
  const { rerender, unmount } = await act(async () =>
    render(
      h(
        SettingsForm,
        { labels: labels, state: settled, onSave: vi.fn(), onDiscard: first },
        { default: () => [h("span", null, undefined)] },
      ),
    ),
  );
  await act(async () => {
    rerender(
      h(
        SettingsForm,
        { labels: labels, state: settled, onSave: vi.fn(), onDiscard: second },
        { default: () => [h("span", null, undefined)] },
      ),
    );
  });
  unmount();
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledOnce();
});
