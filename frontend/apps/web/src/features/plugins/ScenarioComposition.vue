<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Feedback } from '@eap/ui'
import type { PluginHost } from './host'
import { scenarioComposition } from './scenarioComposition'
import { pluginCheckMessages } from '../../lib/pluginMessages'
const props = defineProps<{ host: PluginHost }>()
const emit = defineEmits<{ manage: [] }>()
const { t } = useI18n({ useScope: 'local', messages: pluginCheckMessages })
const composition = computed(() => scenarioComposition(props.host))
</script>

<template>
  <section data-testid="scenario-composition">
    <h2>{{ t('composition.title') }}</h2>
    <p>{{ t('composition.required') }}</p>
    <p data-testid="composition-designer">
      {{ t(composition.designer ? 'composition.designerReady' : 'composition.designerMissing') }}
    </p>
    <p data-testid="composition-board">
      {{
        t(
          host.boardContributionVisible.value
            ? 'composition.boardReady'
            : 'composition.boardMissing',
        )
      }}
    </p>
    <Button
      variant="secondary"
      data-testid="composition-check"
      :disabled="host.builderDependencyCheck.value.status === 'checking'"
      @click="host.checkBuilderDependencies()"
      >{{ t('designer.check') }}</Button
    >
    <p>{{ t('designer.' + host.builderDependencyCheck.value.status) }}</p>
    <p v-if="host.builderDependencyCheck.value.reason">
      {{ host.builderDependencyCheck.value.reason }}
    </p>
    <p v-if="host.builderDependencyCheck.value.snapshot">
      {{
        t('designer.observed', {
          count: composition.count,
          time: host.builderDependencyCheck.value.snapshot.observedAt,
        })
      }}
    </p>
    <Feedback v-if="!composition.ready" tone="warning" data-testid="composition-blocked">{{
      t('composition.blocked')
    }}</Feedback>
    <Button variant="link" data-testid="composition-manage" @click="emit('manage')">{{
      t('composition.manage')
    }}</Button>
    <p class="hint">{{ t('composition.boundary') }}</p>
  </section>
</template>
