<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Dialog, Textarea, Feedback } from '@eap/ui'
import type { ChatTurn } from './chatSession'
const props = defineProps<{ turn: ChatTurn; disabled: boolean }>()
const emit = defineEmits<{
  select: [id: string]
  edit: [id: string, text: string]
  regenerate: [id: string]
}>()
const { t } = useI18n({
  useScope: 'local',
  messages: {
    'zh-CN': {
      edit: '编辑提问',
      regenerate: '重新生成',
      previous: '上一版本',
      next: '下一版本',
      save: '发送新分支',
      cancel: '取消',
      changed: '正在生成或原消息已不可用，请保留草稿并稍后重试。',
    },
    'en-US': {
      edit: 'Edit question',
      regenerate: 'Regenerate',
      previous: 'Previous version',
      next: 'Next version',
      save: 'Send new branch',
      cancel: 'Cancel',
      changed:
        'Generation is active or the original message is unavailable. Keep this draft and try again later.',
    },
  },
})
const editing = ref(false)
const text = ref('')
function beginEdit() {
  text.value = props.turn.text
  editing.value = true
}
function submit() {
  if (props.disabled || !props.turn.id || !text.value.trim()) return
  emit('edit', props.turn.id, text.value)
  editing.value = false
}
function move(offset: number) {
  const versions = props.turn.siblings ?? []
  const index = versions.indexOf(props.turn.id ?? '') + offset
  const id = versions[index]
  if (id) emit('select', id)
}
</script>
<template>
  <div v-if="turn.id" class="chat-branch-actions">
    <Button
      v-if="turn.role === 'user'"
      variant="ghost"
      size="sm"
      :disabled="disabled"
      @click="beginEdit"
      >{{ t('edit') }}</Button
    >
    <Button
      v-else
      variant="ghost"
      size="sm"
      :disabled="disabled"
      @click="emit('regenerate', turn.id!)"
      >{{ t('regenerate') }}</Button
    >
    <template v-if="(turn.siblings?.length ?? 0) > 1">
      <Button
        variant="ghost"
        size="sm"
        :disabled="turn.siblings?.[0] === turn.id"
        @click="move(-1)"
        >{{ t('previous') }}</Button
      >
      <span>{{ (turn.siblings?.indexOf(turn.id) ?? 0) + 1 }} / {{ turn.siblings?.length }}</span>
      <Button
        variant="ghost"
        size="sm"
        :disabled="turn.siblings?.at(-1) === turn.id"
        @click="move(1)"
        >{{ t('next') }}</Button
      >
    </template>
    <Dialog v-if="editing" :title="t('edit')" @close="editing = false">
      <Textarea v-model="text" :aria-label="t('edit')" />
      <Feedback v-if="disabled" tone="warning">{{ t('changed') }}</Feedback>
      <template #footer>
        <Button variant="secondary" @click="editing = false">{{ t('cancel') }}</Button>
        <Button :disabled="disabled || !text.trim()" @click="submit">{{ t('save') }}</Button>
      </template>
    </Dialog>
  </div>
</template>
