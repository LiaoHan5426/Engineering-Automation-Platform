<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Button,
  Checkbox,
  ConfirmBox,
  Dialog,
  Drawer,
  DropdownMenu,
  Feedback,
  IconBriefcase,
  IconCode,
  IconLayers,
  IconSettings,
  IconUsers,
  Input,
  type MenuAction,
} from '@eap/ui'

/** Ardot board 17: six interaction shapes, demonstrated with the real shared components. */
const emit = defineEmits<{ navigate: [id: string] }>()
const { t } = useI18n()

const railAreas = [
  { key: 'code', view: 'chat', label: 'desktop.code', icon: IconCode },
  { key: 'work', view: 'workdoc', label: 'desktop.work', icon: IconBriefcase },
  { key: 'scenes', view: 'scenedesigner', label: 'desktop.scenes', icon: IconLayers },
  { key: 'experts', view: 'experts', label: 'desktop.experts', icon: IconUsers },
  { key: 'settings', view: 'settings', label: 'desktop.settings', icon: IconSettings },
] as const

const dialogOpen = ref(false)
const provider = ref('')
const secret = ref('')
const dialogStatus = ref('')
function cancelDialog() {
  dialogOpen.value = false
  dialogStatus.value = t('patterns.p1.cancelled')
}
function submitDialog() {
  dialogOpen.value = false
  dialogStatus.value = t('patterns.p1.result')
  provider.value = ''
  secret.value = ''
}

const dangerousAcknowledged = ref(false)
const confirmOpen = ref(false)
const confirmStatus = ref('')
function openConfirm() {
  if (!dangerousAcknowledged.value) {
    confirmStatus.value = t('patterns.p2.note')
    return
  }
  confirmStatus.value = ''
  confirmOpen.value = true
}
function confirmDanger() {
  confirmOpen.value = false
  dangerousAcknowledged.value = false
  confirmStatus.value = t('patterns.p2.result')
}
function cancelConfirm() {
  confirmOpen.value = false
  dangerousAcknowledged.value = false
  confirmStatus.value = t('patterns.p2.cancelled')
}

const drawerOpen = ref(false)
const drawerStatus = ref('')
function closeDrawer() {
  drawerOpen.value = false
  drawerStatus.value = t('patterns.p3.closed')
}

const wizardOpen = ref(false)
const wizardStep = ref(1)
const wizardName = ref('')
const wizardUploadAck = ref(false)
const wizardScopeAck = ref(false)
const wizardStatus = ref('')
const wizardStepKey = computed(() => ['One', 'Two', 'Three', 'Four'][wizardStep.value - 1] ?? 'One')
const wizardStepName = computed(() => t(`patterns.p4.step${wizardStepKey.value}`))
const wizardValid = computed(() => {
  if (wizardStep.value === 1) return !!wizardName.value.trim()
  if (wizardStep.value === 2) return wizardUploadAck.value
  if (wizardStep.value === 3) return wizardScopeAck.value
  return true
})
function openWizard() {
  wizardStep.value = 1
  wizardName.value = ''
  wizardUploadAck.value = false
  wizardScopeAck.value = false
  wizardStatus.value = ''
  wizardOpen.value = true
}
function previousWizardStep() {
  if (wizardStep.value > 1) wizardStep.value -= 1
  wizardStatus.value = ''
}
function nextWizardStep() {
  if (!wizardValid.value) {
    wizardStatus.value = t('patterns.p4.blocked')
    return
  }
  wizardStatus.value = ''
  if (wizardStep.value < 4) {
    wizardStep.value += 1
    return
  }
  wizardOpen.value = false
  wizardStatus.value = t('patterns.p4.result')
}

const menuOpen = ref(false)
const menuStatus = ref('')
const menuItems = computed<MenuAction[]>(() => [
  { id: 'rename', label: t('patterns.p5.rename'), testId: 'pattern-menu-rename' },
  { id: 'auth', label: t('patterns.p5.auth'), testId: 'pattern-menu-auth' },
  { id: 'import', label: t('patterns.p5.import'), testId: 'pattern-menu-import' },
  {
    id: 'delete',
    label: t('patterns.p5.delete'),
    destructive: true,
    testId: 'pattern-menu-delete',
  },
])
function selectMenu(id: string) {
  const item = menuItems.value.find((entry) => entry.id === id)
  menuStatus.value = t('patterns.p5.result', { label: item?.label ?? id })
}

type DemoToast = {
  id: number
  tone: 'success' | 'error'
  message: string
  withAction?: boolean
}
let toastSequence = 0
const toasts = ref<DemoToast[]>([])
function replayToasts() {
  toasts.value = [
    { id: ++toastSequence, tone: 'success', message: t('patterns.p6.success') },
    {
      id: ++toastSequence,
      tone: 'error',
      message: t('patterns.p6.error'),
      withAction: true,
    },
  ]
}
replayToasts()
const toastLog = ref('')
function dismissToast(id: number) {
  toasts.value = toasts.value.filter((toast) => toast.id !== id)
}
</script>

<template>
  <div class="patterns" data-testid="interaction-patterns">
    <nav class="pt-rail" data-testid="patterns-rail" :aria-label="t('desktop.navigation')">
      <span class="pt-brand" aria-hidden="true">E</span>
      <Button
        v-for="area in railAreas"
        :key="area.key"
        variant="icon"
        class="pt-rail-entry"
        :class="{ 'pt-rail-entry--active': area.key === 'settings' }"
        :title="t(area.label)"
        :aria-label="t(area.label)"
        :data-testid="'patterns-rail-' + area.key"
        @click="emit('navigate', area.view)"
      >
        <component :is="area.icon" :size="22" />
      </Button>
      <span class="pt-avatar" aria-hidden="true">YL</span>
    </nav>

    <main class="pt-main">
      <header class="pt-topbar" data-testid="patterns-topbar">
        <div>
          <strong>{{ t('patterns.title') }}</strong>
          <small>{{ t('patterns.breadcrumb') }}</small>
        </div>
        <Button
          variant="secondary"
          data-testid="patterns-back"
          @click="emit('navigate', 'settings')"
        >
          {{ t('patterns.back') }}
        </Button>
      </header>

      <div class="pt-content eap-scrollbar">
        <header class="pt-page-head">
          <h1 data-testid="patterns-title">{{ t('patterns.title') }}</h1>
          <p>{{ t('patterns.desc') }}</p>
          <Feedback tone="info" data-testid="patterns-boundary">{{
            t('patterns.demoBoundary')
          }}</Feedback>
        </header>

        <div class="pt-grid">
          <section class="pt-card" data-testid="pattern-dialog">
            <h2>{{ t('patterns.p1.label') }}</h2>
            <p>{{ t('patterns.p1.note') }}</p>
            <div class="pt-stage">
              <Button
                variant="primary"
                data-testid="pattern-dialog-open"
                @click="dialogOpen = true"
              >
                {{ t('patterns.p1.open') }}
              </Button>
              <Feedback
                v-if="dialogStatus"
                tone="info"
                role="status"
                data-testid="pattern-dialog-status"
              >
                {{ dialogStatus }}
              </Feedback>
            </div>
          </section>

          <section class="pt-card" data-testid="pattern-confirm">
            <h2>{{ t('patterns.p2.label') }}</h2>
            <p>{{ t('patterns.p2.note') }}</p>
            <div class="pt-stage">
              <label class="pt-check">
                <Checkbox v-model="dangerousAcknowledged" data-testid="pattern-confirm-ack" />
                <span>{{ t('patterns.p2.acknowledge') }}</span>
              </label>
              <Button
                variant="danger"
                data-testid="pattern-confirm-open"
                :disabled="!dangerousAcknowledged"
                @click="openConfirm"
              >
                {{ t('patterns.p2.open') }}
              </Button>
              <Feedback
                v-if="confirmStatus"
                tone="info"
                role="status"
                data-testid="pattern-confirm-status"
              >
                {{ confirmStatus }}
              </Feedback>
            </div>
          </section>

          <section class="pt-card" data-testid="pattern-drawer">
            <h2>{{ t('patterns.p3.label') }}</h2>
            <p>{{ t('patterns.p3.note') }}</p>
            <div class="pt-stage">
              <Button
                variant="secondary"
                data-testid="pattern-drawer-open"
                @click="drawerOpen = true"
              >
                {{ t('patterns.p3.open') }}
              </Button>
              <Feedback
                v-if="drawerStatus"
                tone="info"
                role="status"
                data-testid="pattern-drawer-status"
              >
                {{ drawerStatus }}
              </Feedback>
            </div>
          </section>

          <section class="pt-card" data-testid="pattern-wizard">
            <h2>{{ t('patterns.p4.label') }}</h2>
            <p>{{ t('patterns.p4.note') }}</p>
            <div class="pt-stage">
              <Button variant="secondary" data-testid="pattern-wizard-open" @click="openWizard">
                {{ t('patterns.p4.open') }}
              </Button>
              <Feedback
                v-if="wizardStatus"
                tone="info"
                role="status"
                data-testid="pattern-wizard-status"
              >
                {{ wizardStatus }}
              </Feedback>
            </div>
          </section>

          <section class="pt-card" data-testid="pattern-dropdown">
            <h2>{{ t('patterns.p5.label') }}</h2>
            <p>{{ t('patterns.p5.note') }}</p>
            <div class="pt-stage">
              <DropdownMenu
                v-model:open="menuOpen"
                :items="menuItems"
                :label="t('patterns.p5.label')"
                align="start"
                teleport-to="body"
                @select="selectMenu"
              >
                <Button variant="secondary" data-testid="pattern-dropdown-trigger">
                  {{ t('patterns.p5.trigger') }}
                </Button>
              </DropdownMenu>
              <Feedback
                v-if="menuStatus"
                tone="info"
                role="status"
                data-testid="pattern-dropdown-status"
              >
                {{ menuStatus }}
              </Feedback>
            </div>
          </section>

          <section class="pt-card" data-testid="pattern-toast">
            <h2>{{ t('patterns.p6.label') }}</h2>
            <p>{{ t('patterns.p6.note') }}</p>
            <div class="pt-stage pt-stage--toasts">
              <Feedback
                v-for="toast in toasts"
                :key="toast.id"
                :tone="toast.tone"
                class="pt-toast"
                :data-testid="'pattern-toast-' + toast.tone"
              >
                <span>{{ toast.message }}</span>
                <Button
                  v-if="toast.withAction"
                  variant="link"
                  size="sm"
                  data-testid="pattern-toast-action"
                  @click="toastLog = t('patterns.p6.log')"
                >
                  {{ t('patterns.p6.action') }}
                </Button>
                <Button
                  variant="icon"
                  size="sm"
                  :aria-label="t('patterns.p6.dismiss')"
                  :data-testid="'pattern-toast-dismiss-' + toast.id"
                  @click="dismissToast(toast.id)"
                >
                  ×
                </Button>
              </Feedback>
              <p v-if="!toasts.length" class="pt-empty" data-testid="pattern-toast-empty">
                {{ t('patterns.p6.empty') }}
              </p>
              <Button variant="secondary" data-testid="pattern-toast-replay" @click="replayToasts">
                {{ t('patterns.p6.replay') }}
              </Button>
              <Feedback v-if="toastLog" tone="info" role="status" data-testid="pattern-toast-log">
                {{ toastLog }}
              </Feedback>
            </div>
          </section>
        </div>
      </div>
    </main>

    <Dialog
      v-if="dialogOpen"
      :title="t('patterns.p1.heading')"
      size="sm"
      data-testid="pattern-dialog-layer"
      @close="cancelDialog"
    >
      <p class="pt-dialog-subtitle">{{ t('patterns.p1.subtitle') }}</p>
      <label class="pt-field">
        <span>{{ t('patterns.p1.provider') }}</span>
        <Input
          v-model="provider"
          data-testid="pattern-dialog-provider"
          :placeholder="t('patterns.p1.providerPlaceholder')"
        />
      </label>
      <label class="pt-field">
        <span>{{ t('patterns.p1.secret') }}</span>
        <Input
          v-model="secret"
          data-testid="pattern-dialog-secret"
          :placeholder="t('patterns.p1.secretPlaceholder')"
        />
      </label>
      <template #footer>
        <Button variant="secondary" data-testid="pattern-dialog-cancel" @click="cancelDialog">
          {{ t('patterns.p1.cancel') }}
        </Button>
        <Button variant="primary" data-testid="pattern-dialog-submit" @click="submitDialog">
          {{ t('patterns.p1.submit') }}
        </Button>
      </template>
    </Dialog>

    <ConfirmBox
      v-if="confirmOpen"
      :title="t('patterns.p2.heading')"
      :impact="[
        t('patterns.p2.impactOne'),
        t('patterns.p2.impactTwo'),
        t('patterns.p2.impactThree'),
      ]"
      :confirm-label="t('patterns.p2.confirm')"
      :cancel-label="t('patterns.p2.cancel')"
      danger
      @confirm="confirmDanger"
      @cancel="cancelConfirm"
    />

    <Drawer
      v-if="drawerOpen"
      :title="t('patterns.p3.heading')"
      data-testid="pattern-drawer-layer"
      @close="closeDrawer"
    >
      <h3 class="pt-drawer-head">{{ t('patterns.p3.section') }}</h3>
      <div class="pt-drawer-row" data-testid="pattern-drawer-step-one">
        <span class="pt-drawer-mark" aria-hidden="true">✓</span
        ><span>{{ t('patterns.p3.stepOne') }}</span>
      </div>
      <div class="pt-drawer-row" data-testid="pattern-drawer-step-two">
        <span class="pt-drawer-mark" aria-hidden="true">✓</span
        ><span>{{ t('patterns.p3.stepTwo') }}</span>
      </div>
      <div class="pt-drawer-row" data-testid="pattern-drawer-step-three">
        <span class="pt-drawer-mark" aria-hidden="true">…</span
        ><span>{{ t('patterns.p3.stepThree') }}</span>
      </div>
      <Feedback tone="info">{{ t('patterns.p3.boundary') }}</Feedback>
    </Drawer>

    <Dialog
      v-if="wizardOpen"
      :title="t('patterns.p4.heading')"
      size="md"
      data-testid="pattern-wizard-layer"
      @close="wizardOpen = false"
    >
      <p class="pt-dialog-subtitle" data-testid="pattern-wizard-step">
        {{ t('patterns.p4.stepLabel', { current: wizardStep, total: 4, name: wizardStepName }) }}
      </p>
      <div class="pt-stepper" aria-hidden="true">
        <span
          v-for="step in 4"
          :key="step"
          :class="{ 'pt-step--done': step < wizardStep, 'pt-step--active': step === wizardStep }"
          :data-testid="'pattern-wizard-step-' + step"
        ></span>
      </div>
      <label v-if="wizardStep === 1" class="pt-field">
        <span>{{ t('patterns.p4.name') }}</span>
        <Input
          v-model="wizardName"
          data-testid="pattern-wizard-name"
          :placeholder="t('patterns.p4.namePlaceholder')"
        />
      </label>
      <template v-else-if="wizardStep === 2">
        <div class="pt-upload" data-testid="pattern-wizard-upload">
          <span aria-hidden="true">＋</span>
          <div>
            <strong>{{ t('patterns.p4.upload') }}</strong>
            <small>{{ t('patterns.p4.uploadHint') }}</small>
          </div>
        </div>
        <label class="pt-check">
          <Checkbox v-model="wizardUploadAck" data-testid="pattern-wizard-ack" />
          <span>{{ t('patterns.p4.uploadAck') }}</span>
        </label>
      </template>
      <label v-else-if="wizardStep === 3" class="pt-check">
        <Checkbox v-model="wizardScopeAck" data-testid="pattern-wizard-ack" />
        <span>{{ t('patterns.p4.scopeAck') }}</span>
      </label>
      <p v-else class="pt-wizard-summary" data-testid="pattern-wizard-summary">
        {{ wizardName }} · {{ t('patterns.p4.stepFour') }}
      </p>
      <template #footer>
        <Button variant="secondary" data-testid="pattern-wizard-prev" @click="previousWizardStep">
          {{ t('patterns.p4.prev') }}
        </Button>
        <Button variant="primary" data-testid="pattern-wizard-next" @click="nextWizardStep">
          {{ wizardStep === 4 ? t('patterns.p4.finish') : t('patterns.p4.next') }}
        </Button>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.patterns {
  display: grid;
  grid-template-columns: var(--eap-layout-activity-width, 72px) minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
  color: var(--text);
  background: var(--bg);
}

.pt-rail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  padding: 10px 0 14px;
  background: var(--bg);
  border-right: 1px solid var(--border);
}

.pt-brand,
.pt-avatar {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 36px;
  height: 36px;
  font-size: 16px;
  font-weight: 700;
  color: var(--eap-color-on-primary, var(--text));
  background: var(--eap-color-primary, var(--accent));
  border-radius: 10px;
}

.pt-brand {
  margin-bottom: 10px;
}

.pt-avatar {
  margin-top: auto;
  font-size: 11px;
  color: var(--text-soft);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 50%;
}

.pt-rail-entry {
  width: 44px;
  height: 44px;
}

.pt-rail-entry--active {
  color: var(--eap-color-primary-text, var(--text));
  background: var(--surface-3);
}

.pt-main {
  display: grid;
  grid-template-rows: 56px minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
}

.pt-topbar {
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
  padding: 0 24px;
  border-bottom: 1px solid var(--border);
}

.pt-topbar > div {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.pt-topbar strong {
  font-size: 14px;
  font-weight: 650;
}

.pt-topbar small {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--text-mute);
  white-space: nowrap;
}

.pt-content {
  min-width: 0;
  padding: 28px 32px 48px;
  overflow: auto;
}

.pt-page-head {
  max-width: 76ch;
  margin-bottom: 24px;
}

.pt-page-head h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.pt-page-head p {
  margin: 8px 0 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-soft);
}

.pt-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
}

.pt-card {
  min-width: 0;
  padding: 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.pt-card h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
}

.pt-card > p {
  margin: 8px 0 16px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-soft);
}

.pt-stage {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
  min-height: 150px;
  padding: 16px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.pt-stage--toasts {
  width: 100%;
  max-width: 100%;
}

.pt-toast {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  overflow-wrap: anywhere;
}

.pt-empty {
  margin: 0;
  font-size: 11px;
  color: var(--text-mute);
}

.pt-check {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-soft);
  overflow-wrap: anywhere;
}

.pt-dialog-subtitle {
  margin: 0 0 16px;
  font-size: 12px;
  color: var(--text-soft);
}

.pt-field {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--text-soft);
}

.pt-drawer-head {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 650;
}

.pt-drawer-row {
  display: flex;
  gap: 10px;
  align-items: center;
  min-height: 30px;
  font-size: 12px;
}

.pt-drawer-mark {
  color: var(--eap-color-success-text, var(--text));
}

.pt-stepper {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 18px;
}

.pt-stepper > span {
  height: 6px;
  background: var(--surface-3);
  border-radius: 999px;
}

.pt-stepper > .pt-step--done {
  background: var(--eap-color-success-bg, var(--accent));
}

.pt-stepper > .pt-step--active {
  background: var(--accent);
}

.pt-upload {
  display: flex;
  gap: 12px;
  align-items: center;
  min-height: 76px;
  padding: 12px;
  margin-bottom: 12px;
  border: 1px dashed var(--border);
  border-radius: 10px;
}

.pt-upload > span {
  font-size: 20px;
  color: var(--text-mute);
}

.pt-upload div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.pt-upload small {
  font-size: 11px;
  color: var(--text-mute);
  overflow-wrap: anywhere;
}

.pt-wizard-summary {
  font-size: 12px;
  color: var(--text-soft);
  overflow-wrap: anywhere;
}

@media (width <= 900px) {
  .pt-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (width <= 760px) {
  .pt-topbar {
    padding: 0 10px;
  }

  .pt-content {
    padding: 20px 12px 32px;
  }

  .pt-card {
    padding: 14px;
  }

  .pt-stage {
    padding: 12px;
  }
}
</style>
