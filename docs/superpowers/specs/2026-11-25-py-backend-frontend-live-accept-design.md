# 设计：py-backend 前端 live accept

**日期：** 2026-11-25  
**状态：** 已接受  
**切片：** 前端对 py-backend 的 live accept（shell boot + Chat SSE）  
**延伸：** [`docs/decisions/py-backend-thin-mvp.md`](../../decisions/py-backend-thin-mvp.md)、[`docs/decisions/py-backend-agent-architecture.md`](../../decisions/py-backend-agent-architecture.md)

## 背景

Vue 控制台在非 `--mode mock` 时，默认已将 `/api` 与 `/sidebar` 代理到 `http://127.0.0.1:8080`。py-backend 侧目录与 Chat 路由已补到足以让单测通过（35 项）。thin-mvp 决策里 **frontend live accept** 仍标为 unverified。此前浏览器侧曾见外壳「已连接」，但 Chat 发送因 `not_configured` 保持禁用。

本切片用真实模型调用关闭该验收缺口，不使用离线假流。

## 目标（单一验收出口）

在非 mock 的 Vite 会话、指向正在运行的 py-backend 时：

1. Shell 刷新对 `health`、`capabilities`、`databases`、`experts`、`tasks`、`stats` 成功（这些键无错误横幅）。
2. Chat 能开会话，并以 `toolMode=none` 对真实 OpenAI 兼容模型完成一轮 SSE。
3. 留下证据；`py-backend-thin-mvp.md` 将 live-accept 从 unverified 改为 verified（注明日期与边界）。

## 非目标

- MCP `tools/list` / `tools/call` 生产路径
- 消息 edit / regenerate 分支
- Board、SQL 分析、knowledge FTS、Java 双跑
- 巡检每一个管理页
- 改动 mock 宿主（`dev:mock` → `:53200`）或另造一套 API 方言
- 提交密钥，或在日志/文档中打印 API Key

## 架构

本验收只认一条生产路径：

| 层 | 职责 |
|---|---|
| `frontend/apps/web`（默认 `vp dev`） | 将 `/api`、`/sidebar` 代理到 `127.0.0.1:8080` |
| `@eap/runtime-client` | 同一套 HTTP/SSE 词汇；`VITE_API_URL` 默认为 `/api` |
| `py-backend` | Chat + 目录 + 插件 Host 权威 |

本验收不引入第二套 Chat 后端。Mock 仍是 UI 测试的显式旁路，不是验收宿主。

### 模型凭证

优先使用 `.eap/config/model-connections.json` 中已有连接（界面「模型设置」）。若无已启用连接，`ConnectionStore.effective()` 会回退到 `py-backend/.env` 的 `EAP_MODEL_*`。验收使用任一已能给出 `secret_present` 的路径，不另开平行密钥通道。

在 `GET /api/ai/status` 报 `not_configured` 时，Chat 发送保持禁用。该诚实性不变；验收不得伪装已就绪。

## 步骤

1. 确认 py-backend 以当前代码监听 `127.0.0.1:8080`。
2. 确认前端以非 mock 运行（`vp` / `vpr` `dev`，不是 `--mode mock`）。
3. 确认可用模型密钥：界面连接，或 `.env`（`EAP_MODEL_API_KEY` + base URL + 默认模型）。
4. 浏览器：打开控制台 → 刷新 shell → 断言上述 boot 键成功。
5. 浏览器：进入 Chat → 开会话 → 发送一条短消息（`toolMode=none`）→ 观察 SSE 最终回答，以及 graph 中含助手节点。
6. 仅修复阻挡第 4–5 步的合同缺口（被调用路由的 404 或非法形状）。不扩大到延期域。
7. 更新 thin-mvp 验收表述；若 README 仍写 unverified，一并对齐。
8. 在 `py-backend` 下重跑 `pytest -q`（须保持全绿）。

## 错误处理

- 网络/进程不可用 → 记验收失败；重启宿主；不削弱前端防护。
- `not_configured` → 停下，请操作者补连接或写 `.env`；本切片不启用离线回复。
- 供应商/鉴权失败 → 记模型腿验收失败；若 shell boot 已通过，可单独标明。
- boot 或 Chat 路径出现意外 404 / 形状不符 → 在 py-backend 修复（仅当客户端违反已接受合同时才改客户端）；非琐碎修复时补或扩一条定向 pytest。

## 测试与证据

| 检查项 | 方式 |
|---|---|
| Shell boot | 浏览器网络或 UI：六项 boot 键无错 |
| Chat SSE | 浏览器：一轮完成，可见助手正文 |
| 回归 | `py-backend` `pytest -q` |
| 决策 | thin-mvp 验收句更新日期，并注明「真模型，toolMode=none」 |

证据可为浏览器观察笔记（状态文案、会话 id、执行状态）。勿把密钥或完整模型原文写入仓库。

## 验收范围外（仍延期）

调用 board / SQL / edit / regenerate / MCP 协议的页面或动作仍可能 404 或拒绝。本切片 live accept 不要求它们。若在 Chat 路径上碰到，仅记为后续跟进。
