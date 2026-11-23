<script setup lang="ts">
/**
 * Ardot prototype board 04 — Scene 场景中心 / 原型 → 代码设计器.
 *
 * Self-contained surface: activity rail, stepper, 200px component palette,
 * canvas, save footer and a 380px inspector. The palette and canvas operate on
 * the real PrototypeSchema shape; versions come from the real prototypeVersions
 * API. Nothing from the prototype's sample login page is reproduced as data.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  runtimeApi,
  PROTOTYPE_KINDS,
  emptyPrototypeSchema,
  type CodePreparation,
  type PrototypeSchema,
  type PrototypeNode,
  type PrototypeVersionRecord,
} from '@eap/runtime-client'
import { Button, Icon, Input, Feedback, EmptyState, Tabs } from '@eap/ui'
import { errorMessage } from '../../lib/presentation'
import { scenePublicationBlockers, scenePublicationRequest } from './scenePublication'

const emit = defineEmits<{ navigate: [view: string] }>()
const { t } = useI18n()

type Area = 'code' | 'work' | 'scenes' | 'experts' | 'settings'
const areas: Array<{ key: Area; icon: string }> = [
  { key: 'code', icon: 'code' },
  { key: 'work', icon: 'briefcase' },
  { key: 'scenes', icon: 'layers' },
  { key: 'experts', icon: 'users' },
  { key: 'settings', icon: 'settings' },
]

const steps = computed(() => [
  t('sceneDesigner.stepDesign'),
  t('sceneDesigner.stepVersion'),
  t('sceneDesigner.stepPrepare'),
  t('sceneDesigner.stepVerify'),
])
const activeStep = ref(0)
const stepTitle = computed(() => steps.value[activeStep.value] ?? steps.value[0]!)
const targetPath = ref('')
const preparation = ref<CodePreparation | null>(null)
const preparing = ref(false)
const stepError = ref('')

// Only representable, registered kinds are offered — no fake components.
const palette = PROTOTYPE_KINDS.filter((kind) => !['page', 'section'].includes(kind))
const schema = ref<PrototypeSchema>(emptyPrototypeSchema())
const versions = ref<PrototypeVersionRecord[]>([])
const loadingVersions = ref(false)
const error = ref('')
const notice = ref('')
const saveError = ref('')
const savingVersion = ref(false)
let publicationRequestId = ''
const selectedVersionId = ref('')
const narrowInspector = ref(false)
const inspectorOpen = ref(true)
const activeTab = ref('versions')
const tabs = computed(() => [
  { id: 'versions', label: t('sceneDesigner.tabVersions'), testId: 'scenedesigner-tab-versions' },
  {
    id: 'dependencies',
    label: t('sceneDesigner.tabDependencies'),
    testId: 'scenedesigner-tab-dependencies',
  },
  { id: 'check', label: t('sceneDesigner.tabCheck'), testId: 'scenedesigner-tab-check' },
  { id: 'history', label: t('sceneDesigner.tabHistory'), testId: 'scenedesigner-tab-history' },
  { id: 'settings', label: t('sceneDesigner.tabSettings'), testId: 'scenedesigner-tab-settings' },
])

const canvasNodes = computed(() => schema.value.root.children)
const selectedVersion = computed(() => versions.value.find((v) => v.id === selectedVersionId.value))
const nextDisabled = computed(
  () =>
    preparing.value ||
    (activeStep.value === 1 && !selectedVersion.value) ||
    (activeStep.value === 2 && !preparation.value),
)

function goStep(index: number) {
  stepError.value = ''
  activeStep.value = index
}
function toggleInspector() {
  inspectorOpen.value = !inspectorOpen.value
  narrowInspector.value = !narrowInspector.value
}
function selectVersion(id: string, review = false) {
  selectedVersionId.value = id
  targetPath.value = ''
  preparation.value = null
  stepError.value = ''
  notice.value = ''
  if (review) activeStep.value = 1
}
function back() {
  stepError.value = ''
  if (activeStep.value > 0) activeStep.value -= 1
}
function next() {
  stepError.value = ''
  if (activeStep.value === 1 && !selectedVersion.value) {
    stepError.value = t('sceneDesigner.versionRequired')
    return
  }
  if (activeStep.value === 2 && !preparation.value) {
    stepError.value = t('sceneDesigner.prepareNoFiles')
    return
  }
  if (activeStep.value < 3) activeStep.value += 1
  else emit('navigate', 'board')
}
async function discover() {
  const target = targetPath.value.trim()
  if (!target || preparing.value) {
    if (!target) stepError.value = t('sceneDesigner.targetRequired')
    return
  }
  preparing.value = true
  stepError.value = ''
  try {
    const result = await runtimeApi.discoverCodeDependencies(target)
    if (result.files.length > 7) throw new Error(t('sceneDesigner.prepareTooMany'))
    preparation.value = result
    notice.value = t('sceneDesigner.prepareReady', { count: result.files.length })
  } catch (failure) {
    preparation.value = null
    stepError.value = t('sceneDesigner.prepareFailed', { error: errorMessage(failure) })
  } finally {
    preparing.value = false
  }
}

function addNode(kind: string) {
  const node: PrototypeNode = {
    id: `${kind}-${Date.now().toString(36)}`,
    kind,
    props: {},
    children: [],
  }
  schema.value.root.children.push(node)
  schema.value.updatedAt = new Date().toISOString()
  notice.value = ''
}
function removeNode(id: string) {
  schema.value.root.children = schema.value.root.children.filter((n) => n.id !== id)
}

async function loadVersions() {
  loadingVersions.value = true
  error.value = ''
  try {
    const [a, b] = await Promise.all([
      runtimeApi.prototypeVersions('builder-alpha'),
      runtimeApi.prototypeVersions('builder-beta'),
    ])
    versions.value = [...a.items, ...b.items]
  } catch (failure) {
    error.value = t('sceneDesigner.loadError', { error: errorMessage(failure) })
    versions.value = []
  } finally {
    loadingVersions.value = false
  }
}

function blockerLabel(reason: string): string {
  if (reason === 'empty_schema') return t('sceneDesigner.blockerEmpty')
  if (reason.startsWith('unknown_mappings:')) return t('sceneDesigner.blockerMappings')
  if (reason.startsWith('unregistered_kind:'))
    return t('sceneDesigner.blockerKind', {
      kind: reason.slice('unregistered_kind:'.length),
    })
  return reason
}

async function saveDraft() {
  if (savingVersion.value) return
  saveError.value = ''
  notice.value = ''
  const blockers = scenePublicationBlockers(schema.value)
  if (blockers.length) {
    saveError.value = t('sceneDesigner.saveBlocked', {
      reasons: blockers.map(blockerLabel).join('；'),
    })
    return
  }
  // Keep the request id across failures so a retry cannot create a second
  // immutable version if the first request actually reached the server.
  if (!publicationRequestId) publicationRequestId = crypto.randomUUID()
  savingVersion.value = true
  try {
    const version = await runtimeApi.savePrototypeVersion(
      scenePublicationRequest(schema.value, publicationRequestId),
    )
    publicationRequestId = ''
    await loadVersions()
    selectVersion(version.id)
    activeStep.value = 1
    notice.value = t('sceneDesigner.saveDraftSuccess', {
      id: version.id,
      hash: version.contentHash.slice(0, 8),
    })
  } catch (failure) {
    saveError.value = t('sceneDesigner.saveDraftFailed', { error: errorMessage(failure) })
  } finally {
    savingVersion.value = false
  }
}
function toCode() {
  // Hand-off requires an explicitly selected, saved version; never auto-start a Run.
  if (!selectedVersion.value) {
    activeStep.value = 1
    activeTab.value = 'versions'
    inspectorOpen.value = true
    narrowInspector.value = true
    return
  }
  emit('navigate', 'builder-alpha')
}

function goArea(area: Area) {
  if (area === 'scenes') return
  const target =
    area === 'code'
      ? 'chat'
      : area === 'work'
        ? 'workdoc'
        : area === 'experts'
          ? 'experts'
          : 'model-settings'
  emit('navigate', target)
}

onMounted(() => {
  void loadVersions()
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
  <div class="scd" data-testid="scenedesigner-root">
    <nav class="scd-rail" :aria-label="t('desktop.navigation')">
      <div class="scd-brand" aria-hidden="true">E</div>
      <Button
        v-for="item in areas"
        :key="item.key"
        variant="activity"
        class="scd-rail-entry"
        :class="{ 'scd-rail-entry--active': item.key === 'scenes' }"
        :active="item.key === 'scenes'"
        :aria-current="item.key === 'scenes' ? 'page' : undefined"
        :aria-label="t('desktop.' + item.key)"
        :title="t('desktop.' + item.key)"
        type="button"
        @click="goArea(item.key)"
        ><Icon :name="item.icon as never" :size="22"
      /></Button>
      <div class="scd-rail-spacer"></div>
      <div class="scd-avatar" aria-hidden="true">YL</div>
    </nav>

    <main class="scd-main">
      <header class="scd-topbar">
        <Button
          variant="navigation"
          class="scd-back"
          data-testid="scenedesigner-back"
          @click="emit('navigate', 'scenes')"
          ><Icon name="arrow-left" />{{ t('sceneDesigner.backToScenes') }}</Button
        >
        <div class="scd-title-group">
          <strong>{{ t('sceneDesigner.area') }} · {{ stepTitle }}</strong>
          <small>{{ t('sceneDesigner.breadcrumb') }}</small>
        </div>
        <span class="scd-run-status"
          ><span class="scd-run-dot"></span>{{ t('sceneDesigner.designing') }}</span
        >
        <div class="scd-topbar-spacer"></div>
        <Button
          variant="icon"
          class="scd-inspector-toggle"
          data-testid="scenedesigner-inspector-toggle"
          :aria-label="t('workDocument.toggleInspector')"
          @click="toggleInspector"
          >▥</Button
        >
      </header>

      <div class="scd-stepper" data-testid="scenedesigner-stepper">
        <template v-for="(step, i) in steps" :key="i">
          <Button
            variant="navigation"
            type="button"
            class="scd-step"
            :class="{ 'scd-step--active': i === activeStep, 'scd-step--done': i < activeStep }"
            :data-testid="'scenedesigner-step-' + i"
            :aria-current="i === activeStep ? 'step' : undefined"
            @click="goStep(i)"
          >
            <span class="scd-step-num">{{ i + 1 }}</span>
            <span class="scd-step-label">{{ step }}</span>
          </Button>
          <span v-if="i < steps.length - 1" class="scd-step-line"></span>
        </template>
      </div>

      <Feedback v-if="error" tone="error" role="alert" class="scd-error">{{ error }}</Feedback>
      <Feedback v-if="stepError" tone="error" role="alert" class="scd-error">{{
        stepError
      }}</Feedback>
      <Feedback
        v-if="saveError"
        tone="error"
        role="alert"
        class="scd-error"
        data-testid="scenedesigner-save-error"
        >{{ saveError }}</Feedback
      >

      <section v-if="activeStep === 0" class="scd-designer-body">
        <aside class="scd-palette">
          <strong>{{ t('sceneDesigner.palette') }}</strong>
          <small>{{ t('sceneDesigner.paletteHint') }}</small>
          <Button
            v-for="kind in palette"
            :key="kind"
            variant="secondary"
            size="sm"
            class="scd-palette-item"
            :data-testid="'scenedesigner-add-' + kind"
            @click="addNode(kind)"
            >{{ kind }}</Button
          >
        </aside>
        <div class="scd-canvas-wrap eap-scrollbar">
          <div class="scd-canvas-toolbar">
            <span>{{ t('sceneDesigner.canvasTitle', { title: schema.title }) }}</span>
            <span class="scd-canvas-version">{{ t('sceneDesigner.versionDraft') }}</span>
          </div>
          <div class="scd-artboard" data-testid="scenedesigner-canvas">
            <template v-if="canvasNodes.length">
              <div
                v-for="node in canvasNodes"
                :key="node.id"
                class="scd-node"
                :data-testid="'scenedesigner-node-' + node.id"
              >
                <span class="scd-node-kind">{{ node.kind }}</span>
                <Button
                  variant="icon"
                  size="sm"
                  class="scd-node-remove"
                  :aria-label="'remove ' + node.kind"
                  @click="removeNode(node.id)"
                  >×</Button
                >
              </div>
            </template>
            <EmptyState v-else class="scd-canvas-empty">{{
              t('sceneDesigner.canvasEmpty')
            }}</EmptyState>
          </div>
        </div>
      </section>

      <!-- Board 14: immutable version selection. -->
      <section
        v-else-if="activeStep === 1"
        class="scd-flow-body eap-scrollbar"
        data-testid="scenedesigner-version-body"
      >
        <div class="scd-flow-head">
          <h2>{{ t('sceneDesigner.versionSelectTitle') }}</h2>
          <p>{{ t('sceneDesigner.versionSelectDesc') }}</p>
        </div>
        <div v-if="versions.length" class="scd-version-cards">
          <Button
            v-for="version in versions"
            :key="version.id"
            variant="card"
            class="scd-version-card"
            :class="{ 'scd-version-card--selected': version.id === selectedVersionId }"
            :data-testid="'scenedesigner-version-card-' + version.id"
            :aria-pressed="version.id === selectedVersionId"
            @click="selectVersion(version.id, true)"
          >
            <span class="scd-version-badge">{{ version.contentHash.slice(0, 4) || 'NEW' }}</span>
            <span class="scd-version-card-info">
              <strong>{{ version.title }}</strong>
              <small>{{ version.sourceRef }} · {{ version.contentHash }}</small>
            </span>
            <span class="scd-version-card-sel">{{
              version.id === selectedVersionId
                ? t('sceneDesigner.versionSelected')
                : t('sceneDesigner.confirmVersion')
            }}</span>
          </Button>
        </div>
        <EmptyState v-else class="scd-flow-empty">{{ t('sceneDesigner.versionEmpty') }}</EmptyState>
      </section>

      <!-- Board 15: read-only dependency/file review. -->
      <section
        v-else-if="activeStep === 2"
        class="scd-flow-body eap-scrollbar"
        data-testid="scenedesigner-prepare-body"
      >
        <div class="scd-flow-head">
          <h2>{{ t('sceneDesigner.prepareTitle') }}</h2>
          <p>{{ t('sceneDesigner.prepareDesc', { title: selectedVersion?.title ?? '—' }) }}</p>
        </div>
        <div class="scd-readonly-banner" data-testid="scenedesigner-readonly-banner">
          {{ t('sceneDesigner.readonly') }}
        </div>
        <div class="scd-prepare-form">
          <label class="scd-field">
            <span>{{ t('sceneDesigner.prepareTarget') }}</span>
            <Input
              v-model="targetPath"
              :disabled="preparing"
              :placeholder="t('sceneDesigner.prepareTarget')"
              data-testid="scenedesigner-target"
            />
          </label>
          <Button
            variant="secondary"
            :disabled="preparing || !targetPath.trim()"
            data-testid="scenedesigner-discover"
            @click="discover"
            >{{ preparing ? '…' : t('sceneDesigner.prepareDiscover') }}</Button
          >
        </div>
        <div v-if="preparation" class="scd-file-list" data-testid="scenedesigner-file-list">
          <div class="scd-file-head">
            {{ t('sceneDesigner.prepareFiles', { count: preparation.files.length }) }} ·
            {{ preparation.workspace }}
          </div>
          <div
            v-for="file in preparation.files"
            :key="file.path"
            class="scd-file"
            :data-testid="'scenedesigner-file-' + file.path"
          >
            <code>{{ file.path }}</code>
            <span>{{ file.exists ? 'M' : 'A' }}</span>
            <small>{{ file.baseHash.slice(0, 8) }} · {{ file.bytes }} B</small>
          </div>
        </div>
        <p v-else class="scd-hint">{{ t('sceneDesigner.prepareNoFiles') }}</p>
      </section>

      <!-- Board 16: no VERIFIED claim without independent evidence. -->
      <section v-else class="scd-flow-body eap-scrollbar" data-testid="scenedesigner-verify-body">
        <div class="scd-flow-head">
          <h2>{{ t('sceneDesigner.verifyTitle') }}</h2>
          <p>{{ t('sceneDesigner.verifyDesc') }}</p>
        </div>
        <div class="scd-verdict">
          <span class="scd-verdict-badge">UNKNOWN</span>
          <div>
            <strong>{{ t('sceneDesigner.verifyUnknown') }}</strong>
            <small>{{ t('sceneDesigner.verifyUnknownHint') }}</small>
          </div>
        </div>
        <Button
          variant="secondary"
          data-testid="scenedesigner-open-board"
          @click="emit('navigate', 'board')"
        >
          {{ t('sceneDesigner.openBoard') }}
        </Button>
      </section>

      <footer v-if="activeStep === 0" class="scd-footer">
        <div class="scd-footer-hint">
          <strong>{{ notice || t('sceneDesigner.footerTitle') }}</strong>
          <small>{{ t('sceneDesigner.footerHint') }}</small>
        </div>
        <Button
          variant="secondary"
          :disabled="savingVersion"
          data-testid="scenedesigner-save-draft"
          @click="saveDraft"
          >{{
            savingVersion ? t('sceneDesigner.saveDraftBusy') : t('sceneDesigner.saveDraft')
          }}</Button
        >
        <Button variant="primary" data-testid="scenedesigner-to-code" @click="toCode">{{
          t('sceneDesigner.toCode')
        }}</Button>
      </footer>
      <footer v-else class="scd-footer">
        <div class="scd-footer-hint">
          <strong>{{ notice || stepTitle }}</strong>
          <small>{{ t('sceneDesigner.footerHint') }}</small>
        </div>
        <Button
          variant="secondary"
          data-testid="scenedesigner-back"
          :disabled="activeStep === 0"
          @click="back"
        >
          {{ t('sceneDesigner.back') }}
        </Button>
        <Button
          variant="primary"
          data-testid="scenedesigner-next"
          :disabled="nextDisabled"
          @click="next"
        >
          {{ activeStep === 3 ? t('sceneDesigner.openBoard') : t('sceneDesigner.next') }}
        </Button>
      </footer>
    </main>

    <Button
      v-if="narrowInspector"
      variant="backdrop"
      class="scd-inspector-backdrop"
      data-testid="scenedesigner-inspector-backdrop"
      @click="narrowInspector = false"
    ></Button>
    <aside
      v-show="inspectorOpen"
      class="scd-inspector eap-scrollbar"
      :class="{ 'scd-inspector--drawer': narrowInspector }"
      data-testid="scenedesigner-inspector"
    >
      <Tabs
        v-model="activeTab"
        class="scd-inspector-tabs"
        :label="t('workDocument.inspector')"
        :tabs="tabs"
      />
      <div class="scd-inspector-body">
        <template v-if="activeTab === 'versions'">
          <div class="scd-section-head">
            <strong>{{ t('sceneDesigner.versionImmutable') }}</strong>
            <small>{{ t('sceneDesigner.versionCount', { count: versions.length }) }}</small>
          </div>
          <div v-if="versions.length" class="scd-version-list">
            <Button
              v-for="v in versions"
              :key="v.id"
              variant="navigation"
              class="scd-version"
              :class="{ 'scd-version--selected': v.id === selectedVersionId }"
              :data-testid="'scenedesigner-version-' + v.id"
              @click="selectVersion(v.id)"
            >
              <span class="scd-version-hash">{{ v.contentHash.slice(0, 4) || 'NEW' }}</span>
              <span class="scd-version-info">
                <strong>{{ v.title }}</strong>
                <small>{{ v.sourceRef }} · {{ t('sceneDesigner.confirmVersion') }}</small>
              </span>
            </Button>
          </div>
          <p v-else class="scd-hint">{{ t('sceneDesigner.versionEmpty') }}</p>
        </template>
        <template v-else-if="activeTab === 'dependencies'">
          <div class="scd-note">
            <strong>{{ t('sceneDesigner.dependencyTitle') }}</strong>
            <p>{{ t('sceneDesigner.dependencyDesc') }}</p>
          </div>
          <div v-if="selectedVersion" class="scd-inspect-block">
            <div class="scd-section-head">
              <strong>{{
                t('sceneDesigner.acceptance', { count: selectedVersion.acceptance.length })
              }}</strong>
            </div>
            <ul v-if="selectedVersion.acceptance.length" class="scd-acceptance">
              <li v-for="item in selectedVersion.acceptance" :key="item">{{ item }}</li>
            </ul>
            <p v-else class="scd-hint">{{ t('sceneDesigner.noAcceptance') }}</p>
            <template v-if="preparation">
              <div class="scd-section-head">
                <strong>{{
                  t('sceneDesigner.prepareFiles', { count: preparation.files.length })
                }}</strong>
              </div>
              <div v-for="file in preparation.files" :key="file.path" class="scd-inspect-file">
                <code>{{ file.path }}</code>
                <small>{{ file.baseHash.slice(0, 8) }}</small>
              </div>
            </template>
          </div>
        </template>
        <template v-else-if="activeTab === 'check'">
          <div class="scd-note">
            <strong>{{ t('sceneDesigner.dependencyTitle') }}</strong>
            <p>{{ t('sceneDesigner.dependencyDesc') }}</p>
          </div>
        </template>
        <template v-else-if="activeTab === 'history'">
          <div v-if="selectedVersion" class="scd-inspect-block">
            <div class="scd-section-head">
              <strong>{{ selectedVersion.title }}</strong>
              <small>{{ selectedVersion.contentHash }}</small>
            </div>
            <p class="scd-hint">
              {{ selectedVersion.sourceRef }} ·
              {{ selectedVersion.createdAt ?? t('sceneDesigner.notFrozen') }}
            </p>
          </div>
          <p v-else class="scd-hint">{{ t('sceneDesigner.versionEmpty') }}</p>
        </template>
        <template v-else>
          <p class="scd-hint">{{ t('sceneDesigner.dependencyDesc') }}</p>
        </template>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.scd {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) 380px;
  height: 100%;
  min-height: 0;
  color: var(--eap-text-color-primary);
  background: var(--eap-bg-color);
}

.scd-rail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  padding: 12px 0;
  background: var(--eap-rail-color);
  border-right: 1px solid var(--eap-border-color);
}

.scd-brand {
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

.scd-rail-entry {
  width: 44px;
  height: 44px;
  color: var(--eap-rail-text);
}

.scd-rail-entry--active {
  color: var(--eap-text-color-primary);
  background: var(--eap-rail-active);
}

.scd-rail-spacer {
  flex: 1;
}

.scd-avatar {
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

.scd-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.scd-topbar {
  display: flex;
  flex: 0 0 56px;
  gap: 12px;
  align-items: center;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid var(--eap-border-color);
}

.scd-back {
  display: inline-flex;
  gap: 6px;
}

.scd-title-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.scd-title-group strong,
.scd-title-group small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scd-title-group strong {
  font-size: 14px;
  font-weight: 600;
}

.scd-title-group small {
  font-size: 11px;
  color: var(--eap-text-color-secondary);
}

.scd-run-status {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 3px 10px;
  font-size: 11px;
  color: var(--eap-text-color-regular);
  white-space: nowrap;
  background: var(--eap-fill-color);
  border-radius: 10px;
}

.scd-run-dot {
  width: 7px;
  height: 7px;
  background: var(--eap-color-warning);
  border-radius: 50%;
}

.scd-topbar-spacer {
  flex: 1;
}

.scd-inspector-toggle {
  display: none;
}

.scd-stepper {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 12px 24px;
  border-bottom: 1px solid var(--eap-border-color);
}

.scd-step {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  white-space: nowrap;
}

.scd-step-num {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  font-size: 11px;
  color: var(--eap-text-color-secondary);
  background: var(--eap-fill-color);
  border-radius: 50%;
}

.scd-step--active .scd-step-num {
  color: var(--eap-color-on-primary);
  background: var(--eap-color-primary);
}

.scd-step-label {
  font-size: 12px;
  color: var(--eap-text-color-secondary);
}

.scd-step--active .scd-step-label {
  font-weight: 600;
  color: var(--eap-text-color-primary);
}

.scd-step--done .scd-step-label {
  color: var(--eap-text-color-regular);
}

.scd-step-line {
  flex: 1;
  height: 2px;
  background: var(--eap-border-color);
}

.scd-error {
  margin: 8px 16px 0;
}

.scd-designer-body {
  display: grid;
  flex: 1;
  grid-template-columns: 200px minmax(0, 1fr);
  min-height: 0;
}

.scd-palette {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 12px;
  overflow-y: auto;
  background: var(--eap-fill-color-light);
  border-right: 1px solid var(--eap-border-color);
}

.scd-palette strong {
  font-size: 12px;
}

.scd-palette small {
  margin-bottom: 6px;
  font-size: 10px;
  color: var(--eap-text-color-secondary);
}

.scd-palette-item {
  padding: 8px 10px;
  font-size: 11px;
  color: var(--eap-text-color-regular);
  text-align: left;
  cursor: pointer;
  background: var(--eap-fill-color-blank);
  border: 1px solid var(--eap-border-color);
  border-radius: 6px;
}

.scd-palette-item:hover {
  color: var(--eap-text-color-primary);
  border-color: var(--eap-color-primary);
}

.scd-canvas-wrap {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow-y: auto;
}

.scd-canvas-toolbar {
  display: flex;
  flex: 0 0 40px;
  gap: 8px;
  align-items: center;
  height: 40px;
  padding: 0 16px;
  font-size: 11px;
  color: var(--eap-text-color-regular);
}

.scd-canvas-version {
  color: var(--eap-color-warning-text);
}

.scd-artboard {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  padding: 24px;
  margin: 0 16px 16px;
  background: var(--eap-fill-color-blank);
  border: 1px solid var(--eap-border-color);
  border-radius: 10px;
}

.scd-node {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: var(--eap-fill-color-light);
  border: 1px solid var(--eap-border-color);
  border-radius: 8px;
}

.scd-node-kind {
  font-size: 12px;
}

.scd-node-remove {
  font-size: 16px;
  color: var(--eap-text-color-secondary);
  cursor: pointer;
  background: transparent;
  border: 0;
}

.scd-canvas-empty {
  margin: auto;
  color: var(--eap-text-color-secondary);
}

.scd-footer {
  display: flex;
  flex: 0 0 52px;
  gap: 8px;
  align-items: center;
  padding: 10px 16px;
  background: var(--eap-fill-color-light);
  border-top: 1px solid var(--eap-border-color);
}

.scd-footer-hint {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.scd-footer-hint strong {
  font-size: 11px;
}

.scd-footer-hint small {
  font-size: 10px;
  color: var(--eap-text-color-secondary);
}

.scd-inspector {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow-y: auto;
  background: var(--eap-fill-color-light);
  border-left: 1px solid var(--eap-border-color);
}

.scd-inspector-tabs {
  flex: 0 0 46px;
  min-height: 46px;
  border-bottom: 1px solid var(--eap-border-color);
}

.scd-inspector-body {
  padding: 16px;
}

.scd-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.scd-section-head strong {
  font-size: 12px;
}

.scd-section-head small {
  font-size: 11px;
  color: var(--eap-text-color-secondary);
}

.scd-version-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.scd-version {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: var(--eap-fill-color);
  border: 1px solid var(--eap-border-color);
  border-radius: 8px;
}

.scd-version--selected {
  background: var(--eap-color-primary-soft);
  border-color: var(--eap-color-primary);
}

.scd-version-hash {
  display: grid;
  place-items: center;
  min-width: 34px;
  height: 22px;
  padding: 0 4px;
  font-size: 9px;
  color: var(--eap-text-color-secondary);
  background: var(--eap-fill-color-hover);
  border-radius: 4px;
}

.scd-version-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.scd-version-info strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  white-space: nowrap;
}

.scd-version-info small {
  font-size: 10px;
  color: var(--eap-text-color-secondary);
}

.scd-hint,
.scd-note p {
  font-size: 11px;
  line-height: 1.5;
  color: var(--eap-text-color-secondary);
}

.scd-note {
  padding: 12px;
  background: var(--eap-fill-color);
  border-radius: 8px;
}

.scd-note strong {
  font-size: 12px;
}

.scd-inspector-backdrop {
  display: none;
}

/* Prototype boards 14–16: version review, read-only preparation, verification. */
.scd-flow-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  padding: 24px 28px;
  overflow-y: auto;
}

.scd-flow-head h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.scd-flow-head p {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--eap-text-color-secondary);
}

.scd-version-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 860px;
}

.scd-version-card {
  display: flex;
  gap: 14px;
  align-items: center;
  width: 100%;
  padding: 14px 16px;
  color: inherit;
  text-align: left;
  background: var(--eap-fill-color);
  border: 1px solid var(--eap-border-color);
  border-radius: 10px;
}

.scd-version-card--selected {
  background: var(--eap-color-primary-soft);
  border-color: var(--eap-color-primary);
}

.scd-version-badge {
  display: grid;
  flex: 0 0 46px;
  place-items: center;
  width: 46px;
  height: 46px;
  font-size: 14px;
  font-weight: 600;
  color: var(--eap-text-color-primary);
  background: var(--eap-fill-color-hover);
  border-radius: 8px;
}

.scd-version-card-info {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.scd-version-card-info strong {
  font-size: 13px;
  font-weight: 500;
}

.scd-version-card-info small {
  font-size: 11px;
  color: var(--eap-text-color-secondary);
}

.scd-version-card-sel {
  font-size: 12px;
  color: var(--eap-text-color-secondary);
  white-space: nowrap;
}

.scd-flow-empty {
  margin: 40px auto 0;
}

.scd-readonly-banner {
  display: flex;
  align-items: center;
  min-height: 40px;
  padding: 0 14px;
  font-size: 12px;
  color: var(--eap-text-color-primary);
  background: var(--eap-fill-color);
  border-radius: 8px;
}

.scd-prepare-form {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  max-width: 860px;
}

.scd-field {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.scd-field > span {
  font-size: 11px;
  color: var(--eap-text-color-secondary);
}

.scd-file-list {
  max-width: 860px;
  overflow: hidden;
  border: 1px solid var(--eap-border-color);
  border-radius: 10px;
}

.scd-file-head {
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 600;
  background: var(--eap-fill-color-light);
}

.scd-file {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 20px 140px;
  gap: 8px;
  align-items: center;
  min-height: 50px;
  padding: 0 14px;
  background: var(--eap-fill-color-blank);
  border-top: 1px solid var(--eap-border-color);
}

.scd-file code {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  white-space: nowrap;
}

.scd-file > span {
  font-size: 11px;
  color: var(--eap-color-warning-text);
}

.scd-file small {
  font-size: 11px;
  color: var(--eap-text-color-secondary);
  text-align: right;
}

.scd-verdict {
  display: flex;
  gap: 16px;
  align-items: center;
  max-width: 860px;
  padding: 18px;
  background: var(--eap-color-warning-soft);
  border: 1px solid var(--eap-color-warning);
  border-radius: 10px;
}

.scd-verdict-badge {
  display: grid;
  flex: 0 0 96px;
  place-items: center;
  height: 36px;
  font-size: 12px;
  font-weight: 600;
  color: var(--eap-color-on-primary);
  background: var(--eap-color-warning);
  border-radius: 8px;
}

.scd-verdict > div {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.scd-verdict strong {
  font-size: 13px;
  font-weight: 500;
}

.scd-verdict small {
  font-size: 11px;
  line-height: 1.5;
  color: var(--eap-text-color-secondary);
}

.scd-flow-body > .eap-button {
  align-self: flex-start;
}

.scd-acceptance {
  padding-left: 18px;
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--eap-text-color-regular);
}

.scd-inspect-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.scd-inspect-file {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  padding: 8px 10px;
  background: var(--eap-fill-color);
  border-radius: 6px;
}

.scd-inspect-file code,
.scd-inspect-file small {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10px;
  white-space: nowrap;
}

.scd-inspect-file small {
  color: var(--eap-text-color-secondary);
}

@media (width <= 1100px) {
  .scd {
    grid-template-columns: 72px minmax(0, 1fr);
  }

  .scd-inspector {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 40;
    width: 380px;
    max-width: 90vw;
    box-shadow: var(--eap-box-shadow-overlay);
  }

  .scd-inspector--drawer {
    display: flex;
  }

  .scd-inspector-toggle {
    display: inline-grid;
  }
}

@media (width <= 760px) {
  .scd-designer-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .scd-palette {
    flex-flow: row wrap;
    align-items: center;
    border-right: 0;
    border-bottom: 1px solid var(--eap-border-color);
  }

  .scd-palette strong,
  .scd-palette small {
    width: 100%;
  }

  .scd-step-label {
    display: none;
  }

  .scd-back {
    display: none;
  }

  .scd-flow-body {
    padding: 16px;
  }

  .scd-version-card-sel {
    display: none;
  }

  .scd-prepare-form {
    flex-direction: column;
    align-items: stretch;
  }

  .scd-file {
    grid-template-columns: minmax(0, 1fr) 20px;
  }

  .scd-file small {
    display: none;
  }

  .scd-verdict {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
