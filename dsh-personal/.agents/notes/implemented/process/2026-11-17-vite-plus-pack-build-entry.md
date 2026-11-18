# Agent Note: One Vite+ Pack entry for workspace builds

Status: implemented

English | [中文](2026-11-17-vite-plus-pack-build-entry.zh.md)

## Problem

Package builds, watchers, and fixtures need the same configuration and dependency boundaries. A second configuration loader can change default inheritance: a package declaring one entry can accidentally gain the root entry glob. Browser bundles also need stricter external rules than Node packages because their loader supplies only declared module identities.

## Decision

Vite+ 1.7.0 owns the build entry. Package configuration lives in `vite.config.ts` under `defineConfig({ pack: ... })`; commands use `vp pack`, and programmatic consumers import from `vite-plus/pack`. The [root configuration](../../../../vite.config.ts) expands package options into one array. The [shared reader](../../../../scripts/pack-config.ts) uses Vite’s native loader; the root attaches package working directories and disables secondary config and workspace discovery.

Root defaults fill missing options. Explicit package options, including `entry` and `format`, replace the corresponding defaults as a whole. Only `plugins` arrays append the default plugins after package plugins. This preserves explicit entries and prevents duplicate ESM builds from concatenated format arrays.

An empty-string `entry` is a repository-level disabled-face marker. After applying defaults, the root filters out every configuration whose `entry` is `""` before submitting the array to Pack. Pack treats an empty string as a missing entry and discovers `src/index.ts`; passing the marker through would let the Client pass rebuild Host-only packages without Host decorator lowering and overwrite their Host output.

Host and Client run in separate processes selected by `DSH_BUILD_FACE`. Package configs evaluate helpers before exposing objects or arrays in `pack`, so native module caching cannot retain a Host selection for a later Client invocation. Desktop bundling follows Host output; Client compilation follows those bundles because split compiler faces rewrite shared compiler output.

The [client preset](../../../../packages/client/pack.client.ts) uses explicit `deps.neverBundle` and `deps.alwaysBundle` policies. Node production dependencies stay external. Browser requests supplied by the loader stay external; other admitted dependencies inline. Purity checks still reject undeclared cross-module imports: switching bundlers permits neither duplicate shared runtime identities nor browser `require` calls that the loader cannot satisfy.

The build API returns an object containing `bundles`. Watchers and fixtures consume `(await build(options)).bundles`; output inspection and watcher lifetime handling operate on those bundle records, not on the outer result as an array.

## Alternatives considered

Keeping two configuration sets would split ownership between development, tests, and artifacts. Implicit workspace discovery would hide inheritance and working-directory behavior in another loader. Evaluating both faces in one cached module graph would make phase selection depend on import order. The explicit reader and process boundary keep these contracts visible at their owning call sites.

## Consequences

Developers migrate filenames, commands, and build result access with the [upgrade guide](../../../../docs/upgrade-guide/v0.2.2-rc.3/vite-plus-pack-config/guide.md). Native loading requires Node TypeScript stripping. Explicit dependency policies preserve runtime identities and require cross-module imports to follow the manifest and loader contract.

The [artifact/check split](2026-10-11-build-artifacts-check-split.md) and [shell/dynamic-package boundary](../architecture/2026-08-15-client-shells-and-dynamic-packages.md) remain active: this note changes bundler integration, not their scheduling or ownership rationale. Neither decision is fully superseded.

## Verification

Focused migration checks passed during integration. `node --import tsx scripts/verify-package-dependencies.ts` passed for 101 packages. These are bounded results; they do not establish a completed full repository build.
