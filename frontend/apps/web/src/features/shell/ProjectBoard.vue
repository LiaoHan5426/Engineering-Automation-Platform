<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
// Both service modes use the same preparation contract; scheduling is not connected.
const PreviewBoard = defineAsyncComponent(() => import('./PreviewBoard.vue'));
</script>
<template><PreviewBoard /></template>
