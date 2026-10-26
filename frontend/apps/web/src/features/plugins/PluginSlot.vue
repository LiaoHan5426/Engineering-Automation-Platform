<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { useI18n } from "vue-i18n";
import ChatWorkspace from "../chat/ChatWorkspace.vue";
import BuilderWorkspace from "./BuilderWorkspace.vue";
import type { PluginHost } from "./host";
import type { BuilderConfig } from "./model";

const props = defineProps<{ viewId: string; host: PluginHost }>();
const { t } = useI18n();
const visited = reactive(new Set<string>());
const workspaceIds = ['chat', 'builder-alpha', 'builder-beta'] as const;
watch(() => props.viewId, id => { if (workspaceIds.some(value => value === id)) visited.add(id); }, { immediate: true });
const cachedViews = computed(() => workspaceIds.filter(id => visited.has(id) && (id === 'chat' ? props.host.installation.value.enabled.chat : props.host.installation.value.enabled.builder)));

const instanceId = computed((): BuilderConfig["instanceId"] | "" => {
  if (props.viewId === "builder-alpha") return "alpha";
  if (props.viewId === "builder-beta") return "beta";
  return "";
});
const enabled = computed(() =>
  props.viewId === "chat" ? props.host.installation.value.enabled.chat : props.host.installation.value.enabled.builder,
);
</script>

<template>
  <template v-for="id in cachedViews" :key="id">
    <ChatWorkspace v-if="id === 'chat'" v-show="viewId === id" :active="viewId === id" />
    <BuilderWorkspace v-else v-show="viewId === id" :instance-id="id === 'builder-alpha' ? 'alpha' : 'beta'" :host="host" />
  </template>
  <section v-if="(viewId === 'chat' || instanceId) && !enabled" class="view" data-testid="plugin-disabled">
    <div class="page-head">
      <h1>{{ t("plugin.hiddenTitle") }}</h1>
      <p>{{ t("plugin.hiddenBody") }}</p>
    </div>
  </section>
</template>
