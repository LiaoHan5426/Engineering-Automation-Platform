<script setup lang="ts">
import { onMounted, ref, toRefs } from "vue";
import { useI18n } from "vue-i18n";
import { Input, Select, Slider, Button } from "@eap/ui";
import { loadLayoutDrafts, saveLayoutDraft, workbench, type LayoutDraft } from "./workbench";

const { t } = useI18n();
const emit = defineEmits<{ saved: [draft: LayoutDraft] }>();
const { title, placeholder, sidebarWidth, accent, sidebar, popover, panel } = toRefs(workbench.layoutEditor);
const note = ref("");
const storage = typeof localStorage === "undefined" ? undefined : localStorage;

onMounted(() => loadLayoutDrafts(storage));

const exercised = ref<string[]>([]);
function mark(id: string) { if (!exercised.value.includes(id)) exercised.value = [...exercised.value, id]; }
function toggleNav() { mark("nav"); sidebar.value = !sidebar.value; }
function togglePopover() { mark("popover"); popover.value = !popover.value; }
function togglePanel() { mark("panel"); panel.value = !panel.value; }
function save() {
  const draft = saveLayoutDraft({ sidebar: sidebar.value, popover: popover.value, panel: panel.value, title: title.value, placeholder: placeholder.value, sidebarWidth: sidebarWidth.value, accent: accent.value, acceptance: exercised.value }, storage);
  emit('saved', draft);
  note.value = t("desktop.draftSaved");
}
function reopen(draft: LayoutDraft) {
  sidebar.value = draft.sidebar;
  popover.value = draft.popover;
  panel.value = draft.panel;
  title.value = draft.title || 'EAP Workspace'; placeholder.value = draft.placeholder || 'Describe a task…';
  sidebarWidth.value = Math.min(180, Math.max(80, draft.sidebarWidth || 120)); accent.value = draft.accent === '#407bb0' ? '#407bb0' : '#347f70';
  exercised.value = Array.isArray(draft.acceptance) ? [...draft.acceptance] : [];
  note.value = draft.savedAt;
}
</script>

<template>
  <section class="layout-draft" data-testid="layout-draft">
    <header>
      <h2>{{ t("desktop.draftTitle") }}</h2>
      <span>{{ t("desktop.draftMark") }}</span>
    </header>
    <p class="hint">{{ t("desktop.draftCurrent") }}：{{ t("desktop.navigation") }}。{{ t("desktop.draftCandidate") }}：{{ t("desktop.draftTitle") }}。</p>
    <div class="design-controls"><label>{{ t('preview.designTitle') }}<Input v-model="title" maxlength="80" /></label><label>{{ t('preview.designPrompt') }}<Input v-model="placeholder" maxlength="160" /></label><label>{{ t('preview.sidebarWidth') }} · {{ sidebarWidth }}px<Slider v-model="sidebarWidth" :min="80" :max="180" /></label><label>{{ t('preview.theme') }}<Select v-model="accent"><option value="#347f70">{{ t('preview.green') }}</option><option value="#407bb0">{{ t('preview.blue') }}</option></Select></label></div>
    <div class="fixture eap-scrollbar" :class="{ 'fixture--panel': panel }" :style="{ '--draft-sidebar': sidebarWidth + 'px', '--draft-accent': accent }">
      <nav v-if="sidebar" aria-label="draft-nav"><Button size="sm" variant="secondary" type="button" data-testid="draft-nav" @click="toggleNav">code</Button></nav>
      <Button size="sm" variant="secondary" v-else type="button" data-testid="draft-nav" @click="toggleNav">{{ t("desktop.openSidebar") }}</Button>
      <div class="fixture-main">
        <strong>{{ title }}</strong><p>{{ t('preview.preview') }}</p>
        <div class="fixture-composer">
          <Button size="sm" variant="secondary" type="button" data-testid="draft-plus" :aria-expanded="popover" @click="togglePopover">＋</Button>
          <span>{{ placeholder }}</span><p v-if="popover" data-testid="draft-popover">{{ t('preview.menu') }}</p>
        </div>
      </div>
      <aside v-if="panel" data-testid="draft-panel">{{ t("desktop.summary") }}</aside>
    </div>
    <div class="draft-actions">
      <Button size="sm" variant="secondary" type="button" data-testid="draft-summary" @click="togglePanel">{{ t("desktop.summary") }}</Button>
      <Button size="sm" variant="secondary" type="button" data-testid="draft-save" @click="save">{{ t("desktop.draftSave") }}</Button>
    </div>
    <ul class="acceptance"><li>{{ t('preview.checkNav') }} · {{ exercised.includes('nav') ? t('preview.checkDone') : t('preview.checkPending') }}</li><li>{{ t('preview.checkPopover') }} · {{ exercised.includes('popover') ? t('preview.checkDone') : t('preview.checkPending') }}</li><li>{{ t('preview.checkPanel') }} · {{ exercised.includes('panel') ? t('preview.checkDone') : t('preview.checkPending') }}</li></ul>
    <p v-if="note" role="status">{{ note }}</p>
    <ul>
      <li v-for="draft in workbench.drafts" :key="draft.id"><Button size="sm" variant="secondary" type="button" @click="reopen(draft)">{{ draft.savedAt }}</Button></li>
    </ul>
  </section>
</template>

<style scoped>
.layout-draft{display:grid;gap:12px;padding:16px;border:1px dashed var(--border-strong);border-radius:12px;background:var(--surface)}
header{display:flex;justify-content:space-between;gap:8px;align-items:center}
h2{margin:0;font-size:16px}
header span,.hint{color:var(--text-soft);font-size:12px}
.fixture{display:grid;grid-template-columns:var(--draft-sidebar,120px) minmax(0,1fr);gap:8px;min-height:200px;overflow:auto}
.fixture--panel{grid-template-columns:var(--draft-sidebar,120px) minmax(140px,1fr) 96px}
@media(max-width:760px){.fixture{grid-template-columns:minmax(72px,var(--draft-sidebar,96px)) minmax(0,1fr)}.fixture--panel{grid-template-columns:minmax(72px,var(--draft-sidebar,96px)) minmax(0,1fr)}.fixture--panel aside{display:none}.design-controls{grid-template-columns:1fr}}
.fixture nav,.fixture aside,.fixture-main{padding:8px;border-radius:8px;background:var(--bg)}
.fixture-composer{display:flex;gap:8px;align-items:center;margin-top:24px;padding:8px;border-radius:8px;background:var(--surface)}
.fixture-composer{position:relative;font-size:11px}.fixture-composer p{position:absolute;bottom:100%;left:0;padding:12px;background:var(--surface);border:1px solid var(--border-strong);box-shadow:0 5px 16px color-mix(in srgb, var(--text) 7%, transparent);border-radius:8px}.fixture-main strong{color:var(--draft-accent)}.design-controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.design-controls label{display:grid;gap:6px;font-size:11px}.design-controls input,.design-controls select{width:100%;min-width:0;font:inherit}.fixture-main{min-width:0}.fixture-main strong{overflow-wrap:anywhere}.fixture-composer span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acceptance{margin:0;padding-left:18px;font-size:12px;line-height:1.7;color:var(--text-soft)}
ul{padding-left:18px}
</style>
