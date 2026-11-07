# 聊天工程任务与原型到源码

2026-10-24，用户直接授权实现。未提交、未推送。这是本地工程工作台功能，不是模型供应平台；没有另建 Harness、模型协议或 Agent 工具循环。

## 使用

1. 打开 `#chat` 的折叠连接设置。新增 OpenAI 连接（`https://api.openai.com`、可用的 GPT API 模型）或 DeepSeek（`https://api.deepseek.com`、`deepseek-chat`），填写对应 API Key。支持多个连接；这不是 ChatGPT 网页账号登录或订阅 OAuth。
2. 新建会话并选择连接，切换目标需确认，旧对话不静默发送给新供应商。保存与切换本身不调用模型。
3. 输入需求，“＋引用与专家”可选择文本文件或已保存原型。最多 6 份文件，单份 16000、总计 24000 字符。选择工程、SQL 或 Vue 专家，可编辑本次指导。预装指导在 `backend/eap-runtime/src/main/resources/chat/expert-profiles.json`。原静态专家 DAG 仍保留，尚未全部迁移成聊天 profile。
4. 讨论模式输出回答；代码模式输出 1–8 个完整源码候选，展示实际目标工作区、当前/候选内容。推理强度仅对当前支持的 OpenAI 推理模型开放；DeepSeek 等使用模型默认，不伪装成已支持。
5. 勾选审阅确认，单独应用文件。只读模式在服务端拒绝应用。生成不写文件，不执行命令、不安装依赖。现有根为空时仍可生成审阅，但写入明确拒绝；需要操作者明确将已绑定工作区纳入 `eap.runtime.authorized-root`。本次不改日常授权根。
6. Builder 重开原型版本后可点“引用此版本并生成代码”。服务端按 ID 读取已保存版本，不相信客户端自报正文。普通需求无需先创建原型版本、Handoff、Mission。

## 实现边界

- 复用 Spring AI 和现有连接配置；没有给 GPT/DeepSeek 手写 HTTP 协议。模型和认证、回答质量仍需真实供应商验收，本次不调用付费模型。
- 请求引用的是用户选择的文本，不接受任意磁盘读取路径、身份或授权。候选仅允许相对源码路径，拒绝隐藏目录、路径穿越、链接逃逸及依赖声明文件。申请代码不自动授予写权限。
- 候选保存当前文件基线，应用前变化则拒绝；跨会话不能应用。候选最多 32 份、30 分钟、内存保存，重启丢失。多文件不是文件系统事务，失败时报告已写文件，不盲目回滚覆盖。避免应用时其他进程同时写同一文件。
- 写入结果是 `verification=not_requested`，不表示编译、测试或任务完成。下一步运行项目检查及 Git diff。未实现自动命令执行、提交、推送、部署或外部 Agent 接线。
- 会话发送在串行边界内读取绑定；SQL 缓存与调用固定同一连接快照，避免默认切换串分区。SQL 规则、缓存、失败回退仍属现有 SQL 业务，不应用到普通对话。

## UI 与 Vue 开发 MCP

已评估 [AI Elements Vue](https://www.ai-elements-vue.com/) 及 [shadcn-vue 接替模式](https://www.shadcn-vue.com/docs/ai-elements)。本次采用消息、输入、上下文标签、代码审阅的组合方式，继续复用 `@eap/ui`，没有为聊天 UI 引入第二套模型请求 SDK 或整体替换组件库。

web 包新增开发依赖 `vite-plugin-vue-mcp` 0.3.2，默认关闭。仅开发时设置 `EAP_VUE_MCP=true` 才启用，绑定 `127.0.0.1`，不自动修改 Cursor 配置，生产 build 无端点。连接地址为 `http://127.0.0.1:<port>/__mcp/sse`。

已真实验证 MCP 初始化、工具发现、读取组件树、读取 TaskComposer 状态、将引用菜单展开。它提供运行状态观察/编辑，不自动把状态变成源码，也不替代业务授权。开发状态可能包含表单值；输入真实凭据时保持 MCP 关闭。本次没有读取凭据组件或通过 MCP 发送/写仓库。

## 验证与保留项

- 后端：`rtk proxy mvn -f backend/pom.xml clean test package` 通过，257 项执行：252 通过、0 失败、5 条件跳过；真实数据库、CLI 集成、模型等五个门控保持关闭。
- 前端：`pnpm --dir frontend typecheck`、`test run`、`check:boundaries`、`build` 通过；17 个测试文件、70 项通过。
- `EngineeringTaskFlowTest` 验证专家、文件和保存原型进入公开 Fake ChatModel，返回源码候选，经独立确认写到测试临时工作区；覆盖只读、空根、用户修改保护、跨会话和路径拒绝。
- 浏览器实际切换任务模式和专家、展开引用菜单；没有发送真实付费请求。角色 JSON 最初被旧专家扫描器误识别，启动检查发现后已移到独立 `chat/` 资源目录。
- 代码同步到 F: IDEA 检出后，8080 状态为 disabled，新上下文消息返回 503 / AI_NOT_CONFIGURED，未调用模型。浏览器读取到了原有两份真实保存的结算页版本，并可选为任务上下文；日常授权根不变。
- 原 Builder 隔离数据库验收仍是独立未完成项；本切片不以它为普通需求入口的前置。真实 GPT/DeepSeek、生成代码在用户项目的构建/测试及外部 Agent 委派仍未验证，不因离线测试就宣称完成。

## 会话历史与管理（2026-10-24）

对话页提供会话列表、切换、重命名、归档/恢复和删除确认。正文、标题、草稿及模型绑定标识保存在当前浏览器来源的 localStorage（eap.chat.history.v1），不保存模型密钥，不将附加文件作为历史配置持久化。它不是服务端审计或跨设备同步。清理浏览器数据会丢失这些历史。旧页面仅驻留内存且已丢失的正文无法补回。

切换通过 GET /api/ai/conversations/{id} 确认服务端会话是否有效，并恢复该会话自己的草稿与绑定；服务端超时或重启后，本地正文仍可查看，但不能宣称模型上下文恢复，也不自动重建或重发。归档只隐藏最近列表入口，不延长服务端记忆寿命。

确认删除后，DELETE /api/ai/conversations/{id} 清理对应服务端会话及其 ChatMemory，再删除本地正文和草稿；忙碌会话拒绝删除。删除不级联交接、Mission 或仓库文件。前端正在生成时禁止归档/删除。历史存储失败有可见提示，不报告已持久保存。

## 会话失效与显式重试（2026-11-05，实现与离线回归通过）

旧“只可查看历史，请新建会话”将模型调用失败、暂时离线与服务端会话丢失混在一起，导致重启后原草稿无法继续。新合同保留“不自动重建/重发”，但不能据此永久锁死用户：

- 模型返回失败而会话仍有效：原会话可编辑草稿并重试，不新建会话、不替换模型。
- 暂时无法检查会话：允许重新检查连接，不把网络错误或无关404永久标成会话丢失。
- 确认会话丢失：显式提供重新连接/重新连接并重试，确认对话框说明服务端模型记忆将从空开始，本地历史不自动重放；无草稿时只重连，不发送空请求。
- 重连保留本地会话ID、项目关联、正文、草稿、附件/指引、模型选择与工作面状态，不另造一条用户会话。服务端仅在会话缺失时重建同ID空会话；已有会话不清空记忆/绑定，忙碌时拒绝。新会话不自动使用当前全局默认模型，先显式绑定用户选中的原目标；不可用时允许用户选择但不静默降级。
- `POST /api/ai/conversations/{id}/reconnect`严格接收`{confirmContextReset:true,expectedWorkspaceLabel:<原会话标签>}`；重建前核对当前进程工作区标签，不信任浏览器路径或悄悄换仓库。工作区变化、缺目标、重绑定失败、网络中断均保留数据并停止发送；双击/并发不重复创建或提交。
- 用户确认后，仅重试当前草稿一次，沿用正常任务组合/审批路径；不重放历史模型工具、旧候选应用或UNKNOWN写入。重连不等于恢复模型记忆、持久Mission或跨重启进程接管。

父任务独立检查代码差异后执行`rtk proxy mvn -f backend/pom.xml test`：四个有测试模块摘要聚合673项、0失败/错误、68条件跳过；日志在受管scratch的`reconnect-parent-backend.log`。未开启数据库/真实模型门禁。新增HTTP/注册表回归覆盖同ID重建、已有会话记忆/绑定/敏感标记保留、工作区变化、忙碌、容量及清理失败不发布新会话。

前端根`check`首次发现新增组件测试1处格式问题，仅格式化该文件后，根检查384格式文件、300 lint文件零问题；随后`rtk proxy pnpm --dir frontend test run --maxWorkers=2`全量110文件632项通过，`typecheck`和`build`通过，根架构检查包含边界门禁。组件测试点击确认/取消/双击并验证调用次数及项目/滚动保留；会话测试覆盖模型缺失/禁用/移除、重连/绑定失败、切换竞态、瞬时离线及无关404。真实与mock使用同一路由/请求合同。

未重启用户服务、未调用真实模型、未提交推送。Node localStorage、Mockito/JDK及构建大chunk告警保留。上述为自动化组件/回环HTTP证据，不宣称真实浏览器用户接受或模型故障已恢复；本地记录续接不等于完整ChatMemory持久化。已有服务需由用户重启加载后使用该入口。

## 聊天 SSE 执行事件与取消（2026-11-07，离线通过，浏览器待验）

破坏性合同：`POST /api/ai/conversations/{id}/messages` 主路径改为 `text/event-stream`（`consumes=application/json`）。校验失败仍在首帧前抛出 HTTP 4xx JSON；成功路径按序推送 `status` / `answer.delta` / `tool` / `approval` / `error` / `final`（`final.payload` 为完整消息信封）。配套：

- `POST /api/ai/conversations/{id}/cancel`（JSON `{}`）：协作取消进行中的 exclusive 轮次；空闲为 no-op。
- `GET /api/ai/conversations/{id}/executions/{executionId}/snapshot?afterSequence=`：进程内游标补齐；非法游标 `CURSOR_INVALID`。
- 前端 `runtime-client` 用 fetch 消费 SSE；`eventProjector` 按 `executionId+sequence` 去重并记录缺序；发送中可取消。

离线证据：`ChatExecutionStreamTest` 4 项；前端 eventProjector/reconnect/wireApi 等定向通过。不宣称跨重启持久事件日志或真实供应商流式验收。

## 上下文预算 CE-01 首片（2026-11-07，离线通过）

在既有 `AiChatApplication` 拼装路径接入 `ContextBudget`：按 CHAR_ESTIMATE 计量 system + 已组装 user material，预留输出字符，超限返回 `CONTEXT_BUDGET_EXCEEDED`（ProblemDetail 携带来源用量，无正文）。history 标 `CHAT_MEMORY_NOT_METERED`；知识/Skill 触发的记忆清空记 `DERIVED_CLEARED_BEFORE_SEND`。成功响应附带可观测 `contextBudget`。旧硬限 `TASK_CONTEXT_TOO_LARGE` 由该合同替代。`ContextBudgetTest` 5 项通过。不宣称 provider token、压缩策略或 MEM-01。

## 上下文预算 UI（2026-11-07，离线通过）

聊天回合展示 `contextBudget` 用量摘要（已用/剩余/预留/计量/来源明细，无正文）；超限映射 `context-budget-exceeded` 并展示可读 Feedback。`contextBudgetView` 单测覆盖成功挂载与错误观测解析。

## 上下文预算 mock 合同与浏览器（2026-11-07，mock 通过）

`mock/chatBackend` 成功 SSE/`final` 附带确定性 `CHAR_ESTIMATE` 观测；消息含 `预算超限验收` 或 `__CONTEXT_BUDGET_EXCEEDED__` 时 HTTP 400 + `CONTEXT_BUDGET_EXCEEDED` + `contextBudget`（无正文）。消息含 `历史未计量验收` 或 `__CHAT_MEMORY_NOT_METERED__` 时计量为 `UNKNOWN`、来源含 `history`、备注含 `CHAT_MEMORY_NOT_METERED`。`chatBackend`/`contextBudgetView` 定向通过。mock `:5174` 浏览器：普通发送可见 `turn-context-budget`；超限关键字可见 Feedback；历史未计量可见未知计量与备注。不宣称真实 token、压缩策略或用户产品接受。

## 任务工作记忆失效 mock（2026-11-07，mock 通过）

`mock/chatBackend` 在发送含「记忆失效验收」或 `__INVALIDATE_WORKING_MEMORY__` 时将工作记忆标为 `DEPENDENCY_CHANGED` 并清空目标/约束/事实/证据/依赖键；会话 GET 回传后 Chat 面板展示失效。`:5174` 已验。不宣称真实依赖同步或取消 sticky 清空。

## 任务工作记忆 MEM-01 首片（2026-11-07，离线通过）

`TaskWorkingMemory` 与 ChatMemory/浏览器展示历史分层；敏感上下文清空与模型切换会使工作记忆失效，不取消 sticky 清空保护。会话 GET 返回 `workingMemory` 快照与更新后的 `MEMORY_NOTE`。`TaskWorkingMemoryTest` 通过。不宣称跨重启恢复或自动长期记忆。

## 任务工作记忆 UI/PUT（2026-11-07，离线通过）

`PUT /api/ai/conversations/{id}/working-memory` 写入目标/约束/事实引用（无正文）；聊天区展示分层说明并可保存目标。`WorkingMemoryApiTest` 与 `workingMemorySession` 通过。

## 任务工作记忆本地持久（2026-11-07，离线通过）

`FileWorkingMemoryStore` 落盘至 `.eap/working-memory`；进程重启后同会话 ID reconnect 恢复工作记忆、不恢复模型窗口；显式删除清盘。`WorkingMemoryPersistenceTest` 通过。

## 任务工作记忆 Task/Run 关联（2026-11-07，离线通过）

发送路径在 exclusive 下 `linkTaskAndExecution`：`taskRef` 写入 `dependencyKeys`（`task:project:id:rev`），本回合 `executionId` 写入 `evidenceRefs`（`execution:<uuid>`）；已有不同 `task:` 键时先 `TASK_BINDING_CHANGED` 失效再重绑。不复制看板任务状态机。聊天区展示依赖/证据；发送后刷新会话工作记忆。`TaskWorkingMemoryTest` 关联项与 `workingMemorySession` 刷新项通过。

## 任务工作记忆对抗失效（2026-11-07，离线通过）

`syncMaterialDependencies` 同步知识/Skill 依赖键；陈旧键 `DEPENDENCY_CHANGED`。`WorkingMemoryAdversarialTest`：PUT 不取消 sticky 清空、重连不复活模型窗/失效目标、Skill/任务切换丢弃派生内容。sticky 清空保护保留，不宣称可替代清空。
