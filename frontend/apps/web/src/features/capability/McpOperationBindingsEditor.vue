<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Checkbox, ConfirmBox, Dialog, Feedback, Input, Select, Textarea } from '@eap/ui'
import { runtimeApi, type McpOperationBinding, type McpInputSchema } from '@eap/runtime-client'
import { errorMessage } from '../../lib/presentation'
const props = defineProps<{ serverId: string }>()
const emit = defineEmits<{
  close: []
  saved: [snapshot: import('@eap/runtime-client').McpOperationBindingsSnapshot]
}>()
const { t } = useI18n({
  useScope: 'local',
  messages: {
    'zh-CN': {
      title: '聊天服务配置',
      reconcile: '重新核对保存结果',
      verified: '已确认配置已保存。',
      notSaved: '服务端尚未保存此修改，草稿已保留，可重新保存。',
      conflict: '服务端配置已变化，草稿已保留。请关闭并重新读取后核对修改。',
      operation: '操作',
      tool: '工具名称',
      expertId: '授权专家标识',
      approved: '批准此操作映射',
      schema: '工具输入 Schema（JSON）',
      save: '保存',
      cancel: '取消',
      add: '添加操作',
      remove: '移除操作',
      discard: '放弃未保存的配置？',
      loading: '正在读取配置…',
      invalidJson: '输入 Schema 必须是 type 为 object 的 JSON 对象，且不超过 65536 字符。',
      invalid: '请填写工具、专家与全部映射字段。',
      help: '配置只保存操作映射；不会自动启用、信任、授权、探测或调用服务。',
      empty: '尚未配置操作。可保存空配置，稍后重新编辑。',
      inputArgument: '查询或链接输入字段',
      resultsField: '结果列表字段（根对象留空）',
      titleField: '标题字段',
      urlField: '链接字段',
      textField: '文本字段',
      ownerPolicyArgument: '链接归属策略输入字段',
      audioArgument: '音频 Base64 输入字段',
      mimeArgument: '音频 MIME 输入字段',
      textArgument: '文本输入字段',
      audioField: '音频 Base64 结果字段',
      mimeField: '音频 MIME 结果字段',
      resultFormat: '返回格式',
    },
    'en-US': {
      title: 'Chat service configuration',
      reconcile: 'Check save result',
      verified: 'The configuration was saved.',
      notSaved:
        'The server has not saved this change. Your draft is preserved and can be saved again.',
      conflict:
        'Server configuration changed. Your draft is preserved. Close and reopen to review the current configuration.',
      operation: 'Operation',
      tool: 'Tool name',
      expertId: 'Authorized expert ID',
      approved: 'Approve this operation mapping',
      schema: 'Tool input schema (JSON)',
      save: 'Save',
      cancel: 'Cancel',
      add: 'Add operation',
      remove: 'Remove operation',
      discard: 'Discard unsaved configuration?',
      loading: 'Loading configuration…',
      invalidJson: 'Input schema must be a JSON object with type object, at most 65536 characters.',
      invalid: 'Fill in the tool, expert and all mapping fields.',
      help: 'Saving mappings does not enable, trust, authorize, probe or call a service.',
      empty: 'No operations configured. You can save an empty configuration and edit it later.',
      inputArgument: 'Query or URL input field',
      resultsField: 'Result list field (empty for root object)',
      titleField: 'Title field',
      urlField: 'URL field',
      textField: 'Text field',
      ownerPolicyArgument: 'Owner policy input field',
      audioArgument: 'Audio base64 input field',
      mimeArgument: 'Audio MIME input field',
      textArgument: 'Text input field',
      audioField: 'Audio base64 result field',
      mimeField: 'Audio MIME result field',
      resultFormat: 'Result format',
    },
  },
})
const operationChoices = ['SEARCH', 'READ', 'ASR', 'TTS'] as const
const operation = ref<(typeof operationChoices)[number]>('SEARCH')
const revision = ref<number | null>(null)
const recoveryRequired = ref(false)
let attempted: McpOperationBinding[] | undefined
const recovered = ref('')
function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']'
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + stable(Reflect.get(value, key)))
        .join(',') +
      '}'
    )
  return JSON.stringify(value)
}
async function reconcile() {
  if (busy.value) return
  const current = ++request
  busy.value = true
  error.value = ''
  recovered.value = ''
  try {
    const result = await runtimeApi.getMcpOperationBindings(props.serverId)
    if (current !== request) return
    if (attempted && stable(result.bindings) === stable(attempted)) {
      revision.value = result.revision
      bindings.value = structuredClone(result.bindings)
      schemaDrafts.value = result.bindings.map((binding) =>
        JSON.stringify(binding.inputSchema, null, 2),
      )
      baseline.value = snapshot()
      recoveryRequired.value = false
      recovered.value = t('verified')
      emit('saved', result)
    } else if (result.revision === revision.value) {
      recoveryRequired.value = false
      recovered.value = t('notSaved')
    } else error.value = t('conflict')
  } catch (failure) {
    if (current === request) error.value = errorMessage(failure)
  } finally {
    if (current === request) busy.value = false
  }
}
const bindings = ref<McpOperationBinding[]>([])
const schemaDrafts = ref<string[]>([])
const baseline = ref('')
const busy = ref(false),
  error = ref(''),
  discard = ref(false)
let request = 0
const snapshot = () => JSON.stringify({ bindings: bindings.value, schema: schemaDrafts.value })
const dirty = computed(() => snapshot() !== baseline.value)
const fields = {
  SEARCH: ['inputArgument', 'resultsField', 'titleField', 'urlField', 'textField'],
  READ: [
    'inputArgument',
    'resultsField',
    'titleField',
    'urlField',
    'textField',
    'ownerPolicyArgument',
  ],
  ASR: ['audioArgument', 'mimeArgument', 'textField'],
  TTS: ['textArgument', 'audioField', 'mimeField'],
} as const
function close() {
  if (busy.value) return
  if (dirty.value) discard.value = true
  else emit('close')
}
watch(
  () => props.serverId,
  async (id) => {
    const current = ++request
    revision.value = null
    attempted = undefined
    recoveryRequired.value = false
    recovered.value = ''
    bindings.value = []
    schemaDrafts.value = []
    baseline.value = snapshot()
    busy.value = true
    error.value = ''
    try {
      const result = await runtimeApi.getMcpOperationBindings(id)
      if (current !== request) return
      revision.value = result.revision
      bindings.value = structuredClone(result.bindings)
      schemaDrafts.value = result.bindings.map((binding) =>
        JSON.stringify(binding.inputSchema, null, 2),
      )
      baseline.value = snapshot()
    } catch (failure) {
      if (current === request) error.value = errorMessage(failure)
    } finally {
      if (current === request) busy.value = false
    }
  },
  { immediate: true },
)
function add() {
  if (
    busy.value ||
    recoveryRequired.value ||
    bindings.value.some((binding) => binding.operation === operation.value)
  )
    return
  const common = {
    tool: '',
    expertId: '',
    approved: false,
    inputSchema: { type: 'object' as const, properties: {} },
  }
  switch (operation.value) {
    case 'SEARCH':
      bindings.value.push({
        ...common,
        operation: 'SEARCH',
        inputArgument: '',
        resultsField: '',
        titleField: '',
        urlField: '',
        textField: '',
      })
      break
    case 'READ':
      bindings.value.push({
        ...common,
        operation: 'READ',
        inputArgument: '',
        resultsField: '',
        titleField: '',
        urlField: '',
        textField: '',
        ownerPolicyArgument: '',
      })
      break
    case 'ASR':
      bindings.value.push({
        ...common,
        operation: 'ASR',
        audioArgument: '',
        mimeArgument: '',
        textField: '',
        resultFormat: 'JSON',
      })
      break
    case 'TTS':
      bindings.value.push({
        ...common,
        operation: 'TTS',
        textArgument: '',
        audioField: '',
        mimeField: '',
        resultFormat: 'JSON',
      })
      break
  }
  schemaDrafts.value.push(JSON.stringify(common.inputSchema, null, 2))
}
function remove(index: number) {
  if (busy.value || recoveryRequired.value) return
  bindings.value.splice(index, 1)
  schemaDrafts.value.splice(index, 1)
}
function mapping(binding: McpOperationBinding, key: string): string {
  return String(Reflect.get(binding, key) ?? '')
}
function updateMapping(binding: McpOperationBinding, key: string, value: string) {
  if (fields[binding.operation].some((field) => field === key)) Reflect.set(binding, key, value)
}
async function save() {
  if (revision.value === null || busy.value || recoveryRequired.value) return
  error.value = ''
  let parsed: McpOperationBinding[]
  try {
    parsed = bindings.value.map((binding, index) => {
      const raw = schemaDrafts.value[index] ?? ''
      if (raw.length > 65536) throw new Error(t('invalidJson'))
      let schema: unknown
      try {
        schema = JSON.parse(raw)
      } catch {
        throw new Error(t('invalidJson'))
      }
      if (
        !schema ||
        typeof schema !== 'object' ||
        Array.isArray(schema) ||
        Reflect.get(schema, 'type') !== 'object'
      )
        throw new Error(t('invalidJson'))
      if (
        !/^[a-z0-9][a-z0-9_-]{0,60}$/.test(binding.tool) ||
        !binding.expertId.trim() ||
        fields[binding.operation].some(
          (key) => key !== 'resultsField' && !mapping(binding, key).trim(),
        )
      )
        throw new Error(t('invalid'))
      return { ...binding, inputSchema: schema as McpInputSchema }
    })
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : t('invalid')
    return
  }
  busy.value = true
  attempted = structuredClone(parsed)
  const current = ++request,
    id = props.serverId
  try {
    const result = await runtimeApi.saveMcpOperationBindings(id, {
      expectedRevision: revision.value,
      bindings: parsed,
    })
    if (current !== request) return
    revision.value = result.revision
    bindings.value = structuredClone(result.bindings)
    schemaDrafts.value = result.bindings.map((binding) =>
      JSON.stringify(binding.inputSchema, null, 2),
    )
    baseline.value = snapshot()
    emit('saved', result)
  } catch (failure) {
    if (current === request) {
      error.value = errorMessage(failure)
      recoveryRequired.value = true
    }
  } finally {
    if (current === request) busy.value = false
  }
}
</script>
<template>
  <Dialog
    :title="t('title') + ' · ' + serverId"
    size="lg"
    :busy="busy"
    data-testid="mcp-operation-bindings"
    @close="close"
  >
    <p>{{ t('help') }}</p>
    <Feedback v-if="error" tone="error">{{ error }}</Feedback>
    <Feedback v-if="recovered" tone="info">{{ recovered }}</Feedback>
    <Button
      v-if="recoveryRequired"
      data-testid="mcp-binding-reconcile"
      variant="secondary"
      :disabled="busy"
      @click="reconcile"
      >{{ t('reconcile') }}</Button
    >
    <p v-if="busy && revision === null">{{ t('loading') }}</p>
    <p v-if="!bindings.length">{{ t('empty') }}</p>
    <div class="operation-toolbar">
      <Select v-model="operation" :disabled="busy || recoveryRequired"
        ><option v-for="item in operationChoices" :key="item" :value="item">
          {{ item }}
        </option></Select
      ><Button
        variant="secondary"
        :disabled="
          busy ||
          recoveryRequired ||
          revision === null ||
          bindings.some((binding) => binding.operation === operation)
        "
        @click="add"
        >{{ t('add') }}</Button
      >
    </div>
    <section
      v-for="(binding, index) in bindings"
      :key="binding.operation"
      class="operation-binding"
    >
      <header>
        <h3>{{ binding.operation }}</h3>
        <Button variant="ghost" :disabled="busy || recoveryRequired" @click="remove(index)">{{
          t('remove')
        }}</Button>
      </header>
      <label
        >{{ t('tool')
        }}<Input v-model="binding.tool" :disabled="busy || recoveryRequired" maxlength="61"
      /></label>
      <label
        >{{ t('expertId')
        }}<Input v-model="binding.expertId" :disabled="busy || recoveryRequired" maxlength="120"
      /></label>
      <label v-for="field in fields[binding.operation]" :key="field"
        >{{ t(field)
        }}<Input
          :model-value="mapping(binding, field)"
          :disabled="busy || recoveryRequired"
          maxlength="80"
          @update:model-value="updateMapping(binding, field, String($event))"
      /></label>
      <label v-if="binding.operation === 'ASR' || binding.operation === 'TTS'"
        >{{ t('resultFormat')
        }}<Select v-model="binding.resultFormat" :disabled="busy || recoveryRequired"
          ><option value="JSON">JSON</option>
          <option :value="binding.operation === 'ASR' ? 'TEXT' : 'AUDIO'">
            {{ binding.operation === 'ASR' ? 'TEXT' : 'AUDIO' }}
          </option></Select
        ></label
      >
      <label
        >{{ t('schema')
        }}<Textarea
          v-model="schemaDrafts[index]"
          :disabled="busy || recoveryRequired"
          rows="6"
          maxlength="65536"
          spellcheck="false"
      /></label>
      <label>
        <Checkbox
          :model-value="binding.approved"
          :disabled="busy || recoveryRequired"
          @update:model-value="typeof $event === 'boolean' && (binding.approved = $event)"
        />
        {{ t('approved') }}
      </label>
    </section>
    <template #footer
      ><Button variant="secondary" :disabled="busy || recoveryRequired" @click="close">{{
        t('cancel')
      }}</Button
      ><Button :disabled="busy || revision === null || recoveryRequired" @click="save">{{
        t('save')
      }}</Button></template
    >
    <ConfirmBox
      v-if="discard"
      :title="t('discard')"
      :impact="[t('discard')]"
      :confirm-label="t('remove')"
      @confirm="emit('close')"
      @cancel="discard = false"
    />
  </Dialog>
</template>
<style scoped>
.operation-toolbar,
.operation-binding header {
  display: flex;
  gap: 0.75rem;
  justify-content: space-between;
  align-items: center;
}
.operation-binding {
  display: grid;
  gap: 0.75rem;
  margin-block: 1rem;
  min-width: 0;
}
.operation-binding label {
  display: grid;
  gap: 0.25rem;
}
.operation-toolbar :deep(select) {
  max-width: 10rem;
}
</style>
