import { shallowRef, ref } from "vue";
import { applyAppearance, type EapDensity, type EapSkin } from "@eap/style";

export const APPEARANCE_KEY = "eap.appearance.v1";
export type AppearancePreferences = {
  theme: "light" | "dark" | "system";
  skin: EapSkin;
  density: EapDensity;
  sidebarWidth: number;
  railWidth: number;
  contentMaxWidth: number;
};
export const appearanceDefaults: Readonly<AppearancePreferences> = {
  theme: "light", skin: "console", density: "comfortable", sidebarWidth: 288, railWidth: 360, contentMaxWidth: 1480,
};
export function normalizeAppearance(value: unknown): AppearancePreferences {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  function size(key: "sidebarWidth" | "railWidth" | "contentMaxWidth", min: number, max: number) {
    const raw = source[key];
    return typeof raw === "number" && Number.isFinite(raw) ? Math.min(max, Math.max(min, Math.round(raw))) : appearanceDefaults[key];
  }
  return {
    theme: source.theme === "dark" || source.theme === "system" ? source.theme : "light",
    skin: source.skin === "default" ? "default" : "console",
    density: source.density === "compact" ? "compact" : "comfortable",
    sidebarWidth: size("sidebarWidth", 240, 380), railWidth: size("railWidth", 280, 560), contentMaxWidth: size("contentMaxWidth", 960, 1920),
  };
}
export function decodeAppearance(raw: string | null): AppearancePreferences {
  if (!raw) return { ...appearanceDefaults };
  try {
    const record = JSON.parse(raw);
    return record?.version === 1 ? normalizeAppearance(record.preferences) : { ...appearanceDefaults };
  } catch { return { ...appearanceDefaults }; }
}
export const appearance = shallowRef<AppearancePreferences>({ ...appearanceDefaults });
export const appearanceStorageError = ref(false);
function apply() {
  if (typeof document === "undefined") return;
  const value = appearance.value;
  const theme = value.theme === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light") : value.theme;
  applyAppearance({ theme, skin: value.skin, density: value.density,
    layout: { sidebarWidth: value.sidebarWidth, railWidth: value.railWidth, contentMaxWidth: value.contentMaxWidth } });
}
export function setAppearance(value: unknown) {
  appearance.value = normalizeAppearance(value);
  apply();
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ version: 1, preferences: appearance.value }));
    appearanceStorageError.value = false;
  } catch { appearanceStorageError.value = true; }
}
export function initializeAppearance() {
  try { appearance.value = decodeAppearance(localStorage.getItem(APPEARANCE_KEY)); appearanceStorageError.value = false; }
  catch { appearanceStorageError.value = true; }
  apply();
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  const systemChanged = () => { if (appearance.value.theme === "system") apply(); };
  const storageChanged = (event: StorageEvent) => {
    if (event.key === APPEARANCE_KEY || event.key === null) {
      appearance.value = decodeAppearance(event.newValue); apply();
    }
  };
  media?.addEventListener("change", systemChanged);
  window.addEventListener("storage", storageChanged);
  return () => { media?.removeEventListener("change", systemChanged); window.removeEventListener("storage", storageChanged); };
}
