<script setup lang="ts">
const model = defineModel<string | number>();
defineProps<{ value: string | number; name: string; disabled?: boolean }>();
</script>
<template>
  <input v-model="model" class="eap-radio" type="radio" :value="value" :name="name" :disabled="disabled" />
</template>
<style src="./radio.css"></style>
