<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import ChatWorkspace from "../chat/ChatWorkspace.vue";
import BuilderWorkspace from "./BuilderWorkspace.vue";
import type { PluginHost } from "./host";
import type { BuilderConfig } from "./model";

const props = defineProps<{ viewId: string; host: PluginHost }>();
const { t } = useI18n();

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
  <ChatWorkspace v-if="viewId === 'chat' && enabled" />
  <BuilderWorkspace v-else-if="instanceId && enabled" :key="instanceId" :instance-id="instanceId" :host="host" />
  <section v-else class="view" data-testid="plugin-disabled">
    <div class="page-head">
      <h1>{{ t("plugin.hiddenTitle") }}</h1>
      <p>{{ t("plugin.hiddenBody") }}</p>
    </div>
  </section>
</template>
