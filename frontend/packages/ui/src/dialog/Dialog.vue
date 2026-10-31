<script setup lang="ts">
import { ref, useAttrs } from "vue";
import Button from "../button/Button.vue";
import { useFocusTrap } from "../hooks/useFocusTrap";

/**
 * Shared modal shell for EAP consoles.
 * Prefer this over ad-hoc Teleport overlays or native <dialog> top-layer
 * so ConfirmBox (z-index 60) can still stack above content dialogs.
 */
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    title?: string;
    busy?: boolean;
    size?: "sm" | "md" | "lg";
    showHeader?: boolean;
    showClose?: boolean;
    closeLabel?: string;
    closeTestId?: string;
    /** Keep a subtree theme by targeting a portal host inside that subtree. */
    teleportTo?: string | HTMLElement;
  }>(),
  {
    busy: false,
    size: "md",
    showHeader: true,
    showClose: true,
    closeLabel: "关闭",
    teleportTo: "body",
  },
);
const emit = defineEmits<{ close: [] }>();
const attrs = useAttrs();
const panel = ref<HTMLElement | null>(null);

function dismiss() {
  if (!props.busy) emit("close");
}
const { onKeydown } = useFocusTrap(panel, {
  onEscape: dismiss,
  initial: (node) => node.querySelector<HTMLElement>("[data-eap-dialog-close]") ?? node,
});
</script>

<template>
  <Teleport :to="teleportTo">
    <div class="eap-dialog-root" data-testid="eap-dialog" v-bind="attrs">
      <button type="button" class="eap-dialog-backdrop" :aria-label="closeLabel" :disabled="busy" @click="dismiss" />
      <section
        ref="panel"
        class="eap-dialog eap-scrollbar"
        :class="`eap-dialog--${size}`"
        role="dialog"
        aria-modal="true"
        :aria-label="title || closeLabel"
        tabindex="-1"
        @keydown="onKeydown"
      >
        <header v-if="showHeader && (title || $slots.header || showClose)" class="eap-dialog__header">
          <slot name="header">
            <h2 v-if="title" class="eap-dialog__title">{{ title }}</h2>
            <span v-else />
          </slot>
          <Button
            v-if="showClose"
            data-eap-dialog-close
            :data-testid="closeTestId"
            variant="ghost"
            size="sm"
            :disabled="busy"
            :aria-label="closeLabel"
            @click="dismiss"
          >{{ closeLabel }}</Button>
        </header>
        <div class="eap-dialog__body">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="eap-dialog__footer">
          <slot name="footer" />
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style src="./dialog.css"></style>
