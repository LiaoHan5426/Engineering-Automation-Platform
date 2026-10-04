<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>
<template><section class="eap-panel"><header><div><h2>{{ title }}</h2><p v-if="description">{{ description }}</p></div><slot name="actions" /></header><div class="eap-panel__body"><slot /></div></section></template>
