import { defineConfig } from 'vite-plus'

/** The Node provider and its private process bootstraps are published bundles. */
export default defineConfig({
  pack: [
    { entry: ['lib/types/index.js', 'lib/types/configuration.js'], outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024', fixedExtension: false, dts: false, clean: false },
    { entry: { process: 'lib/types/process-entry.js' }, outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024', fixedExtension: false, dts: false, clean: false, deps: { alwaysBundle: ['@deepseek-ai/dsh-subprocess/control', 'acorn', 'acorn-walk', 'birpc'] } },
    { entry: { 'persistent-process': 'lib/types/persistent-process-entry.js' }, outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024', fixedExtension: false, dts: false, clean: false, deps: { alwaysBundle: ['@deepseek-ai/dsh-subprocess/control', 'acorn', 'acorn-walk', 'birpc'] } },
  ]
})
