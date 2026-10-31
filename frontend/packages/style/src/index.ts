/**
 * Theme and token entry.
 * Reskin by overriding `--eap-*` (see `tokens.css`). Do not fork component class names.
 * The `eap-` class prefix is fixed BEM, not an Element Plus-style compile namespace.
 */
export const EAP_THEME_ATTR = "data-eap-theme";

export const themes = ["light", "dark"] as const;

export type EapTheme = (typeof themes)[number];

export const DEFAULT_THEME: EapTheme = "light";

export function isEapTheme(value: unknown): value is EapTheme {
  return typeof value === "string" && (themes as readonly string[]).includes(value);
}

/**
 * Apply a theme by setting `data-eap-theme` on the given root (default: documentElement).
 * Theme CSS must already be loaded (for example `@eap/style/themes.css`).
 */

export function applyTheme(
  theme: EapTheme,
  root: HTMLElement = document.documentElement,
): EapTheme {
  root.setAttribute(EAP_THEME_ATTR, theme);
  return theme;
}

export function getTheme(root: HTMLElement = document.documentElement): EapTheme {
  const value = root.getAttribute(EAP_THEME_ATTR);
  return isEapTheme(value) ? value : DEFAULT_THEME;
}

export type EapDensity = "comfortable" | "compact";
export type EapSkin = "default" | "console";
export interface EapAppearance {
  theme?: EapTheme;
  skin?: EapSkin;
  density?: EapDensity;
  layout?: { sidebarWidth?: number; railWidth?: number; contentMaxWidth?: number };
}

/** Pure DOM configuration: no storage, system preference listeners or app state. */
export function applyAppearance(options: EapAppearance, root: HTMLElement = document.documentElement) {
  if (options.theme) applyTheme(options.theme, root);
  if (options.skin) root.setAttribute("data-eap-skin", options.skin);
  if (options.density) root.setAttribute("data-eap-density", options.density);
  const sizes = {
    sidebarWidth: "--eap-layout-sidebar-width",
    railWidth: "--eap-layout-rail-width",
    contentMaxWidth: "--eap-layout-content-max-width",
  } as const;
  for (const key of Object.keys(sizes) as Array<keyof typeof sizes>) {
    const value = options.layout?.[key];
    if (value !== undefined && Number.isFinite(value) && value > 0) {
      root.style.setProperty(sizes[key], `${value}px`);
    }
  }
}

/** Pass null to remove a local override and inherit the host palette again. */
export function applyTokens(
  tokens: Partial<Record<`--eap-${string}`, string | null>>,
  root: HTMLElement = document.documentElement,
) {
  root.setAttribute("data-eap-tokens", "");
  for (const [key, value] of Object.entries(tokens)) {
    if (!key.startsWith("--eap-")) continue;
    if (value == null) root.style.removeProperty(key);
    else root.style.setProperty(key, value);
  }
}
