import { reactive } from "vue";

/** Local group preference. Intended path is a client-side binding hint, never a write grant. */
export type LocalProject = {
  id: string;
  label: string;
  /** Absolute or operator-entered path preference on the user's machine. */
  intendedPath: string;
};

const PROJECTS_KEY = "eap.local-projects.v1";
const SELECTED_KEY = "eap.selected-project.v1";

const DEFAULT_PROJECTS: LocalProject[] = [{ id: "local-eap", label: "EAP", intendedPath: "" }];

function storage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function readProjects(): LocalProject[] {
  const raw = storage()?.getItem(PROJECTS_KEY);
  if (!raw) return DEFAULT_PROJECTS.map((item) => ({ ...item }));
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_PROJECTS.map((item) => ({ ...item }));
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      if (typeof row.id !== "string" || !row.id.trim() || typeof row.label !== "string" || !row.label.trim()) return [];
      return [{
        id: row.id.trim().slice(0, 64),
        label: row.label.trim().slice(0, 80),
        intendedPath: typeof row.intendedPath === "string" ? row.intendedPath.trim().slice(0, 512) : "",
      }];
    });
  } catch {
    return DEFAULT_PROJECTS.map((item) => ({ ...item }));
  }
}

function readSelected(projects: LocalProject[]): string | null {
  const id = storage()?.getItem(SELECTED_KEY);
  if (id === "") return null;
  if (!id) return projects[0]?.id ?? null;
  return projects.some((item) => item.id === id) ? id : projects[0]?.id ?? null;
}

export const localProjectState = reactive({
  projects: readProjects(),
  selectedId: null as string | null,
});
localProjectState.selectedId = readSelected(localProjectState.projects);

export function persistLocalProjects() {
  const store = storage();
  if (!store) return;
  store.setItem(PROJECTS_KEY, JSON.stringify(localProjectState.projects));
  if (localProjectState.selectedId == null) store.setItem(SELECTED_KEY, "");
  else store.setItem(SELECTED_KEY, localProjectState.selectedId);
}

export function projectLabel(id: string | null | undefined) {
  return localProjectState.projects.find((item) => item.id === id)?.label ?? "";
}

export function projectIntendedPath(id: string | null | undefined) {
  return localProjectState.projects.find((item) => item.id === id)?.intendedPath ?? "";
}

export function selectLocalProject(id: string | null) {
  localProjectState.selectedId = id;
  persistLocalProjects();
}

export function updateProjectIntendedPath(id: string, path: string) {
  const target = localProjectState.projects.find((item) => item.id === id);
  if (!target) return;
  target.intendedPath = path.trim().slice(0, 512);
  persistLocalProjects();
}

const MAX_PROJECTS = 32;

function newProjectId() {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Create a local group label. Does not grant repository write access. */
export function createLocalProject(label: string): LocalProject | null {
  const trimmed = label.trim().slice(0, 80);
  if (!trimmed || localProjectState.projects.length >= MAX_PROJECTS) return null;
  const project: LocalProject = { id: newProjectId(), label: trimmed, intendedPath: "" };
  localProjectState.projects = [...localProjectState.projects, project];
  localProjectState.selectedId = project.id;
  persistLocalProjects();
  return project;
}

export function renameLocalProject(id: string, label: string): boolean {
  const trimmed = label.trim().slice(0, 80);
  if (!trimmed) return false;
  const target = localProjectState.projects.find((item) => item.id === id);
  if (!target) return false;
  target.label = trimmed;
  persistLocalProjects();
  return true;
}

/**
 * Remove a local group label. Keeps at least one group.
 * Callers must detach session extras that referenced this id.
 */
export function removeLocalProject(id: string): boolean {
  if (localProjectState.projects.length <= 1) return false;
  const next = localProjectState.projects.filter((item) => item.id !== id);
  if (next.length === localProjectState.projects.length) return false;
  localProjectState.projects = next;
  if (localProjectState.selectedId === id) localProjectState.selectedId = next[0]?.id ?? null;
  persistLocalProjects();
  return true;
}

/** Test seam. */
export function resetLocalProjectsForTests() {
  localProjectState.projects = DEFAULT_PROJECTS.map((item) => ({ ...item }));
  localProjectState.selectedId = localProjectState.projects[0]?.id ?? null;
  storage()?.removeItem(PROJECTS_KEY);
  storage()?.removeItem(SELECTED_KEY);
}
