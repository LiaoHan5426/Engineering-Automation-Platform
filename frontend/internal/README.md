# Internal frontend configuration

This directory contains shared, non-runtime configuration for the frontend workspace. TypeScript policy is defined in `tsconfig/base.json`; package-level configs may only add project references, includes, and build-specific settings.

Formatting and TypeScript/Vue linting policy is centralized in the workspace-root `vite.config.ts` and is executed through Vite+ (`vp fmt`, `vp lint`, `vp check`). CSS linting is provided by the reusable `@eap/stylelint-config` package under `internal/stylelint-config` and can be run with `pnpm stylelint` from the frontend workspace.
