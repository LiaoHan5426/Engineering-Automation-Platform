<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Checkbox, Select } from '@eap/ui';
import LayoutDraft from './LayoutDraft.vue';
import { pagePreviewMessageKey, resolvePagePreview } from './pagePreview';
import { workbench, type LayoutDraft as DesignVersion } from './workbench';
import { preview, previewProjects } from './preview';
import { identityAuthorized, identityPath, runtimeIdentity } from './runtimeIdentity';
const emit = defineEmits<{ navigate: [id: string] }>();
const { t } = useI18n();
const pagePreview = computed(() => resolvePagePreview({ mock: true }));
const previewLine = computed(() => t(pagePreviewMessageKey(pagePreview.value)));
const projectId = ref(preview.state.projectId), versionId = ref('');
const pages = [
  { id: 'shell', label: 'preview.pageShell', path: 'frontend/apps/web/src/App.vue' },
  { id: 'nav', label: 'preview.pageNav', path: 'frontend/apps/web/src/features/DesktopNavigation.vue' },
  { id: 'chat', label: 'preview.pageChat', path: 'frontend/apps/web/src/features/chat/ChatWorkspace.vue' },
  { id: 'composer', label: 'preview.pageComposer', path: 'frontend/apps/web/src/features/chat/TaskComposer.vue' },
];
const pageId = ref('composer');
const scopeConfirmed = ref(false);
const adopted = ref(false);
const checks = ["nav", "popover", "panel"] as const;
const version = computed(() => workbench.drafts.find(item => item.id === versionId.value));
const repository = computed(() => previewProjects.find(item => item.id === projectId.value));
const page = computed(() => pages.find(item => item.id === pageId.value) ?? pages[0]!);
const serverRepo = computed(() => {
  const path = identityPath(runtimeIdentity.value);
  if (!path) return t('desktop.repoUnknown');
  return identityAuthorized(runtimeIdentity.value)
    ? `${path} · ${t('desktop.repoAuthorized')}`
    : `${path} · ${t('desktop.processBoundRootMissing')}`;
});
const allowed = ref(true);
const accepted = computed(() => checks.every((id) => version.value?.acceptance?.includes(id)));
const ready = computed(() => Boolean(version.value && repository.value && allowed.value && scopeConfirmed.value && adopted.value && accepted.value));
function saved(draft: DesignVersion) { versionId.value = draft.id; adopted.value = false; }
function prepare() {
  if (!ready.value || !version.value) return;
  // Explicitly labeled handoff to a simulated session; never send a fixture to the real model.
  workbench.pendingMockHandoff = true;
  preview.state.projectId = projectId.value;
  const session = preview.create('code', projectId.value);
  session.execution = 'agent';
  workbench.workMode = 'code'; workbench.executionMode = 'agent';
  session.context.mode = 'code'; session.context.expert = 'frontend'; session.context.prototypeVersionId = version.value.id;
  session.context.targetPath = page.value.path || workbench.deliveryTargetPath;
  session.context.instructions = `${page.value.path}\n${t('desktop.deliveryConstraint')}\n${t('desktop.deliverySource')}\n${t('desktop.deliveryBaseline')}\n${t('desktop.deliveryChecks')}`;
  session.draft = `${t('preview.prototypeTitle')}：${version.value.title || version.value.id}`;
  workbench.sessionExtras[session.id] = { scenarioId: 'prototype-to-code', experts: [], resources: [], projectId: null, executionMode: 'agent', delivery: { versionId: version.value.id, pagePath: page.value.path, pageLabel: page.value.label } };
  emit('navigate', 'chat');
}
</script>
<template>
  <section class="prototype-flow" data-testid="prototype-flow">
    <header><div><h2>{{ t('preview.prototypeTitle') }}</h2><p>{{ t('preview.prototypeIntro') }}</p></div><span>{{ t('preview.simulated') }}</span></header>
    <section class="target-card"><h3>{{ t('preview.target') }}</h3><div class="target-fields"><label>{{ t('preview.repository') }}<Select v-model="projectId"><option v-for="project in previewProjects" :key="project.id" :value="project.id">{{ project.name }} · {{ project.directory }}</option></Select></label><div><small>{{ t('preview.baseline') }}</small><p>{{ t('preview.projectHint') }}</p></div></div><label class="path-scope"><Checkbox v-model="allowed" />{{ t('preview.scope') }}：{{ page.path }} · {{ t('preview.simulated') }}</label></section>
    <section class="target-card" data-testid="prototype-current"><h3>{{ t('preview.current') }}</h3><p>{{ t('preview.currentHint') }}</p><label>{{ t('preview.pageLabel') }}<Select v-model="pageId" data-testid="target-page" @change="scopeConfirmed = false"><option v-for="item in pages" :key="item.id" :value="item.id">{{ t(item.label) }} · {{ item.path }}</option></Select></label><ul class="readiness"><li>{{ t('preview.unread') }}</li><li data-testid="server-repo-current">{{ serverRepo }}</li><li>{{ t('preview.baselineUnknown') }}</li><li>{{ t('preview.verificationOff') }}</li><li>{{ scopeConfirmed ? t('preview.scopeReady') : t('preview.scopePending') }}</li><li>{{ version ? (version.title || version.id) : t('preview.chooseVersion') }}</li></ul><label class="path-scope"><Checkbox v-model="scopeConfirmed" data-testid="confirm-scope" />{{ t('preview.confirmScope') }}：{{ t(page.label) }}</label></section>
    <section><h3>{{ t('preview.design') }}</h3><LayoutDraft @saved="saved" /></section>
    <section class="target-card"><h3>{{ t('preview.prepare') }}</h3><label>{{ t('preview.version') }}<Select v-model="versionId" data-testid="design-version" @change="adopted = false"><option value="">{{ t('preview.chooseVersion') }}</option><option v-for="draft in workbench.drafts" :key="draft.id" :value="draft.id">{{ draft.title || draft.id }} · {{ draft.savedAt }}</option></Select></label><ul class="readiness" data-testid="delivery-input"><li>{{ t('desktop.deliveryInput') }}</li><li>{{ version ? (version.title || version.id) : t('preview.chooseVersion') }}</li><li>{{ t(page.label) }} · {{ page.path }}</li><li>{{ t('desktop.deliverySource') }}</li><li>{{ t('desktop.deliveryBaseline') }}</li><li>{{ t('desktop.deliveryChecks') }}</li><li data-testid="delivery-preview">{{ previewLine }}</li><li>{{ t('desktop.acceptanceStillOpen') }}</li></ul><ul class="readiness" data-testid="prepare-contract"><li>{{ version ? (version.title || version.id) : t('preview.chooseVersion') }}</li><li>{{ repository?.name }} · {{ repository?.directory }}</li><li data-testid="server-repo-prepare">{{ serverRepo }}</li><li>{{ t('preview.allowedFile') }}：{{ allowed ? page.path : t('preview.scopePending') }}</li><li>{{ t('preview.baselineUnknown') }}</li><li>{{ t('preview.executorOff') }}</li><li>{{ t('preview.modelOff') }}</li><li>{{ t('preview.policyReview') }}</li><li>{{ t('preview.commandsOff') }}</li></ul><ul class="readiness"><li v-for="id in checks" :key="id">{{ t('preview.check' + id.charAt(0).toUpperCase() + id.slice(1)) }} · {{ version?.acceptance?.includes(id) ? t('preview.checkDone') : t('preview.checkPending') }}</li></ul><label class="path-scope"><Checkbox v-model="adopted" data-testid="confirm-design" :disabled="!accepted" />{{ t('preview.adoptDesign') }}</label><p>{{ t(ready ? 'preview.readiness' : accepted ? 'preview.adoptDesign' : version ? 'preview.acceptancePending' : 'preview.chooseVersion') }}</p><Button class="prepare-button" type="button" variant="primary" size="sm" :disabled="!ready" data-testid="prepare-prototype" @click="prepare">{{ t('preview.continue') }} →</Button></section>
  </section>
</template>
<style scoped>
.prototype-flow{display:grid;gap:22px}header{display:flex;justify-content:space-between;gap:14px}h2{font-size:20px;margin:0 0 8px}h3{font-size:13px;margin:0 0 14px}header p,.target-card p,.target-fields small{font-size:12px;line-height:1.7;color:#7a887f}header>span{font-size:10px;color:#a18b50;white-space:nowrap}.target-card{padding:20px;background:#f2f4ec;border:1px solid var(--border);border-radius:14px}.target-fields{display:grid;grid-template-columns:1fr 1fr;gap:20px}.target-card label{display:grid;gap:8px;font-size:12px}.target-card .path-scope{display:flex;align-items:center;gap:8px;margin-top:16px;overflow-wrap:anywhere}.path-scope input{flex-shrink:0}select{max-width:100%;min-width:0;font-size:12px}.readiness{margin:12px 0 0;padding-left:18px;font-size:12px;line-height:1.7;color:#526356}.prepare-button{margin-top:12px}@media(max-width:760px){.target-fields{grid-template-columns:1fr}.target-card{padding:14px}}
</style>
