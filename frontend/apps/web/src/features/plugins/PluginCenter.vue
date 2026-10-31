<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { Badge, Button } from "@eap/ui";
import type { PluginHost } from "./host";
import { GRANTS, MANIFESTS, type PluginId } from "./model";

defineProps<{ host: PluginHost }>();
const { t } = useI18n();

function name(id: PluginId): string {
  return id === "chat" ? t("plugin.chat") : t("plugin.builder");
}
</script>

<template>
  <section class="view" data-testid="plugin-center">
    <div class="page-head">
      <p class="eyebrow">PLUGINS</p>
      <h1>{{ t("plugin.center") }}</h1>
      <p>{{ t("plugin.centerHint") }}</p>
    </div>
    <ul class="plugin-list">
      <li v-for="manifest in MANIFESTS" :key="manifest.id" :data-testid="`plugin-${manifest.id}`">
        <h2>{{ name(manifest.id) }} <span class="hint">{{ manifest.version }}</span></h2>
        <Badge
          :tone="host.installation.value.enabled[manifest.id] ? 'success' : 'warning'"
          :label="host.installation.value.enabled[manifest.id] ? t('plugin.enabled') : t('plugin.disabled')"
        />
        <p class="hint">{{ t("plugin.requests") }}：{{ manifest.requests.map((item) => item.id).join("、") }}</p>
        <p class="hint">{{ t("plugin.grants") }}：{{ GRANTS.length ? GRANTS.join("、") : t("plugin.noGrant") }}</p>
        <Button
          variant="secondary"
          :data-testid="`plugin-toggle-${manifest.id}`"
          @click="host.setEnabled(manifest.id, !host.installation.value.enabled[manifest.id])"
        >
          {{ host.installation.value.enabled[manifest.id] ? t("plugin.disable") : t("plugin.enable") }}
        </Button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.plugin-list {
  display: grid;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.plugin-list li {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
  padding: 16px;
  border: 1px solid var(--eap-line, var(--border));
  border-radius: 12px;
}
</style>
