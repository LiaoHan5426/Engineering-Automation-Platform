<script setup lang="ts">
withDefaults(defineProps<{ orientation?: "horizontal" | "vertical"; decorative?: boolean }>(), {
  orientation: "horizontal", decorative: false,
});
</script>
<template>
  <div class="eap-divider" :class="`eap-divider--${orientation}`"
    :role="decorative ? 'none' : 'separator'" :aria-orientation="decorative ? undefined : orientation" />
</template>
<style src="./divider.css"></style>
