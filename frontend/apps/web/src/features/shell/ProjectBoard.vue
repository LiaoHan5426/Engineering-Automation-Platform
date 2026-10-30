<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
// Scheduling is not available yet: both service modes use the same labeled local board.
const PreviewBoard = defineAsyncComponent(() => import('./PreviewBoard.vue'));
</script>
<template><PreviewBoard /></template>
