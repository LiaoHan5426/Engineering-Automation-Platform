<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import type { UploadRequest, UploadProgress } from '@eap/request'
import Button from '../button/Button.vue'
import FileInput from './FileInput.vue'
import Feedback from '../feedback/Feedback.vue'

const props = withDefaults(
  defineProps<{
    accept?: string
    multiple?: boolean
    disabled?: boolean
    maxFiles?: number
    maxSize?: number
    /** No request means local selection only. Uploads always require a separate explicit action. */
    request?: UploadRequest
    label?: string
    uploadLabel?: string
    cancelLabel?: string
    removeLabel?: string
    invalidMessage?: string
    failedMessage?: string
  }>(),
  {
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    label: '选择文件',
    uploadLabel: '上传',
    cancelLabel: '取消上传',
    removeLabel: '移除',
    invalidMessage: '文件类型、数量或大小不符合要求。',
    failedMessage: '上传失败，请重试。',
  },
)
const emit = defineEmits<{
  select: [files: File[]]
  uploaded: [results: unknown[]]
  error: [error: unknown]
}>()
const files = ref<File[]>([])
const progress = ref<UploadProgress>()
const busy = ref(false)
const message = ref('')
let controller: AbortController | undefined
function accepts(file: File) {
  const rules = props.accept
    ?.split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
  return (
    !rules?.length ||
    rules.some((rule) =>
      rule.startsWith('.')
        ? file.name.toLowerCase().endsWith(rule)
        : rule.endsWith('/*')
          ? file.type.toLowerCase().startsWith(rule.slice(0, -1))
          : file.type.toLowerCase() === rule,
    )
  )
}
function select(event: Event) {
  const input = event.target as HTMLInputElement
  const next = Array.from(input.files ?? [])
  input.value = ''
  if (props.disabled || busy.value || !next.length) return
  if (
    next.length > (props.multiple ? props.maxFiles : 1) ||
    next.some((file) => file.size > props.maxSize || !accepts(file))
  ) {
    message.value = props.invalidMessage
    return
  }
  files.value = next
  message.value = ''
  progress.value = undefined
  emit('select', next)
}
async function upload() {
  if (!props.request || props.disabled || busy.value || !files.value.length) return
  const active = new AbortController()
  controller = active
  busy.value = true
  message.value = ''
  const results: unknown[] = []
  try {
    for (const file of files.value) {
      results.push(
        await props.request(file, {
          signal: active.signal,
          onProgress: (value) => {
            if (!active.signal.aborted) progress.value = value
          },
        }),
      )
      if (active.signal.aborted) return
    }
    files.value = []
    emit('uploaded', results)
  } catch (error) {
    if (!active.signal.aborted) {
      message.value = props.failedMessage
      emit('error', error)
    }
  } finally {
    if (controller === active) {
      controller = undefined
      busy.value = false
    }
  }
}
function cancel() {
  controller?.abort()
}
onBeforeUnmount(cancel)
</script>

<template>
  <div class="eap-upload">
    <FileInput
      :accept="accept"
      :multiple="multiple"
      :disabled="disabled || busy"
      :aria-label="label"
      @change="select"
    />
    <ul v-if="request && files.length" class="eap-upload__files">
      <li v-for="(file, index) in files" :key="file.name + index">
        <span>{{ file.name }} · {{ file.size }} B</span>
        <Button :disabled="disabled || busy" size="sm" @click="files.splice(index, 1)">{{
          removeLabel
        }}</Button>
      </li>
    </ul>
    <p v-if="busy && progress" role="status">
      {{ progress.percent === undefined ? progress.loaded + ' B' : progress.percent + '%' }}
    </p>
    <Button v-if="request && !busy" :disabled="disabled || !files.length" @click="upload">{{
      uploadLabel
    }}</Button>
    <Button v-if="busy" @click="cancel">{{ cancelLabel }}</Button>
    <Feedback v-if="message" tone="error">{{ message }}</Feedback>
  </div>
</template>

<style scoped>
.eap-upload {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.eap-upload__files {
  display: grid;
  gap: 8px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.eap-upload__files li {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  overflow-wrap: anywhere;
}
</style>
