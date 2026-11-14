# 聊天核心重构与 DSH client 扩展验证

日期：2026-11-14。状态：B/C/D/E 与新增浏览器 client 已实现并完成下述技术验证；整个 CT-02 尚未完成。语音未实现，真实模型/网页服务未验，用户接受独立。

## 范围与实现边界

本轮保留 Vue、Java/Spring AI、单 DSH 前端适配器与 EAP 原生计划。BEFORE 为 `9e7257b9fb45f138db04b6cfe57e1839c5261597`；AFTER 源码 revision 为 `0f7defa437eb516ff853965f779208f5ab644679`，浏览器捕获时的生产源码树摘要为 `53e588fb58128a1a9762555b891d2a2976e65bc34e2e1697c6392e8cf8bd570f`，见[源码清单](../evidence/chat-core-refactor/after-source-manifest.json)。

- B：公共 `@eap/ui` RichText/RichCode 支持 Markdown、代码复制/高亮、KaTeX 和手动 Mermaid。原始 HTML、远端图片及 SVG 外部资源不执行/加载；预算、过期结果及原文复制保留。Mermaid 时间预算只能丢弃超时结果，不能硬中断同步 JavaScript。
- C：[SQL 消息图](../../backend/eap-ai/eap-ai-codegen/src/main/java/com/lh/eap/ai/ChatGraphStore.java)与 [V3](../../backend/eap-applications/eap-full-application/src/main/resources/db/migration/V3__chat_message_graph.sql)保存唯一正文权威、稳定节点/operation/execution/generation 关联、revision、分支及完成回答。前端只持久化草稿/偏好/待核对操作；旧 v1 正文只读导出。完成结果跨重启可读，不等于 CT-01 推理/事件持久接管。
- D：IndexedDB 保存本机原件与共享引用。请求只显式转发已验证的原件，临时 holder 严格校验 UTF-8 文本及 PNG/JPEG/静态 WebP、摘要/数量/大小；类型化图片经过两种模型协议。原件不进入数据库、序列化诊断或共享模型记忆。实际 provider 窗口与预算使用同一材料。真实供应商识别未验。
- E：固定 approved MCP 映射、精确 schema、持久 expert grant 与执行作用域进入现有模型循环；默认无服务/关闭，缺少可信服务端 expert 身份时拒绝启用。引用只来自实际返回资料，不冒充模型原生引用。真实网页服务尚未配置和验收，抓取端网络策略需独立验。
- 插件：固定 `39163dd30f703a79079e2d2446545cff3c453738`；原 82 个摘要不变，受审清单增至 106 个文件，增加原 ui-shortcuts/ui-file-actions 浏览器 client，同一 React/Cordis 岛。无独立 DSH 宿主、Node provider、任意包执行或跨 SHA 升级完成承诺。
- F：ASR/TTS MCP 服务未指定，录音→ASR 草稿及回答→TTS 播放未实现。

共享 UI 已登记于[模块边界](../decisions/frontend-ui-shared-module-boundaries.md)；消息/附件领域仍归 Chat，业务 API/SSE 归 runtime-client，通用传输归 request。

## 实际验证

命令从仓库根运行；`vp` 为 `/home/superagent/.local/share/vite-plus/bin/vp`。下列范围不累加，不能将定向、全量、环境跳过及用户接受混为一个完成数。

| 检查 | 实际命令/证据 | 结果 |
|---|---|---|
| 前端全量 | `vp -C frontend test run`；`/tmp/ct02-frontend-tests-final.log` | exit 0，194 文件、1167 项通过；随后新增严格 404 正/负定向用例，graphSession 6 项通过，不另加进全量数字 |
| 类型 | `vp -C frontend run typecheck` | vue-tsc 与 vsh tsc 均通过；最终布局后再次通过 |
| 架构 | `vp -C frontend run check:architecture`；`/tmp/ct02-architecture-final.log` | exit 0；边界检查也通过 |
| 最终生产构建 | `vp -C frontend run build`；`/tmp/ct02-frontend-build-final.log` | exit 0，包含 SVG 标签及宿主剩余高度修复 |
| 最终布局回归 | TaskComposer.layout、ChatWorkspace.toolbar 定向 | 26 项通过；浏览器初始视口几何同时验证，无需隐藏宿主的程序滚动 |
| 领域合同 | `python3 scripts/verify-domain-contracts.py`；`/tmp/ct02-domain-contracts-final.log` | exit 0，539 个错误码及资源配对通过 |
| 后端组合 | 下列精确 Maven 命令；`/tmp/ct02-backend-complete.log` | exit 1：宿主 130 项中 120 通过、9 环境门控跳过、1 已有基线失败；不声明全绿 |
| 图持久化/执行 | ChatGraphPersistenceTest 7 + ChatGraphExecutionTest 2 | 真实隔离 H2 与 V3 DDL，9 项通过，覆盖并发、分支、精确取消、image-only、实际窗口预算、清空互斥及 journal 淘汰/重启后完成结果读回；本轮 PostgreSQL 未验 |
| 上游媒体/MCP | Surefire XML：TransientAttachmentsTest 4、McpWebChatToolTest 9、McpWebServiceTest 12 | 各 0 failure/0 error/0 skip，共 25 项定向通过，单列不与宿主结果累加；无真实供应商/外网调用 |
| 浏览器 | [最终证据](../evidence/chat-core-refactor/README.md)、[行为](../evidence/chat-core-refactor/after-browser-results.json)、[滚动](../evidence/chat-core-refactor/after-scroll-results.json) | 实际应用 1440×1000 / 390×1000、浅色，同会话/正文/草稿；最终捕获通过，业务后端由有界 HTTP 夹具替代 |

```bash
source /home/superagent/.local/env/java-maven.sh
mvn -q -f backend/pom.xml -pl :eap-full-application -am -Dtest=ChatGraphPersistenceTest,ChatGraphExecutionTest,TransientAttachmentsTest,McpWebServiceTest,McpWebChatToolTest,FullApplicationCompositionTest,AiChatApplicationTest,ChatPlanPersistenceTest,OpenAiResponsesProtocolTest,WorkingMemoryApiTest,AiConversationReconnectTest,HistorySummaryTest,EngineeringTaskFlowTest,CodeSourceAgentTest,ChatExecutionStreamTest,SkillChatTest,ExpertKnowledgeChatTest,ExpertKnowledgePersistenceTest,SkillChatPersistenceTest,CodeTaskBindingPersistenceTest,EngineeringChatServiceTest -Dsurefire.failIfNoSpecifiedTests=false test
```

唯一宿主失败为未修改断言 `AiChatApplicationTest.statusIsReadWithoutCallingTheModel`：既有 `workspacePath` 响应包含临时工作根，违反其旧隐私断言。该行为在基线亦已观察；未删断言或修改无关状态合同来换取通过。门控跳过不计为通过。更广 reactor 的既有 Windows junction 测试依赖 Windows `cmd.exe`，本轮 Linux 环境不满足。

浏览器检查实际 Markdown/代码/公式/表格、图表 A/B 标签与净化、全文/代码复制、原快捷键及下载、IME/Enter、草稿保护、延迟布局跟随/阅读暂停/回到底部及历史前插。同一消息 UUID 偏移 26→25.84375px，漂移 0.15625px，小于原 3px 阈值；先前不同 first-visible 行的 246px 比较不是产品锚点丢失证据。宿主初始 `scrollTop=0`，模型/发送按钮及快捷键均可见；原 sibling 100% 高度叠加导致的裁剪已修。

## 尚缺条件

实际多模态模型、真实网页 MCP 以及 ASR/TTS 服务的初始化、发现、调用和内容一致性未验；语音闭环未实现。需要明确服务连接、工具 schema 与对应授权后才能完成这些联调。当前成果可审阅，不将部分技术验证或完成消息图读回提升为整个 CT-02、CT-01 或用户接受完成。
