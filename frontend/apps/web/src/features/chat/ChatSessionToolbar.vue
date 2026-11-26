<script setup lang="ts">
import type { AiConnectionState, AiStatus } from '@eap/runtime-client'
import { Badge, Button, DropdownMenu, IconEllipsis } from '@eap/ui'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SidebarRightToggle from '../../components/SidebarRightToggle.vue'
import { useSidebarRight } from '../../components/sidebarRight'
import { identityFromStatus, identityPath } from '../shell/runtimeIdentity'
import { workbench } from '../shell/workbench'
import { installToolbarFallback } from './toolbarKeys'

type SessionPanelId = 'summary' | 'changes' | 'files' | 'terminal'

const props = defineProps<{
  phase: 'loading' | 'ready' | 'offline'
  status: AiStatus | null
  expired: boolean
  archived: boolean
  memoryNote: string
  conversationId: string | null
  sending: boolean
  hasTurns: boolean
}>()
const emit = defineEmits<{
  panel: [id: SessionPanelId]
  export: []
  'model-context': []
}>()
const { t } = useI18n()
const sidebarRight = useSidebarRight()
const moreOpen = ref(false)
const toolbar = ref<HTMLElement | null>(null)

const stateKey: Record<AiConnectionState, string> = {
  disabled: 'chat.disabled',
  not_configured: 'chat.not_configured',
  configured_unverified: 'chat.configured_unverified',
  available: 'chat.available',
  error: 'chat.error',
}
const statusTone = computed(() => {
  if (props.expired || props.archived) return 'warning'
  const state = props.status?.state
  return state === 'available' ? 'success' : state === 'error' ? 'danger' : 'warning'
})
/** Ready-enough states do not need a connection badge in the chat chrome. */
const showConnectionBadge = computed(() => {
  if (props.expired || props.archived) return true
  const state = props.status?.state
  return state === 'not_configured' || state === 'error' || state === 'disabled' || !state
})
const workspacePath = computed(
  () => identityPath(identityFromStatus(props.status)) || props.status?.workspaceLabel || '',
)
const pathTitle = computed(() =>
  [
    workspacePath.value ? `${t('chat.workspace')}：${workspacePath.value}` : '',
    props.status?.workspaceLabel ? `id：${props.status.workspaceLabel}` : '',
    props.memoryNote ? `${t('chat.memory')}：${props.memoryNote}` : '',
  ]
    .filter(Boolean)
    .join(' · '),
)
const panels: Array<{ id: SessionPanelId; label: string; title?: string }> = [
  { id: 'summary', label: 'desktop.summary' },
  { id: 'terminal', label: 'desktop.terminal', title: 'desktop.terminalDockHint' },
  { id: 'changes', label: 'desktop.changes' },
  { id: 'files', label: 'desktop.sources' },
]
const moreItems = computed(() => [
  {
    id: 'model-context',
    label: t('desktop.moreModelContext'),
    disabled: !props.conversationId || props.sending,
    description: t('desktop.moreModelContextHint'),
    testId: 'open-model-history',
  },
  {
    id: 'export',
    label: t('desktop.moreExport'),
    disabled: !props.conversationId || props.sending || !props.hasTurns,
    description: t('desktop.exportBoundary'),
    testId: 'chat-export-open',
  },
  {
    id: 'share',
    label: t('desktop.moreShare'),
    disabled: true,
    description: t('desktop.moreShareOff'),
  },
])

function choosePanel(id: SessionPanelId) {
  moreOpen.value = false
  emit('panel', id)
}
function selectMore(id: string) {
  if (id === 'export') emit('export')
  if (id === 'model-context') emit('model-context')
}

let releaseToolbar: (() => void) | null = null
onMounted(() => {
  if (toolbar.value) releaseToolbar = installToolbarFallback(toolbar.value)
})
onUnmounted(() => releaseToolbar?.())
</script>

<template>
  <div class="live-utilities__row">
    <div v-if="phase === 'loading'" class="session-status">
      <p class="hint">{{ t('chat.loading') }}</p>
    </div>
    <div
      v-else-if="phase === 'offline'"
      class="session-status session-status--notice"
      role="status"
    >
      <p class="hint">{{ t('chat.offline') }}</p>
    </div>
    <div v-else class="session-status">
      <Badge
        v-if="showConnectionBadge"
        :tone="statusTone"
        :label="t(stateKey[status?.state ?? 'disabled'])"
      />
      <p v-if="status?.errorCode" class="hint">
        {{ status.errorCode }}
      </p>
      <p class="hint session-path" data-testid="session-workspace-path" :title="pathTitle">
        {{ workspacePath }}
      </p>
    </div>
    <div
      ref="toolbar"
      class="session-tools"
      role="toolbar"
      focusgroup="toolbar wrap"
      :aria-label="t('desktop.sessionTools')"
    >
      <div class="session-tools__group" role="group" :aria-label="t('desktop.sessionPanels')">
        <Button
          v-for="panel in panels"
          :key="panel.id"
          size="sm"
          variant="ghost"
          type="button"
          class="shell-tool"
          :data-testid="`open-${panel.id}`"
          :aria-pressed="workbench.panel === panel.id"
          :title="panel.title ? t(panel.title) : undefined"
          @click="choosePanel(panel.id)"
          >{{ t(panel.label) }}</Button
        >
      </div>
      <span class="session-tools__sep" role="separator" aria-orientation="vertical"></span>
      <DropdownMenu
        v-model:open="moreOpen"
        :label="t('desktop.moreActions')"
        data-testid="ribbon-more-menu"
        :items="moreItems"
        @select="selectMore"
      >
        <Button
          size="sm"
          variant="icon"
          type="button"
          class="shell-tool"
          data-testid="ribbon-more"
          :aria-label="t('desktop.moreActions')"
          ><IconEllipsis
        /></Button>
      </DropdownMenu>
      <SidebarRightToggle
        v-if="sidebarRight.seated.value"
        :collapsed="sidebarRight.collapsed.value"
        @toggle="sidebarRight.setCollapsed"
      />
    </div>
  </div>
</template>

<style scoped>
.live-utilities__row {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  align-items: center;
  width: 100%;
  min-width: 0;
}

.session-status {
  flex: 1 1 auto;
  min-width: 0;
}

.session-status--notice .hint {
  display: inline-block;
  max-width: 100%;
  padding: 2px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--warn-text, var(--text));
  white-space: nowrap;
  background: var(--warn-bg, var(--surface-2));
  border-radius: 6px;
}

.session-tools {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
  align-items: center;
  margin-left: auto;
}

.session-tools__group {
  display: flex;
  gap: 2px;
  align-items: center;
}

.session-tools__sep {
  align-self: stretch;
  margin-block: 6px;
  border-inline-start: 1px solid var(--border);
}

.session-tools .shell-tool {
  min-inline-size: 2rem;
  min-block-size: 2rem;
  white-space: nowrap;
}

.session-tools .shell-tool:is([aria-pressed='true']) {
  box-shadow: inset 0 0 0 1px var(--eap-color-primary);
}

@media (pointer: coarse) {
  .session-tools .shell-tool {
    min-inline-size: 2.75rem;
    min-block-size: 2.75rem;
  }
}

@media (width <= 760px) {
  .live-utilities__row {
    flex-wrap: wrap;
  }

  .session-tools {
    flex-wrap: wrap;
    max-width: 100%;
    margin-left: 0;
  }
}
</style>
