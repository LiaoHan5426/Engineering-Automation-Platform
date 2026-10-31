<script setup lang="ts">
import Input from "../field/Input.vue";
const model = defineModel<string>({ default: "" });
defineProps<{ label: string; min?: string; max?: string; disabled?: boolean; required?: boolean }>();
</script>
<template>
  <Input v-model="model" class="eap-date-picker" type="date" :aria-label="label"
    :min="min" :max="max" :disabled="disabled" :required="required" />
</template>
<style src="./date-picker.css"></style>
