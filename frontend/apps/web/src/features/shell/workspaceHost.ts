import { useMockServices } from "../../lib/serviceConfig";
import { resolveDesktopBridge } from "./desktopPlatform";

/**
 * Where filesystem authority is expected to run.
 * Browser localStorage / intendedPath never becomes the process cwd or write authority.
 * Product default is colocated local Java service (see docs/running-context.md).
 */
export type WorkspaceHostKind =
  /** Dev mock: no real repository IO. */
  | "mock"
  /**
   * Default product: UI talks to the colocated local Java service.
   * Process-bound root on that JVM is the workspace binding; optional desktop bridge is enhancement only.
   */
  | "local-service"
  /**
   * Desktop preload exposes chooseWorkspace for path picking UX.
   * File authority remains the local service when colocated; bridge does not create a remote grant store.
   */
  | "local-bridge";

export type WorkspaceHost = {
  kind: WorkspaceHostKind;
  /**
   * True when this UI expects repository file ops through the product host
   * (local Java service and/or desktop bridge), not through browser storage.
   */
  localFiles: boolean;
  /** True when `/ai/workspace/*` may describe the local Java process disk. */
  serverDiskObservation: boolean;
};

export function detectWorkspaceHost(mock = useMockServices): WorkspaceHost {
  if (mock) {
    return { kind: "mock", localFiles: false, serverDiskObservation: false };
  }
  if (resolveDesktopBridge()) {
    return { kind: "local-bridge", localFiles: true, serverDiskObservation: true };
  }
  return { kind: "local-service", localFiles: true, serverDiskObservation: true };
}

export function workspaceHostNoteKey(host: WorkspaceHost = detectWorkspaceHost()) {
  if (host.kind === "mock") return "desktop.hostMock";
  if (host.kind === "local-bridge") return "desktop.hostLocalBridge";
  return "desktop.hostLocalService";
}
