import { expect, it, vi } from "vite-plus/test";
import type { AiStatus } from "@eap/runtime-client";
import { runtimeApi } from "@eap/runtime-client";
import {
  applyRuntimeIdentity,
  formatDirtyLine,
  formatVerificationConfig,
  identityAuthorized,
  identityFromStatus,
  identityPath,
  processBoundRootPath,
  refreshWorkspaceDirty,
  runtimeIdentity,
  workspaceDirty,
} from "./runtimeIdentity";

function status(partial: Partial<AiStatus> = {}): AiStatus {
  return {
    state: "available",
    provider: "mock",
    model: "m",
    configurationRevision: "r",
    lastObservedAt: null,
    errorCode: "",
    tools: { git_status: false },
    workspaceLabel: "ws-abc",
    storesUserDirectoryGrants: false,
    ...partial,
  };
}

it("keeps local group labels out of the server identity path", () => {
  runtimeIdentity.value = null;
  workspaceDirty.value = null;
  expect(identityFromStatus(null)).toBeNull();
  applyRuntimeIdentity(status({
    workspacePath: "J:/Code/Engineering-Automation-Platform",
    authorizedRootPath: "",
    authorizedRootDenial: "AUTHORIZED_ROOT_MISSING",
  }));
  expect(identityPath(runtimeIdentity.value)).toBe("J:/Code/Engineering-Automation-Platform");
  expect(processBoundRootPath(runtimeIdentity.value)).toBe("");
  expect(identityAuthorized(runtimeIdentity.value)).toBe(false);
  expect(runtimeIdentity.value?.storesUserDirectoryGrants).toBe(false);
  applyRuntimeIdentity(status({
    workspacePath: "J:/Code/Engineering-Automation-Platform",
    authorizedRootPath: "J:/Code/bound-root",
    authorizedRootDenial: "",
  }));
  expect(identityAuthorized(runtimeIdentity.value)).toBe(true);
  expect(identityPath(runtimeIdentity.value)).toBe("J:/Code/Engineering-Automation-Platform");
  expect(processBoundRootPath(runtimeIdentity.value)).toBe("J:/Code/bound-root");
  expect(runtimeIdentity.value?.storesUserDirectoryGrants).toBe(false);
  runtimeIdentity.value = null;
  workspaceDirty.value = null;
});

it("never treats a missing storesUserDirectoryGrants flag as true", () => {
  applyRuntimeIdentity(status({ storesUserDirectoryGrants: undefined }));
  expect(runtimeIdentity.value?.storesUserDirectoryGrants).toBe(false);
  applyRuntimeIdentity(status({ storesUserDirectoryGrants: true }));
  expect(runtimeIdentity.value?.storesUserDirectoryGrants).toBe(true);
  runtimeIdentity.value = null;
});

it("reports verification config without claiming checks already ran", () => {
  const t = (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key;
  applyRuntimeIdentity(status({}));
  expect(runtimeIdentity.value?.verificationEnabled).toBe(false);
  expect(formatVerificationConfig(runtimeIdentity.value, t)).toBe("desktop.verificationConfigOff");
  applyRuntimeIdentity(status({ verificationEnabled: true, verificationCommands: [] }));
  expect(formatVerificationConfig(runtimeIdentity.value, t)).toBe("desktop.verificationConfigEmpty");
  applyRuntimeIdentity(status({ verificationEnabled: true, verificationCommands: ["git-version"] }));
  expect(formatVerificationConfig(runtimeIdentity.value, t)).toContain("git-version");
  runtimeIdentity.value = null;
});

it("clears a stale dirty denial when the process-bound root appears", () => {
  applyRuntimeIdentity(status({
    authorizedRootPath: "",
    authorizedRootDenial: "AUTHORIZED_ROOT_MISSING",
  }));
  workspaceDirty.value = {
    requested: false,
    denial: "AUTHORIZED_ROOT_MISSING",
    count: 0,
    paths: [],
    detail: "",
  };
  applyRuntimeIdentity(status({
    authorizedRootPath: "J:/Code/Engineering-Automation-Platform",
    authorizedRootDenial: "",
  }));
  expect(workspaceDirty.value).toBeNull();
  runtimeIdentity.value = null;
  workspaceDirty.value = null;
});

it("records dirty denial without calling git when root is missing", async () => {
  const spy = vi.spyOn(runtimeApi, "workspaceDirty");
  applyRuntimeIdentity(status({ authorizedRootPath: "", authorizedRootDenial: "AUTHORIZED_ROOT_MISSING" }));
  const dirty = await refreshWorkspaceDirty();
  expect(spy).not.toHaveBeenCalled();
  expect(dirty?.requested).toBe(false);
  expect(dirty?.denial).toBe("AUTHORIZED_ROOT_MISSING");
  expect(formatDirtyLine(dirty, (key, values) => `${key}:${values?.code ?? ""}`)).toContain("AUTHORIZED_ROOT_MISSING");
  spy.mockRestore();
  workspaceDirty.value = null;
  runtimeIdentity.value = null;
});

it("keeps the last dirty line while identity is still loading", async () => {
  workspaceDirty.value = { requested: true, denial: "", count: 1, paths: ["kept.ts"], detail: "" };
  runtimeIdentity.value = null;
  const spy = vi.spyOn(runtimeApi, "workspaceDirty");
  const dirty = await refreshWorkspaceDirty(null);
  expect(spy).not.toHaveBeenCalled();
  expect(dirty?.paths).toEqual(["kept.ts"]);
  expect(formatDirtyLine(dirty, (key, values) => `${key}:${values?.count ?? ""}`)).toBe("desktop.repoDirtyCount:1");
  spy.mockRestore();
  workspaceDirty.value = null;
});

it("loads dirty summary when authorized root is present", async () => {
  const spy = vi.spyOn(runtimeApi, "workspaceDirty").mockResolvedValue({
    requested: true,
    denial: "",
    count: 2,
    paths: ["a.ts", "b.ts"],
    detail: "dirty",
  });
  applyRuntimeIdentity(status({ authorizedRootPath: "J:/Code/Engineering-Automation-Platform", authorizedRootDenial: "" }));
  const dirty = await refreshWorkspaceDirty();
  expect(spy).toHaveBeenCalledOnce();
  expect(dirty?.count).toBe(2);
  expect(formatDirtyLine(dirty, (key, values) => `${key}:${values?.count ?? ""}:${values?.sample ?? ""}`)).toBe("desktop.repoDirtyCount:2:a.ts · b.ts");
  spy.mockRestore();
  workspaceDirty.value = null;
  runtimeIdentity.value = null;
});
