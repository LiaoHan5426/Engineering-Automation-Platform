import { defineConfig } from 'vite-plus'
/** Build the Timeline Host and browser entry points. */
import { clientBundle } from '../../client/pack.client.ts'

export default defineConfig({
  pack: clientBundle(import.meta.dirname, ['lib/types/index.js'], { hostPhase: true })({ env: process.env })
})
