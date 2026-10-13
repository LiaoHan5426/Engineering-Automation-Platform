<script setup lang="ts">
defineProps<{ label: string; value: string | number; detail?: string; source?: string }>();
</script>

<template>
  <article class="eap-metric">
    <span>{{ label }}</span>
    <strong>{{ value }}</strong>
    <small v-if="detail">{{ detail }}</small>
    <small v-if="source" class="eap-metric__source">{{ source }}</small>
    <slot />
  </article>
</template>
