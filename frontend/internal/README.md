# Internal frontend configuration

This directory contains shared, non-runtime configuration for the frontend workspace. TypeScript policy is defined in `tsconfig/base.json`; package-level configs may only add project references, includes, and build-specific settings.

Formatting and TypeScript/Vue linting policy is centralized in the workspace-root `vite.config.ts` and is executed through Vite+ (`vp fmt`, `vp lint`, `vp check`). CSS linting is provided by the reusable `@eap/stylelint-config` package under `internal/stylelint-config` and can be run with `pnpm stylelint` from the frontend workspace. That config allows kebab-case/BEM workspace-wide and requires `eap-*` BEM under `packages/ui`. Point the Stylelint VS Code extension at `${workspaceFolder}/frontend/stylelint.config.mjs` with `stylelint.cwd` set to the frontend workspace (see repo `.vscode/settings.json`) so IDE diagnostics match CI and nested packages do not resolve the config path relative to themselves.
