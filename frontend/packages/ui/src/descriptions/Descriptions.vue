<script setup lang="ts">
defineProps<{ items: ReadonlyArray<{ key: string; label: string; value?: string | number }> }>();
</script>
<template>
  <dl class="eap-descriptions">
    <template v-for="item in items" :key="item.key">
      <dt class="eap-descriptions__label">{{ item.label }}</dt>
      <dd class="eap-descriptions__value"><slot :name="item.key" :item="item">{{ item.value ?? "—" }}</slot></dd>
    </template>
  </dl>
</template>
<style src="./descriptions.css"></style>
