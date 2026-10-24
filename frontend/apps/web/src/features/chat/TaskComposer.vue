<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Button, Feedback } from "@eap/ui";
import { runtimeApi, type TaskContext, type PrototypeVersionRecord } from "@eap/runtime-client";

const props = defineProps<{ context: TaskContext; disabled: boolean; reasoningSupported: boolean }>();
const emit = defineEmits<{ update: [context: TaskContext] }>();
const { t } = useI18n();
const menu = ref(false), settings = ref(false), category = ref("references"), note = ref("");
const root = ref<HTMLElement | null>(null);
function dismiss(event: Event) { if (!root.value?.contains(event.target as Node)) { menu.value = false; settings.value = false; } }
onMounted(() => document.addEventListener("pointerdown", dismiss));
onUnmounted(() => document.removeEventListener("pointerdown", dismiss));
const versions = ref<PrototypeVersionRecord[]>([]);
const filesInput = ref<HTMLInputElement | null>(null);
const selectedVersion = computed(() => versions.value.find((version) => version.id === props.context.prototypeVersionId));
function change<K extends keyof TaskContext>(key: K, value: TaskContext[K]) {
  emit("update", { ...props.context, [key]: value });
}
async function filesChanged(event: Event) {
  note.value = "";
  const input = event.target as HTMLInputElement;
  try {
    const next = [...props.context.files];
    for (const file of Array.from(input.files ?? [])) {
      if (next.length >= 6 || file.size > 64000) throw new Error(t("task.fileLimit"));
      const content = await file.text();
      if (content.includes("\0") || content.length > 16000 || next.reduce((size, item) => size + item.content.length, 0) + content.length > 24000)
        throw new Error(t("task.fileLimit"));
      next.push({ name: file.name, content });
    }
    change("files", next);
  } catch (error) { note.value = error instanceof Error ? error.message : t("task.fileLimit"); }
  finally { input.value = ""; }
}
onMounted(async () => {
  const pending = sessionStorage.getItem("eap.chat.prototype");
  if (pending) {
    sessionStorage.removeItem("eap.chat.prototype");
    emit("update", { ...props.context, prototypeVersionId: pending, mode: "code", expert: "frontend" });
  }
});
async function loadVersions() {
  try {
    const pages = await Promise.all([runtimeApi.prototypeVersions("builder-alpha"), runtimeApi.prototypeVersions("builder-beta")]);
    versions.value = pages.flatMap((page) => page.items);
    note.value = "";
  } catch { note.value = t("task.versionUnavailable"); }
}
</script>

<template>
  <div ref="root" class="task-context" data-testid="task-context" @keydown.esc="menu = false; settings = false">
    <div class="context-toolbar">
      <Button variant="secondary" type="button" :disabled="disabled" :aria-label="t('task.context')" :aria-expanded="menu" @click="menu = !menu; settings = false">＋</Button>
      <slot name="model" />
      <Button class="composer-settings-button" variant="secondary" type="button" :disabled="disabled" :aria-expanded="settings" @click="settings = !settings; menu = false">⚙ {{ t('composerUi.settings') }}</Button>
      <slot name="send" />
    </div>
    <div v-if="menu" class="composer-popup" role="dialog" :aria-label="t('task.context')">
      <div class="composer-categories" role="tablist">
        <button v-for="tab in ['references', 'experts', 'guidance']" :key="tab" type="button" role="tab" :aria-selected="category === tab" @click="category = tab">{{ t('composerUi.' + tab) }}</button>
      </div>
      <div class="composer-popup-content">
        <template v-if="category === 'references'">
          <input ref="filesInput" type="file" multiple accept=".vue,.ts,.tsx,.js,.jsx,.json,.md,.txt,.sql,.java,.css,.html" hidden @change="filesChanged" />
          <Button type="button" variant="secondary" :disabled="disabled" @click="filesInput?.click()">{{ t('task.addFile') }}</Button>
          <Button type="button" variant="secondary" :disabled="disabled" @click="loadVersions">{{ t('task.loadVersions') }}</Button>
          <label>{{ t('task.version') }}<select :disabled="disabled" :value="context.prototypeVersionId" @change="change('prototypeVersionId', ($event.target as HTMLSelectElement).value)"><option value="">{{ t('task.noVersion') }}</option><option v-for="version in versions" :key="version.id" :value="version.id">{{ version.title }} · {{ version.id.slice(0, 8) }}</option></select></label>
        </template>
        <template v-else-if="category === 'experts'">
      <label>{{ t("task.expert") }}
        <select :value="context.expert" :disabled="disabled" @change="change('expert', ($event.target as HTMLSelectElement).value as TaskContext['expert'])">
          <option value="general">{{ t("task.general") }}</option><option value="sql">{{ t("task.sql") }}</option><option value="frontend">{{ t("task.frontend") }}</option>
        </select>
      </label>
        </template>
        <label v-else>{{ t('task.guidance') }}<textarea :disabled="disabled" :value="context.instructions" rows="3" maxlength="4000" @input="change('instructions', ($event.target as HTMLTextAreaElement).value)" /></label>
        <p class="hint">{{ t('task.contextNotice') }}</p>
      </div>
    </div>
    <div v-if="settings" class="composer-popup composer-settings" role="dialog" :aria-label="t('composerUi.settings')">
      <h3>{{ t('composerUi.settings') }}</h3>
      <slot name="settings" />
      <label>{{ t("task.mode") }}
        <select :value="context.mode" :disabled="disabled" @change="change('mode', ($event.target as HTMLSelectElement).value as TaskContext['mode'])">
          <option value="chat">{{ t("task.discuss") }}</option><option value="code">{{ t("task.generate") }}</option>
        </select>
      </label>
      <label>{{ t("task.reasoning") }}
        <select :value="context.reasoning" :disabled="disabled || !reasoningSupported" @change="change('reasoning', ($event.target as HTMLSelectElement).value as TaskContext['reasoning'])">
          <option value="default">{{ t("task.modelDefault") }}</option><option value="low">{{ t("task.low") }}</option><option value="medium">{{ t("task.medium") }}</option><option value="high">{{ t("task.high") }}</option>
        </select>
      </label>
      <label>{{ t("task.approval") }}
        <select :value="context.approval" :disabled="disabled" @change="change('approval', ($event.target as HTMLSelectElement).value as TaskContext['approval'])">
          <option value="review">{{ t("task.review") }}</option><option value="read_only">{{ t("task.readOnly") }}</option>
        </select>
      </label>
      <p v-if="!reasoningSupported" class="hint">{{ t('task.reasoningUnsupported') }}</p>
    </div>
    <div class="context-chips">
      <button v-if="context.expert !== 'general'" type="button" @click="change('expert', 'general')">{{ t('task.' + context.expert) }} ×</button>
      <button v-for="(file, index) in context.files" :key="index" type="button" @click="change('files', context.files.filter((_, i) => i !== index))">📎 {{ file.name }} ×</button>
      <button v-if="context.prototypeVersionId" type="button" @click="change('prototypeVersionId', '')">▧ {{ selectedVersion?.title || context.prototypeVersionId.slice(0, 8) }} ×</button>
    </div>
    <p v-if="context.mode === 'code'" class="hint">{{ t("task.codeNotice") }}</p>

    <Feedback v-if="note" tone="warning">{{ note }}</Feedback>
  </div>
</template>

<style scoped>
.task-context { border-top: 1px solid var(--color-border, #dce3ee); padding-top: 12px; }
.context-toolbar, .context-chips { display: flex; flex-wrap: wrap; align-items: end; gap: 10px; }
.context-toolbar label { display: grid; gap: 5px; font-size: 12px; }
.context-toolbar select { padding: 7px; border: 1px solid #dce3ee; border-radius: 8px; background: var(--color-surface, white); }
.context-menu { display: grid; gap: 12px; padding: 16px; margin: 12px 0; background: #f6f8fc; border-radius: 12px; }
.context-menu textarea { width: 100%; display: block; }
.context-chips { margin: 10px 0; }
.context-chips button { border: 1px solid #c9d7eb; border-radius: 16px; padding: 4px 12px; background: #edf4ff; color: #263e63; }
</style>
