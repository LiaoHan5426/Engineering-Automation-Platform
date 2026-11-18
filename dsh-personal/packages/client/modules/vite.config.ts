import { defineConfig } from 'vite-plus'
import { clientBundle } from '../pack.client.ts'

export default defineConfig({
  pack: clientBundle(
    import.meta.dirname,
    ['lib/types/index.js'],
  )({ env: process.env })
})
