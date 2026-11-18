import { defineConfig } from 'vite-plus'
import { clientBundle } from '../pack.client.ts'

export default defineConfig({
  pack: clientBundle(
    import.meta.dirname,
    ['lib/types/index.js'],
    {
      lib: {
        copy: [{
          from: 'src/styles/{brand-font.css,montserrat-*.woff2,Montserrat-OFL.txt}',
          to: 'lib/styles',
        }],
      },
    },
  )({ env: process.env })
})
