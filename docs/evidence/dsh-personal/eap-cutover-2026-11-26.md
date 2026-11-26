# EAP 宿主切换状态（2026-11-26）

生产 Web 通过 `DshBootHost.vue` 调用 `@eap/plugin-runtime` 的过渡宿主。启用状态以 py-backend 的贡献清单为准，模块依赖使用过渡宿主既有解析器。插件同步串行处理，卸载时回收已挂载贡献。

`__DSH_BOOT__` 注入 fixture 在独立 `dsh-boot-verify` 工作区验证。生产 Web 构建已移除 fixture 注入和虚拟脚本 URL。真实 `AppWebEntry` 与 `ui-*` 依赖闭包通过真实 Host 门禁后，才切换生产入口并退役过渡宿主。

## 验证

- **passed**　L2 及 Boot 注入共 7 项。过渡宿主测试会从工厂解析 React 和 UI primitives，覆盖本次加载回归。
- **passed**　前端类型检查、生产构建。
- **passed**　隔离 Vite + py-backend + Chromium 实际安装并加载本机 dsh-better-sidebar 0.31.1，后端停用后刷新确认宿主不再挂载插件。
- **unverified**　真实 `AppWebEntry` 与 py-backend 联合浏览器验收，以及目录、预览、主题、Git 和插件卸载的完整对照。
