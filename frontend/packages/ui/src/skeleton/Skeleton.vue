<script setup lang="ts">
withDefaults(defineProps<{ animated?: boolean }>(), { animated: true });
</script>
<template>
  <span class="eap-skeleton" :class="{ 'eap-skeleton--animated': animated }" aria-hidden="true" />
</template>
<style src="./skeleton.css"></style>
