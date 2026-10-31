<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import 'grapesjs/dist/css/grapes.min.css';
import PrototypeSchemaPreview from './PrototypeSchemaPreview.vue';
import { useI18n } from "vue-i18n";
import { Button, Input, Select, Slider } from "@eap/ui";
import { runtimeApi } from '@eap/runtime-client';
import {
  canAutoDeliver,
  deliveryBlockers,
  emptyPrototypeSchema,
  loadPrototypeSchema,
  loadPrototypeVersions,
  savePrototypeSchema,
  schemaFromGrapesProject,
  type PrototypeSchema,
} from "./prototypeSchema";

const { t } = useI18n();
const emit = defineEmits<{ saved: [schema: PrototypeSchema]; published: [id: string] }>();

const canvas = ref<HTMLElement | null>(null);
const title = ref("EAP layout");
const status = ref<"loading" | "ready" | "offline">("loading");
const note = ref("");
const selectedText = ref('');
const selected = ref(false);
const layout = ref('block'), spacing = ref(12);
function updateLayout() { activeComponent?.addStyle({ display: layout.value, gap: `${spacing.value}px`, padding: `${spacing.value}px` }); }
let activeComponent: import('grapesjs').Component | undefined;
const publishing = ref(false);
function newDesign() { editor?.setComponents([]); schema.value = emptyPrototypeSchema(title.value); selected.value = false; activeComponent = undefined; }
async function publish() {
  if (publishing.value || !editor) return;
  save(); if (!canAutoDeliver(schema.value)) return;
  publishing.value = true;
  try {
    const version = await runtimeApi.savePrototypeVersion({ sourceRef: 'builder-alpha', title: schema.value.title, body: JSON.stringify({ format: 'eap-prototype-v1', schema: schema.value }), buttonPresses: 0, acceptance: ['semantic-preview'] });
    note.value = t('desktop.grapesPublished', { id: version.id }); emit('published', version.id);
  } catch { note.value = t('desktop.grapesPublishFailed'); }
  finally { publishing.value = false; }
}
function addBlock(kind: 'section' | 'text' | 'heading' | 'button' | 'input' | 'link' | 'list') {
  if (!editor) return;
  const tags = { section: 'section', text: 'p', heading: 'h1', button: 'button', input: 'textarea', link: 'a', list: 'ul' };
  const [component] = editor.addComponents(kind === 'list'
    ? {
      tagName: 'ul',
      attributes: { 'data-eap-kind': 'list' },
      components: [
        { tagName: 'li', content: 'Item 1' },
        { tagName: 'li', content: 'Item 2' },
      ],
    }
    : {
      tagName: tags[kind],
      attributes: {
        'data-eap-kind': kind,
        ...(kind === 'input' ? { placeholder: 'Describe a task' } : {}),
        ...(kind === 'link' ? { href: '#' } : {}),
        ...(kind === 'heading' ? { 'data-level': '1' } : {}),
      },
      content: kind === 'input' ? '' : kind === 'button' ? 'Action' : kind === 'link' ? 'Link' : kind === 'heading' ? 'Heading' : 'Text',
    });
  if (component) { editor.select(component); activeComponent = component; selected.value = true; selectedText.value = component.get('content') || 'Text'; }
}
function updateText() {
  const component = activeComponent ?? editor?.getSelected(); if (!component) return;
  // Text nodes are encoded; no user-entered HTML or scripts are executed.
  const encoded = selectedText.value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  component.set('content', '');
  component.components(encoded);
}
const schema = ref<PrototypeSchema>(emptyPrototypeSchema());
const versions = ref(loadPrototypeVersions());
function reopen(id: string) {
  const version = versions.value.find(item => item.id === id); if (!version) return;
  schema.value = JSON.parse(JSON.stringify(version)); title.value = version.title;
  editor?.loadProjectData(version.grapesProject as import('grapesjs').ProjectData);
}
let editor: import('grapesjs').Editor | null = null;
let disposed = false;

async function mountEditor() {
  status.value = "loading";
  note.value = "";
  const restored = loadPrototypeSchema();
  if (restored) {
    schema.value = restored;
    title.value = restored.title;
  }
  try {
    const { default: grapes } = await import('grapesjs');
    if (disposed || !canvas.value) return;
    editor?.destroy?.();
    editor = grapes.init({
      container: canvas.value,
      height: "360px",
      width: "auto",
      fromElement: false,
      storageManager: false,
      noticeOnUnload: false,
      avoidInlineStyle: false,
      cssIcons: '',
      panels: { defaults: [] },
      blockManager: { blocks: [
        { id: 'section', label: 'Section', content: '<section data-eap-kind="section"><p data-eap-kind="text">Section</p></section>' },
        { id: 'text', label: 'Text', content: '<p data-eap-kind="text">Text</p>' },
        { id: 'heading', label: 'Heading', content: '<h1 data-eap-kind="heading" data-level="1">Heading</h1>' },
        { id: 'button', label: 'Button', content: '<button data-eap-kind="button">Action</button>' },
        { id: 'link', label: 'Link', content: '<a data-eap-kind="link" href="#">Link</a>' },
        { id: 'list', label: 'List', content: '<ul data-eap-kind="list"><li>Item 1</li><li>Item 2</li></ul>' },
        { id: 'input', label: 'Input', content: '<textarea data-eap-kind="input" placeholder="Describe a task"></textarea>' },
      ] },
    });
    const syncSelection = () => queueMicrotask(() => {
      if (disposed) return;
      const component = editor?.getSelected();
      if (component) { activeComponent = component; selected.value = true; selectedText.value = component.get('content') || component.getInnerHTML().replace(/<[^>]*>/g, ''); }
    });
    editor.on('component:selected', syncSelection);
    editor.on('component:deselected', syncSelection);
    if (schema.value.grapesProject && Object.keys(schema.value.grapesProject).length && typeof (editor as { loadProjectData?: (data: Record<string, unknown>) => void }).loadProjectData === "function") {
      (editor as { loadProjectData: (data: Record<string, unknown>) => void }).loadProjectData(schema.value.grapesProject);
    } else {
      editor.setComponents([{ tagName: 'section', attributes: { 'data-eap-kind': 'section' }, components: [
        { tagName: 'h1', type: 'text', attributes: { 'data-eap-kind': 'text' }, content: 'EAP Workspace' },
        { tagName: 'button', attributes: { 'data-eap-kind': 'button' }, content: 'Action' },
      ] }]);
    }
    status.value = "ready";
  } catch {
    editor = null;
    status.value = "offline";
    note.value = t("desktop.grapesOffline");
  }
}

function save() {
  const project = editor?.getProjectData?.() ?? schema.value.grapesProject ?? {};
  const next = schemaFromGrapesProject(title.value, project);
  if (status.value === "offline") {
    next.root.children = [
      { id: "section-0", kind: "section", props: {}, children: [
        { id: "text-0", kind: "text", props: { text: title.value }, children: [] },
        { id: "button-0", kind: "button", props: { label: "Action" }, children: [] },
      ] },
    ];
    next.unknownMappings = [];
  }
  schema.value = savePrototypeSchema(next);
  versions.value = loadPrototypeVersions();
  const blockers = deliveryBlockers(schema.value);
  note.value = blockers.length
    ? t("desktop.grapesBlocked", { reasons: blockers.join(" · ") })
    : t("desktop.grapesSaved");
  emit("saved", schema.value);
}

onMounted(() => { void mountEditor(); });
onUnmounted(() => { disposed = true; editor?.destroy?.(); editor = null; });
</script>

<template>
  <section class="grapes-scaffold" data-testid="grapes-scaffold">
    <header>
      <h2>{{ t("desktop.grapesTitle") }}</h2>
      <span data-testid="grapes-status">{{ status === "ready" ? t("desktop.grapesReady") : status === "offline" ? t("desktop.grapesOfflineShort") : t("desktop.grapesLoading") }}</span>
    </header>
    <p class="hint" data-testid="grapes-boundary">{{ t("desktop.grapesBoundary") }}</p>
    <label class="title-field">
      {{ t("desktop.grapesName") }}
      <Input v-model="title" maxlength="120" data-testid="grapes-title" />
    </label>
    <label v-if="versions.length" class="title-field">{{ t('desktop.chooseVersion') }}<Select :model-value="schema.id || ''" @update:model-value="reopen(String($event))"><option value="" disabled>—</option><option v-for="version in versions" :key="version.id" :value="version.id">{{ version.title }} · {{ version.updatedAt }}</option></Select></label>
    <div ref="canvas" class="grapes-canvas eap-scrollbar" data-testid="grapes-canvas" :data-mode="status" />
    <div v-if="status === 'ready'" class="editor-controls">
      <Button type="button" size="sm" @click="newDesign">{{ t('desktop.grapesNew') }}</Button>
      <Button v-for="kind in (['section','text','heading','button','link','list','input'] as const)" :key="kind" type="button" size="sm" :data-testid="'grapes-add-' + kind" @click="addBlock(kind)">{{ t('desktop.grapesAdd' + kind) }}</Button>
      <label v-if="selected">{{ t('desktop.grapesText') }}<Input v-model="selectedText" @input="updateText" /></label>
      <label v-if="selected">{{ t('desktop.grapesLayout') }}<Select v-model="layout" @change="updateLayout"><option value="block">Block</option><option value="flex">Flex</option><option value="grid">Grid</option></Select></label>
      <label v-if="selected">{{ t('desktop.grapesSpacing') }} · {{ spacing }}px<Slider v-model="spacing" :min="0" :max="48" @input="updateLayout" /></label>
    </div>
    <PrototypeSchemaPreview :schema="schema" />
    <p v-if="status === 'offline'" class="offline-panel" data-testid="grapes-offline-panel">
      {{ t("desktop.grapesOfflineBody") }}
    </p>
    <div class="actions">
      <Button type="button" size="sm" data-testid="grapes-save" :disabled="status === 'loading'" @click="save">{{ t("desktop.grapesSave") }}</Button>
      <Button type="button" size="sm" variant="primary" data-testid="grapes-publish" :disabled="status !== 'ready' || publishing" @click="publish">{{ t('desktop.grapesPublish') }}</Button>
      <span class="hint" data-testid="grapes-deliver">{{ canAutoDeliver(schema) ? t("desktop.grapesDeliverOk") : t("desktop.grapesDeliverBlocked") }}</span>
    </div>
    <p v-if="note" role="status" data-testid="grapes-note">{{ note }}</p>
  </section>
</template>

<style scoped>
.grapes-scaffold{display:grid;gap:10px;padding:14px;border:1px dashed var(--border-strong);border-radius:12px;background:var(--surface-2)}
header{display:flex;justify-content:space-between;gap:8px;align-items:center}
h2{margin:0;font-size:15px;color:var(--accent)}
header span,.hint{font-size:12px;color:var(--text-soft)}
.title-field{display:grid;gap:4px;font-size:12px;color:var(--text-soft)}
.title-field input{font:inherit;width:100%}
.grapes-canvas{min-height:200px;border:1px solid var(--border);border-radius:10px;background:var(--surface);overflow:auto}
.grapes-canvas :deep(.gjs-cv-canvas){width:100%;height:100%;top:0}.editor-controls{display:flex;gap:8px;flex-wrap:wrap}.editor-controls label{display:grid;gap:5px;width:100%;font-size:12px}.editor-controls input{width:100%}
.grapes-canvas[data-mode="offline"],.grapes-canvas[data-mode="loading"]{min-height:120px;background:repeating-linear-gradient(-45deg,var(--surface),var(--surface) 8px,var(--surface-2) 8px,var(--surface-2) 16px)}
.offline-panel{margin:0;padding:10px;border-radius:8px;background:var(--surface-2);font-size:12px;line-height:1.5;color:var(--text-soft)}
.actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
</style>
