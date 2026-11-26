<script setup lang="ts">
import { Button, IconPanelRight } from '@eap/ui'
import { useI18n } from 'vue-i18n'
import { SIDEBAR_RIGHT_ID } from './sidebarRight'

defineProps<{ collapsed: boolean }>()
const emit = defineEmits<{ toggle: [collapsed: boolean] }>()
const { t } = useI18n()
</script>

<template>
  <Button
    variant="icon"
    type="button"
    class="layout-sidebar-toggle"
    data-testid="toggle-layout-sidebar-right"
    :active="!collapsed"
    :aria-expanded="!collapsed"
    :aria-controls="SIDEBAR_RIGHT_ID"
    :aria-label="collapsed ? t('desktop.openRightSidebar') : t('desktop.closeRightSidebar')"
    v-bind="collapsed ? { 'data-sidebar-right-expand': '' } : { 'data-sidebar-right-toggle': '' }"
    @click="emit('toggle', !collapsed)"
  >
    <IconPanelRight />
  </Button>
</template>
