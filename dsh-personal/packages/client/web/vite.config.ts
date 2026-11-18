import { defineConfig } from 'vite-plus'
import { clientShell } from '../pack.client.ts'

export default defineConfig({
  pack: clientShell(
    import.meta.dirname,
    ['lib/types/index.js', 'lib/types/apply-injections.js'],
  )({ env: process.env })
})
