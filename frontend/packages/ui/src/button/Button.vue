<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string;
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md";
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
  }>(),
  { variant: "secondary", size: "md", disabled: false, type: "button" },
);
defineEmits<{ click: [MouseEvent] }>();
</script>

<template>
  <button
    class="eap-button"
    :class="[`eap-button--${variant}`, `eap-button--${size}`]"
    :disabled="disabled"
    :type="type"
    @click="$emit('click', $event)"
  >
    <slot>{{ label }}</slot>
  </button>
</template>

<style src="./button.css"></style>
