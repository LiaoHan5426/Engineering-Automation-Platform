<script setup lang="ts">
withDefaults(defineProps<{ message: string; tone?: "info" | "error" | "warning" }>(), {
  tone: "info",
});
</script>
<template>
  <p
    :class="tone === 'error' ? 'error-message' : tone === 'warning' ? 'planning-note' : 'feedback'"
    :role="tone === 'error' ? 'alert' : 'status'"
  >
    {{ message }}<slot />
  </p>
</template>
