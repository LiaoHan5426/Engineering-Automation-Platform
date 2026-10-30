import type { AiConnectionState, AiStatus, WorkspaceDirty } from "@eap/runtime-client";
import { runtimeApi } from "@eap/runtime-client";
import { shallowRef } from "vue";

/**
 * Local Java service identity from `/ai/status`.
 * Never a browser localStorage path. Process-bound root is the workspace binding when set.
 */
export type RuntimeIdentity = {
  workspaceLabel: string;
  workspacePath: string;
  /** Local-service process-bound workspace root; empty when not configured. */
  authorizedRootPath: string;
  authorizedRootDenial: string;
  gitStatusAvailable: boolean;
  /**
   * Always false in current contract: API refuses remote/browser grant-store POSTs.
   * Does not mean the local service cannot bind a workspace via process config.
   */
  storesUserDirectoryGrants: boolean;
  /** Local-service post-apply verification flag; false by default. */
  verificationEnabled: boolean;
  /** Configured check names; empty means checks stay not_requested. */
  verificationCommands: string[];
  /** Connection readiness from `/ai/status`; never invents a live model call. */
  connectionState: AiConnectionState | "";
  /** Selected model id when the local service has one; empty when disabled/not configured. */
  model: string;
};

export const runtimeIdentity = shallowRef<RuntimeIdentity | null>(null);
/** Latest dirty summary; null until the first request finishes. */
export const workspaceDirty = shallowRef<WorkspaceDirty | null>(null);

export function identityFromStatus(status: AiStatus | null | undefined): RuntimeIdentity | null {
  if (!status) return null;
  return {
    workspaceLabel: status.workspaceLabel || "",
    workspacePath: status.workspacePath?.trim() || "",
    authorizedRootPath: status.authorizedRootPath?.trim() || "",
    authorizedRootDenial: status.authorizedRootDenial?.trim() || "",
    gitStatusAvailable: !!status.tools?.git_status,
    storesUserDirectoryGrants: status.storesUserDirectoryGrants === true,
    verificationEnabled: status.verificationEnabled === true,
    verificationCommands: Array.isArray(status.verificationCommands)
      ? status.verificationCommands.filter((name): name is string => typeof name === "string" && !!name.trim())
      : [],
    connectionState: status.state || "",
    model: status.model?.trim() || "",
  };
}

/** Honest one-line verification config; never claims checks already ran. */
export function formatVerificationConfig(
  identity: RuntimeIdentity | null | undefined,
  translate: (key: string, values?: Record<string, unknown>) => string,
) {
  if (!identity?.verificationEnabled) return translate("desktop.verificationConfigOff");
  if (!identity.verificationCommands.length) return translate("desktop.verificationConfigEmpty");
  return translate("desktop.verificationConfigOn", { names: identity.verificationCommands.join(" · ") });
}

export function applyRuntimeIdentity(status: AiStatus | null | undefined) {
  const previous = runtimeIdentity.value;
  runtimeIdentity.value = identityFromStatus(status);
  const next = runtimeIdentity.value;
  // When bind root appears or changes, clear a stale dirty denial from an earlier unbound probe.
  if (
    previous?.authorizedRootPath !== next?.authorizedRootPath
    || previous?.authorizedRootDenial !== next?.authorizedRootDenial
  ) {
    workspaceDirty.value = null;
  }
}

/** Fetch `/ai/status` into the shared identity. Safe to call from any shell surface. */
export async function refreshRuntimeIdentity() {
  try {
    applyRuntimeIdentity(await runtimeApi.aiStatus());
  } catch {
    /* Leave prior identity; callers keep showing unknown until the next success. */
  }
  return runtimeIdentity.value;
}

/** Identity then dirty, in order, so AUTHORIZED_ROOT_MISSING cannot linger after a successful bind. */
export async function refreshRuntimeIdentityAndDirty() {
  const identity = await refreshRuntimeIdentity();
  await refreshWorkspaceDirty(identity);
  return identity;
}

/** Absolute path on the Java process machine (observation). Never a local group label. */
export function identityPath(identity: RuntimeIdentity | null | undefined) {
  if (!identity) return "";
  return identity.workspacePath || "";
}

/** Optional process-bound root on the same JVM machine; not a remote user grant. */
export function processBoundRootPath(identity: RuntimeIdentity | null | undefined) {
  return identity?.authorizedRootPath || "";
}

/** True when this JVM has a process-bound root configured. */
export function identityAuthorized(identity: RuntimeIdentity | null | undefined) {
  return !!identity?.authorizedRootPath;
}

/** Fetch dirty files when a process-bound root is present; otherwise record the honest denial. */
export async function refreshWorkspaceDirty(identity: RuntimeIdentity | null | undefined = runtimeIdentity.value) {
  // Keep the last dirty line while /ai/status is still loading — do not flash AUTHORIZED_ROOT_MISSING.
  if (!identity) return workspaceDirty.value;
  if (!identityAuthorized(identity)) {
    workspaceDirty.value = {
      requested: false,
      denial: identity.authorizedRootDenial || "AUTHORIZED_ROOT_MISSING",
      count: 0,
      paths: [],
      detail: "",
    };
    return workspaceDirty.value;
  }
  try {
    workspaceDirty.value = await runtimeApi.workspaceDirty();
  } catch {
    workspaceDirty.value = {
      requested: false,
      denial: "GIT_STATUS_FAILED",
      count: 0,
      paths: [],
      detail: "",
    };
  }
  return workspaceDirty.value;
}

/** Shared sidebar / gate label. Does not invent dirty paths. */
export function formatDirtyLine(
  dirty: WorkspaceDirty | null | undefined,
  translate: (key: string, values?: Record<string, unknown>) => string,
) {
  if (!dirty) return translate("desktop.repoDirtyOff");
  if (!dirty.requested) {
    return translate("desktop.repoDirtyDenied", { code: dirty.denial || "AUTHORIZED_ROOT_MISSING" });
  }
  if (dirty.count <= 0) return translate("desktop.repoDirtyClean");
  return translate("desktop.repoDirtyCount", {
    count: dirty.count,
    sample: dirty.paths
      .slice(0, 2)
      .map((path) => path.split(/[/\\]/).pop() || path)
      .join(" · "),
  });
}
