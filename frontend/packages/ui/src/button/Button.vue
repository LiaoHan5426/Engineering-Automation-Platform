<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string;
    variant?: "primary" | "secondary" | "ghost" | "danger" | "link" | "navigation" | "activity" | "chip" | "icon" | "card" | "backdrop" | "custom";
    active?: boolean;
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
    :class="variant === 'custom' ? 'eap-button-custom' : ['eap-button', `eap-button--${variant}`, `eap-button--${size}`]"
    :disabled="disabled"
    :data-active="active || undefined"
    :type="type"
    @click="$emit('click', $event)"
  >
    <slot>{{ label }}</slot>
  </button>
</template>

<style src="./button.css"></style>
