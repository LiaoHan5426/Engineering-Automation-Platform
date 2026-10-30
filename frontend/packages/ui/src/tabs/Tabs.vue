<script setup lang="ts">
import { computed, useAttrs } from "vue";

defineOptions({ inheritAttrs: false });

const model = defineModel<string>({ required: true });
defineProps<{
  label: string;
  tabs: Array<{ id: string; label: string; testId?: string }>;
}>();
const attrs = useAttrs();
const extra = computed(() => {
  const { class: _class, role: _role, "aria-label": _label, ...rest } = attrs;
  return rest;
});
</script>

<template>
  <div v-bind="extra" :class="['eap-tabs', attrs.class]" role="tablist" :aria-label="label">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      class="eap-tabs__tab"
      role="tab"
      :data-testid="tab.testId"
      :aria-selected="model === tab.id"
      @click="model = tab.id"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<style src="./tabs.css"></style>
