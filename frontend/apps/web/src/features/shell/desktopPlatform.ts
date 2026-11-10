/**
 * DesktopPlatform contract (docs/desktop-spec.md).
 * Vue calls this adapter only — never electron / ipcRenderer / preload internals.
 */

export type DesktopNotificationInput = {
  title?: string
  body?: string
}

export type DesktopPlatformInfo = {
  shell: string
  scaffold?: boolean
  /** Major version from Electron shell (45+). */
  electronMajor?: number
  platform?: string
  arch?: string
  versions?: Record<string, string | undefined>
}

export type DesktopPlatform = {
  chooseWorkspace: () => Promise<string | null>
  getPlatformInfo?: () => Promise<DesktopPlatformInfo>
  openExternal?: (url: string) => Promise<{ ok: boolean; denial?: string } | void>
  showNotification?: (input: DesktopNotificationInput) => Promise<{ ok: boolean } | void>
}

declare global {
  interface Window {
    /** Canonical preload surface from desktop-spec. */
    eap?: DesktopPlatform
  }
}

/** Resolve the single public surface exposed by the desktop preload. */
export function resolveDesktopBridge(
  win: Window | undefined = typeof window === 'undefined' ? undefined : window,
): DesktopPlatform | null {
  if (!win) return null
  if (typeof win.eap?.chooseWorkspace === 'function') return win.eap
  return null
}

export function isDesktopScaffold(info: DesktopPlatformInfo | null | undefined) {
  return info?.scaffold === true || info?.shell === 'electron'
}
