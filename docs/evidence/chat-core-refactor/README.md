# 聊天核心重构：Before / After

日期：2026-11-14。下列真实应用捕获及场景验证已完成；真实模型/MCP 服务、语音与用户接受另验，见[完整验证记录](../../records/chat-core-refactor-validation.md)。

## 相同场景与版本

BEFORE：`9e7257b9fb45f138db04b6cfe57e1839c5261597` 的真实旧应用。AFTER：本轮实现提交对应生产源码，捕获时源码树 SHA-256 为 `53e588fb58128a1a9762555b891d2a2976e65bc34e2e1697c6392e8cf8bd570f`，提交 revision 随归档补充。[清单](after-source-manifest.json)记录每个生产/配置/lock 文件摘要。

使用同一[场景](../../../frontend/apps/web/__tests__/browser/chat-core-fixture.mjs)：相同会话、问题、含 Markdown/代码/公式/Mermaid/表格的回答、未发送草稿；1440×1000 与 390×1000、浅色、reduced motion。旧应用读取 v1 history，当前应用读取偏好与 GET graph，按各自真实合同提供相同材料；没有把新 UI 冒充旧 UI。

| 内容 | Before：9e7257b | After：本轮源码 |
|---|---|---|
| 1440×1000 正文与草稿 | [Before](before-1440.png) | [After](after-1440.png) |
| 390×1000 正文与草稿 | [Before](before-390.png) | [After](after-390.png) |
| 1440×1000 消息操作 | [Before](before-actions-1440.png) | [After](after-actions-1440.png) |
| 390×1000 消息操作 | [Before](before-actions-390.png) | [After](after-actions-390.png) |

正文变成富文本后占用不同高度，主对照保持消息操作和草稿状态，滚动到对应操作区域。补充上部富文本：[1440](after-richtext-1440.png)、[390](after-richtext-390.png)；完整输入区：[1440](after-composer-1440.png)、[390](after-composer-390.png)。补充图不冒充同场景 BEFORE。

## 验证及限制

[完整命令、行为与来源](after-browser.md)、[最终主场景结果](after-browser-results.json)、[滚动及安全结果](after-scroll-results.json)保留实际请求与几何数据。最终 `finalCaptures:true`；同一消息 UUID 的前插漂移 0.15625px，低于未放宽的 3px 阈值；Mermaid A/B 标签可见且 SVG 外部资源被过滤。

原快捷键 Ctrl+/ 与 Escape、原消息下载字节、全文/代码复制、ShiftEnter 与 IME、普通 Enter、草稿/当前会话、底部跟随/暂停/回到底部均通过。初始宿主无隐藏滚动：1440 发送底部 928.86px，390 发送底部 906.86px，模型及快捷键入口都可见。

HTTP 夹具只允许当前源的受限 GET；普通 Enter 的唯一消息 POST 被明确以 409 拒绝，其他写入及外部请求均阻断，未知 GET 为 503。复制通过浏览器注入处理器验证，下载通过真实浏览器下载事件验证。本证据不证明后端业务执行、真实模型识别、实网 MCP 或用户接受；SQL 图的隔离 H2 验证与真实服务缺口在验证记录单列。
