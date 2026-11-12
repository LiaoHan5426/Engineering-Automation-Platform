<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Input, Button, Checkbox, Select, Dialog, Feedback } from '@eap/ui'
import type { PrototypeAction } from '@eap/runtime-client/contracts'
import type { PrototypeNode } from './prototypeSchema'
import { usePrototypePreview } from './prototypePreview'
defineProps<{ node: PrototypeNode }>()
const preview = usePrototypePreview()
const { t } = useI18n()
function listItems(node: PrototypeNode): string[] {
  const raw = node.props.items
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => String(item))
    .filter(Boolean)
    .slice(0, 50)
}
</script>
<template>
  <section
    v-if="node.kind === 'page' || node.kind === 'section'"
    v-show="!preview.hidden.has(node.id)"
    class="schema-section"
    :style="node.props.style as Record<string, string>"
  >
    <PrototypeNodeView v-for="child in node.children" :key="child.id" :node="child" />
  </section>
  <section
    v-else-if="node.kind === 'form'"
    class="schema-section"
    :aria-label="String(node.props.label || t('editor.interaction.form'))"
  >
    <h4 v-if="node.props.label">{{ node.props.label }}</h4>
    <PrototypeNodeView v-for="child in node.children" :key="child.id" :node="child" />
    <Feedback v-if="preview.submitted.has(node.id)" tone="success">
      {{ t('editor.interaction.submitted') }}
    </Feedback>
  </section>
  <template v-else-if="node.kind === 'dialog'">
    <Dialog
      v-if="!preview.hidden.has(node.id)"
      :title="String(node.props.label || t('editor.interaction.dialog'))"
      :close-label="t('editor.close')"
      @close="preview.hidden.add(node.id)"
    >
      <PrototypeNodeView v-for="child in node.children" :key="child.id" :node="child" />
    </Dialog>
  </template>
  <p v-else-if="node.kind === 'text'" :style="node.props.style as Record<string, string>">
    {{ node.props.text }}
  </p>
  <component
    :is="Number(node.props.level) === 2 ? 'h2' : Number(node.props.level) === 3 ? 'h3' : 'h1'"
    v-else-if="node.kind === 'heading'"
    class="schema-heading"
    :style="node.props.style as Record<string, string>"
    >{{ node.props.text }}</component
  >
  <div v-else-if="node.kind === 'button'">
    <Button
      size="sm"
      variant="secondary"
      type="button"
      :disabled="!node.props.action"
      @click="preview.act(node.props.action as PrototypeAction)"
      >{{ node.props.label || t('editor.interaction.action') }}</Button
    >
  </div>
  <Button
    v-else-if="node.kind === 'link'"
    class="schema-link"
    variant="link"
    disabled
    :title="String(node.props.href || '#')"
    >{{ node.props.label || t('editor.interaction.link') }}</Button
  >
  <label v-else-if="node.kind === 'input' || node.kind === 'select'" class="schema-field">
    {{ node.props.label || node.props.placeholder || t('editor.interaction.field') }}
    <Input
      v-if="node.kind === 'input'"
      :model-value="String(preview.values.get(node.id) ?? '')"
      @update:model-value="preview.values.set(node.id, String($event))"
      :placeholder="String(node.props.placeholder || '')"
      :aria-label="
        String(node.props.label || node.props.placeholder || t('editor.interaction.field'))
      "
      :required="node.props.required === true"
      :aria-invalid="preview.invalid.has(node.id)"
      maxlength="2000"
    />
    <Select
      v-else
      :aria-label="String(node.props.label || t('editor.interaction.field'))"
      :model-value="String(preview.values.get(node.id) ?? '')"
      @update:model-value="preview.values.set(node.id, String($event))"
      :required="node.props.required === true"
      :aria-invalid="preview.invalid.has(node.id)"
    >
      <option value="">{{ t('editor.interaction.choose') }}</option>
      <option v-for="option in node.props.options as string[]" :key="option" :value="option">
        {{ option }}
      </option>
    </Select>
    <span v-if="preview.invalid.has(node.id)" role="alert">{{
      t('editor.interaction.required')
    }}</span>
  </label>
  <label v-else-if="node.kind === 'checkbox'" class="schema-field">
    <span
      ><Checkbox
        :aria-label="String(node.props.label || t('editor.interaction.checkbox'))"
        :model-value="preview.values.get(node.id) === true"
        @update:model-value="preview.values.set(node.id, $event === true)"
        :aria-invalid="preview.invalid.has(node.id)"
      />
      {{ node.props.label || t('editor.interaction.checkbox') }}</span
    >
    <span v-if="preview.invalid.has(node.id)" role="alert">{{
      t('editor.interaction.required')
    }}</span>
  </label>
  <component
    :is="node.props.ordered ? 'ol' : 'ul'"
    v-else-if="node.kind === 'list'"
    class="schema-list"
    :style="node.props.style as Record<string, string>"
  >
    <li v-for="(item, index) in listItems(node)" :key="index">{{ item }}</li>
  </component>
  <p v-else role="alert">Unsupported: {{ node.kind }}</p>
</template>
<style scoped>
.schema-section {
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px dashed var(--border-strong);
  border-radius: 8px;
}

p {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.schema-heading {
  margin: 0;
  color: var(--text);
  letter-spacing: -0.02em;
  overflow-wrap: anywhere;
}

h1.schema-heading {
  font-size: 22px;
}

h2.schema-heading {
  font-size: 18px;
}

h3.schema-heading {
  font-size: 15px;
}

.schema-link {
  font-weight: 650;
  color: var(--accent);
  text-decoration: underline;
  cursor: pointer;
}

.schema-field {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.schema-list {
  padding-left: 1.25em;
  margin: 0;
  line-height: 1.55;
  color: var(--text);
}

.schema-list li {
  margin: 2px 0;
}
</style>
