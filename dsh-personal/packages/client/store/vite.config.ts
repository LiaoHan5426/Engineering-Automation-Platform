import { defineConfig } from 'vite-plus'
import { staticLinked } from '../pack.client.ts'

export default defineConfig({
  pack: staticLinked(
    import.meta.dirname,
    ['lib/types/index.js'],
  )({ env: process.env })
})
