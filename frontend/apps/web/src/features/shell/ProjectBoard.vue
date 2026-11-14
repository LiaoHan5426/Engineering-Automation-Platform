<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'
// Both service modes use the same preparation contract; scheduling is not connected.
const PreviewBoard = defineAsyncComponent(() => import('./PreviewBoard.vue'))
const board = ref<{ guardLeave: (onDiscard?: () => void) => boolean }>()
defineExpose({ guardLeave: (onDiscard?: () => void) => board.value?.guardLeave(onDiscard) ?? true })
</script>
<template><PreviewBoard ref="board" /></template>
