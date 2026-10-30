// @vitest-environment happy-dom
import { afterEach, expect, it } from "vite-plus/test";
import { detectWorkspaceHost, workspaceHostNoteKey } from "./workspaceHost";

afterEach(() => {
  delete window.eap;
  delete window.eapDesktop;
});

it("defaults to colocated local-service when no desktop bridge is present", () => {
  expect(detectWorkspaceHost(true)).toEqual({ kind: "mock", localFiles: false, serverDiskObservation: false });
  const browser = detectWorkspaceHost(false);
  expect(browser.kind).toBe("local-service");
  expect(browser.localFiles).toBe(true);
  expect(browser.serverDiskObservation).toBe(true);
  expect(workspaceHostNoteKey(browser)).toBe("desktop.hostLocalService");
});

it("treats window.eap.chooseWorkspace as an optional desktop bridge enhancement", () => {
  window.eap = { chooseWorkspace: async () => null };
  const host = detectWorkspaceHost(false);
  expect(host).toEqual({ kind: "local-bridge", localFiles: true, serverDiskObservation: true });
  expect(workspaceHostNoteKey(host)).toBe("desktop.hostLocalBridge");
});
