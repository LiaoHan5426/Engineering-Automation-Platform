# Frontend guidance

- Retain Vue 3, TypeScript, Vite+, Tailwind and pnpm workspace (`packageManager` currently pnpm 12.9.0). Reuse `@eap/ui`, `@eap/style`, `@eap/runtime-client` and existing feature managers.
- From repository root use `rtk proxy pnpm --dir frontend typecheck`, `rtk proxy pnpm --dir frontend test run`, `rtk proxy pnpm --dir frontend build`, and `rtk proxy pnpm --dir frontend check:boundaries`; these scripts exist in `frontend/package.json`. Report execution results, not script existence, as evidence.
- Avoid adding domain state/API orchestration to `App.vue`. Extract only where the approved slice requires it; do not install all candidate UI/state libraries.
- Target workbenches use trusted bundled Manifest/Registry contributions, instance configuration and explicit grants. This is a target contract, not a statement that Plugin SDK/Registry already exists. Obtain approval before that migration.
- Preserve expert/knowledge/CLI/MCP/rule management. Mock navigation or timers must be labeled and never reported as background execution.
- Builder uses GrapesJS for editing and versioned semantic Schema/component mappings for Vue preview and controlled delivery. HTML/CSS export is not maintainable Vue source. Preserve both editor project data and semantic data; reject unknown mappings.
- Prototype acceptance requires manual design without AI, visible button/state changes, save/reopen, real interactive preview and documented mock boundaries. Production handoff additionally requires target repository authorization, diff, build/tests and human acceptance.
- Keep renderer access bounded; Electron integration is a later approved phase. New product text follows existing i18n conventions.
