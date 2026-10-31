<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Button, Feedback, Panel, Segmented, Select, Slider, Splitter, Tooltip } from "@eap/ui";
import { appearance, appearanceDefaults, appearanceStorageError, setAppearance, type AppearancePreferences } from "./appearance";
const { t } = useI18n();
const choices = (values: string[]) => values.map(value => ({ value, label: t(`appearance.${value}`) }));
function update(key: keyof AppearancePreferences, value: string | number) { setAppearance({ ...appearance.value, [key]: value }); }
const split = computed({ get: () => 100 - appearance.value.railWidth / 10, set: value => update("railWidth", Math.round((100 - value) * 10)) });
</script>
<template>
  <section class="appearance-settings work-page" data-testid="appearance-settings">
    <header class="page-head"><h1>{{ t('appearance.title') }}</h1><p>{{ t('appearance.hint') }}</p></header>
    <Feedback v-if="appearanceStorageError" tone="warning" role="alert">{{ t('appearance.failed') }}</Feedback>
    <Panel :title="t('appearance.theme')">
      <Segmented data-testid="appearance-theme" :label="t('appearance.theme')" :options="choices(['light', 'dark', 'system'])" :model-value="appearance.theme" @update:model-value="update('theme', $event)" />
      <label class="appearance-field">{{ t('appearance.skin') }}<Select data-testid="appearance-skin" :model-value="appearance.skin" @update:model-value="update('skin', String($event))"><option value="console">{{ t('appearance.console') }}</option><option value="default">{{ t('appearance.default') }}</option></Select></label>
      <Segmented data-testid="appearance-density" :label="t('appearance.density')" :options="choices(['comfortable', 'compact'])" :model-value="appearance.density" @update:model-value="update('density', $event)" />
    </Panel>
    <Panel :title="t('appearance.preview')">
      <label v-for="item in [{ key: 'sidebarWidth', label: 'sidebar', min: 240, max: 380 }, { key: 'railWidth', label: 'rail', min: 280, max: 560 }, { key: 'contentMaxWidth', label: 'content', min: 960, max: 1920 }] as const" :key="item.key" class="appearance-field">
        <span>{{ t(`appearance.${item.label}`) }} · {{ appearance[item.key] }}px</span>
        <Slider :data-testid="'appearance-' + item.key" :model-value="appearance[item.key]" :min="item.min" :max="item.max" :step="4" @update:model-value="update(item.key, $event)" />
      </label>
      <p class="hint">{{ t('appearance.previewHint') }}</p>
      <Splitter v-model="split" class="appearance-preview" :min="44" :max="72" :label="t('appearance.resize')">
        <template #start><div>{{ t('appearance.main') }}</div></template>
        <template #end><div>{{ t('appearance.panel') }}</div></template>
      </Splitter>
      <Tooltip :text="t('appearance.widthHint')"><Button data-testid="appearance-reset" @click="setAppearance(appearanceDefaults)">{{ t('appearance.reset') }}</Button></Tooltip>
    </Panel>
    <p v-if="!appearanceStorageError" class="hint" role="status">{{ t('appearance.saved') }}</p>
  </section>
</template>
<style scoped>
.appearance-settings { display: grid; gap: 20px; width: 100%; }
.appearance-field { display: grid; gap: 8px; margin-block: 16px; max-width: 560px; }
.appearance-preview { height: 140px; margin-block: 12px; border: 1px solid var(--border); border-radius: var(--radius-control); }
.appearance-preview :deep(.eap-splitter__panel > div) { height: 100%; padding: 16px; background: var(--surface-2); }
</style>
