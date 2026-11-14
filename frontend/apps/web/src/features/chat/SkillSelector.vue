<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Checkbox, Dialog, Feedback } from '@eap/ui'
import {
  runtimeApi,
  type SkillContext,
  type SkillRef,
  type SkillSnapshot,
  type SkillSummary,
} from '@eap/runtime-client'
const props = defineProps<{
  disabled: boolean
  blocked: boolean
  trigger?: boolean
}>()
const emit = defineEmits<{ select: [ref: SkillRef, paths: string[]] }>()
const { t } = useI18n()
const open = ref(false),
  loading = ref(false),
  busy = ref(false),
  error = ref('')
const items = ref<SkillSummary[]>([]),
  candidate = ref<SkillSnapshot>(),
  paths = ref<string[]>([]),
  preview = ref<SkillContext>()
const requestedIds = ref<string[] | null>(null)
const missingIds = computed(
  () => requestedIds.value?.filter((id) => !items.value.some((item) => item.id === id)) ?? [],
)
let catalogTicket = 0,
  detailTicket = 0,
  previewTicket = 0
function invalidate() {
  ++previewTicket
  preview.value = undefined
  busy.value = false
}
let opener: HTMLElement | null = null
function close() {
  if (open.value && opener?.isConnected) opener.focus()
  opener = null
  open.value = false
  ++catalogTicket
  ++detailTicket
  invalidate()
  loading.value = false
}
onBeforeUnmount(close)
watch(
  () => props.disabled || props.blocked,
  (blocked) => {
    if (blocked) close()
  },
  { flush: 'sync' },
)
watch(paths, invalidate, { deep: true, flush: 'sync' })
async function show(ids?: string[]) {
  if (props.disabled || props.blocked) return
  close()
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  open.value = true
  loading.value = true
  error.value = ''
  items.value = []
  requestedIds.value = ids ? [...new Set(ids)] : null
  candidate.value = undefined
  paths.value = []
  const ticket = ++catalogTicket
  try {
    const result = await runtimeApi.skills()
    if (ticket === catalogTicket)
      items.value = requestedIds.value
        ? result.items.filter((item) => requestedIds.value!.includes(item.id))
        : result.items
  } catch {
    if (ticket === catalogTicket) error.value = t('skill.failure')
  } finally {
    if (ticket === catalogTicket) loading.value = false
  }
}
async function choose(item: SkillSummary) {
  invalidate()
  candidate.value = undefined
  paths.value = []
  loading.value = true
  error.value = ''
  const ticket = ++detailTicket
  try {
    const result = await runtimeApi.skill(item.id, item.version)
    if (ticket !== detailTicket) return
    if (
      result.id !== item.id ||
      result.version !== item.version ||
      !result.enabled ||
      result.digest !== item.digest ||
      result.stateRevision !== item.stateRevision
    )
      throw new Error('stale')
    candidate.value = result
  } catch {
    if (ticket === detailTicket) error.value = t('skill.failed')
  } finally {
    if (ticket === detailTicket) loading.value = false
  }
}
function reference(item: SkillSnapshot): SkillRef {
  return {
    id: item.id,
    version: item.version,
    digest: item.digest,
    stateRevision: item.stateRevision,
  }
}
async function validate() {
  if (!candidate.value || busy.value || props.blocked || props.disabled) return
  const ticket = ++previewTicket
  const ref = reference(candidate.value)
  busy.value = true
  error.value = ''
  try {
    const result = await runtimeApi.previewSkillContext(ref, [...paths.value])
    if (ticket === previewTicket) {
      if (
        result.skillRef.id !== ref.id ||
        result.skillRef.version !== ref.version ||
        result.skillRef.digest !== ref.digest ||
        result.skillRef.stateRevision !== ref.stateRevision
      )
        throw new Error('stale')
      preview.value = result
    }
  } catch {
    if (ticket === previewTicket) error.value = t('skill.failed')
  } finally {
    if (ticket === previewTicket) busy.value = false
  }
}
function use() {
  if (!preview.value || busy.value || loading.value || props.blocked || props.disabled) return
  emit('select', { ...preview.value.skillRef }, [...paths.value])
  close()
}
function toggle(path: string, checked: boolean | unknown[]) {
  paths.value = checked === true ? [...paths.value, path] : paths.value.filter((p) => p !== path)
}
defineExpose({ show, close })
</script>
<template>
  <Button
    v-if="trigger !== false"
    data-testid="skill-open"
    type="button"
    :disabled="disabled || blocked"
    @click="show()"
    >{{ t('skill.choose') }}</Button
  >
  <Dialog v-if="open" :title="t('skill.choose')" data-testid="skill-dialog" @close="close">
    <p>{{ t('skill.boundary') }}</p>
    <p v-if="requestedIds">{{ t('skill.scenarioSelection') }}</p>
    <Feedback v-if="!loading && missingIds.length" tone="warning">{{
      t('skill.scenarioMissing', { ids: missingIds.join(', ') })
    }}</Feedback>
    <p v-if="loading">{{ t('skill.loading') }}</p>
    <p v-else-if="!items.length">{{ t('skill.empty') }}</p>
    <div v-for="item in items" :key="item.id + item.version">
      <Button
        type="button"
        variant="navigation"
        :data-testid="'skill-candidate-' + item.id + '-' + item.version"
        :disabled="!item.enabled"
        @click="choose(item)"
        >{{ item.id }} · {{ item.version }} · r{{ item.stateRevision }} ·
        {{ t(item.enabled ? 'skill.enabled' : 'skill.disabled') }}</Button
      >
    </div>
    <Feedback v-if="error" tone="error">{{ error }}</Feedback>
    <section v-if="candidate">
      <h3>{{ candidate.id }} · {{ candidate.version }}</h3>
      <code>{{ candidate.digest }}</code>
      <pre>{{ candidate.instructions }}</pre>
      <p>{{ t('skill.dependencies') }}: {{ candidate.dependencies }}</p>
      <p>{{ t('skill.paths') }}</p>
      <label v-for="(resource, index) in candidate.resources" :key="resource.path"
        ><Checkbox
          :model-value="paths.includes(resource.path)"
          :data-testid="'skill-resource-' + index"
          @update:model-value="toggle(resource.path, $event)"
        />{{ resource.path }}
        <pre>{{ resource.content }}</pre>
      </label>
    </section>
    <Button
      type="button"
      data-testid="skill-context-preview"
      :disabled="!candidate || busy || loading"
      @click="validate"
      >{{ t('skill.contextPreview') }}</Button
    >
    <section v-if="preview" data-testid="skill-context-result">
      <p>{{ t('skill.evidence') }}</p>
      <pre>{{ preview.instructions }}</pre>
      <div v-for="resource in preview.resources" :key="resource.path">
        <strong>{{ resource.path }}</strong>
        <pre>{{ resource.content }}</pre>
      </div>
    </section>
    <template #footer
      ><Button
        type="button"
        data-testid="skill-use"
        :disabled="!preview || busy || loading || !!error"
        @click="use"
        >{{ t('skill.use') }}</Button
      ><Button type="button" data-testid="skill-selector-cancel" @click="close">{{
        t('skill.close')
      }}</Button></template
    >
  </Dialog>
</template>
<style scoped>
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
label {
  display: block;
}
</style>
