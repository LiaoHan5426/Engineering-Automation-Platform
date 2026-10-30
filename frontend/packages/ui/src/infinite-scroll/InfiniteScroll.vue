<script setup lang="ts">
import { ref } from "vue";
import Scrollbar from "../scrollbar/Scrollbar.vue";
import { reachedScrollEdge } from "./reachedScrollEdge";

const props = withDefaults(
  defineProps<{
    edge?: "start" | "end";
    distance?: number;
    disabled?: boolean;
  }>(),
  { edge: "start", distance: 80, disabled: false },
);
const emit = defineEmits<{
  load: [];
  scroll: [Event];
}>();
const bar = ref<{ getEl: () => HTMLElement | null } | null>(null);
let armed = true;

function onScroll(event: Event) {
  emit("scroll", event);
  const el = event.currentTarget;
  if (!(el instanceof HTMLElement)) return;
  const hit = reachedScrollEdge(
    { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight },
    props.edge,
    props.distance,
  );
  if (!hit) {
    armed = true;
    return;
  }
  if (!armed || props.disabled) return;
  armed = false;
  emit("load");
}

defineExpose({ getEl: () => bar.value?.getEl() ?? null });
</script>

<template>
  <Scrollbar ref="bar" @scroll="onScroll">
    <slot />
  </Scrollbar>
</template>
