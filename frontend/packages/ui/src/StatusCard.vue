<script setup lang="ts">
withDefaults(defineProps<{ status?: string }>(), { status: 'Ready' })
</script>
<template><p>Runtime status: {{ status }}</p></template>
