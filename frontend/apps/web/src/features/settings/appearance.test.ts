// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vite-plus/test";
import { APPEARANCE_KEY, appearance, appearanceDefaults, appearanceStorageError, decodeAppearance, initializeAppearance, normalizeAppearance, setAppearance } from "./appearance";
let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); dispose = undefined; vi.restoreAllMocks(); localStorage.clear(); setAppearance(appearanceDefaults); localStorage.clear(); });

it("restores validated settings and applies them before app mount", () => {
  localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ version: 1, preferences: { theme: "dark", density: "compact", sidebarWidth: 320, railWidth: 420 } }));
  dispose = initializeAppearance();
  expect(appearance.value.theme).toBe("dark");
  expect(document.documentElement.dataset.eapDensity).toBe("compact");
  expect(document.documentElement.style.getPropertyValue("--eap-layout-rail-width")).toBe("420px");
  setAppearance(appearanceDefaults);
  expect(decodeAppearance(localStorage.getItem(APPEARANCE_KEY))).toEqual(appearanceDefaults);
});

it("rejects malformed or unknown versions and clamps unsafe dimensions", () => {
  expect(decodeAppearance("broken")).toEqual(appearanceDefaults);
  expect(decodeAppearance('{"version":2,"preferences":{"theme":"dark"}}')).toEqual(appearanceDefaults);
  expect(normalizeAppearance({ theme: "javascript", sidebarWidth: -10, railWidth: 99999, contentMaxWidth: "100px" }))
    .toEqual({ ...appearanceDefaults, sidebarWidth: 240, railWidth: 560 });
});

it("keeps the current display usable and reports storage failure", () => {
  vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
  setAppearance({ ...appearanceDefaults, theme: "dark" });
  expect(document.documentElement.dataset.eapTheme).toBe("dark");
  expect(appearanceStorageError.value).toBe(true);
});

it("follows system changes only in system mode and removes listeners", () => {
  let listener: (() => void) | undefined;
  const media = { matches: true, addEventListener: vi.fn((_type, next) => { listener = next; }), removeEventListener: vi.fn() };
  vi.spyOn(window, "matchMedia").mockReturnValue(media as unknown as MediaQueryList);
  dispose = initializeAppearance();
  setAppearance({ ...appearanceDefaults, theme: "system" });
  expect(document.documentElement.dataset.eapTheme).toBe("dark");
  media.matches = false; listener?.(); expect(document.documentElement.dataset.eapTheme).toBe("light");
  setAppearance({ ...appearanceDefaults, theme: "dark" }); listener?.(); expect(document.documentElement.dataset.eapTheme).toBe("dark");
  dispose(); dispose = undefined; expect(media.removeEventListener).toHaveBeenCalled();
});

it("synchronizes cross-tab storage updates and reset without writing them back", () => {
  dispose = initializeAppearance();
  const save = vi.spyOn(localStorage, "setItem");
  window.dispatchEvent(new StorageEvent("storage", { key: APPEARANCE_KEY, newValue: JSON.stringify({ version: 1, preferences: { theme: "dark" } }) }));
  expect(appearance.value.theme).toBe("dark"); expect(save).not.toHaveBeenCalled();
  window.dispatchEvent(new StorageEvent("storage", { key: APPEARANCE_KEY, newValue: null }));
  expect(appearance.value).toEqual(appearanceDefaults);
});
