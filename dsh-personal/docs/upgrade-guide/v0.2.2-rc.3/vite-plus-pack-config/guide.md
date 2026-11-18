---
kind: upgrade-guide
description: "Move developer build integrations to Vite+ Pack configuration and result APIs."
---

# Vite+ Pack replaces standalone bundler configuration

English | [中文](guide.zh.md)

## Change

Developers maintaining repository forks or build integrations use `vite.config.ts` with Vite+ 1.7.0 `pack` options instead of `tsdown.config.ts`. The command is `vp pack`; the client preset is `packages/client/pack.client.ts`. Programmatic builds return an object with `bundles`.

## Migration

1. Rename package `tsdown.config.ts` to `vite.config.ts`, import `defineConfig` from `vite-plus`, and wrap options in `defineConfig({ pack: options })`. Evaluate phase helpers before assigning `pack`; the client form is `defineConfig({ pack: clientBundle(import.meta.dirname, entries)({ env: process.env }) })`.

2. Replace standalone bundler commands with `vp pack`, preset imports with `packages/client/pack.client.ts`, and build/type imports with `vite-plus/pack`. Read `(await build(options)).bundles` in output and watcher consumers.

3. Use `pnpm run build:artifacts` for the complete artifact pipeline. It selects `DSH_BUILD_FACE` in independent Host and Client processes. Keep explicit package options: `entry`, `format`, and other declared values replace root defaults as a whole; only `plugins` arrays append defaults after package plugins. This prevents duplicate ESM builds. Treat `entry: ""` as a disabled face: filter it out after inheriting defaults and before calling Pack. Passing it to Pack triggers source-entry discovery and can overwrite Host output during the Client pass. Preserve external runtime dependencies and the browser loader request list; do not rely on implicit dependency bundling.

4. Run `pnpm run build:artifacts` and confirm the expected package output under `lib/`, then run `node --import tsx scripts/verify-package-dependencies.ts`. See the [decision record](../../../../.agents/notes/implemented/process/2026-11-17-vite-plus-pack-build-entry.md) for configuration inheritance and module boundaries.
