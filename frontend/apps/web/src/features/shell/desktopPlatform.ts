/**
 * DesktopPlatform contract (docs/desktop-spec.md).
 * Vue calls this adapter only — never electron / ipcRenderer / preload internals.
 */

export type DesktopNotificationInput = {
  title?: string;
  body?: string;
};

export type DesktopPlatformInfo = {
  shell: string;
  scaffold?: boolean;
  /** Major version from Electron shell (45+). */
  electronMajor?: number;
  platform?: string;
  arch?: string;
  versions?: Record<string, string | undefined>;
};

export type DesktopPlatform = {
  chooseWorkspace: () => Promise<string | null>;
  getPlatformInfo?: () => Promise<DesktopPlatformInfo>;
  openExternal?: (url: string) => Promise<{ ok: boolean; denial?: string } | void>;
  showNotification?: (input: DesktopNotificationInput) => Promise<{ ok: boolean } | void>;
};

/** @deprecated Prefer DesktopPlatform; kept for existing localBridge imports. */
export type DesktopWorkspaceBridge = Pick<DesktopPlatform, "chooseWorkspace">;

declare global {
  interface Window {
    /** Canonical preload surface from desktop-spec. */
    eap?: DesktopPlatform;
    /** Interim alias used before apps/desktop ships. */
    eapDesktop?: DesktopPlatform;
  }
}

/** Preload may expose window.eap (spec) or window.eapDesktop (interim). */
export function resolveDesktopBridge(
  win: Window | undefined = typeof window === "undefined" ? undefined : window,
): DesktopPlatform | null {
  if (!win) return null;
  if (typeof win.eap?.chooseWorkspace === "function") return win.eap;
  if (typeof win.eapDesktop?.chooseWorkspace === "function") return win.eapDesktop;
  return null;
}

export function isDesktopScaffold(info: DesktopPlatformInfo | null | undefined) {
  return info?.scaffold === true || info?.shell === "electron";
}
