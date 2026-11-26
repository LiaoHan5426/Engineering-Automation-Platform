<script setup lang="ts">
import { ref } from 'vue'
import './layout.css'

const element = ref<HTMLElement>()
defineExpose({ focus: () => element.value?.focus() })
</script>

<template>
  <aside ref="element" class="eap-layout__aside">
    <slot />
  </aside>
</template>
