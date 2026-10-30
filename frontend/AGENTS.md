# Frontend guidance

- Retain Vue 3, TypeScript, Vite+, Tailwind and pnpm workspace (`packageManager` currently pnpm 12.9.0). Reuse `@eap/ui`, `@eap/style`, `@eap/runtime-client` and existing feature managers.
- **UI / 共享模块落点（强制）**：先读并遵守 [`docs/decisions/frontend-ui-shared-module-boundaries.md`](../docs/decisions/frontend-ui-shared-module-boundaries.md)。所有基础组件先在 `@eap/ui` 定义并导出；禁止在 `features/*` 平行实现 Button/Dialog/Confirm 等壳。可复用组合件与 `hooks` / `effects` / `layout` / `toggle` / `plugin` 等按该文档分层与暂存登记落点；未满足抽包条件不得擅自新增含糊包名。交付说明须勾选：已搜索现有原语 → 判层 → 写入位置 → 文档/暂存是否更新 → boundaries/相关测试结果。
- **`vite-plugin-vue-mcp`（可选运行时）**：默认关闭；`EAP_VUE_MCP=true` 的 `vp dev` 才提供 `/__mcp/sse`（见上述决策 §8）。用于组件树/高亮/状态观测，**不能**替代落点规范或 `check:boundaries`。未开浏览器会话时不要把 MCP 工具失败报成实现缺陷。
- From repository root use `rtk proxy pnpm --dir frontend typecheck`, `rtk proxy pnpm --dir frontend test run`, `rtk proxy pnpm --dir frontend build`, and `rtk proxy pnpm --dir frontend check:boundaries`; these scripts exist in `frontend/package.json`. Report execution results, not script existence, as evidence.
- Avoid adding domain state/API orchestration to `App.vue`. Extract only where the approved slice requires it; do not install all candidate UI/state libraries.
- Target workbenches use trusted bundled Manifest/Registry contributions, instance configuration and explicit grants. This is a target contract, not a statement that Plugin SDK/Registry already exists. Obtain approval before that migration.
- Preserve expert/knowledge/CLI/MCP/rule management. Mock navigation or timers must be labeled and never reported as background execution.
- Builder uses GrapesJS for editing and versioned semantic Schema/component mappings for Vue preview and controlled delivery. HTML/CSS export is not maintainable Vue source. Preserve both editor project data and semantic data; reject unknown mappings.
- Prototype acceptance requires manual design without AI, visible button/state changes, save/reopen, real interactive preview and documented mock boundaries. Production handoff additionally requires target repository authorization, diff, build/tests and human acceptance.
- Keep renderer access bounded; Electron integration is a later approved phase. New product text follows existing i18n conventions.
