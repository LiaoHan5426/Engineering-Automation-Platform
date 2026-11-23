<script setup lang="ts">
/**
 * Ardot prototype board 03 — Work 办公工作台 (document workspace).
 *
 * A self-contained three-column surface: 72px activity rail, 288px document
 * sidebar, a main document editor + composer, and a 380px inspector. Every
 * visible document value comes from the real knowledge-base HTTP API; nothing
 * from the prototype's sample copy ("Q4 产品路线图" etc.) is reproduced. When
 * the backend is unavailable the surface shows a truthful error/empty state.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { runtimeApi } from '@eap/runtime-client'
import { Tag, Button, Icon, Input, Feedback, EmptyState, Textarea, Tabs, RichText } from '@eap/ui'
import { errorMessage } from '../../lib/presentation'
import { chatBinding, workbench } from '../shell/workbench'
import { downloadMarkdownFile } from './documentExport'
import { buildWorkComposerAxes } from './workComposer'

const emit = defineEmits<{
  navigate: [view: string]
}>()
const { t } = useI18n()

type Area = 'code' | 'work' | 'scenes' | 'experts' | 'settings'
const areas: Array<{ key: Area; icon: string }> = [
  { key: 'code', icon: 'code' },
  { key: 'work', icon: 'briefcase' },
  { key: 'scenes', icon: 'layers' },
  { key: 'experts', icon: 'users' },
  { key: 'settings', icon: 'settings' },
]

type Base = { id: string; name: string; description: string; documents: number }
type Doc = { id: string; title: string; content: string }

const bases = ref<Base[]>([])
const activeBaseId = ref('')
const docs = ref<Doc[]>([])
const activeDocId = ref('')
const loading = ref(false)
const error = ref('')
const filter = ref('')
const narrowSidebar = ref(false)
const inspectorOpen = ref(true)
const narrowInspector = ref(false)

const activeTab = ref('outline')
const tabs = computed(() => [
  { id: 'outline', label: t('workDocument.tabOutline'), testId: 'workdoc-tab-outline' },
  { id: 'references', label: t('workDocument.tabReferences'), testId: 'workdoc-tab-references' },
  { id: 'preview', label: t('workDocument.tabPreview'), testId: 'workdoc-tab-preview' },
  { id: 'browser', label: t('workDocument.tabBrowser'), testId: 'workdoc-tab-browser' },
  { id: 'history', label: t('workDocument.tabHistory'), testId: 'workdoc-tab-history' },
])

const visibleBases = computed(() => bases.value)
const activeBase = computed(() => bases.value.find((b) => b.id === activeBaseId.value))
const visibleDocs = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return q ? docs.value.filter((d) => d.title.toLowerCase().includes(q)) : docs.value
})
const activeDoc = computed(() => docs.value.find((d) => d.id === activeDocId.value))

// Draft edits stay local until explicitly saved through the same hash-checked
// contract used by the knowledge manager. No optimistic "connected" claim.
const draftTitle = ref('')
const draftContent = ref('')
const saving = ref(false)
const saveMessage = ref('')
watch(activeDoc, (doc) => {
  draftTitle.value = doc?.title ?? ''
  draftContent.value = doc?.content ?? ''
})
const dirty = computed(
  () =>
    draftTitle.value !== (activeDoc.value?.title ?? '') ||
    draftContent.value !== (activeDoc.value?.content ?? ''),
)

type Heading = { level: number; text: string }
const outline = computed<Heading[]>(() => {
  const result: Heading[] = []
  for (const line of draftContent.value.split('\n')) {
    const match = /^(#{1,6})\s+(.+)$/.exec(line.trim())
    if (match) result.push({ level: match[1]!.length, text: match[2]!.trim() })
  }
  return result
})
const charCount = computed(() => draftContent.value.length)

async function loadBases() {
  loading.value = true
  error.value = ''
  try {
    const page = await runtimeApi.knowledgeBases()
    bases.value = page.items
    if (!bases.value.some((b) => b.id === activeBaseId.value)) {
      activeBaseId.value = bases.value[0]?.id ?? ''
    }
    await loadDocs()
  } catch (failure) {
    error.value = t('workDocument.loadError', { error: errorMessage(failure) })
    docs.value = []
  } finally {
    loading.value = false
  }
}

async function loadDocs() {
  if (!activeBaseId.value) {
    docs.value = []
    return
  }
  try {
    const page = await runtimeApi.knowledgeDocuments(activeBaseId.value)
    docs.value = page.items
    if (!docs.value.some((d) => d.id === activeDocId.value)) {
      activeDocId.value = docs.value[0]?.id ?? ''
    }
  } catch (failure) {
    error.value = t('workDocument.loadError', { error: errorMessage(failure) })
    docs.value = []
  }
}

function selectBase(id: string) {
  activeBaseId.value = id
  activeDocId.value = ''
  saveMessage.value = ''
  void loadDocs()
}

function selectDoc(id: string) {
  activeDocId.value = id
  saveMessage.value = ''
}

function goArea(area: Area) {
  if (area === 'work') return
  const target =
    area === 'code' || area === 'scenes'
      ? 'chat'
      : area === 'experts'
        ? 'experts'
        : 'model-settings'
  emit('navigate', target)
}

async function save() {
  const doc = activeDoc.value
  if (!doc || saving.value || !dirty.value || !draftTitle.value.trim()) return
  saving.value = true
  saveMessage.value = ''
  error.value = ''
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(doc.content))
    const expectedHash = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('')
    await runtimeApi.updateKnowledgeDocument(activeBaseId.value, doc.id, {
      title: draftTitle.value,
      content: draftContent.value,
      expectedHash,
    })
    const page = await runtimeApi.knowledgeDocuments(activeBaseId.value)
    const current = page.items.find((item) => item.id === doc.id)
    if (!current || current.title !== draftTitle.value || current.content !== draftContent.value)
      throw new Error('readback mismatch')
    docs.value = page.items
    activeDocId.value = current.id
    saveMessage.value = t('workDocument.saved')
  } catch (failure) {
    error.value = errorMessage(failure)
  } finally {
    saving.value = false
  }
}

function toggleInspector() {
  inspectorOpen.value = !inspectorOpen.value
  narrowInspector.value = !narrowInspector.value
}

function openPreviewTab() {
  activeTab.value = 'preview'
  inspectorOpen.value = true
  narrowInspector.value = window.matchMedia('(max-width: 1100px)').matches
}

function exportMarkdown() {
  if (!activeDoc.value) return
  const downloaded = downloadMarkdownFile(draftTitle.value, draftContent.value, document)
  saveMessage.value = downloaded ? t('workDocument.exported') : ''
}

// The composer is an explicit hand-off to the chat workspace, never an in-place
// execution: the real typed message and the current document context are seeded
// into the chat draft (ChatWorkspace consumes pendingDraft) and nothing is sent.
const composerDraft = ref('')
const composerAxes = computed(() =>
  buildWorkComposerAxes(
    {
      references: chatBinding.value?.references.length ?? 0,
      executionMode: workbench.executionMode,
      approval: chatBinding.value?.approval ?? '',
      model: chatBinding.value?.model ?? '',
      reasoning: '',
    },
    t,
  ),
)
function sendToAssistant() {
  const message = composerDraft.value.trim()
  if (!message) return
  const context = activeDoc.value
    ? t('workDocument.handoffContext', { title: activeDoc.value.title, message })
    : message
  composerDraft.value = ''
  emit('navigate', 'chat')
  // Seed after the chat workspace becomes active: setting the draft while it is
  // still hidden lets the consumer watch fire with active=false and skip it.
  const seeded = context
  window.setTimeout(() => {
    workbench.pendingDraft = seeded
  }, 0)
}

onMounted(() => {
  void loadBases()
  // On narrow screens the inspector is an on-demand drawer, not a docked column.
  const mq = window.matchMedia('(max-width: 1100px)')
  const sync = () => {
    inspectorOpen.value = !mq.matches
    narrowInspector.value = false
  }
  sync()
  mq.addEventListener?.('change', sync)
})
</script>

<template>
  <div class="workdoc" data-testid="workdoc-root">
    <!-- 72px activity rail -->
    <nav class="wd-rail" :aria-label="t('desktop.navigation')">
      <div class="wd-brand" aria-hidden="true">E</div>
      <Button
        v-for="item in areas"
        :key="item.key"
        variant="activity"
        class="wd-rail-entry"
        :class="{ 'wd-rail-entry--active': item.key === 'work' }"
        :active="item.key === 'work'"
        :aria-current="item.key === 'work' ? 'page' : undefined"
        :aria-label="t('desktop.' + item.key)"
        :title="t('desktop.' + item.key)"
        type="button"
        @click="goArea(item.key)"
      >
        <Icon :name="item.icon as never" :size="22" />
      </Button>
      <div class="wd-rail-spacer"></div>
      <div class="wd-avatar" aria-hidden="true">YL</div>
    </nav>

    <!-- 288px document sidebar -->
    <Button
      v-if="narrowSidebar"
      variant="backdrop"
      class="wd-backdrop"
      data-testid="workdoc-sidebar-backdrop"
      @click="narrowSidebar = false"
    ></Button>
    <aside class="wd-sidebar eap-scrollbar" :class="{ 'wd-sidebar--open': narrowSidebar }">
      <div class="wd-sidebar-head">
        <span class="wd-dot" aria-hidden="true"></span>
        <strong>{{ t('workDocument.docSpace') }}</strong>
        <span class="wd-caret" aria-hidden="true">⌄</span>
      </div>
      <div v-if="visibleBases.length > 1" class="wd-base-switch" data-testid="workdoc-base-switch">
        <Button
          v-for="base in visibleBases"
          :key="base.id"
          variant="secondary"
          size="sm"
          class="wd-base-chip"
          :class="{ 'wd-base-chip--active': base.id === activeBaseId }"
          :aria-pressed="base.id === activeBaseId"
          @click="selectBase(base.id)"
          >{{ base.name }}</Button
        >
      </div>
      <div class="wd-group-label">{{ t('workDocument.recentDocs') }}</div>
      <Input
        v-model="filter"
        class="wd-search"
        type="search"
        :aria-label="t('workDocument.searchDocs')"
        :placeholder="t('workDocument.searchDocs')"
        data-testid="workdoc-search"
      />
      <nav class="wd-doc-list" :aria-label="t('workDocument.recentDocs')">
        <Button
          v-for="doc in visibleDocs"
          :key="doc.id"
          variant="navigation"
          class="wd-doc-item"
          :class="{ 'wd-doc-item--active': doc.id === activeDocId }"
          :data-testid="'workdoc-doc-' + doc.id"
          :aria-current="doc.id === activeDocId ? 'page' : undefined"
          @click="selectDoc(doc.id)"
        >
          <span class="wd-doc-activebar" aria-hidden="true"></span>
          <span class="wd-doc-body">
            <span class="wd-doc-title">{{ doc.title }}</span>
            <span class="wd-doc-sub">
              <span class="wd-chip">{{ t('workDocument.draft') }}</span>
            </span>
          </span>
        </Button>
      </nav>
      <EmptyState v-if="!loading && !error && !visibleDocs.length" class="wd-side-empty">
        {{ filter ? t('workDocument.noDocSelected') : t('workDocument.emptyTitle') }}
      </EmptyState>
      <div class="wd-sidebar-foot">
        <span class="wd-storage-icon" aria-hidden="true">▤</span>
        <span class="wd-storage-text">
          <strong>{{ t('workDocument.localWorkspace') }}</strong>
          <small>{{ t('workDocument.storage') }}</small>
        </span>
      </div>
    </aside>

    <!-- Main area -->
    <main class="wd-main">
      <header class="wd-topbar">
        <Button
          variant="icon"
          class="wd-menu-toggle"
          data-testid="workdoc-menu-toggle"
          :aria-label="t('desktop.openSidebar')"
          @click="narrowSidebar = !narrowSidebar"
          >☰</Button
        >
        <div class="wd-title-group">
          <strong>{{ activeDoc?.title ?? t('workDocument.noDocSelected') }}</strong>
          <small
            >{{ t('workDocument.area') }} · {{ activeBase?.name ?? t('workDocument.docSpace') }} /
            {{ t('workDocument.tabOutline') }}</small
          >
        </div>
        <span class="wd-status" :data-save-state="saving ? 'saving' : dirty ? 'dirty' : 'saved'">
          <span class="wd-status-dot" aria-hidden="true"></span>
          {{
            saving
              ? t('workDocument.saving')
              : dirty
                ? t('workDocument.unsaved')
                : t('workDocument.saved')
          }}
        </span>
        <div class="wd-topbar-spacer"></div>
        <Button
          variant="icon"
          class="wd-inspector-toggle"
          data-testid="workdoc-inspector-toggle"
          :aria-label="t('workDocument.toggleInspector')"
          @click="toggleInspector"
          >▥</Button
        >
      </header>

      <Feedback v-if="error" tone="error" role="alert" class="wd-error">{{ error }}</Feedback>

      <section class="wd-doc-workspace eap-scrollbar">
        <template v-if="activeDoc">
          <div class="wd-doc-actions">
            <span class="wd-statuschip">{{ t('workDocument.draft') }}</span>
            <span v-if="saveMessage" class="wd-save-message" data-testid="workdoc-save-message">{{
              saveMessage
            }}</span>
            <span class="wd-doc-actions-spacer"></span>
            <Button
              size="sm"
              variant="secondary"
              data-testid="workdoc-save"
              :disabled="!dirty || saving"
              @click="save"
              >{{ t('workDocument.save') }}</Button
            >
            <Button
              size="sm"
              variant="secondary"
              data-testid="workdoc-preview-action"
              @click="openPreviewTab"
              >{{ t('workDocument.previewDoc') }}</Button
            >
            <Button
              size="sm"
              variant="primary"
              data-testid="workdoc-export"
              @click="exportMarkdown"
              >{{ t('workDocument.exportMarkdown') }}</Button
            >
          </div>
          <article class="wd-doc-card">
            <h1 class="wd-doc-h1">{{ draftTitle || t('workDocument.noDocSelected') }}</h1>
            <p class="wd-doc-meta">
              {{
                t('workDocument.docMeta', {
                  date: t('workDocument.updatedToday'),
                  count: charCount,
                })
              }}
            </p>
            <Textarea
              v-model="draftContent"
              class="wd-doc-body-input"
              :aria-label="t('product.documentBody')"
              data-testid="workdoc-body"
            />
          </article>
        </template>
        <EmptyState v-else-if="!loading && !error" class="wd-empty">
          <strong>{{ t('workDocument.emptyTitle') }}</strong>
          <p>{{ t('workDocument.emptyHint') }}</p>
        </EmptyState>
      </section>

      <section class="wd-composer">
        <div class="wd-axes" data-testid="workdoc-axes">
          <Tag
            v-for="axis in composerAxes"
            :key="axis.key"
            size="sm"
            :type="axis.tone === 'warning' ? 'warning' : 'info'"
            >{{ axis.label }}</Tag
          >
        </div>
        <div class="wd-input-box">
          <Input
            v-model="composerDraft"
            :aria-label="t('workDocument.composerPlaceholder')"
            :placeholder="t('workDocument.composerPlaceholder')"
            data-testid="workdoc-composer"
          />
          <div class="wd-input-bottom">
            <small>{{ t('workDocument.composerHint') }}</small>
            <span class="wd-input-spacer"></span>
            <Button
              variant="primary"
              size="sm"
              data-testid="workdoc-send"
              :disabled="!composerDraft.trim()"
              @click="sendToAssistant"
              >{{ t('workDocument.send') }}</Button
            >
          </div>
        </div>
      </section>
    </main>

    <!-- 380px inspector -->
    <Button
      v-if="narrowInspector"
      variant="backdrop"
      class="wd-inspector-backdrop"
      data-testid="workdoc-inspector-backdrop"
      @click="narrowInspector = false"
    ></Button>
    <aside
      v-show="inspectorOpen"
      class="wd-inspector eap-scrollbar"
      :class="{ 'wd-inspector--drawer': narrowInspector }"
      data-testid="workdoc-inspector"
    >
      <Tabs
        v-model="activeTab"
        class="wd-inspector-tabs"
        :label="t('workDocument.inspector')"
        :tabs="tabs"
      />
      <div class="wd-inspector-body">
        <template v-if="activeTab === 'outline'">
          <div class="wd-inspector-section-head">
            <strong>{{ t('workDocument.outlineTitle') }}</strong>
            <small>{{ t('workDocument.outlineCount', { count: outline.length }) }}</small>
          </div>
          <ul v-if="outline.length" class="wd-outline">
            <li v-for="(h, i) in outline" :key="i" :class="'wd-outline--h' + h.level">
              {{ h.text }}
            </li>
          </ul>
          <p v-else class="wd-hint">{{ t('workDocument.noOutline') }}</p>
        </template>
        <template v-else-if="activeTab === 'references'">
          <div class="wd-inspector-section-head">
            <strong>{{ t('workDocument.referencesTitle', { count: 0 }) }}</strong>
          </div>
          <p class="wd-hint">{{ t('workDocument.noReferences') }}</p>
        </template>
        <template v-else-if="activeTab === 'preview'">
          <div class="wd-inspector-section-head">
            <strong>{{ t('workDocument.previewTitle') }}</strong>
            <small>{{ t('workDocument.outlineCount', { count: outline.length }) }}</small>
          </div>
          <article v-if="draftContent.trim()" class="wd-preview" data-testid="workdoc-preview">
            <RichText :source="draftContent" />
          </article>
          <p v-else class="wd-hint">{{ t('workDocument.noPreview') }}</p>
        </template>
        <template v-else>
          <p class="wd-hint">{{ t('workDocument.noReferences') }}</p>
        </template>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.workdoc {
  display: grid;
  grid-template-columns: 72px 288px minmax(0, 1fr) 380px;
  height: 100%;
  min-height: 0;
  color: var(--eap-text-color-primary);
  background: var(--eap-bg-color);
}

.wd-rail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  padding: 12px 0;
  background: var(--eap-rail-color);
  border-right: 1px solid var(--eap-border-color);
}

.wd-brand {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  margin-bottom: 12px;
  font-size: 20px;
  font-weight: 700;
  color: var(--eap-color-on-primary);
  background: var(--eap-color-primary);
  border-radius: 10px;
}

.wd-rail-entry {
  width: 44px;
  height: 44px;
  color: var(--eap-rail-text);
}

.wd-rail-entry--active {
  color: var(--eap-text-color-primary);
  background: var(--eap-rail-active);
}

.wd-rail-spacer {
  flex: 1;
}

.wd-avatar {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  font-size: 12px;
  font-weight: 600;
  color: var(--eap-text-color-regular);
  background: var(--eap-fill-color);
  border-radius: 50%;
}

.wd-sidebar {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow-y: auto;
  background: var(--eap-fill-color-light);
  border-right: 1px solid var(--eap-border-color);
}

.wd-sidebar-head {
  display: flex;
  flex: 0 0 56px;
  gap: 8px;
  align-items: center;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid var(--eap-border-color);
}

.wd-sidebar-head strong {
  font-size: 14px;
  font-weight: 600;
}

.wd-dot {
  width: 10px;
  height: 10px;
  background: var(--eap-color-primary);
  border-radius: 50%;
}

.wd-caret {
  color: var(--eap-text-color-secondary);
}

.wd-base-switch {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 12px 0;
}

.wd-base-chip {
  max-width: 100%;
  padding: 4px 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--eap-text-color-regular);
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: 1px solid var(--eap-border-color);
  border-radius: 12px;
}

.wd-base-chip--active {
  color: var(--eap-text-color-primary);
  background: var(--eap-color-primary-soft);
  border-color: var(--eap-color-primary);
}

.wd-group-label {
  padding: 12px 16px 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--eap-text-color-secondary);
}

.wd-search {
  margin: 4px 12px 8px;
}

.wd-doc-list {
  display: flex;
  flex-direction: column;
}

.wd-doc-item {
  display: flex;
  align-items: stretch;
  min-width: 0;
  padding: 10px 16px;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.wd-doc-item:hover {
  background: var(--eap-fill-color-hover);
}

.wd-doc-item--active {
  background: var(--eap-rail-active);
}

.wd-doc-activebar {
  width: 3px;
  margin-right: 10px;
  background: transparent;
  border-radius: 2px;
}

.wd-doc-item--active .wd-doc-activebar {
  background: var(--eap-color-primary);
}

.wd-doc-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.wd-doc-title {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

.wd-doc-sub {
  display: flex;
  gap: 6px;
  align-items: center;
}

.wd-chip {
  padding: 1px 8px;
  font-size: 10px;
  color: var(--eap-color-info);
  background: var(--eap-primary-soft, var(--eap-color-primary-soft));
  border-radius: 8px;
}

.wd-side-empty {
  margin: 12px;
}

.wd-sidebar-foot {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px;
  margin-top: auto;
  border-top: 1px solid var(--eap-border-color);
}

.wd-storage-icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  color: var(--eap-text-color-regular);
  background: var(--eap-fill-color);
  border-radius: 8px;
}

.wd-storage-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}

.wd-storage-text small {
  font-size: 11px;
  color: var(--eap-text-color-secondary);
}

.wd-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.wd-topbar {
  display: flex;
  flex: 0 0 56px;
  gap: 12px;
  align-items: center;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid var(--eap-border-color);
}

.wd-menu-toggle,
.wd-inspector-toggle {
  display: none;
}

.wd-title-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.wd-title-group strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

.wd-title-group small {
  font-size: 11px;
  color: var(--eap-text-color-secondary);
}

.wd-status {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 3px 10px;
  font-size: 11px;
  color: var(--eap-color-success);
  white-space: nowrap;
  background: var(--eap-color-success-soft);
  border-radius: 10px;
}

.wd-status[data-save-state='dirty'] {
  color: var(--eap-color-warning-text);
  background: var(--eap-color-warning-soft);
}

.wd-status-dot {
  width: 7px;
  height: 7px;
  background: currentcolor;
  border-radius: 50%;
}

.wd-topbar-spacer {
  flex: 1;
}

.wd-error {
  margin: 8px 16px 0;
}

.wd-doc-workspace {
  flex: 1;
  min-height: 0;
  padding: 20px 24px;
  overflow-y: auto;
}

.wd-doc-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}

.wd-statuschip {
  padding: 3px 10px;
  font-size: 11px;
  color: var(--eap-color-warning-text);
  background: var(--eap-color-warning-soft);
  border-radius: 10px;
}

.wd-save-message {
  font-size: 11px;
  color: var(--eap-color-success);
}

.wd-doc-actions-spacer {
  flex: 1;
}

.wd-doc-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 28px 32px;
  background: var(--eap-fill-color-blank);
  border: 1px solid var(--eap-border-color);
  border-radius: 12px;
}

.wd-doc-h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 600;
}

.wd-doc-meta {
  margin: 0;
  font-size: 11px;
  color: var(--eap-text-color-secondary);
}

.wd-doc-body-input {
  width: 100%;
  min-height: 260px;
}

.wd-empty,
.wd-hint {
  font-size: 12px;
  color: var(--eap-text-color-secondary);
}

.wd-preview {
  padding: 12px;
  overflow-x: auto;
  background: var(--eap-fill-color-blank);
  border: 1px solid var(--eap-border-color);
  border-radius: 8px;
}

.wd-empty {
  margin-top: 80px;
  text-align: center;
}

.wd-composer {
  flex: 0 0 170px;
  padding: 12px 20px 16px;
  border-top: 1px solid var(--eap-border-color);
}

.wd-axes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.wd-input-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  padding: 12px;
  background: var(--eap-fill-color-blank);
  border: 1px solid var(--eap-border-color);
  border-radius: 10px;
}

.wd-input-bottom {
  display: flex;
  gap: 8px;
  align-items: center;
}

.wd-input-bottom small {
  font-size: 11px;
  color: var(--eap-text-color-secondary);
}

.wd-input-spacer {
  flex: 1;
}

.wd-inspector {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow-y: auto;
  background: var(--eap-fill-color-light);
  border-left: 1px solid var(--eap-border-color);
}

.wd-inspector-tabs {
  flex: 0 0 46px;
  min-height: 46px;
  border-bottom: 1px solid var(--eap-border-color);
}

.wd-inspector-body {
  padding: 16px;
}

.wd-inspector-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.wd-inspector-section-head strong {
  font-size: 12px;
}

.wd-inspector-section-head small {
  font-size: 11px;
  color: var(--eap-text-color-secondary);
}

.wd-outline {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.wd-outline li {
  padding: 8px 10px;
  font-size: 12px;
  background: var(--eap-fill-color);
  border-radius: 6px;
}

.wd-outline--h1 {
  font-weight: 600;
  color: var(--eap-text-color-primary);
  background: var(--eap-color-primary-soft);
}

.wd-outline--h2 {
  padding-left: 20px;
}

.wd-outline--h3 {
  padding-left: 30px;
}

.wd-backdrop,
.wd-inspector-backdrop {
  display: none;
}

@media (width <= 1100px) {
  .workdoc {
    grid-template-columns: 72px 288px minmax(0, 1fr);
  }

  .wd-inspector {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 40;
    width: 380px;
    max-width: 90vw;
    box-shadow: var(--eap-box-shadow-overlay);
  }

  .wd-inspector--drawer {
    display: flex;
  }

  .wd-inspector-toggle {
    display: inline-grid;
  }
}

@media (width <= 760px) {
  .workdoc {
    grid-template-columns: 72px minmax(0, 1fr);
  }

  .wd-sidebar {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 72px;
    z-index: 40;
    width: 288px;
    max-width: calc(100vw - 72px);
    box-shadow: var(--eap-box-shadow-overlay);
    transform: translateX(calc(-100% - 72px));
    transition: transform 0.18s ease;
  }

  .wd-sidebar--open {
    transform: translateX(0);
  }

  .wd-backdrop {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: block;
    background: var(--eap-overlay-color);
  }

  .wd-menu-toggle {
    display: inline-grid;
  }

  .wd-doc-card {
    padding: 20px;
  }
}
</style>
