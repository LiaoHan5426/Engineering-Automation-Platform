# 消息总线（Notify Bus）

状态：2026-11-26 已实施薄 MVP（silent REST + 常驻 SSE + WebSocket）。

## 1. 问题

存活探测与轮询共用 axios pending → NProgress 被刷。应用缺少统一的会话徽标 / toast / 横幅 / 对话框通道。py-backend 仅有按次聊天 turn SSE，没有站外推送。

## 2. 决策

- **单一权威事件**：`NotifyEvent`（`protocolVersion: "1"`），合同在 `@eap/runtime-client` 的 `contracts/notify.ts` 与 `py-backend/app/domain/notify.py` 对齐。
- **非法 `kind` / `severity` / `surface` 严格拒绝**，不映射业务 UNKNOWN。
- **三条运输通道扇出同一 Hub**：`GET /api/notify/stream`（SSE）、`WS /api/notify/ws`、`GET /api/notify/snapshot`（silent REST 补拉）。聊天 turn SSE 保持独立，不混流。
- **NProgress**：仅非 `silent` 的 axios 计入 `@eap/request` pending。health / probe / notify snapshot 默认 `silent: true`。SSE/WS 不走 pending。
- **UI 出口唯一**：应用壳 `NotifyHost` + 会话列表徽标。本切片不接入 Cordis `workspace.toast` 双轨。
- **surface 派生**：由 `kind`+`severity` 固定规则生成（`surfacesFor`），调用方不得另写映射。`probe` 无 toast/banner。

## 3. 生产者（第一期）

| 来源 | kind | 说明 |
|---|---|---|
| 前端 `runtimeLiveness` 边沿 | probe | 本地 publish；不弹 toast |
| Chat 终端态 SUCCEEDED/FAILED/UNKNOWN | session | Hub publish；聚焦会话由客户端抑制徽标/toast |
| 插件安装失败 | system | Hub publish → banner + dialog |

## 4. 前端路径

`startNotifyClient`：silent snapshot → 并行 WS + SSE；按 `eventId`/`sequence` 去重；可见性恢复再 snapshot。

## 5. 验证

- `@eap/request` silent 单测；py-backend `tests/test_notify.py`；域合同脚本不要求 Java 对称枚举（本域仅 py + runtime-client）。
- Mock：`backend-mock` 提供 snapshot / SSE / WS upgrade。
