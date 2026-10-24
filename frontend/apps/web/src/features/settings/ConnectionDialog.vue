<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
const emit = defineEmits<{ close: [] }>();
const props = defineProps<{ title: string; busy: boolean }>();
const dialog = ref<HTMLDialogElement | null>(null);
onMounted(() => { if (dialog.value?.showModal) dialog.value.showModal(); else dialog.value?.setAttribute('open', ''); });
onUnmounted(() => dialog.value?.close?.());
function dismiss() { if (!props.busy) emit('close'); }
</script>
<template><Teleport to="body"><dialog ref="dialog" class="connection-dialog" :aria-label="title" @cancel.prevent="dismiss" @click="($event.target === dialog) && dismiss()"><div class="connection-dialog-content work-page"><slot /></div></dialog></Teleport></template>
