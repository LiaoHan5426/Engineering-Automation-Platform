// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vite-plus/test";
import {
  chooseLocalWorkspace,
  clearLocalWorkspaceGrant,
  hasLocalWorkspaceGrant,
  localBridgeState,
  localGrantPath,
  resetLocalBridgeForTests,
} from "./localBridge";
import { projectIntendedPath, resetLocalProjectsForTests, selectLocalProject, updateProjectIntendedPath } from "./localProjects";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetLocalProjectsForTests();
  resetLocalBridgeForTests();
  delete window.eap;
  delete window.eapDesktop;
});

it("refuses choose when the local bridge is missing", async () => {
  const result = await chooseLocalWorkspace("local-eap");
  expect(result).toEqual({ ok: false, denial: "LOCAL_BRIDGE_MISSING" });
  expect(hasLocalWorkspaceGrant()).toBe(false);
  expect(localBridgeState.lastDenial).toBe("LOCAL_BRIDGE_MISSING");
});

it("records a local session grant from window.eap without posting to the server", async () => {
  window.eap = { chooseWorkspace: vi.fn(async () => "J:/Code/Engineering-Automation-Platform") };
  selectLocalProject("local-eap");
  const result = await chooseLocalWorkspace("local-eap");
  expect(result.ok).toBe(true);
  expect(localGrantPath()).toBe("J:/Code/Engineering-Automation-Platform");
  expect(projectIntendedPath("local-eap")).toBe("J:/Code/Engineering-Automation-Platform");
  expect(JSON.parse(sessionStorage.getItem("eap.local-workspace-grant.v1") || "{}").source).toBe("desktop-bridge");
});

it("does not treat a manually typed intended path as a grant, and renaming preference keeps grant separate", async () => {
  window.eapDesktop = { chooseWorkspace: vi.fn(async () => "J:/repos/demo") };
  selectLocalProject("local-eap");
  await chooseLocalWorkspace("local-eap");
  expect(hasLocalWorkspaceGrant()).toBe(true);
  updateProjectIntendedPath("local-eap", "J:/typed-only");
  expect(projectIntendedPath("local-eap")).toBe("J:/typed-only");
  expect(localGrantPath()).toBe("J:/repos/demo");
  clearLocalWorkspaceGrant();
  expect(hasLocalWorkspaceGrant()).toBe(false);
  expect(projectIntendedPath("local-eap")).toBe("J:/typed-only");
});

it("treats cancelled dialogs as cancelled, not as a forged grant", async () => {
  window.eap = { chooseWorkspace: vi.fn(async () => null) };
  const result = await chooseLocalWorkspace("local-eap");
  expect(result).toEqual({ ok: false, denial: "CHOOSE_CANCELLED" });
  expect(hasLocalWorkspaceGrant()).toBe(false);
});
