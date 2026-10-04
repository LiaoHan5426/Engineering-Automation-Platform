<script setup lang="ts">
defineProps<{ label: string; value: string; detail?: string }>()
</script>
<template><article class="eap-metric"><span>{{ label }}</span><strong>{{ value }}</strong><small v-if="detail">{{ detail }}</small></article></template>
