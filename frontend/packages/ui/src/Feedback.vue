<script setup lang="ts">
withDefaults(defineProps<{ message?: string; tone?: "info" | "error" | "warning" | "success" }>(), {
  tone: "info",
});
</script>

<template>
  <p
    class="eap-feedback"
    :class="{
      'eap-feedback--error': tone === 'error',
      'eap-feedback--warning': tone === 'warning',
      'eap-feedback--success': tone === 'success',
    }"
    :role="tone === 'error' ? 'alert' : 'status'"
  >
    <slot>{{ message }}</slot>
  </p>
</template>
