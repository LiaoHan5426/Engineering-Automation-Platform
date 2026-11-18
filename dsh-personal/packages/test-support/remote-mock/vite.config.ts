import { defineConfig } from 'vite-plus'
import { clientLibrary } from '../../client/pack.client.ts'

export default defineConfig({
  pack: clientLibrary(
    import.meta.dirname,
    ['lib/types/index.js'],
  )({ env: process.env })
})
