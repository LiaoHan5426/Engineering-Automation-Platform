<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { PrototypeSchema } from './prototypeSchema';
import PrototypeNodeView from './PrototypeNodeView.vue';
defineProps<{ schema: PrototypeSchema }>();
const { t } = useI18n();
</script>
<template><section class="semantic-preview eap-scrollbar" data-testid="semantic-preview"><h3>{{ t('desktop.preview') }} · Vue</h3><PrototypeNodeView :key="schema.updatedAt" :node="schema.root" /></section></template>
<style scoped>.semantic-preview{padding:16px;border:1px solid #d5ddd4;border-radius:10px;background:#faf9f4;overflow:auto}h3{font-size:13px;margin:0 0 12px}</style>
