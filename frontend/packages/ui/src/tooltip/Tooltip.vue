<script setup lang="ts">
import { TooltipProvider, TooltipRoot, TooltipTrigger } from "reka-ui";
import TooltipContent from "./TooltipContent.vue";
withDefaults(defineProps<{ text: string; delay?: number; side?: "top" | "right" | "bottom" | "left"; teleportTo?: string | HTMLElement }>(), { delay: 300, side: "top", teleportTo: "body" });
</script>
<template>
  <TooltipProvider :delay-duration="delay">
    <TooltipRoot>
      <TooltipTrigger as-child><slot /></TooltipTrigger>
      <TooltipContent :side="side" :teleport-to="teleportTo">{{ text }}</TooltipContent>
    </TooltipRoot>
  </TooltipProvider>
</template>
<style src="./tooltip.css"></style>
