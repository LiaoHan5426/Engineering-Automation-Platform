<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Dialog, Feedback, Select } from '@eap/ui'
import { runtimeApi, type McpServerItem } from '@eap/runtime-client'
import McpOperationBindingsEditor from '../capability/McpOperationBindingsEditor.vue'
import { errorMessage } from '../../lib/presentation'
const emit = defineEmits<{ close: []; manage: []; saved: [] }>()
const servers = ref<McpServerItem[]>([]),
  selected = ref(''),
  editing = ref(false),
  error = ref('')
const { t } = useI18n({
  useScope: 'local',
  messages: {
    'zh-CN': {
      title: '聊天服务配置',
      service: '注册的 MCP 服务',
      select: '选择服务',
      empty: '尚未登记 MCP 服务。可先登记服务，再配置网页搜索、链接阅读、转录和朗读操作。',
      edit: '编辑操作映射',
      manage: '管理 MCP 服务',
      close: '关闭',
    },
    'en-US': {
      title: 'Chat service configuration',
      service: 'Registered MCP service',
      select: 'Choose a service',
      empty:
        'No MCP server is registered. Register a server, then configure search, link reading, transcription and speech synthesis.',
      edit: 'Edit operation mappings',
      manage: 'Manage MCP services',
      close: 'Close',
    },
  },
})
onMounted(async () => {
  try {
    servers.value = (await runtimeApi.mcpServers()).items
  } catch (failure) {
    error.value = errorMessage(failure)
  }
})
</script>
<template>
  <McpOperationBindingsEditor
    v-if="editing"
    :server-id="selected"
    @close="editing = false"
    @saved="emit('saved')"
  />
  <Dialog
    v-else
    :title="t('title')"
    data-testid="chat-service-configuration"
    @close="emit('close')"
  >
    <Feedback v-if="error" tone="error">{{ error }}</Feedback>
    <p v-if="!servers.length">{{ t('empty') }}</p>
    <label
      >{{ t('service')
      }}<Select v-model="selected"
        ><option value="">{{ t('select') }}</option>
        <option v-for="server in servers" :key="server.id" :value="server.id">
          {{ server.name }} · {{ server.id }}
        </option></Select
      ></label
    >
    <template #footer
      ><Button variant="secondary" @click="emit('manage')">{{ t('manage') }}</Button
      ><Button :disabled="!selected" @click="editing = true">{{ t('edit') }}</Button
      ><Button variant="ghost" @click="emit('close')">{{ t('close') }}</Button></template
    >
  </Dialog>
</template>
