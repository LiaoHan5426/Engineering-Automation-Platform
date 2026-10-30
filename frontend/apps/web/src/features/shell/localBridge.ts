import { reactive } from "vue";
import { resolveDesktopBridge } from "./desktopPlatform";
import { detectWorkspaceHost } from "./workspaceHost";
import { localProjectState, updateProjectIntendedPath } from "./localProjects";

/** Local session grant from the desktop bridge. Never posted to the Java server. */
export type LocalWorkspaceGrant = {
  path: string;
  grantedAt: string;
  projectId: string | null;
  source: "desktop-bridge";
};

export type ChooseWorkspaceResult =
  | { ok: true; path: string; grant: LocalWorkspaceGrant }
  | { ok: false; denial: "LOCAL_BRIDGE_MISSING" | "CHOOSE_CANCELLED" | "CHOOSE_FAILED"; detail?: string };

const GRANT_KEY = "eap.local-workspace-grant.v1";

export const localBridgeState = reactive({
  grant: null as LocalWorkspaceGrant | null,
  lastDenial: "" as string,
  choosing: false,
});

function sessionStore(): Storage | undefined {
  try {
    return typeof sessionStorage === "undefined" ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}

function readGrant(): LocalWorkspaceGrant | null {
  const raw = sessionStore()?.getItem(GRANT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.source !== "desktop-bridge" || typeof parsed.path !== "string" || !parsed.path.trim()) return null;
    if (typeof parsed.grantedAt !== "string" || !parsed.grantedAt) return null;
    return {
      path: parsed.path.trim().slice(0, 512),
      grantedAt: parsed.grantedAt,
      projectId: typeof parsed.projectId === "string" ? parsed.projectId : null,
      source: "desktop-bridge",
    };
  } catch {
    return null;
  }
}

function writeGrant(grant: LocalWorkspaceGrant | null) {
  const store = sessionStore();
  if (!store) return;
  if (!grant) store.removeItem(GRANT_KEY);
  else store.setItem(GRANT_KEY, JSON.stringify(grant));
}

localBridgeState.grant = readGrant();

export function localGrantPath() {
  return localBridgeState.grant?.path ?? "";
}

export function hasLocalWorkspaceGrant() {
  return !!localBridgeState.grant?.path;
}

/**
 * Choose a directory via the desktop bridge and record a local session grant.
 * Updates intendedPath for the selected project as a preference mirror; does not call the server.
 */
export async function chooseLocalWorkspace(projectId: string | null = localProjectState.selectedId): Promise<ChooseWorkspaceResult> {
  localBridgeState.choosing = true;
  localBridgeState.lastDenial = "";
  try {
    const host = detectWorkspaceHost();
    const bridge = resolveDesktopBridge();
    if (host.kind === "mock" || !bridge) {
      localBridgeState.lastDenial = "LOCAL_BRIDGE_MISSING";
      return { ok: false, denial: "LOCAL_BRIDGE_MISSING" };
    }
    let path: string | null;
    try {
      path = await bridge.chooseWorkspace();
    } catch (error) {
      localBridgeState.lastDenial = "CHOOSE_FAILED";
      return { ok: false, denial: "CHOOSE_FAILED", detail: error instanceof Error ? error.message : String(error) };
    }
    if (!path || !path.trim()) {
      localBridgeState.lastDenial = "CHOOSE_CANCELLED";
      return { ok: false, denial: "CHOOSE_CANCELLED" };
    }
    const normalized = path.trim().slice(0, 512);
    const grant: LocalWorkspaceGrant = {
      path: normalized,
      grantedAt: new Date().toISOString(),
      projectId,
      source: "desktop-bridge",
    };
    localBridgeState.grant = grant;
    writeGrant(grant);
    if (projectId) updateProjectIntendedPath(projectId, normalized);
    return { ok: true, path: normalized, grant };
  } finally {
    localBridgeState.choosing = false;
  }
}

/** Clear local session grant only. Does not rename the project or wipe intendedPath preference. */
export function clearLocalWorkspaceGrant() {
  localBridgeState.grant = null;
  localBridgeState.lastDenial = "";
  writeGrant(null);
}

/** Test seam. */
export function resetLocalBridgeForTests() {
  localBridgeState.grant = null;
  localBridgeState.lastDenial = "";
  localBridgeState.choosing = false;
  sessionStore()?.removeItem(GRANT_KEY);
}
