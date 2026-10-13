<script setup lang="ts">
import Feedback from "./Feedback.vue";

withDefaults(
  defineProps<{
    status?: string;
    label?: string;
    tone?: "info" | "error" | "warning" | "success";
  }>(),
  { status: "就绪", label: "运行时状态", tone: "info" },
);
</script>

<template>
  <Feedback :tone="tone">{{ label }}：{{ status }}</Feedback>
</template>
