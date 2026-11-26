# EAP Boot baseline (Slice A)

**Date:** 2026-11-26
**Kind:** reference / fixture assembly evidence — **not** real py-backend Host acceptance.

## Version pins

| Pin | Value |
| --- | --- |
| EAP HEAD (record start) | `31f2ec05` |
| dsh-personal tree introduce | `0c55ad24` |
| Accepted upstream B | `39163dd30f703a79079e2d2446545cff3c453738` |
| Pending U | `ca33fd6843b205e279c7ccb6cb73a472c78f5760` (not promoted) |
| Fixture plugin | `dsh-better-sidebar@0.31.1` |

Sources: `dsh-personal/upstream-sync-state.json`, `dsh-personal/source-inventory.json`, roadmap §首次基线验证.

## Reference replay

| Case | Result | Notes |
| --- | --- | --- |
| Roadmap-cited `built-boot.expected.e2e.ts` + `client-plugin-live.e2e.ts` (8) | **passed** (prior record in roadmap) | Reference dsh-personal workspace; Host-injected `__DSH_BOOT__` |
| Standalone `docs/evidence/dsh-personal/validation.md` Vue migration ledger | **passed** (historical) | Explicitly does **not** establish EAP Host integration |
| Browser replay better-sidebar 0.31.1 on EAP + py-backend | **unverified** | Deferred to Slice C real-Host gate |
| This session re-run of built-boot e2e | **unverified** | Command hung with no output; killed after ~220s. Prior roadmap 8-pass record retained. | |

### Operation → contribution → Host trace (reference Host)

| User operation | Client contribution | Typical Host / remote |
| --- | --- | --- |
| Enable plugin | plugin manager / enablement UI | Host pluginManager Remote (reference); EAP: py-backend install/enable |
| Dock right sidebar | `ui-sidebar-right` | layout state client-local; content via remotes |
| Settings modal | `ui-settings*` | `settings.get` / `settings.update` |
| Expand directory | better-sidebar / files tree | `fs.tree` / `fs.trees` |
| Open file preview | document preview tab | `fs.read` |
| Git status / diff | better-sidebar Git UI | `git.status`, `git.diff`, … |
| Round files (本轮文件) | changes view | `changes.ops` (EAP Host: implement in Slice C) |

## EAP vs reference differences (checklist for later gates)

| Topic | Reference (dsh web) | EAP today (pre-cutover) |
| --- | --- | --- |
| Boot | `__DSH_BOOT__` via Host | `@eap/plugin-runtime` island shim |
| Directory → preview | new preview tab, tree remains | must match after Boot path |
| Close file tab | returns to tree | must match |
| Git content region | full diff in sidebar | Host methods present; browser **unverified** |
| Official DeepSeek account UI | present in web-app patch | must stay excluded in EAP overlay |

## Slice B fixture (this session)

| Check | Result |
| --- | --- |
| `@eap/dsh-boot` unit tests | **passed** |
| Browser `http://127.0.0.1:5200/` dsh-boot-verify | **passed** — `__DSH_BOOT__.rev: fixture-slice-b`, entries 8, batches 2 |

## Import manifest

See `eap-import-manifest.json` in this directory.

## Slice B fixture

Slice B adds `@eap/dsh-boot` and the `dsh-boot-verify` dev app. **Fixture injection** (`composeFixtureGraph` + `eapDshBoot({ mode: 'fixture' })`) is the assembly proof path: it validates Host-style index rows (`bootInjections`, `__DSH_BOOT__`, `__DSH_BOOT_READY__`) without requiring a full dsh-personal compose at Vite dev time. When client build artifacts and Host composition are linked, the production path uses the real composed `WebBootGraph` plus py-backend `uiClients` merge (`live` mode); that gate is not fixture acceptance.


### 独立 Vite 入口的参考侧接线

- **passed**　Chromium 经本地参考 Host 获取真实 HTML，独立 Vite 入口加载同一构建的浏览器产物。观测到启动清单 76 项，Vue 壳渲染「新建会话」按钮。
- **passed**　启动文档与 RPC 代理保留同一浏览器 HTTP authority，修复 settings、inventory、modelCatalog 等启动 RPC 401。Chromium 首次认证及去掉 token 后刷新均通过，观察窗口内无请求错误。
- **unverified**　同版本 better-sidebar 的完整参考侧回放、真实 py-backend 启动和正式入口切换。

### Better Sidebar 0.31.1 参考配置

- **passed**　临时 `DSH_HOME` 内通过官方安装命令离线安装本机 0.31.1。临时 Git 仓库用作工作目录。Chromium 首屏启动清单包含该包，右栏可打开。
- **failed**　Chromium 的启动审计报告 0.31.1 未激活：`require("react") missed the module table`。插件资源请求成功，启动清单的该条目没有 `external` 声明。其客户端产物直接引用 React、React DOM 和 JSX runtime，当前 dsh-personal Vue seed 未提供这些模块。目录、预览、Git 和卸载仍待验收。
- **passed**　从 0.31.1 实际客户端确认 `changes.ops` 调用以 `afterSeq` 取增量并读取 `events`、`lastSeq`。EAP 的 Host 测试已改为验证该形状、会话隔离和游标。现有投影来自工作区文件写入，Agent 轮次日志仍待接入。

### React 插件在真实 Vue Boot 中的隔离实验

- **passed**　Chromium 在 `reference-react` 模式下激活 0.31.1，显示原生「开始」中的插件入口，点击后创建「文件」标签，显示插件搜索、刷新和上传控件。React 模块表、仅对该插件使用的 React 原语，以及声明并传递 tab hooks 和数据的 Vue 席位包装都已接线。
- **failed**　参考会话中文件页显示 `default-workspace HTTP 400`，`agent-opens` 和 `fs-watch` WebSocket 未完成握手。「开始」的插件图标仍有 `[object Object]`。
- **unverified**　实际目录展开、文件预览、Git、页面内实时卸载，以及真实 py-backend 和生产切换。本次仅使用独立入口。
