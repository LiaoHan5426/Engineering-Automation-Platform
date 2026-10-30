// @vitest-environment happy-dom
import { expect, it, beforeEach } from "vite-plus/test";
import {
  createLocalProject,
  localProjectState,
  persistLocalProjects,
  projectIntendedPath,
  projectLabel,
  removeLocalProject,
  renameLocalProject,
  resetLocalProjectsForTests,
  selectLocalProject,
  updateProjectIntendedPath,
} from "./localProjects";

beforeEach(() => {
  localStorage.clear();
  resetLocalProjectsForTests();
});

it("persists intended path without treating it as authorization", () => {
  expect(projectLabel("local-eap")).toBe("EAP");
  expect(projectIntendedPath("local-eap")).toBe("");
  updateProjectIntendedPath("local-eap", "J:/Code/Engineering-Automation-Platform");
  expect(projectIntendedPath("local-eap")).toBe("J:/Code/Engineering-Automation-Platform");
  persistLocalProjects();
  const raw = JSON.parse(localStorage.getItem("eap.local-projects.v1") || "[]") as Array<{ intendedPath: string }>;
  expect(raw[0]?.intendedPath).toBe("J:/Code/Engineering-Automation-Platform");
  selectLocalProject(null);
  expect(localProjectState.selectedId).toBeNull();
  expect(localStorage.getItem("eap.selected-project.v1")).toBe("");
});

it("creates, renames, and removes local group labels without inventing a repository tree", () => {
  expect(createLocalProject("   ")).toBeNull();
  const created = createLocalProject(" Demo Repo ");
  expect(created?.label).toBe("Demo Repo");
  expect(localProjectState.projects).toHaveLength(2);
  expect(localProjectState.selectedId).toBe(created!.id);
  expect(renameLocalProject(created!.id, "  Demo ")).toBe(true);
  expect(projectLabel(created!.id)).toBe("Demo");
  expect(removeLocalProject("local-eap")).toBe(true);
  expect(localProjectState.projects.map((item) => item.id)).toEqual([created!.id]);
  expect(removeLocalProject(created!.id)).toBe(false);
  expect(localProjectState.projects).toHaveLength(1);
  const stored = JSON.parse(localStorage.getItem("eap.local-projects.v1") || "[]") as Array<{ label: string }>;
  expect(stored).toEqual([{ id: created!.id, label: "Demo", intendedPath: "" }]);
});
