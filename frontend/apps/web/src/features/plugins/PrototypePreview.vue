<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { Badge, Button } from "@eap/ui";

defineProps<{ title: string; body: string; presses: number }>();
defineEmits<{ press: [] }>();

const { t } = useI18n();
</script>

<template>
  <article class="preview" data-testid="vue-preview">
    <Badge tone="success" :label="t('plugin.preview')" />
    <h2>{{ title }}</h2>
    <p>{{ body }}</p>
    <Button data-testid="preview-button" variant="primary" @click="$emit('press')">
      {{ t("plugin.press") }}
    </Button>
    <p data-testid="press-count">{{ t("plugin.presses", { n: presses }) }}</p>
  </article>
</template>

<style scoped>
.preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--eap-line, #d7dde5);
  border-radius: 12px;
}
</style>
