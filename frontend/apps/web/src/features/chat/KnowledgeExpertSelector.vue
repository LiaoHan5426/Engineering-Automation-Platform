<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Dialog, Feedback, Input } from '@eap/ui'
import { runtimeApi, type KnowledgeContext, type KnowledgeExpertRef } from '@eap/runtime-client'
const props = defineProps<{
  selected?: KnowledgeExpertRef
  draft: string
  disabled: boolean
  blocked: boolean
  mock: boolean
  trigger?: boolean
}>()
const emit = defineEmits<{ select: [ref: KnowledgeExpertRef]; remove: [] }>()
const { t } = useI18n()
const open = ref(false),
  loading = ref(false),
  busy = ref(false),
  failed = ref(false),
  search = ref('')
const experts = ref<Array<{ id: string; name: string; revision: number }>>([])
const candidate = ref<KnowledgeExpertRef>()
const result = ref<KnowledgeContext>()
let previewTicket = 0,
  catalogTicket = 0
function invalidatePreview() {
  ++previewTicket
  result.value = undefined
  busy.value = false
}
function close() {
  open.value = false
  ++catalogTicket
  loading.value = false
  invalidatePreview()
}
watch(() => props.draft, invalidatePreview, { flush: 'sync' })
watch(
  () => [props.selected?.id, props.selected?.revision],
  () => {
    invalidatePreview()
    candidate.value = props.selected ? { ...props.selected } : undefined
  },
  { flush: 'sync' },
)
watch(
  () => props.disabled || props.blocked,
  (disabled) => {
    if (disabled) close()
  },
  { flush: 'sync' },
)
onBeforeUnmount(close)
const visible = computed(() =>
  experts.value.filter((item) =>
    `${item.name} ${item.id}`.toLowerCase().includes(search.value.trim().toLowerCase()),
  ),
)
async function show() {
  if (props.disabled || props.blocked) return
  const ticket = ++catalogTicket
  invalidatePreview()
  experts.value = []
  open.value = true
  loading.value = true
  failed.value = false
  result.value = undefined
  search.value = ''
  candidate.value = props.selected ? { ...props.selected } : undefined
  try {
    const page = await runtimeApi.experts()
    if (ticket !== catalogTicket) return
    experts.value = page.items.flatMap((text) => {
      try {
        const item = JSON.parse(text),
          state = page.states?.[item.id]
        return typeof item.id === 'string' &&
          typeof item.name === 'string' &&
          state?.enabled === true &&
          Number.isInteger(state.revision)
          ? [{ id: item.id, name: item.name, revision: state.revision }]
          : []
      } catch {
        return []
      }
    })
  } catch {
    if (ticket === catalogTicket) {
      experts.value = []
      failed.value = true
    }
  } finally {
    if (ticket === catalogTicket) loading.value = false
  }
}
async function preview() {
  if (
    !candidate.value ||
    busy.value ||
    props.disabled ||
    !props.draft.trim() ||
    props.draft.length > 500
  )
    return
  const ticket = ++previewTicket
  busy.value = true
  failed.value = false
  result.value = undefined
  try {
    const response = await runtimeApi.previewExpertContext({ ...candidate.value }, props.draft)
    if (ticket === previewTicket) result.value = response
  } catch {
    if (ticket === previewTicket) failed.value = true
  } finally {
    if (ticket === previewTicket) busy.value = false
  }
}
function choose(item: { id: string; revision: number }) {
  invalidatePreview()
  candidate.value = { id: item.id, revision: item.revision }
}
function use() {
  if (candidate.value) {
    emit('select', { ...candidate.value })
    close()
  }
}
defineExpose({ show, close })
</script>
<template>
  <div v-if="trigger !== false" class="knowledge-selector">
    <Button
      type="button"
      size="sm"
      data-testid="knowledge-open"
      :disabled="disabled || blocked"
      @click="show"
      >{{ t('knowledgeContext.open') }}</Button
    >
    <span v-if="selected">{{ selected.id }} · r{{ selected.revision }}</span>
    <Button
      v-if="selected"
      type="button"
      size="sm"
      data-testid="knowledge-remove"
      :disabled="disabled"
      @click="emit('remove')"
      >{{ t('knowledgeContext.remove') }}</Button
    >
  </div>
  <Dialog
    v-if="open"
    data-testid="knowledge-dialog"
    :title="t('knowledgeContext.title')"
    :busy="busy"
    @close="close"
  >
    <p>{{ t('knowledgeContext.boundary') }}</p>
    <Feedback v-if="mock" tone="info">{{ t('knowledgeContext.mock') }}</Feedback>
    <Input
      v-model="search"
      :aria-label="t('knowledgeContext.search')"
      :placeholder="t('knowledgeContext.search')"
    />
    <p v-if="loading">{{ t('knowledgeContext.loading') }}</p>
    <p v-else-if="!visible.length">{{ t('knowledgeContext.empty') }}</p>
    <div v-for="item in visible" :key="item.id">
      <Button
        type="button"
        variant="navigation"
        :data-testid="'knowledge-candidate-' + item.id"
        :disabled="busy"
        :aria-pressed="candidate?.id === item.id && candidate?.revision === item.revision"
        @click="choose(item)"
        >{{ item.name }} · {{ item.id }} · r{{ item.revision }}</Button
      >
    </div>
    <p v-if="candidate">{{ candidate.id }} · r{{ candidate.revision }}</p>
    <p>{{ t('knowledgeContext.limit') }}</p>
    <Button
      type="button"
      data-testid="knowledge-preview"
      :disabled="!candidate || busy || !draft.trim() || draft.length > 500"
      @click="preview"
      >{{ t('knowledgeContext.preview') }}</Button
    >
    <Feedback v-if="failed" tone="warning">{{ t('knowledgeContext.failed') }}</Feedback>
    <section v-if="result" data-testid="knowledge-preview-result">
      <h3>{{ t('knowledgeContext.' + result.status) }}</h3>
      <p>{{ t('knowledgeContext.excerpts') }}</p>
      <ul>
        <li v-for="reference in result.references" :key="reference.id">
          <strong
            >{{ reference.id }} · {{ reference.source }} · {{ reference.knowledgeBase }}</strong
          >
          <p>
            {{ reference.retrievalMode }} · {{ reference.knowledgeBaseId }} ·
            {{ reference.documentId }}
          </p>
          <pre>{{ reference.excerpt }}</pre>
        </li>
      </ul>
    </section>
    <template #footer>
      <Button
        type="button"
        data-testid="knowledge-use"
        :disabled="!candidate || busy || loading || failed"
        @click="use"
        >{{ t('knowledgeContext.use') }}</Button
      >
      <Button type="button" data-testid="knowledge-cancel" :disabled="busy" @click="close">{{
        t('knowledgeContext.cancel')
      }}</Button>
    </template>
  </Dialog>
</template>
<style scoped>
.knowledge-selector {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
