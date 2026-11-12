<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Dialog, Feedback, Input, Textarea, Badge, ConfirmBox, Collapse } from '@eap/ui'
import type { CodePreparationSelection } from './workbench'
import {
  runtimeApi,
  type BoardTask,
  type CodePreparation,
  type WorkspaceSource,
} from '@eap/runtime-client'
import RepositoryBrowser from '../../components/RepositoryBrowser.vue'
import { errorMessage } from '../../lib/presentation'
const props = defineProps<{ task: BoardTask }>()
const emit = defineEmits<{
  close: []
  prepared: [selection: CodePreparationSelection]
}>()
const { t } = useI18n()
const target = ref(''),
  companions = ref(''),
  references = ref(''),
  busy = ref(false),
  error = ref('')
const checked = ref<CodePreparation>()
const referenceSources = ref<WorkspaceSource[]>([])
const picker = ref<'target' | 'companion' | 'reference' | ''>('')
const confirmClose = ref(false)
let revision = 0
const paths = computed(() => companions.value.split(/\r?\n/).filter((path) => path !== ''))
const referencePaths = computed(() => references.value.split(/\r?\n/).filter(Boolean))
watch(
  [target, companions, references, () => props.task.revision],
  () => {
    revision++
    checked.value = undefined
    referenceSources.value = []
    error.value = ''
    busy.value = false
  },
  { flush: 'sync' },
)
function select(source: WorkspaceSource) {
  if (picker.value === 'target') target.value = source.path
  else if (picker.value === 'reference') {
    if (!referencePaths.value.includes(source.path))
      references.value = [...referencePaths.value, source.path].join('\n')
  } else if (!paths.value.includes(source.path))
    companions.value = [...paths.value, source.path].join('\n')
  picker.value = ''
}
async function inspect(discover = false) {
  if (busy.value || !target.value.trim()) return
  let ticket = revision
  busy.value = true
  checked.value = undefined
  referenceSources.value = []
  error.value = ''
  const entry = target.value,
    files = [...paths.value],
    selectedReferences = [...referencePaths.value]
  try {
    const result = discover
      ? await runtimeApi.discoverCodeDependencies(entry)
      : await runtimeApi.prepareCode(entry, files)
    if (ticket !== revision) return
    const expected = discover ? result.files.map((file) => file.path) : [entry, ...files]
    if (
      !result.workspace ||
      expected[0] !== entry ||
      expected.length < 1 ||
      expected.length > 8 ||
      new Set(expected).size !== expected.length ||
      result.files.length !== expected.length ||
      result.files.some(
        (file, index) =>
          file.path !== expected[index] ||
          !Number.isSafeInteger(file.bytes) ||
          file.bytes < 0 ||
          !file.baseHash,
      )
    )
      throw new Error('Preparation scope mismatch')
    if (
      selectedReferences.length > 6 ||
      new Set(selectedReferences).size !== selectedReferences.length ||
      selectedReferences.some((path) => expected.includes(path))
    )
      throw new Error(t('boardCode.preparation.referenceScope'))
    const loaded = selectedReferences.length
      ? await runtimeApi.codeReferences(selectedReferences)
      : []
    if (ticket !== revision) return
    if (
      loaded.length !== selectedReferences.length ||
      loaded.some(
        (file, index) =>
          file.path !== selectedReferences[index] ||
          !file.exists ||
          file.denial ||
          !file.baseHash ||
          file.excerpt.length > 16000 ||
          new TextEncoder().encode(file.excerpt).length !== file.bytes,
      ) ||
      loaded.reduce((sum, file) => sum + file.excerpt.length, 0) > 24000
    )
      throw new Error(t('boardCode.preparation.referenceScope'))
    if (discover) {
      companions.value = expected.slice(1).join('\n')
      ticket = revision
    }
    referenceSources.value = loaded
    checked.value = result
  } catch (failure) {
    if (ticket === revision) error.value = errorMessage(failure)
  } finally {
    if (ticket === revision) busy.value = false
  }
}
function adopt() {
  if (busy.value || !checked.value) return
  emit('prepared', {
    targetPath: target.value,
    componentPaths: [...paths.value],
    referenceFiles: referenceSources.value.map((file) => ({
      name: 'read-only:' + file.path,
      content: file.excerpt,
    })),
  })
}
function close() {
  if (busy.value) return
  if (target.value || companions.value || references.value) confirmClose.value = true
  else emit('close')
}
onBeforeUnmount(() => {
  revision++
})
</script>
<template>
  <Dialog :title="t('boardCode.preparation.title')" size="lg" :busy="busy" @close="close">
    <div class="preparation-form">
      <h3>{{ task.title }}</h3>
      <p>{{ t('boardCode.preparation.boundary') }}</p>
      <Feedback v-if="error" tone="error">{{ error }}</Feedback>
      <label
        >{{ t('generation.target') }}
        <Input v-model="target" maxlength="240" :disabled="busy" data-testid="prepare-target" />
      </label>
      <Button size="sm" :disabled="busy" @click="picker = 'target'">{{
        t('boardCode.preparation.chooseTarget')
      }}</Button>
      <label
        >{{ t('generation.components') }}
        <Textarea v-model="companions" rows="4" :disabled="busy" data-testid="prepare-companions" />
      </label>
      <Button size="sm" :disabled="busy || paths.length >= 7" @click="picker = 'companion'">{{
        t('boardCode.preparation.addFile')
      }}</Button>
      <p>{{ t('generation.componentsHelp') }}</p>
      <label
        >{{ t('boardCode.preparation.references') }}
        <Textarea v-model="references" rows="3" :disabled="busy" data-testid="prepare-references" />
      </label>
      <p>{{ t('boardCode.preparation.referencesHelp') }}</p>
      <Button
        size="sm"
        :disabled="busy || referencePaths.length >= 6"
        @click="picker = 'reference'"
        >{{ t('boardCode.preparation.addReference') }}</Button
      >
      <section v-if="checked" class="preparation-form" data-testid="prepare-result">
        <p>{{ checked.workspace }}</p>
        <ul>
          <li v-for="file in checked.files" :key="file.path">
            <code>{{ file.path }}</code>
            <Badge>{{
              t(file.exists ? 'boardCode.preparation.existing' : 'boardCode.preparation.newFile')
            }}</Badge>
            · {{ file.bytes }} B
          </li>
        </ul>
        <p>{{ t('boardCode.preparation.total', { bytes: checked.totalBytes }) }}</p>
        <section v-if="referenceSources.length" data-testid="prepare-reference-result">
          <h4>{{ t('boardCode.preparation.references') }}</h4>
          <Collapse v-for="file in referenceSources" :key="file.path" :summary="file.path">
            <p>{{ file.bytes }} B · {{ file.baseHash }}</p>
            <pre>{{ file.excerpt }}</pre>
          </Collapse>
        </section>
      </section>
    </div>
    <template #footer>
      <Button
        :disabled="busy || !target.trim()"
        data-testid="prepare-discover"
        @click="inspect(true)"
        >{{ t('boardCode.preparation.discover') }}</Button
      >
      <Button :disabled="busy || !target.trim()" data-testid="prepare-check" @click="inspect()">{{
        t('boardCode.preparation.check')
      }}</Button>
      <Button
        variant="primary"
        :disabled="busy || !checked"
        data-testid="prepare-adopt"
        @click="adopt"
        >{{ t('boardCode.preparation.adopt') }}</Button
      >
    </template>
  </Dialog>
  <Dialog v-if="picker" :title="t('desktop.repoFiles')" size="lg" @close="picker = ''">
    <RepositoryBrowser selectable @select="select" />
  </Dialog>
  <ConfirmBox
    v-if="confirmClose"
    :title="t('boardCode.preparation.discard')"
    :impact="[t('boardCode.preparation.discardImpact')]"
    :confirm-label="t('boardCode.preparation.close')"
    @confirm="emit('close')"
    @cancel="confirmClose = false"
  />
</template>
<style scoped>
.preparation-form,
label {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.preparation-form {
  overflow-wrap: anywhere;
}

ul {
  padding-inline-start: 20px;
}

li {
  margin-block: 8px;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
