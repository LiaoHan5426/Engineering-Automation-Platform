<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Input, Popover } from "@eap/ui";
import {
  chatBinding,
  createLocalProject,
  detachSessionsFromProject,
  localProjects,
  removeLocalProject,
  renameLocalProject,
  sessionProjectId,
  workbench,
} from "./shell/workbench";

const props = defineProps<{ activeView: string; pages: { id: string; name: string }[] }>();
const emit = defineEmits<{ navigate: [id: string] }>();
const { t } = useI18n();
type Area = "code" | "work" | "scenes" | "experts" | "settings";
const area = ref<Area>("code");
const lastView = new Map<Area, string>();
const query = ref("");
const sidebarFilter = ref("");
const showArchived = ref(false);
const openMenuId = ref<string | null>(null);
const openProjectMenuId = ref<string | null>(null);
const menuStyle = ref<{ left: string; right: string; top: string; transform?: string }>({ left: "auto", right: "8px", top: "0px" });
const projectMenuStyle = ref<{ left: string; right: string; top: string; transform?: string }>({ left: "auto", right: "8px", top: "0px" });
/** Expanded local-group nodes in the project tree (UI only). */
const expandedProjects = ref<Record<string, boolean>>({});
const draftingProject = ref(false);
const draftProjectLabel = ref("");
const renamingProjectId = ref<string | null>(null);
const renameProjectLabel = ref("");
const pendingDeleteProjectId = ref<string | null>(null);
const codeIds = ["chat", "sql", "board"];
const settingsIds = ["model-settings", "plugins", "rules", "knowledge", "databases", "capabilities"];
const expertIds = ["expert-catalog", "experts"];
function isProjectExpanded(id: string) {
  if (expandedProjects.value[id] != null) return expandedProjects.value[id]!;
  return workbench.selectedProjectId === id;
}
function toggleProjectExpand(id: string, event: Event) {
  event.stopPropagation();
  expandedProjects.value = { ...expandedProjects.value, [id]: !isProjectExpanded(id) };
}
function startNewProject() {
  closeMenu();
  closeProjectMenu();
  renamingProjectId.value = null;
  pendingDeleteProjectId.value = null;
  draftingProject.value = true;
  draftProjectLabel.value = "";
}
function cancelNewProject() {
  draftingProject.value = false;
  draftProjectLabel.value = "";
}
function confirmNewProject() {
  const created = createLocalProject(draftProjectLabel.value || t("desktop.projectNamePlaceholder"));
  if (!created) return;
  draftingProject.value = false;
  draftProjectLabel.value = "";
  expandedProjects.value = { ...expandedProjects.value, [created.id]: true };
}
function startRenameProject(id: string) {
  const label = localProjects.projects.find((item) => item.id === id)?.label ?? "";
  closeProjectMenu();
  draftingProject.value = false;
  pendingDeleteProjectId.value = null;
  renamingProjectId.value = id;
  renameProjectLabel.value = label;
}
function cancelRenameProject() {
  renamingProjectId.value = null;
  renameProjectLabel.value = "";
}
function confirmRenameProject() {
  const id = renamingProjectId.value;
  if (!id) return;
  if (renameLocalProject(id, renameProjectLabel.value)) {
    renamingProjectId.value = null;
    renameProjectLabel.value = "";
  }
}
function askDeleteProject(id: string) {
  closeProjectMenu();
  if (localProjects.projects.length <= 1) return;
  draftingProject.value = false;
  renamingProjectId.value = null;
  pendingDeleteProjectId.value = id;
}
function cancelDeleteProject() {
  pendingDeleteProjectId.value = null;
}
function confirmDeleteProject() {
  const id = pendingDeleteProjectId.value;
  if (!id) return;
  pendingDeleteProjectId.value = null;
  if (!removeLocalProject(id)) return;
  detachSessionsFromProject(id);
  const next = { ...expandedProjects.value };
  delete next[id];
  expandedProjects.value = next;
  if (renamingProjectId.value === id) cancelRenameProject();
}
function anchorMenu(target: HTMLElement) {
  const rect = target.getBoundingClientRect();
  const right = Math.max(8, window.innerWidth - rect.right);
  const openUp = window.innerHeight - rect.bottom < 160 && rect.top > 160;
  return openUp
    ? { right: `${right}px`, left: "auto", top: `${rect.top - 4}px`, transform: "translateY(-100%)" }
    : { right: `${right}px`, left: "auto", top: `${rect.bottom + 4}px` };
}
function toggleProjectMenu(id: string, event: MouseEvent) {
  if (openProjectMenuId.value === id) { openProjectMenuId.value = null; return; }
  closeMenu();
  projectMenuStyle.value = anchorMenu(event.currentTarget as HTMLElement);
  openProjectMenuId.value = id;
}
function closeProjectMenu() { openProjectMenuId.value = null; }
function runProjectMenu(id: string, action?: (id: string) => void) {
  closeProjectMenu();
  action?.(id);
}

watch(() => props.activeView, (id) => {
  const match: Area | undefined = id === "scenes" || id === "work"
    ? id
    : id === "board" || id === "chat" || id === "sql"
      ? workbench.workMode
      : id === "expert-catalog" || id === "experts"
        ? "experts"
        : settingsIds.includes(id) ? "settings" : undefined;
  if (!match) return;
  area.value = match;
  lastView.set(match, id);
}, { immediate: true });

const settings = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return settingsIds.flatMap((id) => props.pages.filter((page) => page.id === id && (!needle || page.name.toLowerCase().includes(needle) || id.includes(needle))));
});
const analysis = computed(() => props.pages.find((page) => page.id === "sql"));
const conversations = computed(() => chatBinding.value?.history.filter((item) => item.archived === showArchived.value) ?? []);
function open(id: string) {
  lastView.set(area.value, id);
  emit("navigate", id);
  workbench.sidebarOpen = false;
}
function sessionMode(): "code" | "work" {
  return workbench.workMode === "work" ? "work" : "code";
}
function startChat(mode: "code" | "work") {
  workbench.workMode = mode;
  if (chatBinding.value) chatBinding.value.create();
  else workbench.pendingNewChat = true;
  open("chat");
}
/** frame-064: the group menu starts a draft while keeping that group selected. */
function startChatInProject(projectId: string, event?: Event) {
  event?.stopPropagation();
  workbench.selectedProjectId = projectId;
  expandedProjects.value = { ...expandedProjects.value, [projectId]: true };
  startChat(sessionMode());
}
/** frame-064: free-chat entry clears the group so the draft stays unbound. */
function startFreeChat() {
  workbench.selectedProjectId = null;
  startChat(sessionMode());
}
/** frame-048/192: soft free-chat entry that seeds a read-only summary draft. */
function startTodayJournal() {
  workbench.pendingDraft = t("desktop.todayJournalDraft");
  startFreeChat();
}
const filterNeedle = computed(() => sidebarFilter.value.trim().toLowerCase());
function matchesFilter(...parts: Array<string | undefined | null>) {
  if (!filterNeedle.value) return true;
  return parts.some((part) => (part || "").toLowerCase().includes(filterNeedle.value));
}
const visibleProjects = computed(() => localProjects.projects.filter((project) => {
  if (!filterNeedle.value) return true;
  if (matchesFilter(project.label, project.intendedPath)) return true;
  return sessionsUnder(project.id).some((item) => matchesFilter(item.title, t("desktop.freeChat")));
}));
watch(filterNeedle, (needle) => {
  if (!needle) return;
  const next = { ...expandedProjects.value };
  for (const project of visibleProjects.value) {
    if (matchesFilter(project.label, project.intendedPath) || sessionsUnder(project.id).some((item) => matchesFilter(item.title, t("desktop.freeChat")))) {
      next[project.id] = true;
    }
  }
  expandedProjects.value = next;
});
function selectProject(id: string) {
  const next = workbench.selectedProjectId === id ? null : id;
  workbench.selectedProjectId = next;
  if (next) expandedProjects.value = { ...expandedProjects.value, [next]: true };
}
function sessionsUnder(projectId: string | null) {
  return conversations.value.filter((item) => sessionProjectId(item.id) === projectId);
}
function sessionsFor(projectId: string | null) {
  const items = sessionsUnder(projectId);
  if (!filterNeedle.value) return items;
  const project = projectId ? localProjects.projects.find((entry) => entry.id === projectId) : null;
  if (project && matchesFilter(project.label, project.intendedPath)) return items;
  return items.filter((item) => matchesFilter(item.title, t("desktop.freeChat")));
}
function sessionStamp(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function select(next: Area) {
  area.value = next;
  if (next === "code" || next === "work") workbench.workMode = next;
  const previous = lastView.get(next);
  if (next === "scenes") { open("scenes"); return; }
  if (next === "work") { open(previous === "chat" || previous === "board" ? previous : "chat"); return; }
  if (next === "code") { open(previous && codeIds.includes(previous) ? previous : "chat"); return; }
  if (next === "experts") { open(previous && expertIds.includes(previous) ? previous : "expert-catalog"); return; }
  open(previous && settingsIds.includes(previous) ? previous : "model-settings");
}
function chooseConversation(id: string) {
  openMenuId.value = null;
  chatBinding.value?.select(id);
  open("chat");
}
function toggleMenu(id: string, event: MouseEvent) {
  if (openMenuId.value === id) { openMenuId.value = null; return; }
  closeProjectMenu();
  menuStyle.value = anchorMenu(event.currentTarget as HTMLElement);
  openMenuId.value = id;
}
function closeMenu() { openMenuId.value = null; }
function runMenu(id: string, action?: (id: string) => void) {
  closeMenu();
  action?.(id);
}
function onMenuPointer(event: PointerEvent) {
  const target = event.target;
  if (target instanceof Element && target.closest("[data-testid=session-actions], [data-testid=project-actions], .session-menu, .project-menu, .project-edit")) return;
  closeMenu();
  closeProjectMenu();
}
function onMenuKey(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  if (openMenuId.value || openProjectMenuId.value) {
    closeMenu();
    closeProjectMenu();
    return;
  }
  if (pendingDeleteProjectId.value) { cancelDeleteProject(); return; }
  if (draftingProject.value) { cancelNewProject(); return; }
  if (renamingProjectId.value) cancelRenameProject();
}
onMounted(() => {
  window.addEventListener("pointerdown", onMenuPointer);
  window.addEventListener("keydown", onMenuKey);
});
onUnmounted(() => {
  window.removeEventListener("pointerdown", onMenuPointer);
  window.removeEventListener("keydown", onMenuKey);
});
</script>

<template>
  <div class="desktop-navigation">
    <nav class="activity-bar" :aria-label="t('desktop.navigation')">
      <button v-for="(path, key) in { code: 'm8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16', work: 'M9 6V4h6v2M3 7h18v13H3zM3 11l9 3 9-3m-9 1v4', scenes: 'm12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5', experts: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8m8 0a4 4 0 0 1 0 8', settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2' }" :key="key" type="button" :class="{ active: area === key }" :aria-current="area === key ? 'page' : undefined" @click="select(key)"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path :d="path" /></svg>{{ t("desktop." + key) }}</button>
    </nav>
    <aside class="desktop-sidebar eap-scrollbar">
      <template v-if="area === 'code' || area === 'work' || area === 'scenes' || area === 'experts'">
        <button type="button" class="nav primary" data-testid="new-chat" :title="t('desktop.newChatHint')" :aria-pressed="activeView === 'chat' && !chatBinding?.activeId" @click="startChat(sessionMode())">＋ {{ t("desktop.newChat") }}</button>
        <section class="tree-project" data-testid="project-tree">
          <Input v-model="sidebarFilter" class="sidebar-filter" type="search" data-testid="sidebar-filter" :aria-label="t('desktop.sidebarFilter')" :placeholder="t('desktop.sidebarFilter')" />
          <button type="button" class="nav" data-testid="new-project" @click="startNewProject">＋ {{ t("desktop.newProject") }}</button>
          <form v-if="draftingProject" class="project-edit" data-testid="project-create" @submit.prevent="confirmNewProject">
            <Input v-model="draftProjectLabel" maxlength="80" :placeholder="t('desktop.projectNamePlaceholder')" :aria-label="t('desktop.projectNamePlaceholder')" data-testid="project-create-input" />
            <div class="project-edit-actions">
              <button type="submit" data-testid="project-create-save">{{ t("desktop.saveProject") }}</button>
              <button type="button" data-testid="project-create-cancel" @click="cancelNewProject">{{ t("desktop.cancelProject") }}</button>
            </div>
          </form>
          <div
            v-for="project in visibleProjects"
            :key="project.id"
            class="tree-node"
            :data-testid="'project-' + project.id"
            :data-expanded="isProjectExpanded(project.id) ? 'true' : 'false'"
          >
            <div class="tree-node-head">
              <button
                type="button"
                class="tree-toggle"
                data-testid="project-expand"
                :aria-expanded="isProjectExpanded(project.id)"
                :aria-label="project.label"
                @click="toggleProjectExpand(project.id, $event)"
              ><span class="tree-caret" :data-open="isProjectExpanded(project.id) ? 'true' : 'false'" aria-hidden="true"></span></button>
              <form v-if="renamingProjectId === project.id" class="project-edit tree-rename" data-testid="project-rename" @submit.prevent="confirmRenameProject">
                <Input v-model="renameProjectLabel" maxlength="80" :aria-label="t('desktop.renameProject')" data-testid="project-rename-input" />
                <div class="project-edit-actions">
                  <button type="submit" data-testid="project-rename-save">{{ t("desktop.saveProject") }}</button>
                  <button type="button" data-testid="project-rename-cancel" @click="cancelRenameProject">{{ t("desktop.cancelProject") }}</button>
                </div>
              </form>
              <template v-else>
                <button type="button" class="nav tree-project-label" :aria-pressed="workbench.selectedProjectId === project.id" @click="selectProject(project.id)">
                  <span>{{ project.label }}</span>
                  <small>{{ t("desktop.projectSessions", { count: sessionsFor(project.id).length }) }}</small>
                </button>
                <button type="button" class="tree-more" data-testid="project-actions" :aria-expanded="openProjectMenuId === project.id" :aria-label="t('desktop.projectActions')" @click.stop="toggleProjectMenu(project.id, $event)">⋯</button>
                <Popover v-if="openProjectMenuId === project.id" teleport class="project-menu session-menu" :style="projectMenuStyle" data-testid="project-menu" :label="t('desktop.projectActions')" @click.stop>
                  <button type="button" data-testid="project-new-chat" @click="runProjectMenu(project.id, startChatInProject)">{{ t("desktop.newInGroup") }}</button>
                  <button type="button" data-testid="project-rename-action" @click="runProjectMenu(project.id, startRenameProject)">{{ t("desktop.renameProject") }}</button>
                  <button type="button" data-testid="project-delete-action" :disabled="localProjects.projects.length <= 1" :title="localProjects.projects.length <= 1 ? t('desktop.deleteProjectLast') : undefined" @click="runProjectMenu(project.id, askDeleteProject)">{{ t("desktop.deleteProject") }}</button>
                </Popover>
              </template>
            </div>
            <div v-if="pendingDeleteProjectId === project.id" class="project-edit" data-testid="project-delete-confirm" role="status">
              <p class="hint">{{ t("desktop.deleteProjectConfirm", { label: project.label }) }}</p>
              <div class="project-edit-actions">
                <button type="button" data-testid="project-delete-confirm-yes" @click="confirmDeleteProject">{{ t("desktop.deleteProject") }}</button>
                <button type="button" data-testid="project-delete-confirm-no" @click="cancelDeleteProject">{{ t("desktop.cancelProject") }}</button>
              </div>
            </div>
            <div v-if="isProjectExpanded(project.id)" class="tree-children" data-testid="project-children">
              <p class="tree-branch-label">{{ t("desktop.projectTasks") }}</p>
              <button type="button" class="nav child tree-child" :class="{ active: activeView === 'board' }" data-testid="open-board" @click="open('board')">{{ t("desktop.board") }} <small>{{ t("desktop.boardDraftRecord") }}</small></button>
              <p class="tree-branch-label">{{ t("historyUi.title") }}</p>
              <div v-for="item in sessionsFor(project.id)" :key="item.id" class="session-row">
                <button type="button" class="nav child tree-child" :class="{ active: activeView === 'chat' && chatBinding?.activeId === item.id }" @click="chooseConversation(item.id)"><span>{{ item.title || t("desktop.freeChat") }}</span><small v-if="sessionStamp(item.updatedAt)">{{ sessionStamp(item.updatedAt) }}</small></button>
                <button type="button" class="tree-more" data-testid="session-actions" :aria-expanded="openMenuId === item.id" :aria-label="t('historyUi.actions')" @click.stop="toggleMenu(item.id, $event)">⋯</button>
                <Popover v-if="openMenuId === item.id" teleport class="session-menu" :style="menuStyle" :label="t('historyUi.actions')" @click.stop><button type="button" @click="runMenu(item.id, chatBinding?.rename)">{{ t('historyUi.rename') }}</button><button type="button" :disabled="chatBinding?.busyIds?.includes(item.id)" @click="runMenu(item.id, chatBinding?.archive)">{{ item.archived ? t('historyUi.restore') : t('historyUi.archive') }}</button><button type="button" :disabled="chatBinding?.busyIds?.includes(item.id)" @click="runMenu(item.id, chatBinding?.remove)">{{ t('historyUi.delete') }}</button></Popover>
              </div>
              <p v-if="!sessionsFor(project.id).length" class="hint tree-empty" data-testid="project-empty">{{ t("desktop.projectNoSessions") }}</p>
            </div>
          </div>
        </section>
        <section data-testid="unbound-sessions">
          <h2>{{ t("desktop.freeChat") }}</h2>
          <p class="hint">{{ t("desktop.unboundHint") }}</p>
          <p v-if="!sessionsFor(null).length" class="hint tree-empty" data-testid="free-chat-empty">{{ t("desktop.freeChatEmpty") }}</p>
          <div v-for="item in sessionsFor(null)" :key="item.id" class="session-row">
            <button type="button" class="nav child" :class="{ active: activeView === 'chat' && chatBinding?.activeId === item.id }" @click="chooseConversation(item.id)"><span>{{ item.title || t("desktop.freeChat") }}</span><small v-if="sessionStamp(item.updatedAt)">{{ sessionStamp(item.updatedAt) }}</small></button>
            <button type="button" class="tree-more" data-testid="session-actions" :aria-expanded="openMenuId === item.id" :aria-label="t('historyUi.actions')" @click.stop="toggleMenu(item.id, $event)">⋯</button>
            <Popover v-if="openMenuId === item.id" teleport class="session-menu" :style="menuStyle" :label="t('historyUi.actions')" @click.stop><button type="button" @click="runMenu(item.id, chatBinding?.rename)">{{ t('historyUi.rename') }}</button><button type="button" :disabled="chatBinding?.busyIds?.includes(item.id)" @click="runMenu(item.id, chatBinding?.archive)">{{ item.archived ? t('historyUi.restore') : t('historyUi.archive') }}</button><button type="button" :disabled="chatBinding?.busyIds?.includes(item.id)" @click="runMenu(item.id, chatBinding?.remove)">{{ t('historyUi.delete') }}</button></Popover>
          </div>
          <button type="button" class="nav" data-testid="today-journal" :title="t('desktop.todayJournalHint')" @click="startTodayJournal">{{ t("desktop.todayJournal") }}</button>
          <button type="button" class="nav primary" data-testid="new-free-chat" @click="startFreeChat">＋ {{ t("desktop.newFreeChat") }}</button>
          <button type="button" class="nav" data-testid="archived-sessions" :aria-pressed="showArchived" @click="showArchived = !showArchived">{{ showArchived ? t('historyUi.active') : t('historyUi.archived') }}</button>
          <p v-if="showArchived && !conversations.length" class="hint">{{ t('historyUi.empty') }}</p>
        </section>
        <section>
          <button v-if="analysis" type="button" class="nav" :class="{ active: activeView === 'sql' }" @click="open('sql')">{{ analysis.name }}</button>
        </section>
      </template>
      <template v-else>
        <h2>{{ t("desktop.settings") }}</h2>
        <Input v-model="query" class="settings-search" type="search" :aria-label="t('desktop.settingsSearch')" :placeholder="t('desktop.settingsSearch')" />
        <button v-for="item in settings" :key="item.id" type="button" class="nav" :class="{ active: activeView === item.id }" @click="open(item.id)">{{ item.name }}</button>
        <p v-if="!settings.length" class="hint">{{ t("desktop.noSettings") }}</p>
      </template>
    </aside>
  </div>
</template>

<style scoped>
.desktop-navigation{display:flex;min-height:0;height:100%;overflow:hidden;color:#43534c}
.activity-bar{width:64px;flex:0 0 64px;display:flex;flex-direction:column;gap:8px;padding:10px 6px;background:#e1e6df}
.activity-bar button{display:grid;gap:5px;justify-items:center;border:0;background:transparent;padding:9px 0;border-radius:10px;color:#64746b;font-size:10px;line-height:1.3;cursor:pointer;min-width:0}
.activity-bar button svg{width:22px;height:26px}
.activity-bar button:hover{background:#d5dfd6}.activity-bar button.active{background:#cbded5;color:#287b6c}.activity-bar button:last-child{margin-top:auto}
.desktop-sidebar{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;overflow:auto;padding:16px 12px;background:#ebece4;border-right:1px solid #dce0d7}
.desktop-sidebar h2{margin:8px 8px 0;color:#69776e;font-size:12px;font-weight:650}
.sidebar-filter{display:block;width:calc(100% - 16px);margin:6px 8px 4px}
.hint{padding:0 8px;font-size:12px;color:#68746e;line-height:1.55}
.tree-node{margin:4px 0;padding:2px 0;border-radius:10px}
.tree-node[data-expanded="true"]{background:#e8ece4}
.tree-node-head{display:flex;align-items:center;gap:2px;min-width:0;min-height:36px}
.tree-toggle{flex:0 0 28px;width:28px;height:28px;display:grid;place-items:center;align-self:center;border:0;background:transparent;color:#68746e;cursor:pointer;padding:0;border-radius:8px}
.tree-toggle:hover{background:#dce4db}
.tree-caret{width:8px;height:8px;border-right:2px solid currentcolor;border-bottom:2px solid currentcolor;transform:rotate(-45deg);margin-left:-1px}
.tree-caret[data-open="true"]{transform:rotate(45deg);margin-top:-4px;margin-left:0}
.tree-project-label{display:flex!important;flex-direction:column;align-items:flex-start;gap:0;flex:1;min-width:0}
.tree-project-label small{color:#8b978f;font-size:10px;font-weight:400;line-height:1.2}
.tree-more{flex:0 0 28px;width:28px;height:28px;display:grid;place-items:center;align-self:center;border:0;border-radius:8px;background:transparent;color:#7a887f;padding:0;cursor:pointer;font-size:16px;line-height:1}
.tree-more:hover,.tree-more[aria-expanded="true"]{background:#dce4db;color:#34443b}
.project-edit{display:grid;gap:6px;margin:4px 0 8px;padding:8px;border:1px solid #d5ddd4;border-radius:9px;background:#f4f5f0}
.project-edit.tree-rename{flex:1;min-width:0;margin:0}
.project-edit :deep(.eap-input){width:100%}
.project-edit-actions{display:flex;flex-wrap:wrap;gap:6px}
.project-edit-actions button{border:0;border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;background:#d8e2d7;color:#286e5d}
.project-edit-actions button[type=button]{background:#e4e7e0;color:#526258}
.tree-children{margin:2px 4px 8px 12px;padding:4px 0 4px 8px;border-left:2px solid #c9d3c8;display:grid;gap:2px}
.tree-branch-label{margin:6px 0 2px;padding:0 8px;font-size:10px;font-weight:650;color:#7a887f;letter-spacing:.02em}
.tree-empty{margin:2px 0 6px;padding-left:8px;font-size:11px}
.tree-child{padding-left:10px!important}
.status-compact{margin:2px 10px 6px;font-size:11px;color:#68746e}
.desktop-sidebar .nav{width:100%;border:0;padding:9px 10px;border-radius:9px;text-align:left;background:transparent;color:#526258;font-size:13px;font-weight:500;cursor:pointer}
.desktop-sidebar .nav.tree-project-label{padding:4px 8px;line-height:1.25}
.desktop-sidebar .nav.child{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding-left:22px}
.desktop-sidebar .nav.child span{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.desktop-sidebar .nav.child small{color:#8b978f;font-size:10px;font-weight:400;line-height:1.2}
.session-row{display:flex;align-items:center;gap:2px;min-width:0}
.session-row>.nav{flex:1;min-width:0}
:global(.eap-popover.session-menu) {
  position: fixed;
  z-index: var(--eap-index-popover);
  display: grid;
  width: max-content;
  min-width: 148px;
  max-width: min(220px, calc(100vw - 16px));
  padding: 4px;
  border-radius: 8px;
}

:global(.eap-popover.session-menu button) {
  border: 0;
  background: transparent;
  text-align: left;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  cursor: pointer;
  color: #37483e;
}

:global(.eap-popover.session-menu button:hover:not(:disabled)) {
  background: #e7eee6;
}

:global(.eap-popover.session-menu button:disabled) {
  opacity: 0.45;
  cursor: default;
}
.desktop-sidebar .nav.primary{background:#d8e2d7;color:#286e5d;font-weight:650}
.desktop-sidebar .nav:hover{background:#e1e5dc}.desktop-sidebar .nav.active,.desktop-sidebar .nav[aria-pressed="true"]{background:#d8e2d7;color:#286e5d;font-weight:600;box-shadow:inset 3px 0 0 #287b6c}
.settings-search{width:100%}
.preview-tree-project{display:grid;gap:3px;margin-bottom:10px}.desktop-sidebar .project-name{font-weight:650}.project-name small{display:block;margin:5px 0 0 16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}.desktop-sidebar .tree-child{padding-left:28px;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.demo-tree-label{margin:12px 0 4px}
button:focus-visible,input:focus-visible{outline:2px solid #398b7a;outline-offset:2px}
</style>
