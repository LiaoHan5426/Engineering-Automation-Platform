<script setup lang="ts">
withDefaults(defineProps<{ label: string; variant?: 'primary' | 'secondary' | 'ghost'; disabled?: boolean }>(), { variant: 'secondary', disabled: false })
defineEmits<{ click: [] }>()
</script>
<template><button class="eap-button" :class="`eap-button--${variant}`" :disabled="disabled" type="button" @click="$emit('click')">{{ label }}</button></template>
