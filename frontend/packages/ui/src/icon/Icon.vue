<script setup lang="ts">
import { computed } from 'vue';
import { iconComponents, type IconName } from './icons';
defineOptions({ inheritAttrs: false });
const props = defineProps<{ name: IconName; size?: number | string; strokeWidth?: number; label?: string }>();
const component = computed(() => Object.hasOwn(iconComponents, props.name) ? iconComponents[props.name] : undefined);
</script>
<template>
  <component v-if="component" :is="component" v-bind="$attrs" :size="size" :stroke-width="strokeWidth" :label="label" />
</template>
