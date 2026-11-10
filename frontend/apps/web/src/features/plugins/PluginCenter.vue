<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Badge, Button, Input, ConfirmBox, Feedback, Collapse } from '@eap/ui'
import { pluginCheckMessages } from '../../lib/pluginMessages'
import type { PluginHost } from './host'
import { GRANTS, MANIFESTS, type PluginId } from './model'
import { PLUGIN_SERVICE_DEPENDENCIES } from './pluginRuntimeView'

const props = defineProps<{ host: PluginHost }>()
const { t } = useI18n({ useScope: 'local', messages: pluginCheckMessages })
const projectId = ref('')
const observationStale = computed(() => {
  const observation = props.host.boardDependencyCheck.value
  return (
    !!observation.source &&
    observation.source !== 'GET /api/board/runtime?projectId=' + encodeURIComponent(projectId.value)
  )
})
const disableTarget = ref<'board' | 'builder' | null>(null)
const installationError = ref('')
const snapshot = computed(() => props.host.boardDependencyCheck.value.snapshot)
const currentObservation = computed(
  () =>
    props.host.boardDependencyCheck.value.status === 'available' &&
    !observationStale.value &&
    snapshot.value?.projectId === projectId.value,
)
const openCount = computed(() =>
  snapshot.value
    ? snapshot.value.activeRunCount +
      snapshot.value.unknownRunCount +
      snapshot.value.activeVerificationCount +
      snapshot.value.unknownVerificationCount +
      snapshot.value.activeWriteCount +
      snapshot.value.unknownWriteCount
    : 0,
)
function confirmDisable() {
  try {
    if (!disableTarget.value) return
    props.host.setEnabled(disableTarget.value, false)
    disableTarget.value = null
    installationError.value = ''
  } catch (error) {
    installationError.value =
      error instanceof Error && error.message === 'DESIGNER_SUSPEND_BLOCKED'
        ? t('designer.suspendBlocked')
        : error instanceof Error
          ? error.message
          : 'PLUGIN_INSTALLATION_PERSIST_FAILED'
  }
}
function refreshInstallation() {
  try {
    props.host.refreshFromStore()
    installationError.value = ''
  } catch {
    installationError.value = t('designer.suspendBlocked')
  }
}
onBeforeUnmount(() => {
  props.host.cancelBoardDependencyCheck()
  props.host.cancelBuilderDependencyCheck()
})
const mockPluginScenarios = import.meta.env.MODE === 'mock'

function name(id: PluginId): string {
  if (id === 'chat') return t('plugin.chat')
  if (id === 'board') return t('desktop.board')
  return t('plugin.builder')
}

function runtimeLabel(kind: string): string {
  if (kind === 'dependency_unchecked') return t('check.unchecked')
  if (kind === 'dependency_checking') return t('check.checking')
  if (kind === 'dependency_check_failed') return t('check.failed')
  if (kind === 'ready') return t('plugin.runtimeReady')
  if (kind === 'disabled') return t('plugin.disabled')
  if (kind === 'dependency_missing') return t('plugin.dependencyMissing')
  if (kind === 'activation_failed') return t('plugin.activationFailed')
  return kind
}

function runtimeTone(kind: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (kind === 'ready') return 'success'
  if (kind === 'disabled') return 'warning'
  if (kind === 'dependency_missing' || kind === 'activation_failed') return 'danger'
  return 'neutral'
}

function toggle(host: PluginHost, id: PluginId) {
  if ((id === 'board' || id === 'builder') && host.installation.value.enabled[id]) {
    disableTarget.value = id
    installationError.value = ''
    return
  }
  try {
    host.setEnabled(id, !host.installation.value.enabled[id])
    installationError.value = ''
  } catch (error) {
    installationError.value =
      error instanceof Error ? error.message : 'PLUGIN_INSTALLATION_PERSIST_FAILED'
  }
}
</script>

<template>
  <section class="view" data-testid="plugin-center">
    <div class="page-head">
      <p class="eyebrow">PLUGINS</p>
      <h1>{{ t('plugin.center') }}</h1>
      <p>{{ t('plugin.centerHint') }}</p>
    </div>
    <div class="plugin-toolbar">
      <Button
        variant="secondary"
        size="sm"
        data-testid="plugin-refresh"
        @click="refreshInstallation"
      >
        {{ t('plugin.refresh') }}
      </Button>
      <template v-if="mockPluginScenarios">
        <Button
          variant="secondary"
          size="sm"
          data-testid="plugin-mock-dependency-missing"
          @click="host.setServiceAvailable('runtime.board-api', false)"
        >
          {{ t('plugin.mockDependencyMissing') }}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          data-testid="plugin-mock-dependency-restore"
          @click="host.setServiceAvailable('runtime.board-api', true)"
        >
          {{ t('plugin.mockDependencyRestore') }}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          data-testid="plugin-mock-activation-fail"
          @click="host.armActivationFailure(t('plugin.mockActivationFailReason'))"
        >
          {{ t('plugin.mockActivationFail') }}
        </Button>
      </template>
    </div>
    <ul class="plugin-list">
      <li v-for="manifest in MANIFESTS" :key="manifest.id" :data-testid="`plugin-${manifest.id}`">
        <h2>
          {{ name(manifest.id) }} <span class="hint">{{ manifest.version }}</span>
        </h2>
        <span :data-testid="`plugin-runtime-${manifest.id}`">
          <Badge
            :tone="runtimeTone(host.runtimeOf(manifest.id).kind)"
            :label="runtimeLabel(host.runtimeOf(manifest.id).kind)"
          />
        </span>
        <p
          v-if="host.runtimeOf(manifest.id).kind === 'dependency_missing'"
          class="hint"
          data-testid="plugin-dependency-missing"
        >
          {{ t('plugin.dependencyMissingDetail', { deps: host.runtimeOf(manifest.id).message }) }}
        </p>
        <p
          v-if="host.runtimeOf(manifest.id).kind === 'activation_failed'"
          class="hint"
          data-testid="plugin-activation-failed"
        >
          {{ t('plugin.activationFailedDetail', { reason: host.runtimeOf(manifest.id).message }) }}
        </p>
        <p v-if="PLUGIN_SERVICE_DEPENDENCIES[manifest.id].length" class="hint">
          {{ t('plugin.dependencies') }}：{{
            PLUGIN_SERVICE_DEPENDENCIES[manifest.id].map((item) => item.label).join('、')
          }}
        </p>
        <p class="hint">
          {{ t('plugin.requests') }}：{{ manifest.requests.map((item) => item.id).join('、') }}
        </p>
        <section v-if="manifest.id === 'builder'" data-testid="designer-dependencies">
          <p>{{ t('designer.boundary') }}</p>
          <Button
            variant="secondary"
            data-testid="designer-check"
            :disabled="host.builderDependencyCheck.value.status === 'checking'"
            @click="host.checkBuilderDependencies()"
            >{{ t('designer.check') }}</Button
          >
          <p data-testid="designer-check-state">
            {{ t('designer.' + host.builderDependencyCheck.value.status) }}
          </p>
          <p v-if="host.builderDependencyCheck.value.reason">
            {{ host.builderDependencyCheck.value.reason }}
          </p>
          <p v-if="host.builderDependencyCheck.value.snapshot" data-testid="designer-observation">
            {{
              t('designer.observed', {
                count: host.builderDependencyCheck.value.snapshot.resources[0]?.count,
                time: host.builderDependencyCheck.value.snapshot.observedAt,
              })
            }}
          </p>
          <Feedback
            v-if="
              host.builderDependencyCheck.value.snapshot &&
              host.builderDependencyCheck.value.status !== 'available'
            "
            tone="warning"
            >{{ t('designer.old') }}</Feedback
          >
        </section>
        <section
          v-if="manifest.id === 'board'"
          data-testid="plugin-dependency-observation"
          aria-live="polite"
        >
          <label for="plugin-check-project">{{ t('check.project') }}</label>
          <Input
            id="plugin-check-project"
            v-model="projectId"
            data-testid="plugin-check-project"
            :maxlength="120"
            :disabled="host.boardDependencyCheck.value.status === 'checking'"
          />
          <p class="hint">{{ t('check.projectHint') }}</p>
          <Button
            variant="secondary"
            data-testid="plugin-check-dependencies"
            :disabled="
              !projectId.trim() ||
              projectId.length > 120 ||
              host.boardDependencyCheck.value.status === 'checking'
            "
            @click="host.checkBoardDependencies(projectId)"
            >{{ t('check.action') }}</Button
          >
          <p>{{ t(`check.${host.boardDependencyCheck.value.status}`) }}</p>
          <p v-if="observationStale" class="hint" data-testid="plugin-check-stale">
            {{ t('check.stale') }}
          </p>
          <p v-if="host.boardDependencyCheck.value.source" class="hint">
            {{ t('check.source', { source: host.boardDependencyCheck.value.source }) }}
          </p>
          <p v-if="host.boardDependencyCheck.value.observedAt" class="hint">
            {{ t('check.time', { time: host.boardDependencyCheck.value.observedAt }) }}
          </p>
          <p v-if="host.boardDependencyCheck.value.reason" class="hint">
            {{ t('check.reason', { reason: host.boardDependencyCheck.value.reason }) }}
          </p>
          <Feedback
            v-if="!host.installation.value.enabled.board"
            tone="warning"
            data-testid="plugin-board-disabled-boundary"
            >{{ t('check.disabledBoundary') }}</Feedback
          >
          <div v-if="snapshot" data-testid="plugin-runtime-snapshot">
            <p class="hint">
              {{
                t('check.savedObservation', {
                  project: snapshot.projectId,
                  time: snapshot.observedAt,
                })
              }}
            </p>
            <p>{{ t('check.totals', { tasks: snapshot.taskCount, runs: snapshot.runCount }) }}</p>
            <p>
              {{
                t('check.runs', {
                  active: snapshot.activeRunCount,
                  unknown: snapshot.unknownRunCount,
                })
              }}
            </p>
            <p>
              {{
                t('check.verifications', {
                  active: snapshot.activeVerificationCount,
                  unknown: snapshot.unknownVerificationCount,
                })
              }}
            </p>
            <p>
              {{
                t('check.writes', {
                  active: snapshot.activeWriteCount,
                  unknown: snapshot.unknownWriteCount,
                })
              }}
            </p>
            <Feedback v-if="!currentObservation" tone="warning" data-testid="plugin-snapshot-old">{{
              t('check.oldSnapshot')
            }}</Feedback>
            <Feedback v-else-if="openCount" tone="warning" data-testid="plugin-open-work">{{
              t('check.openWork')
            }}</Feedback>
            <p v-else data-testid="plugin-no-open-work">{{ t('check.noOpenWork') }}</p>
            <Collapse v-if="snapshot.items.length" data-testid="plugin-open-items">
              <template #summary>{{ t('check.items') }}</template>
              <ul>
                <li v-for="item in snapshot.items" :key="item.kind + item.id">
                  {{ t('check.' + item.kind) }} · {{ item.status }}
                  <template v-if="item.storedStatus !== item.status"
                    >({{ t('check.storedState') }} {{ item.storedStatus }})</template
                  >
                  · Task <code>{{ item.taskId }}</code> · <code>{{ item.id }}</code>
                </li>
              </ul>
            </Collapse>
            <p v-if="snapshot.truncated" class="hint">{{ t('check.truncated') }}</p>
          </div>
          <p class="hint">{{ t('check.scope') }}</p>
          <p v-if="mockPluginScenarios" class="hint">{{ t('check.simulated') }}</p>
        </section>
        <p class="hint">
          {{ t('plugin.grants') }}：{{ GRANTS.length ? GRANTS.join('、') : t('plugin.noGrant') }}
        </p>
        <Button
          variant="secondary"
          :data-testid="`plugin-toggle-${manifest.id}`"
          @click="toggle(host, manifest.id)"
        >
          {{
            host.installation.value.enabled[manifest.id] ? t('plugin.disable') : t('plugin.enable')
          }}
        </Button>
      </li>
    </ul>
    <Feedback v-if="installationError" tone="error" data-testid="plugin-installation-error">{{
      installationError
    }}</Feedback>
    <ConfirmBox
      v-if="disableTarget"
      :title="t(disableTarget === 'builder' ? 'designer.disableTitle' : 'check.disableTitle')"
      :confirm-label="
        t(disableTarget === 'builder' ? 'designer.disableConfirm' : 'check.disableConfirm')
      "
      :impact="
        disableTarget === 'builder'
          ? [t('designer.disableImpact'), t('designer.disablePreserve')]
          : [
              t('check.disableImpact'),
              currentObservation
                ? t('check.disableObserved', {
                    project: snapshot?.projectId,
                    count: openCount,
                    time: snapshot?.observedAt,
                  })
                : t('check.disableUnverified'),
              t('check.disabledBoundary'),
            ]
      "
      :refusal="installationError || undefined"
      @confirm="confirmDisable"
      @cancel="disableTarget = null"
    />
  </section>
</template>

<style scoped>
.plugin-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.plugin-list {
  display: grid;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.plugin-list > li {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
  padding: 16px;
  border: 1px solid var(--eap-line, var(--border));
  border-radius: 12px;
}

.plugin-list > li,
.plugin-list section {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}
</style>
