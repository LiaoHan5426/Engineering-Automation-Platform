<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Tabs, Tree, type TreeNode } from '@eap/ui'
import type { InspectorArea } from '../../lib/inspectorMessages'
import { INSPECTOR_TABS, type InspectorSnapshot } from './inspectorTabs'
import { buildInspectorDiffs } from './inspectorDiff'
import {
  buildInspectorFileTree,
  collectInspectorFolders,
  countInspectorFiles,
  type InspectorFileTreeNode,
  type InspectorFileSource,
} from './inspectorFileTree'

/**
 * Prototype board 18: the right inspector owns a per-area tab set. A tab either
 * renders evidence already held by the current session, states that no source
 * is connected, or shows an empty state. It never renders sample/mock content.
 */
const props = withDefaults(
  defineProps<{
    area: InspectorArea
    snapshot: InspectorSnapshot
    open?: boolean
    narrow?: boolean
  }>(),
  { open: true, narrow: false },
)
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const activeTab = ref<string>(INSPECTOR_TABS[props.area][0] ?? 'changes')
const tabItems = computed(() =>
  INSPECTOR_TABS[props.area].map((id) => ({
    id,
    label: t('inspector.tabs.' + id),
    testId: 'inspector-tab-' + id,
    domId: `inspector-tab-${props.area}-${id}`,
  })),
)
const panelId = computed(() => `inspector-panel-${props.area}`)
const activeTabId = computed(() => `inspector-tab-${props.area}-${activeTab.value}`)
watch(
  () => props.area,
  (area) => {
    activeTab.value = INSPECTOR_TABS[area][0] ?? 'changes'
  },
)

type Section = { title: string; items: string[] }
function items(...values: Array<string | string[] | undefined>) {
  return values.flatMap((value) =>
    typeof value === 'string' ? (value ? [value] : []) : (value ?? []),
  )
}
/** Real candidate-file diffs for the changes tab; empty when no proposal exists. */
const diffFiles = computed(() => buildInspectorDiffs(props.snapshot.proposalDiffs ?? []))
const memoryLines = computed(() =>
  props.snapshot.memory
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean),
)

/** Files tab: a tree derived only from real session paths, never sample files. */
const fileTree = computed(() =>
  buildInspectorFileTree({
    references: props.snapshot.references,
    localFiles: props.snapshot.localFiles,
    proposalFiles: props.snapshot.proposalFiles,
    appliedFiles: props.snapshot.appliedFiles,
  }),
)
const fileCount = computed(() => countInspectorFiles(fileTree.value))
const selectedTreeNode = ref('')
const selectedFilePath = ref('')
const expandedFolders = ref<string[]>([])
watch(
  fileTree,
  (nodes) => {
    expandedFolders.value = collectInspectorFolders(nodes)
  },
  { immediate: true },
)
const fileByPath = computed(() => {
  const byPath = new Map<string, InspectorFileTreeNode>()
  const visit = (nodes: InspectorFileTreeNode[]) => {
    for (const node of nodes) {
      byPath.set(node.path, node)
      visit(node.children ?? [])
    }
  }
  visit(fileTree.value)
  return byPath
})
const treeItems = computed<TreeNode[]>(() => {
  const map = (nodes: InspectorFileTreeNode[]): TreeNode[] =>
    nodes.map((node) => ({
      id: node.path,
      label: node.kind === 'file' ? node.path : node.name,
      children: node.children?.length ? map(node.children) : undefined,
      testId: `inspector-file-node-${node.path}`,
    }))
  return map(fileTree.value)
})
function sourceOf(node: TreeNode): InspectorFileSource | undefined {
  return fileByPath.value.get(node.id)?.source
}
function onFileTreeSelect(node: TreeNode) {
  const file = fileByPath.value.get(node.id)
  selectedFilePath.value = file?.kind === 'file' && file.source === 'proposal' ? file.path : ''
}
const selectedPreview = computed(() =>
  props.snapshot.proposalDiffs?.find((file) => file.path === selectedFilePath.value),
)

function checkOutcome(exitCode: number | null): string {
  if (exitCode === null) return 'UNKNOWN'
  return exitCode === 0 ? 'PASS' : `FAIL ${exitCode}`
}
const sections = computed<Section[] | null>(() => {
  const tab = activeTab.value
  const s = props.snapshot
  switch (tab) {
    case 'changes':
      return [
        { title: t('inspector.sections.candidateChanges'), items: items(s.proposalFiles) },
        { title: t('inspector.sections.appliedChanges'), items: items(s.appliedFiles) },
      ]
    case 'files':
    case 'references':
      return [
        { title: t('inspector.sections.referencedFiles'), items: items(s.references) },
        { title: t('inspector.sections.localFiles'), items: items(s.localFiles) },
      ]
    case 'memory':
      return [
        { title: t('inspector.sections.workingMemory'), items: items(s.memory) },
        { title: t('inspector.sections.workspace'), items: items(s.workspaceLabel) },
        { title: t('inspector.sections.model'), items: items(s.model) },
      ]
    case 'detail':
      return [
        { title: t('inspector.sections.runtime'), items: items(s.runtimeStatus) },
        {
          title: t('inspector.sections.workspace'),
          items: items(s.workspaceLabel, s.contextLabel),
        },
        { title: t('inspector.sections.model'), items: items(s.model, s.connectionName) },
      ]
    case 'verification':
      return [{ title: t('inspector.sections.verification'), items: items(s.verification) }]
    default:
      return null
  }
})
const hasEvidence = computed(() =>
  activeTab.value === 'files'
    ? fileCount.value > 0
    : (sections.value?.some((section) => section.items.length > 0) ?? false),
)
</script>

<template>
  <aside
    class="workspace-inspector"
    :class="{ 'workspace-inspector--drawer': narrow }"
    :aria-label="t('inspector.title')"
    :aria-hidden="!open ? 'true' : undefined"
    data-testid="workspace-inspector"
  >
    <!-- Ardot boards 01/05/10/12: the inspector has no title row of its own.
         Its tabs sit in the same 56px header band as the workbench top bar. -->
    <div class="workspace-inspector__tabbar" data-testid="inspector-tab-bar">
      <Tabs
        v-model="activeTab"
        class="workspace-inspector__tabs"
        :label="t('inspector.title')"
        :tabs="tabItems"
        :panel-id="panelId"
      />
      <Button
        variant="icon"
        type="button"
        class="workspace-inspector__close"
        data-testid="inspector-close"
        :aria-label="t('inspector.close')"
        @click="emit('close')"
      >
        ×
      </Button>
    </div>
    <div
      :id="panelId"
      class="workspace-inspector__body eap-scrollbar"
      role="tabpanel"
      :aria-labelledby="activeTabId"
      tabindex="0"
    >
      <p class="workspace-inspector__view">
        {{ snapshot.title
        }}<template v-if="snapshot.contextLabel"> · {{ snapshot.contextLabel }}</template>
      </p>

      <template v-if="sections === null">
        <p class="workspace-inspector__boundary" data-testid="inspector-unavailable">
          {{ t('inspector.unavailableBody') }}
        </p>
      </template>
      <template v-else-if="activeTab === 'files' && !hasEvidence">
        <div class="workspace-inspector__empty" data-testid="inspector-empty">
          <strong>{{ t('inspector.emptyTitle') }}</strong>
          <p>{{ t('inspector.emptyBody') }}</p>
        </div>
      </template>
      <template v-else-if="activeTab === 'files'">
        <section class="workspace-inspector__section" data-testid="inspector-file-tree">
          <h3>
            {{ t('inspector.sections.fileTree') }} <span>{{ fileCount }}</span>
          </h3>
          <Tree
            v-model="selectedTreeNode"
            v-model:expanded="expandedFolders"
            class="inspector-file-tree"
            :items="treeItems"
            :label="t('inspector.sections.fileTree')"
            @select="onFileTreeSelect"
          >
            <template #default="{ node }">
              <span class="inspector-file-node">
                <span class="inspector-file-tree__name">{{ node.label }}</span>
                <small v-if="sourceOf(node)">{{
                  t('inspector.fileSources.' + sourceOf(node))
                }}</small>
              </span>
            </template>
          </Tree>
        </section>

        <section
          v-if="selectedPreview"
          class="workspace-inspector__section"
          data-testid="inspector-file-preview"
        >
          <h3>{{ t('inspector.sections.filePreview') }}</h3>
          <p class="inspector-file-preview__path">{{ selectedPreview.path }}</p>
          <pre class="inspector-file-preview__body"><code>{{ selectedPreview.content }}</code></pre>
        </section>
      </template>
      <template v-else-if="!hasEvidence">
        <div class="workspace-inspector__empty" data-testid="inspector-empty">
          <strong>{{ t('inspector.emptyTitle') }}</strong>
          <p>{{ t('inspector.emptyBody') }}</p>
        </div>
      </template>
      <template v-else>
        <section
          v-for="section in sections"
          :key="section.title"
          class="workspace-inspector__section"
          data-testid="inspector-section"
        >
          <h3>
            {{ section.title }} <span>{{ section.items.length }}</span>
          </h3>
          <ul v-if="section.items.length">
            <li v-for="item in section.items" :key="item">{{ item }}</li>
          </ul>
        </section>

        <!-- Ardot board 01: candidate changes as real diff cards, not flat paths. -->
        <template v-if="activeTab === 'changes' && diffFiles.length">
          <article
            v-for="file in diffFiles"
            :key="file.path"
            class="inspector-diff-card"
            data-testid="inspector-diff-card"
          >
            <header class="inspector-diff-card__head">
              <span class="inspector-diff-card__path">{{ file.path }}</span>
              <span class="inspector-diff-card__stat">
                <b class="is-add">+{{ file.added }}</b>
                <b class="is-remove">−{{ file.removed }}</b>
              </span>
            </header>
            <p class="inspector-diff-card__hash" v-if="file.baseHash">
              {{ t('inspector.sections.diffBase') }} {{ file.baseHash }}
            </p>
            <pre class="inspector-diff-card__rows" data-testid="inspector-diff-rows"><code
              v-for="(row, index) in file.rows"
              :key="index"
              :class="'is-' + row.kind"
            >{{ row.kind === 'add' ? '+' : row.kind === 'remove' ? '−' : ' ' }}{{ row.text }}
</code></pre>
            <p class="inspector-diff-card__note" v-if="file.truncated">
              {{ t('inspector.sections.diffTruncated') }}
            </p>
          </article>
        </template>

        <!-- Ardot board 01: working memory card with real constraint lines. -->
        <section
          v-if="activeTab === 'changes' && memoryLines.length"
          class="workspace-inspector__section inspector-memory-card"
          data-testid="inspector-memory-card"
        >
          <h3>{{ t('inspector.sections.workingMemory') }} <span>sticky</span></h3>
          <ul>
            <li v-for="(line, index) in memoryLines" :key="index">{{ line }}</li>
          </ul>
        </section>

        <!-- Real verification checks; an unrun check stays UNKNOWN, never PASS. -->
        <section
          v-if="activeTab === 'changes' && snapshot.verificationChecks?.length"
          class="workspace-inspector__section"
          data-testid="inspector-checks"
        >
          <h3>{{ t('inspector.sections.verification') }}</h3>
          <ul>
            <li v-for="check in snapshot.verificationChecks" :key="check.name">
              <span class="inspector-check__name">{{ check.name }}</span>
              <b
                class="inspector-check__outcome"
                :class="
                  check.exitCode === null
                    ? 'is-unknown'
                    : check.exitCode === 0
                      ? 'is-add'
                      : 'is-remove'
                "
                >{{ checkOutcome(check.exitCode) }}</b
              >
              <small v-if="check.summary">{{ check.summary }}</small>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.workspace-inspector {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  color: var(--eap-text-color-primary);
  background: var(--eap-bg-color);
  border-left: 1px solid var(--eap-border-color);
}

/* Leave a strip of backdrop reachable on very narrow screens so tapping
   outside the drawer works; otherwise the close button is the only target. */
.workspace-inspector--drawer {
  position: fixed;
  top: var(--eap-layout-topbar-height, 56px);
  right: 0;
  bottom: 0;
  z-index: 40;
  width: min(
    var(--eap-layout-inspector-width, 380px),
    calc(100vw - var(--eap-layout-activity-width, 72px) - 32px)
  );
  box-shadow: -12px 0 32px var(--eap-box-shadow);
}

/* One 56px header band: tabs on the left, collapse control on the right. */
.workspace-inspector__tabbar {
  display: flex;
  flex: 0 0 var(--eap-layout-topbar-height, 56px);
  gap: 4px;
  align-items: stretch;
  height: var(--eap-layout-topbar-height, 56px);
  padding: 0 10px 0 14px;
  border-bottom: 1px solid var(--eap-border-color);
}

.workspace-inspector__close {
  flex: 0 0 auto;
  align-self: center;
  width: 28px;
  height: 28px;
  font-size: 18px;
  line-height: 1;
  color: var(--eap-text-color-secondary);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 6px;
}

.workspace-inspector__close:hover:not(:disabled) {
  color: var(--eap-text-color-primary);
  background: var(--eap-fill-color-hover);
}

/* Board 18: underline tabs rather than the shared pill tabs. */
.workspace-inspector__tabs {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: nowrap;
  gap: 4px;
  min-width: 0;
  height: 100%;
  padding: 0;
  overflow-x: auto;
}

.workspace-inspector__tabs:deep(.eap-tabs__tab) {
  flex: 0 0 auto;
  height: 100%;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--eap-text-color-secondary);
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
}

.workspace-inspector__tabs:deep(.eap-tabs__tab[aria-selected='true']) {
  font-weight: 650;
  color: var(--eap-color-primary);
  background: transparent;
  border-bottom-color: var(--eap-color-primary);
}

.workspace-inspector__body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 14px 16px 24px;
  overflow: auto;
}

.workspace-inspector__view {
  margin: 0 0 14px;
  font-size: 12px;
  color: var(--eap-text-color-secondary);
}

.workspace-inspector__boundary {
  padding: 12px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--eap-text-color-secondary);
  background: var(--eap-fill-color-light);
  border: 1px solid var(--eap-border-color);
  border-radius: 8px;
}

.workspace-inspector__empty {
  display: grid;
  gap: 6px;
  padding: 16px;
  background: var(--eap-fill-color-light);
  border: 1px dashed var(--eap-border-color-strong);
  border-radius: 8px;
}

.workspace-inspector__empty strong {
  font-size: 13px;
}

.workspace-inspector__empty p {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--eap-text-color-secondary);
}

.workspace-inspector__section {
  margin-bottom: 16px;
}

.workspace-inspector__section h3 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 650;
  color: var(--eap-text-color-secondary);
}

.workspace-inspector__section h3 span {
  font-weight: 500;
  color: var(--eap-text-color-placeholder);
}

.workspace-inspector__section ul {
  display: grid;
  gap: 6px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.workspace-inspector__section li {
  padding: 8px 10px;
  font-family: var(--eap-font-family-mono, monospace);
  font-size: 11px;
  overflow-wrap: anywhere;
  background: var(--eap-fill-color-blank);
  border: 1px solid var(--eap-border-color);
  border-radius: 6px;
}

.inspector-file-tree {
  display: grid;
  gap: 2px;
}

.inspector-file-tree :deep(.eap-tree__item) {
  min-height: 24px;
  padding: 3px 8px;
  font-family: var(--eap-font-family-mono, monospace);
  font-size: 11px;
  color: var(--eap-text-color-regular);
  border-radius: 6px;
}

.inspector-file-tree :deep(.eap-tree__item[data-selected]) {
  color: var(--eap-color-primary);
}

.inspector-file-node {
  display: flex;
  flex: 1 1 auto;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.inspector-file-tree__name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspector-file-node small {
  flex: 0 0 auto;
  font-family: inherit;
  font-size: 10px;
  color: var(--eap-text-color-secondary);
}

.inspector-file-preview__path {
  padding: 6px 8px;
  margin: 0 0 6px;
  font-family: var(--eap-font-family-mono, monospace);
  font-size: 11px;
  overflow-wrap: anywhere;
  background: var(--eap-fill-color-light);
  border-radius: 6px;
}

.inspector-file-preview__body {
  max-height: 220px;
  padding: 10px;
  margin: 0;
  overflow: auto;
  font-family: var(--eap-font-family-mono, monospace);
  font-size: 11px;
  line-height: 1.6;
  background: var(--eap-fill-color-blank);
  border: 1px solid var(--eap-border-color);
  border-radius: 8px;
}

.inspector-file-preview__body code {
  white-space: pre;
}

.inspector-diff-card {
  margin-bottom: 12px;
  overflow: hidden;
  background: var(--eap-fill-color-blank);
  border: 1px solid var(--eap-border-color);
  border-radius: 8px;
}

.inspector-diff-card__head {
  display: flex;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--eap-border-color);
}

.inspector-diff-card__path {
  min-width: 0;
  font-family: var(--eap-font-family-mono, monospace);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.inspector-diff-card__stat {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
  font-size: 10px;
  font-weight: 500;
}

.inspector-diff-card__hash,
.inspector-diff-card__note {
  padding: 4px 10px;
  margin: 0;
  font-size: 10px;
  color: var(--eap-text-color-secondary);
}

.inspector-diff-card__hash {
  font-family: var(--eap-font-family-mono, monospace);
  border-bottom: 1px solid var(--eap-border-color);
}

.inspector-diff-card__rows {
  max-height: 180px;
  padding: 6px 0;
  margin: 0;
  overflow: auto;
  font-family: var(--eap-font-family-mono, monospace);
  font-size: 11px;
  line-height: 1.5;
}

.inspector-diff-card__rows code {
  display: block;
  padding: 0 10px;
  white-space: pre;
}

.inspector-diff-card__rows code.is-add {
  color: var(--eap-color-success);
  background: var(--eap-color-success-soft);
}

.inspector-diff-card__rows code.is-remove {
  color: var(--eap-color-danger);
  background: var(--eap-color-danger-soft);
}

.inspector-diff-card__rows code.is-context {
  color: var(--eap-text-color-secondary);
}

.is-add {
  color: var(--eap-color-success);
}

.is-remove {
  color: var(--eap-color-danger);
}

.inspector-check__name {
  flex: 1 1 auto;
}

.inspector-check__outcome {
  flex: 0 0 auto;
  font-size: 10px;
  font-weight: 650;
}

.inspector-check__outcome.is-unknown {
  color: var(--eap-text-color-secondary);
}

.workspace-inspector__section li .inspector-check__name,
.workspace-inspector__section li .inspector-check__outcome,
.workspace-inspector__section li small {
  display: inline;
  padding: 0;
  background: none;
  border: 0;
}

.workspace-inspector__section li .inspector-check__outcome {
  margin-left: 6px;
}

.workspace-inspector__section li small {
  display: block;
  margin-top: 2px;
  color: var(--eap-text-color-secondary);
}

.inspector-memory-card li {
  font-family: inherit;
  line-height: 1.6;
}
</style>
