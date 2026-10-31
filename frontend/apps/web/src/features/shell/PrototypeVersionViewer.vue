<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Collapse, Dialog } from '@eap/ui';
import { runtimeApi, type PrototypeVersionRecord } from '@eap/runtime-client';
import PrototypeSchemaPreview from './PrototypeSchemaPreview.vue';
import { parsePrototypeSchema } from './prototypeSchema';
const props = defineProps<{ versionId: string; expectedHash?: string }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const version = ref<PrototypeVersionRecord | null>(null), loading = ref(false), error = ref('');
let ticket = 0;
const mismatch = computed(() => !!version.value && !!props.expectedHash && version.value.contentHash !== props.expectedHash);
const schema = computed(() => {
  if (!version.value || mismatch.value) return null;
  try { const data = JSON.parse(version.value.body); return data.format === 'eap-prototype-v1' ? parsePrototypeSchema(JSON.stringify(data.schema)) : null; } catch { return null; }
});
async function load() {
  const current = ++ticket; loading.value = true; version.value = null; error.value = '';
  try { const data = await runtimeApi.prototypeVersion(props.versionId); if (current === ticket) version.value = data; }
  catch { if (current === ticket) error.value = t('boardPrototype.loadFailed'); }
  finally { if (current === ticket) loading.value = false; }
}
watch(() => props.versionId, () => void load(), { immediate: true });
onBeforeUnmount(() => ticket++);
</script>
<template>
  <Dialog :title="t('boardPrototype.viewTitle')" :close-label="t('preview.close')" size="lg" data-testid="prototype-version-viewer" @close="emit('close')">
    <p v-if="loading" role="status">{{ t('boardPrototype.loading') }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <Button v-if="error" size="sm" @click="load">{{ t('boardPrototype.refresh') }}</Button>
    <template v-if="version">
      <p>{{ version.title || version.id }}</p>
      <p class="version-meta">{{ version.sourceRef }} · {{ version.createdAt }}<br>{{ version.id }}<br>SHA-256: {{ version.contentHash }}</p>
      <p v-if="mismatch" role="alert">{{ t('boardPrototype.hashMismatch') }}</p>
      <template v-else>
        <p>{{ t('boardPrototype.previewHint') }}</p>
        <PrototypeSchemaPreview v-if="schema" :key="version.id" :schema="schema" />
        <p v-else>{{ t('boardPrototype.textOnly') }}</p>
        <Collapse><template #summary>{{ t('boardPrototype.savedContent') }}</template><pre>{{ version.body }}</pre></Collapse>
        <p>{{ t('boardPrototype.savedChecks') }}</p>
        <ul><li v-for="(item, index) in version.acceptance" :key="index">{{ item }}</li></ul>
      </template>
    </template>
  </Dialog>
</template>
<style scoped>
.version-meta{font-size:11px;overflow-wrap:anywhere;color:var(--text-soft)}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:320px;overflow:auto;color:var(--eap-code-text);background:var(--eap-code-bg);padding:12px;border-radius:8px;font-size:11px}
</style>
