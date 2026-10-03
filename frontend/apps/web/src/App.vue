<script setup lang="ts">
import { ref } from 'vue'
import { StatusCard } from '@eap/ui'

const status = ref('Ready')
</script>

<template>
  <main>
    <h1>Engineering Automation Platform</h1>
    <p>Deterministic-first developer agent runtime.</p>
    <StatusCard :status="status" />
  </main>
</template>
