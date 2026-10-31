<script setup lang="ts">
// Application-level design content shared by Builder and task/Run version viewers.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PrototypeVersionRecord } from '@eap/runtime-client';
import PrototypeSchemaPreview from '../features/shell/PrototypeSchemaPreview.vue';
import { prototypeVersionDesign } from '../features/shell/prototypeVersionDesign';
const props = defineProps<{ version: PrototypeVersionRecord }>();
const design = computed(() => prototypeVersionDesign(props.version.body));
const { t } = useI18n();
</script>
<template>
  <p v-if="design.blocked" role="alert" data-testid="version-design-blocked">{{ t('desktop.grapesDeliverBlocked') }}</p>
  <PrototypeSchemaPreview v-if="design.schema" :key="version.id" :schema="design.schema" />
  <slot v-else-if="!design.semantic" name="legacy"><p>{{ t('boardPrototype.textOnly') }}</p></slot>
</template>
