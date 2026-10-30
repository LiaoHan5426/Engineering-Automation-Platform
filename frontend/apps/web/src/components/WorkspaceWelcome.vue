<script setup lang="ts">
/**
 * Welcome block embedded by the chat workspace. Scenario state stays in features/shell.
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { addExpert, currentExtras, expertCatalog, removeExpert, scenarios, workbench } from '../features/shell/workbench';
import { pendingScenarioDependencies } from '../features/shell/scenarioDependencies';
import { identityAuthorized, runtimeIdentity } from '../features/shell/runtimeIdentity';
import { Input } from "@eap/ui";
import type { Scenario } from '../features/shell/workbench';
defineEmits<{ scenario: [id: string] }>();
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });
const { t } = useI18n();
const search = ref('');
const expertSearch = ref('');
const extras = computed(() => currentExtras());
function pending(item: Scenario) { return pendingScenarioDependencies(item.dependencies, identityAuthorized(runtimeIdentity.value)); }
const availableScenes = computed(() => scenarios.filter(item => item.modes.includes(workbench.workMode) && item.name.includes(search.value)));
const availableExperts = computed(() => {
  const needle = expertSearch.value.trim();
  if (!needle) return expertCatalog;
  return expertCatalog.filter((item) => item.name.includes(needle) || item.category.includes(needle));
});
function toggleExpert(id: string) {
  if (expertCatalog.find((item) => item.id === id)?.comingSoon) return;
  if (extras.value.experts.some((item) => item.id === id)) removeExpert(id);
  else addExpert(id);
}
</script>
<template>
  <div class="preview-welcome" :class="{ 'welcome-compact': compact }" data-testid="workspace-welcome">
    <template v-if="!compact">
      <span class="welcome-spark">✦</span>
      <h1>{{ t(workbench.workMode === 'work' ? 'preview.workTitle' : 'preview.codeTitle') }}</h1>
    </template>
    <div class="welcome-section-head"><h2>{{ t('preview.scenes') }}</h2><a href="#scenes">{{ t('preview.manageScenes') }} →</a></div>
    <p class="hint welcome-soft" data-testid="welcome-draft-hint">{{ t('desktop.workScenes') }}</p>
    <p v-if="extras.scenarioId || extras.experts.length" class="hint welcome-soft" data-testid="welcome-kept">{{ t('desktop.welcomeKept') }}</p>
    <Input v-model="search" class="scene-search" type="search" :placeholder="t('preview.search')" :aria-label="t('preview.search')" />
    <div class="preview-scene-grid" data-testid="work-scenes">
      <button
        v-for="item in availableScenes"
        :key="item.id"
        type="button"
        :disabled="item.status === 'disabled'"
        :class="{ selected: extras.scenarioId === item.id }"
        :aria-pressed="extras.scenarioId === item.id"
        :title="item.status === 'disabled'
          ? t('desktop.comingSoon')
          : pending(item).length
            ? t('desktop.pendingDependencyCheck') + ' · ' + pending(item).slice(0, 4).join('、')
            : item.summary"
        @click="$emit('scenario', item.id)"
      >
        <span>◇</span><strong>{{ item.name }}</strong><small>{{ item.summary }}</small>
        <small v-if="pending(item).length" class="scene-dep-note">{{ t('desktop.pendingDependencyCheck') }} · {{ pending(item).slice(0, 3).join('、') }}</small>
        <i v-if="extras.scenarioId === item.id" aria-hidden="true">✓</i>
      </button>
    </div>
    <div class="welcome-section-head"><h2>{{ t('preview.experts') }}</h2><a href="#expert-catalog">{{ t('preview.manageExperts') }} →</a></div>
    <Input v-model="expertSearch" class="scene-search" type="search" data-testid="expert-search" :placeholder="t('desktop.searchExperts')" :aria-label="t('desktop.searchExperts')" />
    <div class="expert-pills">
      <button
        v-for="expert in availableExperts"
        :key="expert.id"
        type="button"
        :disabled="expert.comingSoon"
        :aria-pressed="extras.experts.some(item => item.id === expert.id)"
        :class="{ selected: extras.experts.some(item => item.id === expert.id) }"
        :title="expert.comingSoon ? t('desktop.comingSoon') : undefined"
        @click="toggleExpert(expert.id)"
      >
        <span>◉</span> {{ expert.name }}
        <template v-if="expert.comingSoon"> · {{ t('desktop.expertOnTheWay') }}</template>
        <template v-else>{{ extras.experts.some(item => item.id === expert.id) ? ' ×' : ' ＋' }}</template>
      </button>
    </div>
  </div>
</template>
