# Internal frontend configuration

This directory contains shared, non-runtime configuration for the frontend workspace. TypeScript policy is defined in `tsconfig/base.json`; package-level configs may only add project references, includes, and build-specific settings.

Formatting and linting policy is centralized in the workspace-root `vite.config.ts` and is executed through Vite+ (`vp fmt`, `vp lint`, `vp check`).
