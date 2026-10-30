<script setup lang="ts">
import { computed, ref, useAttrs } from "vue";

defineOptions({ inheritAttrs: false });

const emit = defineEmits<{ scroll: [Event] }>();
const attrs = useAttrs();
const root = ref<HTMLElement | null>(null);
const extra = computed(() => {
  const { class: _class, onScroll: _onScroll, ...rest } = attrs;
  return rest;
});

defineExpose({ getEl: () => root.value });
</script>

<template>
  <div ref="root" :class="['eap-scrollbar', attrs.class]" v-bind="extra" @scroll="emit('scroll', $event)">
    <slot />
  </div>
</template>

<style src="./scrollbar.css"></style>
