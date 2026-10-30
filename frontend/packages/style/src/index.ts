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
