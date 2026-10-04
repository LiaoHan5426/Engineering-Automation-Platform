<script setup lang="ts">
withDefaults(defineProps<{ label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }>(), { tone: 'neutral' })
</script>
<template><span class="eap-badge" :class="`eap-badge--${tone}`">{{ label }}</span></template>
