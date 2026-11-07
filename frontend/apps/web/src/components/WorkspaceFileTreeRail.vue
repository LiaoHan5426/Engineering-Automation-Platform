<script setup lang="ts">
import { Button } from '@eap/ui'
import { useI18n } from 'vue-i18n'
import RepositoryBrowser from './RepositoryBrowser.vue'

defineEmits<{ close: [] }>()
const { t } = useI18n()
</script>

<template>
  <aside
    class="workspace-tree-rail eap-scrollbar"
    data-testid="workspace-tree-rail"
    :aria-label="t('desktop.workspaceTree')"
  >
    <header>
      <strong>{{ t('desktop.workspaceTree') }}</strong>
      <Button
        size="sm"
        variant="link"
        type="button"
        data-testid="close-workspace-tree"
        :aria-label="t('desktop.panelClose')"
        @click="$emit('close')"
        >{{ t('desktop.panelClose') }}</Button
      >
    </header>
    <p class="hint">{{ t('desktop.workspaceTreeHint') }}</p>
    <p class="hint">{{ t('desktop.fileReadOnly') }}</p>
    <RepositoryBrowser compact />
  </aside>
</template>

<style scoped>
.workspace-tree-rail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  min-height: 0;
  height: 100%;
  padding: 12px;
  overflow: auto;
  border-right: 1px solid var(--border);
  background: var(--surface);
}
header {
  display: flex;
  align-items: center;
  gap: 8px;
}
header strong {
  font-size: 13px;
}
header :deep(button) {
  margin-left: auto;
}
.hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-mute);
}
.workspace-tree-rail :deep(.repository-browser) {
  flex: 1;
  min-height: 0;
}
.workspace-tree-rail :deep(.repo-tree) {
  max-height: none;
  flex: 1;
  min-height: 120px;
}
.workspace-tree-rail :deep(.repo-source) {
  display: none;
}
</style>
