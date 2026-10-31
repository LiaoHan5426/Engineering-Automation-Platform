<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { PopoverRoot, PopoverAnchor, PopoverPortal, PopoverContent } from "reka-ui";

/**
 * Non-modal mixed-content surface. Anchored mode owns positioning/dismiss/focus;
 * command menus use DropdownMenu. ConfirmBox remains above this layer.
 */
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    label: string;
    role?: "region" | "dialog";
    anchor?: HTMLElement | null;
    returnFocusTo?: HTMLElement | null;
    side?: "top" | "bottom" | "left" | "right";
    align?: "start" | "center" | "end";
    teleport?: boolean;
    teleportTo?: string | HTMLElement;
  }>(),
  { role: "region", side: "bottom", align: "start", teleport: false, teleportTo: "body" },
);
const emit = defineEmits<{ close: [] }>();
let returnFocus = true;
function outside(event: CustomEvent<{ originalEvent: Event }>) {
  if (props.anchor?.contains(event.detail.originalEvent.target as Node)) event.preventDefault();
  else returnFocus = false;
}
function restoreFocus(event: Event) { event.preventDefault(); if (returnFocus) (props.returnFocusTo ?? props.anchor)?.focus(); }
const attrs = useAttrs();
const extra = computed(() => {
  const { class: _class, role: _role, "aria-label": _label, ...rest } = attrs;
  return rest;
});
</script>

<template>
  <PopoverRoot v-if="anchor" :open="true" @update:open="!$event && emit('close')">
    <PopoverAnchor :reference="anchor" as="span" style="display: none" />
    <PopoverPortal :to="teleportTo" :disabled="!teleport">
      <PopoverContent v-bind="extra" :class="['eap-popover', 'eap-scrollbar', attrs.class]" :aria-label="label" :side="side" :align="align" :side-offset="6" :collision-padding="8"
        @interact-outside="outside" @close-auto-focus="restoreFocus" @escape-key-down="$event.stopPropagation()">
        <slot />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
  <Teleport v-else :to="teleportTo" :disabled="!teleport">
    <div v-bind="extra" :class="['eap-popover', 'eap-scrollbar', attrs.class]" :role="role" :aria-label="label">
      <slot />
    </div>
  </Teleport>
</template>

<style src="./popover.css"></style>
