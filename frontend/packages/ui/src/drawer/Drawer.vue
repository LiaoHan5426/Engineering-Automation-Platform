<script setup lang="ts">
import Dialog from "../dialog/Dialog.vue";
withDefaults(defineProps<{ title: string; side?: "start" | "end"; busy?: boolean; showHeader?: boolean; closeLabel?: string; teleportTo?: string | HTMLElement }>(), { side: "end", showHeader: true, closeLabel: "关闭", teleportTo: "body" });
defineEmits<{ close: [] }>();
</script>
<template>
  <Dialog class="eap-drawer" :class="`eap-drawer--${side}`" :title="title" :busy="busy" :show-header="showHeader" :close-label="closeLabel" :teleport-to="teleportTo" @close="$emit('close')">
    <slot />
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </Dialog>
</template>
<style src="./drawer.css"></style>
