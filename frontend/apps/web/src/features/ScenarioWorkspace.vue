<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { onMounted, ref } from 'vue';
import { runtimeApi, type PrototypeVersionRecord } from '@eap/runtime-client';
const props = defineProps<{ builderEnabled: boolean; chatEnabled: boolean }>();
const emit = defineEmits<{ navigate: [id: string] }>();
const { t } = useI18n();
const versions = ref<PrototypeVersionRecord[]>([]);
const selected = ref('');
const loading = ref(false);
const error = ref('');
async function loadVersions() {
  loading.value = true;
  error.value = '';
  try {
    const pages = await Promise.all([runtimeApi.prototypeVersions('builder-alpha'), runtimeApi.prototypeVersions('builder-beta')]);
    versions.value = pages.flatMap(page => page.items);
    if (!versions.value.some(item => item.id === selected.value)) selected.value = '';
  } catch { error.value = t('task.versionUnavailable'); }
  finally { loading.value = false; }
}
function develop() {
  if (!props.chatEnabled || loading.value || error.value || !versions.value.some(item => item.id === selected.value)) return;
  sessionStorage.setItem('eap.chat.prototype', selected.value);
  emit('navigate', 'chat');
}
onMounted(loadVersions);
</script>
<template>
  <section class="view scenario-workspace">
    <h1>{{ t('desktop.prototype') }}</h1>
    <p>{{ t('desktop.scenarioIntro') }}</p>
    <ol class="scenario-steps">
      <li><h2>{{ t('desktop.design') }}</h2><p>{{ t('desktop.designHint') }}</p><button :disabled="!builderEnabled" @click="$emit('navigate', 'builder-alpha')">{{ t('desktop.openPrototype') }}</button></li>
      <li><h2>{{ t('desktop.preview') }}</h2><p>{{ t('desktop.previewHint') }}</p><button :disabled="!builderEnabled" @click="$emit('navigate', 'builder-alpha')">{{ t('desktop.openVersions') }}</button></li>
      <li><h2>{{ t('desktop.develop') }}</h2><p>{{ t('desktop.developHint') }}</p>
        <label>{{ t('desktop.chooseVersion') }}
          <select v-model="selected" :disabled="loading || !!error" data-testid="scenario-version">
            <option value="">{{ t('desktop.chooseVersion') }}</option>
            <option v-for="version in versions" :key="version.id" :value="version.id">{{ version.title }} · {{ version.sourceRef }} · {{ version.id.slice(0, 8) }}</option>
          </select>
        </label>
        <p v-if="error" role="alert">{{ error }}</p>
        <p v-else-if="!loading && !versions.length">{{ t('desktop.noVersions') }}</p>
        <button :disabled="loading" @click="loadVersions">{{ t('desktop.refreshVersions') }}</button>
        <button :disabled="!chatEnabled || !selected || loading || !!error" data-testid="scenario-develop" @click="develop">{{ t('desktop.openCode') }}</button>
      </li>
    </ol>
    <p>{{ t('desktop.scenarioBoundary') }}</p>
    <button v-if="!builderEnabled || !chatEnabled" @click="$emit('navigate', 'plugins')">{{ t('desktop.enablePlugins') }}</button>
  </section>
</template>
<style scoped>
.scenario-workspace{padding:32px;max-width:1100px;margin:auto}.scenario-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;padding:24px;list-style-position:inside}.scenario-steps li{padding:20px;background:#f6f7f3;border:1px solid #dce2d9;border-radius:16px}.scenario-steps h2{font-size:18px}.scenario-steps p{line-height:1.8}.scenario-workspace button{padding:10px 16px;border:1px solid #aebfb5;border-radius:8px;background:#e1ede6;cursor:pointer}.scenario-workspace button:disabled{opacity:.5;cursor:default}@media(max-width:1000px){.scenario-steps{grid-template-columns:1fr}}
</style>
