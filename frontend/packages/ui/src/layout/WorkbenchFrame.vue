<script setup lang="ts">
withDefaults(defineProps<{ rail?: boolean; railSide?: "start" | "end" }>(), { railSide: "end" });
</script>
<template>
  <div class="eap-workbench-frame" :class="{ 'eap-workbench-frame--rail': rail, 'eap-workbench-frame--start': rail && railSide === 'start' }">
    <slot />
    <slot name="rail" />
    <slot name="overlay" />
  </div>
</template>
<style src="./layout.css"></style>
