# Frontend guidance

短表。细则外链，避免把操作手册塞进每次必读提示。

## 硬约束

- 栈：Vue 3、TypeScript、Vite+、Tailwind、pnpm workspace。安装/开发/构建/检查用 `vp`，不直接 `pnpm`。
- **UI 落点**：基础组件只进 `@eap/ui`；禁止在 `features/*` 平行造 Button/Dialog/Confirm。分层与暂存登记见 [`docs/decisions/frontend-ui-shared-module-boundaries.md`](../docs/decisions/frontend-ui-shared-module-boundaries.md)。登记仅首次引入原语/类别时做一次。
- **测试目录**：包根 `__tests__/`（与 `src/` 同级）；禁止在 `src` 散放 `*.test.*`。规范见 [`docs/decisions/frontend-test-layout.md`](../docs/decisions/frontend-test-layout.md)；资产收敛见 [`docs/decisions/test-asset-convergence.md`](../docs/decisions/test-asset-convergence.md)。
- **包边界**：只依赖已声明包的公开 `exports`；检查在 `frontend/scripts/vsh`。新增检查先补本包测试；不用忽略名单掩盖违规。
- Mock 只在 `apps/backend-mock`；生产 `src` 不得导入该包或按模拟环境分支。
- `@eap/request` 无业务端点/默认鉴权地址；业务 DTO/错误/SSE/PluginApi 在 `@eap/runtime-client`（插件启停与 Host API 仍只打 py-backend）。`@eap/plugin-runtime` 的上下文在 `shellContext.ts`，座位注册表在 `slotRegistry.ts`，由壳声明。不加载 Cordis、`ui-renderer`、`ui-sidebar-right`。插件 `./client` 在壳声明之后加载。工作区权威是 py-backend `workspace_root` + Host `session.cwd`，**禁止** EAP Cordis profile。Remotes：`session`/`settings`/`workspaceFiles`（fs.* 映射）只代理 py-backend。Vue 壳只让列（`#eap-cordis-sidebar-right`）+ sync。页面禁止 `Button variant="custom"`、用原生元素假装控件、硬编码宿主色。
- 跨路由交付须核对真实宿主路由与资源加载；禁止凭页面名猜 URL。

## 验证（按 §3.6，不默认全跑）

从仓库根：`rtk proxy vp -C frontend run typecheck`、`test run`、`build`、`run check:boundaries`。级别见 [§3.6](../docs/architecture-method.md#sec-3-6-verify)。

- **默认单测**：Vite+ / happy-dom；不启用 Playwright browser provider，不因普通 UI 任务安装驱动。
- **浏览器**：仅 T2+ 且触及关闭/未保存/焦点/授权/恢复等交互时强制真实浏览器；T1 外观用一张受影响页截图即可。`__tests__/browser/*-live.mjs` 按需跑；`*-visual.mjs` 不纳入默认链路、不新增（见收敛决策）。
- 报告执行结果，不报告「脚本存在」。无浏览器能力时如实标 unverified。

## 产品边界（摘要）

- 复用 `@eap/ui` / `@eap/style` / `@eap/runtime-client` / `@eap/plugin-runtime` 与既有 feature managers；避免把领域编排堆进 `App.vue`。
- 管理页：列表→详情 / 子页 / Tabs / Dialog/Drawer；长文与完整诊断不无条件铺列表。
- Builder：GrapesJS 编辑 + 版本化语义 Schema；HTML/CSS 导出不是可维护 Vue 源。
- 子页保存后自行读回；通知父页时勿重载编辑器清掉草稿/弹窗。
