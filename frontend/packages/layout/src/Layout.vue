<script setup lang="ts">
import './layout.css'

withDefaults(defineProps<{ direction?: 'vertical' | 'horizontal' }>(), {
  direction: 'vertical',
})
</script>

<template>
  <div class="eap-layout" :class="`eap-layout--${direction}`">
    <slot />
  </div>
</template>
