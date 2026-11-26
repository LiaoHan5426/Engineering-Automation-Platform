<script setup lang="ts">
import './layout.css'

withDefaults(defineProps<{ as?: 'main' | 'section' | 'div' }>(), { as: 'main' })
</script>

<template>
  <component :is="as" class="eap-layout__content">
    <slot />
  </component>
</template>
