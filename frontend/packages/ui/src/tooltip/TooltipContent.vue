<script setup lang="ts">
// Adapted from shadcn-vue; fixed source and MIT license are in SOURCE.md / LICENSE.
import type { TooltipContentEmits, TooltipContentProps } from "reka-ui";
import { computed } from "vue";
import { TooltipArrow, TooltipContent, TooltipPortal, useForwardPropsEmits } from "reka-ui";
defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<TooltipContentProps & { teleportTo?: string | HTMLElement }>(), { sideOffset: 4, teleportTo: "body" });
const emit = defineEmits<TooltipContentEmits>();
const delegated = computed(() => { const { teleportTo: _target, ...rest } = props; return rest; });
const forwarded = useForwardPropsEmits(delegated, emit);
</script>
<template>
  <TooltipPortal :to="teleportTo">
    <TooltipContent v-bind="{ ...forwarded, ...$attrs }" class="eap-tooltip">
      <slot />
      <TooltipArrow class="eap-tooltip__arrow" />
    </TooltipContent>
  </TooltipPortal>
</template>
