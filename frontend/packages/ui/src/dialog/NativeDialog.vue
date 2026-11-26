<script setup lang="ts">
import { ref } from 'vue'

const element = ref<HTMLDialogElement | null>(null)

function setOpen(open: boolean) {
  const dialog = element.value
  if (!dialog || dialog.open === open) return
  if (open) dialog.showModal()
  else dialog.close()
}

defineExpose({ setOpen })
</script>

<template>
  <dialog ref="element">
    <slot />
  </dialog>
</template>
