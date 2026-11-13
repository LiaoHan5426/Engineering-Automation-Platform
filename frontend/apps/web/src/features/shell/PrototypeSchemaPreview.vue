<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { toRef } from 'vue'
import { Feedback } from '@eap/ui'
import { canAutoDeliver } from './prototypeSchema'
import type { PrototypeSchema } from './prototypeSchema'
import PrototypeNodeView from './PrototypeNodeView.vue'
import { providePrototypePreview } from './prototypePreview'
const props = defineProps<{ schema: PrototypeSchema }>()
providePrototypePreview(toRef(props, 'schema'))
const { t } = useI18n()
</script>
<template>
  <section class="semantic-preview eap-scrollbar" data-testid="semantic-preview">
    <h3>{{ t('desktop.preview') }} · Vue</h3>
    <Feedback v-if="!canAutoDeliver(schema)" tone="warning">{{
      t('editor.interaction.invalidDesign')
    }}</Feedback>
    <template v-else>
      <p class="preview-boundary">{{ t('editor.interaction.boundary') }}</p>
      <PrototypeNodeView :key="JSON.stringify(schema)" :node="schema.root" />
    </template>
  </section>
</template>
<style scoped>
.semantic-preview {
  padding: 16px;
  overflow: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
}

h3 {
  margin: 0 0 12px;
  font-size: 13px;
}
</style>
