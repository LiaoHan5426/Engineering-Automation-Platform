<script setup lang="ts">
import { computed, useAttrs } from "vue";

/**
 * Non-modal menu shell. Content dialogs stay on Dialog (z-index 50);
 * this layer stays at or below that so ConfirmBox can still cover it.
 */
defineOptions({ inheritAttrs: false });

withDefaults(
  defineProps<{
    label: string;
    role?: "menu" | "listbox";
    teleport?: boolean;
  }>(),
  { role: "menu", teleport: false },
);
const attrs = useAttrs();
const extra = computed(() => {
  const { class: _class, role: _role, "aria-label": _label, ...rest } = attrs;
  return rest;
});
</script>

<template>
  <Teleport to="body" :disabled="!teleport">
    <div v-bind="extra" :class="['eap-popover', 'eap-scrollbar', attrs.class]" :role="role" :aria-label="label">
      <slot />
    </div>
  </Teleport>
</template>

<style src="./popover.css"></style>
