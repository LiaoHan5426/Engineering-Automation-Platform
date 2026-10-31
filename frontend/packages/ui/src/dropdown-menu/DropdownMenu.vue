<script setup lang="ts">
import { DropdownMenuRoot, DropdownMenuTrigger, DropdownMenuPortal, DropdownMenuContent, DropdownMenuItem } from "reka-ui";
import type { MenuAction } from "./types";
defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{ label: string; items: MenuAction[]; align?: "start" | "center" | "end"; teleportTo?: string | HTMLElement }>(), { align: "end", teleportTo: "body" });
const open = defineModel<boolean>("open", { default: false });
defineEmits<{ select: [id: string] }>();
</script>
<template>
  <DropdownMenuRoot v-model:open="open" :modal="false">
    <DropdownMenuTrigger as-child><slot /></DropdownMenuTrigger>
    <DropdownMenuPortal :to="teleportTo">
      <DropdownMenuContent v-bind="$attrs" class="eap-dropdown-menu" :aria-label="label" :align="align" :side-offset="4" :collision-padding="8" loop @escape-key-down="$event.stopPropagation()">
        <DropdownMenuItem v-for="item in items" :key="item.id" as-child :disabled="item.disabled" :text-value="item.label" @select="$emit('select', item.id)">
          <button type="button" class="eap-dropdown-menu__item" :data-destructive="item.destructive || undefined" :data-testid="item.testId" :disabled="item.disabled" :title="item.description">{{ item.label }}</button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
<style src="./dropdown-menu.css"></style>
