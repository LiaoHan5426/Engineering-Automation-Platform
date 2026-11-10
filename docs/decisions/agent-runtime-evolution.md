# Agent 能力、本地运行环境与插件演进

状态：有效合同与增量实现记录；当前已提交实现基线 `067c3d8`（已推送），本轮接续status/diff取消、超时及结果返回中断UNKNOWN核对与恢复；接续改动已获本次用户提交并推送授权，随本次提交交付，完成范围与剩余项以 §7 和[台账](../planning-status.md)为准。历史章节的提交授权、测试数字和限制只描述当时范围。向量增强、框架迁移、第三方安装等仍须满足各自证据与授权门禁。

## 1. 结论与适用范围

采用“确定性工程内核＋可治理上下文/记忆＋标准工具协议＋可信功能插件＋场景组合”。当前继续 Spring AI，不因尚未完成应用工程闭环而直接切换 LangChain4j。LangChain4j 保留为有业务触发条件的对照候选，不长期并行维护两套模型工具循环、连接或记忆体系。

本决定细化[主方案](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md)的技术与扩展边界；[台账](../planning-status.md)维护状态，[路线图](../roadmap.md)维护推进顺序。历史 S2 的固定 Chat/Builder A、B 原型不能覆盖现行五入口、Code/Work 共用会话与来源上下文恢复合同。

## 2. 当前事实与缺口

2026-11-08评审实施补充：[安全与执行边界](../records/architecture-history.md#backend-review-hardening)。保留五模块；禁止把原始工具名、已配置服务器或HTTP成功作为授权/验收。以下历史实现证据不等于本轮实网验证。

以下为静态源码检查，不是本轮运行验收。已有测试和历史实库证据仅按其原范围引用。

| 范围 | 源码事实与定位 | 未完成 / 不得推断 |
|---|---|---|
| 模型与工具循环 | `backend/pom.xml` 使用 Boot 4.1.1 / Spring AI 2.0.2；`EngineeringAiConfiguration` 使用官方 Memory/ToolCalling Advisor | 配置成功不证明供应商效果；不据此添加第二套循环 |
| 会话记忆 | 20条模型窗口；**MEM-01** 工作记忆分层+PUT/UI（含约束/事实展示）+本地持久+Task/Run+知识/Skill 依赖对抗失效 | 模型窗口仍非跨重启；UI 历史在浏览器；长期记忆未启动；sticky 清空保护未取消 |
| 敏感上下文 | `AiConversationRegistry.clearContextMemory`：知识/Skill一旦使用，后续每轮先清空模型记忆，包括移除资源和被拒请求 | 连续对话被主动牺牲；不能简单取消清空，派生回答也可能保留撤权知识 |
| 检索 | PostgreSQL FTS/关键词 + 专家授权引用；**KR-01**：离线 `KEYWORD_PROBE` + `POSTGRES_FTS` 适配 + 每题延迟观测 + 排序质量样本（干扰语料/`expectedMaxRank`） | 无向量；生产样本与真实 FTS 排序对照仍待；引用不证明模型正确使用；KR-02 未触发 |
| 上下文 | `TaskContext`/`AiChatApplication` 拼装；**CE-01 首片**：`ContextBudget` 字符预算/输出预留/超限观测（CHAR_ESTIMATE） | 非 provider token；无压缩选择策略；ChatMemory 未精确计量（标 UNKNOWN）；派生失效仍靠清空保护 |
| 工具调用 | Java Handler可直接执行本地逻辑；CLI经 `CliOperationHandler` / `CliExecutionService` / `DefaultProcessExecutor`，使用argv与cwd；Chat当前受控工具为只读gitStatus | 不是所有工具都走Shell，也不是目录中的工具都向模型开放；cwd限制不是OS沙箱 |
| CLI管理 | `CliProgramService` / `/api/cli-programs` 与 `CliProgramManager.vue` 可登记程序、路径及固定参数操作；`LocalBinaries` 查PATH或指定文件 | 登记不安装；缺少受管版本、来源、更新、回滚、卸载与依赖管理 |
| MCP | 固定read_graph通过现有Handler和持久专家grant接线；stdio环境白名单、半行/输出限额、进程树/初始化失败清理；登记/授权/会话隔离；stdio + 分页 + **官方只读包矩阵** + http + legacy SSE + Streamable-HTTP；生产白名单；GET/Last-Event-ID 续传 | 常驻 GET listen 未做；非官方信任只允许登记，callReadOnly拒绝未经精确矩阵许可的端点；官方包真实Expert整链仍待验 |
| 目录 | 有工作区绑定、只读文件树、受控应用；默认连接 `.eap/model-connections.json`、AI产物 `.eap-ai-artifacts` 为相对位置 | 缺统一数据/缓存/工具/任务临时目录合同与旧数据迁移；不是完全没有目录能力 |
| 前端与桌面 | 浏览器有草稿/偏好存储；`frontend/apps/desktop/src/main.mjs` 提供安全壳和选目录 | UI中的scratch键不是磁盘目录；未接通统一临时资源服务或工具安装器 |
| 插件 | `features/plugins/model.ts` 固定chat/builder，`host.ts` 生成入口，`PluginSlot.vue` 直接导入组件 | 是可信预装原型，不是通用插件SDK、外部安装器或第三方隔离；Manifest申请不是授权 |

## 3. 上下文、记忆与检索合同

### 3.1 分开管理状态

- **对话历史**：用于展示/回放的完整记录，不等于每轮全部注入模型；持久化必须包含会话、连接绑定和失效语义，不能只替换ChatMemory Store。
- **任务工作记忆**：目标、约束、已确认事实、进度和证据引用，关联既有Task/Run；不复制任务状态机。
- **长期记忆**：经确认、可追溯的偏好和项目事实，包含来源、作用域、版本/时间、确认状态、更新/删除。首片不默认自动抽取所有聊天，不把向量库当记忆治理。
- **本轮临时上下文**：授权检索、源码摘录、工具结果等，在发送时检查来源、版本与范围，不自动成为长期记忆或执行指令。

### 3.2 统一上下文策略

在现有拼装路径收敛策略，不再造Agent框架：请求→服务端授权→按需检索→选择/预算→现有模型与工具循环→独立验证。

预算覆盖系统指导、当前请求、历史、资料、源码、工具结果和输出预留；按目标模型能力选择计量方式，无法准确计量时明确估算/未知。优先保留当前目标与必要约束，按相关性选择材料；超限明确拒绝或按已声明策略压缩，不静默丢弃验收要求。观测默认记录来源标识、选择/舍弃原因和用量，不记录敏感正文。

记忆改造先定义原始用户消息、临时材料、派生回答/摘要的依赖和失效。资源撤权、更新或删除后，后续请求不得重注入失效内容或其派生摘要；不能只排除检索片段而保留携带原文的回答。保留当前清空保护，直到替代策略经回归与对抗用例证明。已发送给供应商的内容不能被本地撤权追回。

### 3.3 检索先评测再加基础设施

建立具有预期来源/片段的真实问题集，记录召回、排序、引用可追溯、无结果行为、延迟和成本；加入中文、标识符、同义表达及更新/删除/越权反例。事先确定样本、指标和通过阈值，不能事后挑选成功案例。现有FTS/关键词作为基线，仅在暴露明确缺口后比较向量/混合检索与重排；授权过滤必须在返回材料前生效。

**KR-01 首片（2026-11-07，离线）**：`RetrievalBaseline.fixtureCases` 预定 7 题（direct/identifier/chinese/empty/authz/update）；阈值 `DIRECT_RECALL_AT_K_THRESHOLD=1.0`、`CHINESE_RECALL_AT_K_THRESHOLD=1.0`、authz/empty 失败数=0。`KeywordRetrievalProbe` 复用 `KnowledgeRepository.terms`，计量标 `KEYWORD_PROBE`，**不是** PostgreSQL `ts_rank` 等价证明。`RetrievalBaselineTest` 5 项通过。实库对照与延迟/成本仍待；未启动 KR-02。

**KR-01 实库适配（2026-11-07，离线）**：`PostgresKnowledgeRetrieval` 将 `searchAuthorized` 行映射为 baseline Hit（含 `knowledgeBaseId`）；计量标 `POSTGRES_FTS`。`PostgresKnowledgeRetrievalTest` 通过。`RetrievalBaselineDbContrastTest` 在 `EAP_RUN_BOARD_PERSISTENCE=true` 下播种同题 fixture 对照阈值；本机缺口令时跳过。未启动 KR-02。

**KR-01 本机实库对照（2026-11-07）**：用 IDEA 运行配置中的本机口令（未写入仓库）执行 `RetrievalBaselineDbContrastTest`：**1 通过**，同题阈值与 `KEYWORD_PROBE` 对照满足。排序质量/生产样本仍待；未启动 KR-02。

**KR-01 延迟观测（2026-11-07，离线）**：`RetrievalBaseline.CaseResult.durationMs` 与 `Report.totalSearchDurationMs` 记录每题检索耗时；不设通过阈值（成本账证据），`RetrievalBaselineTest` 校验汇总一致。未启动 KR-02。

**KR-01 排序质量样本（2026-11-07，离线）**：`rankingFixtureCases` 三题要求金标源 `expectedMaxRank=1`；`KeywordRetrievalProbe.rankingCorpus` 加入弱干扰文档；`Report.rankingPassRate` 阈值 `RANKING_PASS_THRESHOLD=1.0`；失败标 `RANK_TOO_LOW`。`RetrievalBaselineTest` 7 项通过。仍为 `KEYWORD_PROBE`，不是 PostgreSQL `ts_rank` 或生产样本；未启动 KR-02。

**MEM-01 首片（2026-11-07，离线）**：`TaskWorkingMemory` 保存目标/约束/事实引用/证据引用/依赖键（无正文）；与 `display_history`/`model_window`/`binding` 分层。`clearContextMemory` 与换模 `bind(..., clearMemory=true)` 失效工作记忆；sticky 清空保护不取消。会话响应附带快照。`TaskWorkingMemoryTest` 通过。

**MEM-01 本地持久（2026-11-07，离线）**：`FileWorkingMemoryStore` 写入 `<workspace>/.eap/working-memory/<id>.json`；同 ID reconnect 可恢复工作记忆且**不**恢复 ChatMemory；空闲驱逐不删盘，显式 DELETE 才清盘；失效原因可落盘回读。`WorkingMemoryPersistenceTest` 3 项通过。无自动长期抽取。

**MEM-01 Task/Run 关联（2026-11-07，离线）**：有 `taskRef` 的发送在 exclusive 下写入任务依赖键与本回合执行证据引用；换任务失效原目标/约束后重绑；不复制看板状态机。`TaskWorkingMemoryTest` 关联项通过。

**MEM-01 对抗失效（2026-11-07，离线）**：`syncMaterialDependencies` 在知识/Skill 发送路径写入 `knowledge:`/`skill:` 依赖；陈旧键触发 `DEPENDENCY_CHANGED`。对抗用例证明：PUT 不能取消 sticky 模型窗清空；重连不复活 ChatMemory/已失效目标；Skill digest 或任务切换丢弃派生工作记忆。`WorkingMemoryAdversarialTest` 通过。**不**取消 sticky 清空，未宣称可替代清空。

**MEM-01 约束/事实 UI（2026-11-07，mock 浏览器）**：Chat 工作记忆面板展示 `constraints`/`facts`；保存目标时回传既有约束/事实/证据/依赖键，避免 PUT 抹平。mock 种子约束 + `workingMemorySession` 持久测 3 项通过；`:5174` 验收保存目标与约束展示。用户产品接受仍待。

**MEM-01 失效 mock UI（2026-11-07，mock 浏览器）**：发送含「记忆失效验收」或 `__INVALIDATE_WORKING_MEMORY__` 时 mock 会话工作记忆写 `invalidation=DEPENDENCY_CHANGED` 并清空目标/约束/事实；Chat 面板 `working-memory-invalidation` Feedback 展示。有目标/约束/事实/证据/失效原因时不叠空态。`:5174` 已验。不取消 sticky 清空，不宣称真实依赖同步。

**MEM-01 sticky 诚实提示（2026-11-07，mock 浏览器）**：失效 Feedback 下追加 `working-memory-sticky-retained`，明示 sticky 清空保护仍保留、不恢复 ChatMemory。`:5174` 已验。

## 4. 协议与框架选择

- MCP连接工具/资源；A2A面向独立Agent互操作；内部静态DAG不必套通信协议，也不是自主规划。
- MCP首片：EAP作为Client，锁定SDK及一个只读服务器版本，验证initialize、分页发现、schema、授权call、拒绝、协议错误、超时、连接清理和跨专家/执行隔离。先核对现有stdio/http/sse登记格式与目标传输映射，不直接将旧http字段视为已支持Streamable HTTP。
- **MCP-01 stdio（2026-11-07）**：`StdioMcpCommand` 解析登记 endpoint（禁 shell/元字符）；`StdioMcpTransport` 子进程逐行 JSON-RPC、通知无响应、超时 `MCP_TIMEOUT`、close 时 destroy；`McpClientService` 在无内存传输时按 registry `transport=stdio`+endpoint 启动。假子进程 `FakeStdioMcpServerMain` 验证 initialize→list→call→清理。http/sse 仍 `MCP_TRANSPORT_UNSUPPORTED`。
- **MCP-01 分页与官方只读包（2026-11-07）**：`McpProtocolClient.listTools` 跟随 `nextCursor`（页数上限 32）。锁定 `@modelcontextprotocol/server-everything@2.2.1`（`OfficialReadonlyMcpLock`）；`EAP_RUN_MCP_OFFICIAL=true` 下 `OfficialReadonlyMcpStdioTest` 完成 initialize→分页 list→`echo` call→清理。不宣称生产授权或 http/sse。
- **MCP-01 http JSON-RPC（2026-11-07）**：`HttpMcpTransport`/`HttpMcpEndpoint` 对 registry `transport=http` 做单端点 POST（禁 userinfo、不跟随重定向）；本地 HttpServer 对照 initialize/list/call。不宣称 Streamable-HTTP。
- **MCP-01 legacy SSE（2026-11-07）**：`SseMcpTransport` 对 `transport=sse`：GET 收 `endpoint` 事件，POST 到消息 URL，经 SSE `message` 按 JSON-RPC id 配对；`SseMcpTransportTest` 通过。不宣称 Streamable-HTTP。
- **MCP-01 Streamable-HTTP（2026-11-07）**：`StreamableHttpMcpTransport` 对 `transport=streamable-http`：POST 带双 Accept，接受 JSON 或 SSE 响应，捕获/回传 `MCP-Session-Id`，close 时尽力 DELETE；`StreamableHttpMcpTransportTest` 通过。不宣称生产授权或 GET 续传。
- **MCP-01 生产授权白名单（2026-11-07）**：`McpProductionAllowlist` 锁定允许传输（含 streamable-http）与官方只读包 `echo`；信任官方包时拒绝越权工具；list/probe 回传 `productionGrantedTools`；调用路径再校验。非官方信任仍为操作者声明。`McpProductionAllowlistTest` 通过。
- **MCP-01 Streamable-HTTP GET 续传（2026-11-07）**：`StreamableHttpMcpTransport` 记录 SSE `id`/`retry`；POST SSE 未拿到匹配响应时带 `Last-Event-ID` GET 续传；`StreamableHttpMcpTransportTest` 含断流重连用例。不宣称常驻 listen 线程。
- **MCP-01 官方只读包矩阵（2026-11-07）**：锁定 everything/`echo`、sequential-thinking/`sequentialthinking`、memory/`read_graph` 与 **filesystem@2025.11.25/`list_directory`+`get_file_info`+`search_files`+`list_allowed_directories`+`directory_tree`**（门禁 stdio 附加允许根；实 call list+info+search+allowed；`directory_tree` 因上游 structuredContent 校验失败仅 tools/list 证明）；生产白名单与能力页共用；mock/真机已验五工具文案。追加包须先验工具存在。
- **MCP-01 callVerified/listOnly 视图（2026-11-07）**：矩阵 `toView` 附加 `callVerifiedTools`/`listOnlyTools`；能力页分开展示；filesystem `directory_tree` 标仅 list。mock/真机已验。
- **FS-01 kind/byteSize（2026-11-07）**：data-layout 条目报告 `kind`（missing/file/directory/other）；仅常规文件附带 `byteSize`，目录不递归计量。mock/真机浏览器已验。
- **FS-01 inventory.byKind（2026-11-07）**：`inventory.byKind` 汇总 file/directory/missing/other；能力页展示。不递归扫盘。mock/真机已验。
- **TC-01 调用摘要（2026-11-07）**：能力页在 stdout 前展示 capability/成功/exitCode/本地 `observedAt`；不宣称服务端时钟合同。mock/真机已验。
- **SC-01 mock 保存断连（2026-11-07）**：mock `mockOutcome=save-lost` 先落盘 revision 再 502；前端「模拟保存断连」触发核对→`unknown`；`:5174` 已验。不等于用户产品接受。
- **TD-01 清除探测缓存（2026-11-07）**：`POST /api/runtime/trusted-tools/probe-cache/clear` 清空内存+`.eap/cache/trusted-tool-probes.json`；能力页按钮；不改绑定/启停；mock/真机浏览器已验版本回未知。
- **TD-01 探测缓存摘要（2026-11-07）**：`GET …/trusted-tools` 附加 `probeCache`（`cached`/`known`/`failed`）；能力页展示摘要，`cached=0` 时禁用清除。mock/真机浏览器已验。
- **TD-01 newestProbedAt（2026-11-07）**：`probeCache.newestProbedAt` 取缓存中最新 ISO 探测时间；空缓存为空串。mock/真机已验。
- **TC-01 失败呈现与耗时（2026-11-07）**：失败提示附带稳定 detail 与客户端 `elapsedMs`；有 typed failure 时不再叠成功摘要行。mock/真机已验。
- **CE-01 COMPRESSION_NOT_ENABLED（2026-11-07）**：`ContextBudget.enforce` 恒记备注；mock 同步。诚实声明未启用压缩，非压缩实现。`:5174` 已验。
- **CE-01 预算备注 Badge（2026-11-07）**：Chat 用量区将 notes 拆为 Badge；稳定码 `COMPRESSION_NOT_ENABLED`/`CHAT_MEMORY_NOT_METERED`/`DERIVED_CLEARED_BEFORE_SEND` 为 warning，`CONTEXT_BUDGET_*` 为 danger，自由文案中性。`:5174` 已验。
- **TC-01 长 stdout 折叠（2026-11-07）**：成功结果 ≥8 行或 ≥480 字符时用 `@eap/ui` Collapse；摘要单行预览；短输出仍内联。mock 加长 stdout；`:5174`/`:5173` 已验。
- **TD-01 绑定状态计数（2026-11-07）**：能力页汇总 ready/disabled/conflict/missing_binary/unknown_version/other；前端聚合，不改探测合同。`:5174`/`:5173` 已验。
- **FS-01 迁移候选计数（2026-11-07）**：`migrationReadiness.candidateCounts`（present/absent/total）；能力页与 inventory 并列展示。mock/真机已验；不执行物理迁移。
- **KR-01 生产形排序样本（2026-11-07）**：`RetrievalBaseline.productionSampleCases`（较长操作员措辞，`expectedMaxRank≤2`）+ 离线 `KEYWORD_PROBE_PRODUCTION_SAMPLE`；`RetrievalBaselineDbContrastTest` 增加 gated Postgres FTS 排序对照；口令回退 `application.yml` / `EAP_DB_PASSWORD` / `SPRING_DATASOURCE_PASSWORD`。不启 KR-02。
- **SC-01 保存未知态核对（2026-11-07）**：`scenarioCatalog.save` 在非 409 失败后 GET 核对；远端 revision 相对保存前前进则标 `unknown` 并采用远端 revision；404 保持 `save`。
- **TC-01 调用未知结果（2026-11-07）**：`trustedToolInvokeFailure` 增加 `unknown`（520/`TRUSTED_TOOL_UNKNOWN` 或无响应网络中断）；mock「模拟结果未知」+ 能力页提示；真机成功调用已验。
- 本地stdio进程的argv、cwd、环境和生命周期仍须约束；远端目标的认证/网络范围独立处理。MCP Roots及工具只读标注不是强制沙箱。不先将已有Java/CLI能力全部包装为MCP Server。
- A2A与EAP作为MCP Server延期至明确互操作需求；不得为对齐教材章节而全部实施。
- LangChain4j对照仅在自主协作等明确需求，或Spring AI出现可复现阻碍时启动。相同模型、业务样例、授权和验收合同下比较复杂度、正确性、token成本、延迟、取消/错误处理、兼容性与迁移回归；不预设胜者。具体版本、Java25/Boot4.1.1兼容性及模块稳定性待实验验证。
- 保留SQL业务回退/缓存、连接选择、自定义ChatModel、工具限额、授权、敏感记忆隔离和独立验证；框架迁移是独立决定，不是本轮规划更新的附带动作。

## 5. 工具供给与本地目录

### 5.1 系统引用与受管工具并存

系统工具只引用路径，不擅自升级/卸载。EAP受管工具安装到专用目录，记录来源、锁定版本、平台架构、校验、实际入口、依赖和使用者；复用现有CLI程序/操作登记与执行器，不另建Capability Registry。

首片仅选一种可信来源的一个便携工具或一个独立Python venv。安装是明确用户动作：展示网络下载/第三方代码风险；验证包内容与路径，拒绝解压路径逃逸；验证失败不激活，安装失败回滚。更新保留可回退版本；在途使用阻止删除；移除受管工具不能删除系统安装或用户项目。模型不能因缺依赖而静默安装，也不默认使用最新版、不经批准全局pip/npm安装。

### 5.2 逻辑布局（目标，物理路径待平台切片确认）

**FS-01 首片盘点（2026-11-07，只读探测）**：`GET /api/runtime/data-layout` 返回下列逻辑项的解析路径与 `exists`，不执行迁移。默认相对进程工作区（`EAP_WORKSPACE` 或含 `.git` 的 `user.dir`）展开。

**FS-01 迁移就绪盘点（2026-11-07）**：同接口附加 `migrationReadiness`（`status`/`candidates`/`approved=false`/`physicalMigration=false`），盘点 legacy 产物路径、连接登记与 `cache/trusted-tool-probes` 是否存在；不移动、不删除、不改默认路径。`RuntimeDataLayoutServiceTest` 覆盖。

**FS-01 能力页盘点 UI（2026-11-07）**：能力总览只读展示 entries + migrationReadiness；mock `:5174` 与真机 `:5173` 浏览器已验；真机探测后 `trusted-tool-probes` 转为 present。

**FS-01 刷新盘点（2026-11-07）**：能力页「刷新盘点」独立调用 data-layout（busy 态）；不触发物理迁移。mock/真机浏览器已验。

| 逻辑路径 | 含义 |
|---|---|
| `data-root` | `.eap/` 应用数据根 |
| `config/model-connections` | `eap.ai.connection-store`（默认 `.eap/model-connections.json`） |
| `artifacts/ai` | `eap.ai.artifact-root`（默认 `.eap-ai-artifacts`） |
| `workspace/process` | 进程检测到的工作区 |
| `workspace/authorized-root` | `eap.runtime.authorized-root` 绑定结果 |
| `cache` / `cache/trusted-tool-probes` / `logs` / `tools` / `tasks` | 目标布局；探测缓存文件按需创建 |

```text
EAP应用数据根/
  config/                     本机配置；敏感信息受保护且导出剔除
  tools/<tool>/<version>/     受管工具，不混入用户源码
  tasks/<taskId>/
    scratch/<executionId>/    执行独占中间文件
    artifacts/                需保留的候选、报告和交付物
  cache/                      可重建缓存
  logs/                       有界运行记录
用户授权工作区/               用户项目，不随应用卸载/清理删除
```

桌面与Java共同使用一个被确认的数据根/服务合同，不各自猜路径。Web由本机Java持有磁盘资源；Electron按职责通过主进程或Java服务的窄接口使用，避免双重所有权。旧相对配置/产物先盘点并制定备份、迁移、失败恢复与读回验证，不直接改默认值使旧数据失联。各OS默认路径、可移植模式、限额与保留期限在实施前确认，不在本文臆定。

临时资源须带owner、用途、状态、保留期限/限额和释放责任；每次执行隔离scratch，支持的外部程序注入专用TEMP/TMP。只清理由EAP创建且归属可验证的目录，防symlink/junction及路径逃逸；运行中/UNKNOWN资源不能按超时直接删除。产物保留与缓存回收分开，重启后核对归属而不是扫描任意系统临时目录清空。设置cwd或TEMP不构成OS隔离承诺。

### 5.3 前端与临时资源

纯表单、原型交互、有界转换和预览优先前端执行；内存/Worker处理计算，Blob/Object URL负责临时下载并释放；小偏好用localStorage，大草稿/离线数据按需评估IndexedDB，确需文件式浏览器存储再评估OPFS。上述浏览器存储不是用户仓库目录或写权限；不为每次预览强制建磁盘目录。

需要本机程序、授权工作区、离页持续执行或持久验证交付物时走本地运行时。Electron渲染页不得开放任意fs/shell/通用IPC；通过具名接口申请/释放受管资源。取消、失败、预览关闭、插件停用及重启分别验证清理，必要产物先移交持久保留再回收scratch。

### 5.4 工具发现与本机绑定（TD-01）

采用“可信定义自动汇总、已知依赖自动绑定、未知来源辅助导入、执行权限单独控制”，不要求用户重复录入包内已有工具声明。定义与绑定在既有Capability/CLI结构上分离，不新增万能注册中心：定义包含稳定标识/版本、输入输出契约、执行归属、允许调用入口、副作用与策略要求；绑定包含实际路径/连接/实例、来源、检测时间、兼容性证据及不可用原因。文件存在不能证明版本兼容，未主动验证时标明未知。

#### TD-01 绑定快照呈现（2026-11-07）

`TrustedToolCatalogService` 在 `GET /api/runtime/trusted-tools` 附加 `bindingStatus`/`bindingSource`/`binary`/`resolvedPath`/`versionStatus`/`bindingNote`。目录渲染只做路径解析，不执行 `--version`（版本保持 `unknown`）。操作员覆盖不可用标 `conflict`，不停用静默回退；停用保留定义快照。`TrustedToolCatalogServiceTest` 与 mock 能力页浏览器已验 ready/disabled/conflict。

#### TD-01 显式版本探测写回（2026-11-07）

`POST /api/runtime/trusted-tools/{id}/probe-version` 复用 `CliChannels.probe` 有界 `--version`（参数数组、短超时、输出截断脱敏）。成功写回 `versionStatus=known` + `detectedVersion`/`probedAt`；失败写 `probe_failed` 且不伪造版本；disabled→403、conflict/missing_binary→409。目录 GET 合并同路径缓存，路径变化失效；仍不在渲染时自动探测。mock 能力页浏览器已验成功写回与探测失败。

#### TD-01 探测持久化缓存（2026-11-07）

`TrustedToolProbeStore` 将探测快照落到 `.eap/cache/trusted-tool-probes.json`（schema `trusted-tool-probes/v1`）；服务启动/重建时读回，写失败不阻断进程内目录。路径变化仍失效并重写文件。`TrustedToolCatalogServiceTest` 覆盖重建可读；mock 模块级缓存 + 能力页浏览器已验离页回读。不整盘扫描、不开放任意执行口。

| 来源 | 发现与绑定方式 | 限制 |
|---|---|---|
| Java内置能力 | 汇总Spring中已有CapabilityHandler声明 | 不将任意Bean自动暴露为模型工具 |
| 已知CLI | 受信适配定义匹配用户指定路径、受管安装记录或PATH | 只开放已有操作定义，不从程序名猜任意参数 |
| 受管工具 | 安装成功后从可信包声明关联定义与实际入口 | 安装/登记不再重复填写；仍需策略检查 |
| MCP | 对已配置且允许连接的服务器初始化、分页发现Schema | 新发现工具不自动进入授权清单；描述是外部数据 |
| 可信插件 | Manifest贡献声明，激活后绑定实际处理器 | 声明存在不等于实例在线或有权限 |
| 前端实例 | Host报告插件实例、文档、revision及支持操作 | 关闭/断线/停用后失效，不保存成永久在线 |
| 未知CLI/项目脚本 | 仅显示候选并辅助导入，需适配定义或确认 | 不自动执行help、脚本或加载仓库代码以猜测能力 |

发现范围限定为已知名称、受管目录及已批准声明来源；不扫描整盘。低副作用文件/配置检查与主动探测分开：运行版本命令、启动stdio服务器、网络连接或下载需明确启用相应策略；不能为渲染目录就执行第三方程序，也不逐次弹窗替代合理的持久策略。显式用户路径优先；受管与PATH候选按可见规则解析，冲突不静默择一或切换。按需刷新/缓存并显示检测时间，执行前重新检查绑定；任务捕获定义/绑定快照，刷新或PATH变化不得替换在途程序，执行入口变化须失效并重新确认。重发现保留用户停用、排除和授权决定，不自动重启用或扩权。

Hermes参考的是声明式自注册、模块发现、依赖检查与toolset筛选，不是扫描任意程序后自动理解其行为。模型仅接收当前任务允许且就绪的工具子集，按需获取定义；不得把整份本机目录或发现到的可执行文件直接全部暴露。未知工具保留手工适配路径，不承诺零配置识别任意CLI。

### 5.5 调用、执行归属与呈现（TC-01 / TC-02）

**Java管理本地运行时能力；前端Host管理交互实例能力；调用方使用明确契约，展示层通过贡献适配。注册、可调用、执行成功和业务完成必须分开。** 当前CliProgramManager偏登记/配置/探测，runtime-client有管理入口；CliExecutionController仅查询/取消，Chat仍为none/git_status特定入口。这不代表其他专家业务入口不存在，但尚无目录到人工/模型/场景调用的统一合同；CapabilityHandler描述元数据不能直接充当完整调用Schema。

| 执行归属 | 示例与前端职责 | 生命周期 |
|---|---|---|
| Java/CLI/MCP | Git、知识、构建；前端负责参数、范围确认、审批交互及结果呈现，不复制执行逻辑 | 后台执行由核心管理，离页不等于取消 |
| 浏览器插件/Worker | 未保存草稿、设计器选中状态；前端提供真实处理器及撤销/错误语义 | 绑定具体实例/文档/revision，关闭或断线明确不可用 |
| Electron主进程 | 原生选目录/保存对话框；前端调用具名IPC | 必要用户手势、取消与平台差异单独处理，不开放任意fs/shell |
| 组合操作 | 保存原型→生成候选→应用/验证；前后端分步合作 | 持久步骤复用Task/Run与版本，不由插件复制状态机 |

调用合同至少明确：定义/绑定版本、调用入口（人工/模型/专家/场景/内部）、类型化输入输出、项目/任务/资源范围、目标实例与revision、审批依据、调用关联号、同步/异步、输出限额、超时/真实取消能力、重试/幂等及结果未知处理。并非每项能力都可手动运行或向模型开放；不得新增绕过业务校验的任意Capability执行HTTP口。前端校验不能代替执行端重校验，客户端“已批准”字段不构成批准证据；具体DTO/API由首片验证，不在文档中臆定已存在接口。

工具目录分别展示定义已发现、依赖就绪、实例在线（适用时）、当前上下文允许调用；本次执行状态与业务验证结果独立记录。这些是不同维度而非所有工具共用的线性状态机。通用UI支持有界Schema表单/校验、目标范围、审批、状态与文本/结构化结果/产物引用；复杂领域用受信适配器，不为每个CLI造独立页面，也不假定任意Schema都能无损生成表单。不支持的Schema/入口明确禁用。工具不得返回任意HTML/JS控制宿主渲染；无领域适配时有安全通用展示。

呈现继续分流：来源→摘要/引用，文件→源文件浮层，Diff→变更右栏，进程输出→底部终端。工具错误、协议成功、副作用是否发生、验证/用户接受不能混为“成功”。失败不回退mock；真实与mock共用DTO/路径和交互合同，模拟结果明确标识。

TC-02首片先人工读取某个编辑器实例的当前草稿/选中状态，对比Java读取已保存版本；两者来源不可替代。验证多实例、切页、revision冲突、关闭/断线及结果丢失；写操作另需撤销和幂等/UNKNOWN合同。若未来让后端Agent调用前端能力，先评审实例路由、断线失效、重放与超时协议；不立即建设通用反向RPC。要求离页/重启继续的任务优先使用已保存不可变版本，不能依赖隐藏Vue组件保持存活。TC-01复用现有运行时，不依赖PL-01完整迁移；TC-02与PL-01/PL-02的实际Host合同协调，不要求全量插件SDK先行。

#### TC-01 mock 拒绝/超时/取消呈现（2026-11-07）

mock 可信目录返回启用 `git-status`；`invoke` 默认成功 stdout，`mockOutcome=denied|timeout|cancelled` 映射 403/504/499；能力页区分成功结果与拒绝/超时/取消提示，busy 时提供 Abort 取消。`capabilityBackend`/`trustedToolInvokeView` 7 项通过；mock `:5174` 浏览器已验。不宣称真实 git、不开放任意执行口。

#### TC-01 停止等待与 TC-02 实例检查（2026-11-07，接续 b582891）

上段 Abort 文案为历史实现，本轮纠正：同步 git-status HTTP 入口没有服务端取消确认协议，客户端 Abort/等待超时只能判 UNKNOWN；按钮称「停止等待」，`CLIENT_WAIT_ABORTED` 明示未确认后台进程取消。服务器 499 与其 `TRUSTED_TOOL_CANCELLED` 保持独立。离页中止等待，不终止后台执行；不自动重试。mock `:5174` 与真机 `:5173` 已验停止等待无取消成功/成功摘要，mock 499 保留取消提示。未新增取消 API，真实进程终止仍待。

TC-02 首片直接读取实际 GrapesJS `getProjectData` / 当前选中组件，不以 Java 保存版本或 mock 替代。目标包含 `instanceId/documentId/sourceRef/revision`，同步读取前后核验；快照上限 24,000 UTF-16 code units，超限拒绝而非截断。编辑/选择变更标过期，新建/重开更换文档，离开设计页与销毁清空；没有持久化、网络读取、反向 RPC、隐藏实例或模型授权。复用 `@eap/ui` Button/Feedback，领域逻辑留 shell，无新共享类别或包。

真机浏览器已验未保存内容与选中状态、编辑后过期、设计/版本切换清空、新建 documentId 更新；390px DOM 无横溢，桌面截图复核后将检查按钮由整行拉伸改为内容宽。多实例隔离、前后 revision 冲突、关闭/失败/超限由离线回归覆盖；远程断线/Agent反向调用/用户产品接受未验收。验证全量与已知基线失败见台账，本切片不关闭总体质量门禁。

父任务实跑（仓库根）：`rtk proxy pnpm --dir frontend typecheck`、`check:boundaries`、`check:architecture`、`build` 通过；定向 `test run apps/web/__tests__/features/capability apps/web/__tests__/features/shell/editorInspection.test.ts apps/web/__tests__/features/shell/GrapesEditor.inspection.test.ts apps/web/__tests__/features/shell/scenarioCatalog.test.ts apps/web/__tests__/mock/capabilityBackend.test.ts` 为8文件49项通过。`test run --reporter=json` 为699项/665通过/34失败，按文件与fullName比对无新增失败名；基线副本存在额外环境失败，不作为等价全量环境。改动文件 `vp lint` 退出0，有既有mock optional-chaining七处warning；大chunk与Node localStorage告警保留。后端未改未跑，不冒充后端或真实进程生命周期验收。

TC-01 独立只读审查通过：取消/未知分类、同步busy守卫与卸载局部状态边界未发现阻断；审查者复跑2文件7项通过。不将 signal abort 当后台终止证明；同tick重复点击、停止后再次调用及相邻完成竞态尚无专用组件回归，作为非阻断覆盖缺口保留。

TC-02 首次独立审查发现P1：`v-show`缓存的Host未传一级导航active，返回仍有旧JSON。已补真实PluginSlot→Builder→Grapes导航回归，原代码RED、active透传后GREEN；alpha→beta/settings/chat离页清空检查且禁用，返回保留标题/实例/文档但需重新读取。真机设置→场景→设计器复验 `before=true/离页result=false,disabled=true/返回result=false,disabled=false`，实例保持一致。此修复仅使观察失效，不销毁草稿或终止任务。

TC-02 定向独立复核通过，原P1关闭：审查者复跑2文件10项、typecheck及architecture通过，确认真实组件链传递完整。快照24,000限制在序列化后检查，只承诺返回载荷上限，不宣称计算/内存有界；用户产品接受仍待。

用户报告c1错误后追加测试安全修复：根`vite.config.ts` test setup安装worker内socket保护，只允许当前测试创建且仍监听的loopback端口，拒绝开发8080与外网；不改生产请求和后端UUID校验。fetch/Axios/XHR拒绝及自建HTTP fixture成功共5项通过，最终含plugins/网络保护的定向18文件80项通过。隔离后全量`test run --maxWorkers=2 --reporter=json`为705项/671通过/34失败，失败名无新增；无限并发曾649/56（SkillManager超时级联），其独立25项通过，不隐藏该失败。保护是测试内误联网防线，非OS沙箱，不约束外部子进程。

上段为初次保护快照。独立审查另发现同步XHR经happy-dom子进程绕过、同端口跨IPv4/IPv6扩大授权两个缺口；已按RED→GREEN修复：同步XHR在open阶段拒绝（安全哨兵证明execFileSync零调用），按精确literal地址+端口登记，不许localhost/DNS/wildcard推导，IPv4临时fixture成功而同端口IPv6请求拒绝。最终隔离回归2文件7项、定向18文件82项通过；限并发完整回归707项/673通过/34失败，未关闭原质量欠账。不声称保护任意显式子进程或构成OS沙箱。

测试保护最终定向独立复核通过：同步XHR与地址归属两个阻断关闭，审查者复跑2文件7项通过；提醒的旧暂存版本已由父任务重新暂存并核对工作树/暂存差异，提交仅采用已复核修复。TC-01、TC-02与测试保护的限定审查均通过，不升级为整体产品或全量回归通过。

#### PL-01 依赖缺失与激活失败呈现（2026-11-07）

看板声明服务依赖 `runtime.board-api`；缺失时隐藏贡献入口并提示，不停 Task/Run。预备激活失败后启用会回滚安装状态并 sticky 显示原因；刷新安装状态不覆盖 Builder 实例草稿。`pluginRuntimeView`/`host` 8 项通过；mock `:5174` 浏览器已验。真实服务探测与外部安装器仍待。

## 6. 核心、插件与场景

核心负责仓库绑定、Task/Run、策略/审批、执行、持久化、目录及独立验证。插件负责功能工作面、面板、命令、设置与实例配置；场景组合指引、依赖、默认配置、交互流程和输出合同。

看板UI适合可信插件，但复用EAP Task/Run及同一API/状态规则；原型编辑器适合插件，继续复用GrapesJS/语义Schema/不可变版本；“原型到代码”是组合这些插件及核心服务的场景，不是单个页面插件或另一套执行系统。Hermes Kanban是持久任务/派发系统，不只是前端插件；只参考其分层，不接其SQLite、Dispatcher或React UI。

### 6.1 先可信内置贡献，后外部安装

#### PL-01 显式只读依赖观测（接续 fdcda56）

插件中心填写项目ID（非空且最多120字符）后显式调用既有`GET /api/board/tasks?projectId=...`；不自动发请求，不创建任务、Run或目录授权。未检查/检查中/Task列表可用/失败可用性未知独立于安装启停和sticky激活错误；显示精确来源、ISO观测时间和原因。默认services=true仅保留旧入口假设，不再作为已检查证据。检查只验证指定项目Task列表可读（空列表可通过），不是Run执行/全服务健康；观察不改变现有入口或用户配置。响应须有items数组；双击去重、离开中心忽略晚到结果，成功不清激活错误。

父任务用`desktop_preview`/`drive_preview`真机5173从未检查输入local-eap点击检查，获得Task列表可用、GET来源与时间；mock5174同流程明确标记模拟。只读不采集任务正文，不改数据/服务配置。UI复用@eap/ui Button/Input/Badge，领域逻辑留plugins与局部文案，无新共享包。定向plugins10文件31项通过；并行SSE后全量130文件752项、类型/架构/构建通过。用户最终接受、在途停用完整矩阵和Run/真实服务整体健康仍待。

首片以现有看板为消费者，收敛身份/版本、Host兼容、依赖服务版本、贡献点、activate/dispose、实例配置和错误状态。SDK/runtime目标落点遵守[共享模块规范](frontend-ui-shared-module-boundaries.md)；先按实际消费者提炼，不创建空包。只通过公开Host上下文、类型化runtime-client及事件访问，不私引其他feature、改全局容器或新建任务/模型执行器。

贡献进入固定五入口内，不增加一级导航；Code/Work共用会话，保留来源返回、草稿、选择与滚动，摘要/源文件/终端/变更保持各自布局。Chat不因早期可停用样例而被重新定义为可卸载的会话核心；Builder A/B仅是历史实例，不是产品分类。

“已打包/可启用”“已启用”“依赖缺失/不兼容”“激活失败”和未来“已安装”必须区分。前端插件不能自动提供Java能力：缺运行时服务时禁用相关动作并说明，不显示假成功。Manifest仅申请，真实授权仍由核心决定。

| 生命周期 | 必须行为 |
|---|---|
| 激活失败 | 撤销本次部分贡献/订阅，保留其他模块与用户配置，显示原因 |
| 停用 | 移除入口、释放监听/预览/临时资源；保留任务、版本、候选和产物 |
| 在途停用 | 提示仍在运行；组件卸载不等于任务取消；核心继续提供可观察状态 |
| 重启/重新启用 | 恢复配置，重读核心真实状态，不从localStorage猜任务结果 |
| 卸载/清理 | 代码移除与数据删除分开；数据默认保留，删除单独确认；引用缺失明确呈现 |

外部安装延期，先明确包格式、可信来源/完整性、兼容/依赖、升级回滚与数据迁移。同页第三方JS不能靠Manifest字段实现可靠隔离；任意URL动态import不开放。不受信iframe/独立进程方案须另评估协议和实际边界。安装插件不自动安装工具、授予权限或触发场景运行。

## 7. 分阶段切片与退出门禁

以下ID与主方案/台账一致。负责人及时间未指定，不编造排期；具体实施需要选定切片与授权，不一次性重写。

| 顺序 / ID | 最小范围与依赖 | 退出证据 |
|---|---|---|
| 先保留缺陷门禁 | 场景保存UNKNOWN后的删除核对仍阻断；已有自身改页验收线独立推进 | 结果未知不误报删除/完成；原有交付证据保留 |
| CE-01 / KR-01 | **CE-01/KR-01 部分交付**：字符预算观测 + 用量 UI + mock 预算/超限 + 历史未计量 + 派生清空 + **备注 Badge**；预定检索 fixture + KEYWORD_PROBE；POSTGRES_FTS；延迟/实库对照/排序样本 | CE-01 剩余 token/压缩/精确 Memory 计量与用户接受；KR-01 生产样本/FTS 排序对照；KR-02 仅证据触发 |
| FS-01 | **部分交付**：data-layout + migrationReadiness + 能力页盘点/刷新 + kind/byteSize + inventory + candidateCounts + **byKind**；`physicalMigration=false` | 迁移/读回/失败恢复、边界与清理合同；不启动未经批准迁移 |
| TD-01 / P0 | **部分交付**：既有程序/操作模型投影目录；Git路径、版本与探测缓存共享；旧能力ID/探测入口兼容，历史路径冲突拒绝执行 | 其他依赖绑定与用户接受；见[Git调用合同](#git-operation-executions) |
| TC-01 / P0 | **status/diff切片实现**：固定操作持久执行，取消覆盖root/filter/最终命令，证据确认终态、KeepAlive/刷新恢复，UNKNOWN按操作阻塞，requestId跨操作冲突拒绝；真实diff HTTP/JDBC已验，工具UNKNOWN显式核对关闭阻塞及当前身份线索已实现；追加每步32个已观察子进程身份持久/核对，清理句柄不受限，仍不证明完整树退出；受控中断及真实status/diff异常终止/持久结果丢失的HTTP/PostgreSQL/Vue核对、diff恢复范围及索引/文件不变已验，确认框明确操作身份，关闭后仍只读保留原始命令和步骤证据；status/diff取消、超时及成功结果返回中断的六组UNKNOWN核对与恢复、正常持久终态对照及人工关闭响应中断后显式重查已验；取消意图在UNKNOWN/CLOSED_UNKNOWN保留展示 | 其他权限/IO/平台异常、跨重启进程接管和产品用户接受独立；见[Git调用合同](#git-operation-executions) |
| TC-02 / P1 | **部分交付**：实际 Grapes 实例人工读取草稿/选中状态，实例/文档/revision 核验、有界快照、过期与离页清空 | 多实例/冲突/超限离线覆盖，真机已验读取/过期/切页/新建；用户接受、远程断线与模型反向调用仍独立，不建设反向 RPC |
| MCP-01 | **部分交付**：stdio + 分页 + 官方只读包矩阵（含 filesystem 五工具）+ **callVerified/listOnly 视图** + http + legacy SSE + Streamable-HTTP + 生产白名单 + GET 续传；mock/真机已验 | 继续追加已验证官方包；常驻 GET listen 未做 |
| PL-01 | **部分交付**：看板启停/回滚、依赖缺失/激活失败；新增显式只读Task列表检查，来源/时间/未检查与未知失败分开（真机及mock已验）；不改Task/Run | Run/整体服务健康未验，用户接受与在途停用完整矩阵仍待；无第二状态源，外部安装器延期 |
| MEM-01 | **部分交付**：状态机+PUT/UI（约束/事实展示）+本地持久+Task/Run+知识/Skill 依赖对抗失效；敏感清空/换模/换任务/换依赖失效；显式删除清盘；mock 验目标/约束 + **DEPENDENCY_CHANGED 失效 UI** | sticky 清空仍保留；用户产品接受仍待；长期自动抽取延期 |
| TM-01 | FS-01后做一个受管工具，复用CLI登记 | 锁版本/校验、失败回滚、实际调用、在途卸载阻止；不更改系统工具 |
| PL-02 / SC-03 | PL-01后迁移原型编辑器并声明场景依赖；复用现有版本/交付链 | 缺依赖提示、配置保留、停用不丢版本；设计→候选→应用→验证→人工接受仍独立 |
| KR-02 / FW-01 | 基线证明检索不足或框架阻碍后，独立批准对照 | 相同样例指标与兼容/迁移代价，采用/拒绝依据；不默认换框架或加向量库 |

这些工作不是单页面真实交付的全套前置；FS-01/MCP-01/PL-01可在明确边界后分别推进。跨重启进程接管、A2A、任意第三方插件、市场及万能包管理器均不列为首片前置。

## 8. 查阅依据与验证口径

- [Hello-Agents](https://github.com/datawhalechina/hello-agents)：能力检查与学习材料，不是逐章部署组件的要求。
- Spring AI：[Chat Memory](https://docs.spring.io/spring-ai/reference/api/chat-memory.html)、[RAG](https://docs.spring.io/spring-ai/reference/api/retrieval-augmented-generation.html)、[MCP](https://docs.spring.io/spring-ai/reference/api/mcp/mcp-overview.html)。
- LangChain4j：[Memory](https://docs.langchain4j.dev/tutorials/chat-memory/)、[RAG](https://docs.langchain4j.dev/tutorials/rag/)、[MCP](https://docs.langchain4j.dev/tutorials/mcp/)、[Agentic](https://docs.langchain4j.dev/tutorials/agents/)、[Boot集成](https://docs.langchain4j.dev/tutorials/spring-boot-integration/)。两者文档均提供记忆/RAG/MCP，不能以框架缺这些能力为由直接迁移。
- [A2A](https://a2a-protocol.org/latest/)、[Hermes Kanban](https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban)、[Desktop SDK](https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk)：协议与界面/运行时分层参考。
- [Hermes Tools Runtime](https://hermes-agent.nousresearch.com/docs/developer-guide/tools-runtime)：声明注册、发现、可用性与toolset筛选参考；不代表EAP已具备相同机制。

外部页面是查阅资料，实际采用须锁定版本并验证。文档一致性检查不代表上述功能交付；本轮不沿用历史测试数字冒充新测，不安装依赖、不启停服务、不调用模型、不提交推送。

### 文档验证

本次TD-01/TC-01/TC-02补充验证：对当前9份新增/修改文档检查UTF-8无BOM、123处本地引用目标与锚点，以及主方案/台账/路线图/本决定的14个技术切片ID覆盖，均通过；`git diff --check -- docs`通过。此次修改5份文档，保留其他既有草稿与配置改动；不运行功能测试、不修改生产代码、不提交推送。新增切片均为待实施，主动发现、调用适配与前端实例桥接尚未交付。以下为补充前历史检查结果，不与本次统计叠加。

补充前历史检查：

- 对9份新增/修改文档执行UTF-8无BOM、本地链接目标与Markdown锚点检查：119处本地引用通过。首次检查器未处理带空格的尖括号链接，修正解析后通过，未为此改动原有媒体引用。
- 主方案、台账、路线图及本决定中的11个技术切片ID覆盖检查通过；优先级、依赖及条件触发范围经差异核对，新增功能均未标为已交付。
- `git diff --check -- docs`通过。Git提示`running-context.md`后续可能转换为CRLF，不是本次空白错误；文件编码仍为UTF-8无BOM。
- 未运行Maven、前端构建或业务测试：本轮仅文档变更，不以历史回归或链接检查替代功能验收。接续时已有文档草稿予以保留核对，`application.yml`未读取或修改。

## 后端评审后的执行约束（2026-11-08）

- API所有方法统一校验loopback Host；带Origin时使用明确来源清单，CORS同源配置复用`eap.web.allowed-origins`。默认只允许localhost/127.0.0.1的5173、5174、8080；部署到其他前端端口须显式配置。POST/PUT/PATCH有正文时只接受JSON；无Origin的本机非浏览器客户端仍可用。这不是远端多租户鉴权。
- Chat执行由有上限的应用线程拥有，HTTP连接是可失效观察者。取消仍通过现有会话取消入口；普通Chat走Spring AI流，Responses适配器关闭底层流；完整行脱敏后发delta，代码提案仍整份解析。进程内事件日志不承诺重启恢复。
- MCP生产调用以精确argv/锁定包版本/工具白名单为准，不能用包名子串或工具名称推断只读。首个Handler只接无参数read_graph，并复核持久专家授权；不会把完整MCP目录暴露给Chat。运行时npx使用离线/拒绝安装选项，安装仍需操作者动作。
- 批量迁移CodeChangeService和交付持久化闭包被自动审批拒绝。本轮采用已验证的单叶类迁移及执行器复用；其余迁移清单、类型依赖和放行条件见评审记录。未引入新注册中心、框架或数据库迁移。


<a id="engine-optional-modules"></a>
## 后端可选能力与应用组合（2026-11-08实施首轮）

用户批准的模块组合已进入代码：api保留契约JAR；engine、ai、web、spring和applications使用聚合POM；full应用接替runtime。core/local与headless Chat已有独立组合回归，完整产品使用显式组件Import。

详细结构、接口迁移、证据和BM-01～07剩余关口统一见[模块组合决定](backend-module-composition.md#implementation)。Expert/目录/CLI管理仍有产品跨域依赖，不能把聚合拆分当成所有能力已独立可选。此前自动审查拒绝批量迁移为已获后续授权的历史，不再作为权限待办。

<a id="expert-agent-boundary"></a>
## 11. 专家、专业Agent与固定流程的边界（2026-11-08，分阶段实施）

用户提出SQL专家应更接近具有特色行为与作用的Agent。本节记录目标、实施边界与迁移顺序。用户后续授权自主Agent行为实现；现已实现显式版本绑定的SQL只读取证Agent（11.9），具备基于观察选择工具、追问与结束的有限行为；已继续实现检查点跨JVM恢复和单SQL候选文件审批（11.10）；自动后台调度与审批UI已继续实现（11.11），真实Chromium视觉与模拟审批交互已验；真实Responses文本和Windows原生100%已验，普通API Responses工具支持及真实两轮取证→候选→页面审批→写入读回→重启终态已验；原生125%技术检查已通过；专家父子导航、SQL行为编辑/分类配置及终态静默更新已交付，见[界面记录](expert-workspace-navigation.md)；150%、复杂SQL效果及用户接受仍待。

### 11.1 初始固定模式的问题（历史背景；新增Agent模式见11.9）

- `ExpertManifest`将步骤、连线、规则包与资源声明绑在一个Expert对象上；`experts/sql-expert.json`固定串行parse→knowledge→schema→indexes→explain。它能表达专业检查流程，却不能根据观察决定补充哪种证据、追问用户或提前形成结论。
- `ExpertExecutionService.Request`包含sql/databaseId/explainPlan等SQL专用字段，执行服务随后把SQL分析、规则判定、知识引用、模型建议合成一个结果。通用服务即使换成接口，产品输入与完成语义仍偏SQL。
- 第三轮的`ExpertAnalysisPolicy`是调度器与领域分析的接口，不是Agent行为接口；执行服务现已支持由宿主按专家解析分析策略，完整产品默认仍显式选择SQL兼容策略；现已提供manifest中的版本化专业分析行为绑定；仍不代表不同Agent决策模式。
- `ExpertExecutionService.execute`的90秒事务范围包含能力与模型执行；任务结果在执行末尾保存。它不是脱离请求持续运行、可恢复和逐步审批的Agent运行机制。给这个方法增加循环会扩大长事务和未知结果问题。
- `SqlExpertService`当前只在确定性分析后决定是否请求模型建议。`eap-api`的`Expert<I,O>.analyze`在当前后端主源码中没有实现接线；不能用接口名称宣称已有统一Agent运行时。

### 11.2 建议职责

| 概念 | 职责 | 与现有实现关系 |
|---|---|---|
| 专家定义 | 专业目标、适用任务、行为策略引用、知识/Skill/工具需求、输入输出与验证要求 | 向专业Agent配置演进；资源声明只表达需求，仍须服务端授权 |
| 专业Agent行为 | 根据目标和已验证观察选择下一步：调用授权工具、调用固定流程、请求补充信息、结束并交付证据 | 复用Spring AI现有模型/工具调用机制；只把业务决策和执行约束放入EAP，不另造模型协议栈 |
| 固定流程 | 可复用、可独立测试的有序步骤/DAG | 已提取core独立定义/结构校验/同步执行器，ExpertGraph保留v1适配和领域校验；SQL确定性检查链继续复用。未来Agent入口与授权接线待实施 |
| Capability / Skill / Rule | Capability执行有边界的操作；Skill提供指导材料；Rule校验事实与候选 | 三者继续分离；自然语言指令不自动成为工具授权或验证结论 |
| 任务运行 | 持久状态、审批、预算、取消、证据、恢复和UNKNOWN处理 | 复用并增量完善Mission/Task/Run，独立于Chat请求与UI；模型/工具等待不占用整轮数据库事务 |

因此建议把“SQL专家”视为专业角色/行为配置，SQL解析、规则分析、授权元数据读取与执行计划分析作为它可以组合的能力。面对“为什么这个查询很慢”，它可以先判断已有证据，按授权补充结构/索引/计划，证据不足则请求用户补充，再生成待验证候选。是否使用模型由任务需要决定；有确定性能力就先取证，并不意味着每一种专家行为都必须绑定同一固定流水线。性能提升、语义保持等结论仍须独立验证，模型不能自行宣布通过。

### 11.3 实现落点与兼容

- `engine-core`保留中立清单、能力/规则查询及固定流程结构/调度原语（WorkflowDefinition、WorkflowGraph、FixedWorkflowRunner）；`engine-sql`继续拥有可脱离模型使用的SQL分析与规则能力。
- `engine-workflow`拥有固定流程及现有产品任务/授权持久化；`ai-sql`承接后续SQL专业Agent行为，复用`ai-chat`、模型适配和上下文服务。尚不预建空的`eap-ai-agent`模块；出现多个专业行为的共同实现后再提取。
- `eap-spring`显式装配已选择的策略/模式；HTTP只做入口适配。配置专家时必须能识别所选模式是否有实现及所需权限，缺实现时明确不可用，不能隐式升级为自主执行。
- 现有`eap/v1 Expert`仍按固定DAG解释。新专家配置与流程引用的版本化合同先定设计，再实现兼容适配；不能把已有steps/edges自动解释为Agent目标。当前DB迁移、URL和内置资源不改写；已应用版本仅允许后续增量迁移。
- 专家定义不持有另一套任务状态。写操作审批由执行端依据目标/范围/版本重验，声明范围与实时授予权限取交集；撤权、取消、预算耗尽和结果未知必须能在步骤边界阻断后续动作。

### 11.4 分阶段验收

| 阶段 | 交付 | 验收/状态 |
|---|---|---|
| EA-01 现有依赖收敛 | 专家定义/目录消费规则查询与专家范围能力查询；产品SQL/MCP实现继续复用；服务注入实际CapabilitySettings | 本轮实施，验证与剩余产品耦合见[模块组合记录](backend-module-composition.md#implementation)；不是Agent实现 |
| EA-02 角色与流程合同 | 明确专业目标/行为策略、输入输出、流程引用、旧v1适配，以及固定模式/Agent模式选择 | **部分实施**：固定流程定义/执行器从专家服务提取至core，v1适配、SQL既有链及非SQL本地流程回归；能力输入已按SQL/本地领域接口分离，原HTTP形状由兼容请求组合；宿主可按已加载专家选择分析策略并固定本次词表；专业分析行为id/version已持久绑定并经实库回归（见11.8）；v2目标/tools与Agent模式已接通SQL只读入口；通用领域输入输出与完整角色合同仍待 |
| EA-03 SQL只读Agent切片 | 授权资料与现有分析能力；选择工具/请求补充/完成的有限行为；复用已有模型工具调用 | **SQL Agent执行与后台入口已实现**：sql-readonly-agent v1复用Spring AI ToolCallingAdvisor，Fake模型及本地PostgreSQL验证动态取证、追问、结束、拒绝/预算/取消、事务边界及持久终态；普通API Responses真实两轮工具调用及单SQL候选审批已验；复杂SQL限定样例、知识引用与缺证据追问已验（首轮CTE超时保留）；完整作用域/生产效果/用户接受待验，见11.9及11.12和[接续](backend-module-composition.md#complex-sql-acceptance) |
| EA-04 运行机制与事务 | 复用Task/Run/Mission，短事务保存状态与证据，模型/工具调用在事务外，审批和恢复按动作持久化 | **部分实施**：Agent在原Task下持久输入/专家revision/检查点及模型预算，租约隔离并显式跨重启续跑；单SQL候选通过独立人工审批复用持久交付，UNKNOWN不重放，已验独立JVM强制退出。模型无事务，本地取证/状态为短事务。显式后台任务可自动续跑，审批UI已接通；旧DAG90秒事务、通用写工具、UNKNOWN人工处置、Chromium视觉/模拟审批交互已验，Responses单SQL文件整链及原生100%已验；其他缩放/复杂SQL效果/用户接受仍待，见11.10～11.12 |
| EA-05 产品与真实验收 | 专家编辑器、行为轨迹、领域结果/证据展示及旧SQL入口兼容 | 待实施；真实供应商/数据权限/费用另按明确授权验证，用户接受独立记录 |

EA-03若仅验证同步只读行为，可使用有明确生命周期的临时执行；需要脱离请求、跨重启、写操作审批或后台任务时必须先满足EA-04对应关口。产品角色命名与模式选择尚未定稿，不以本节代替后续行为接受。

### 11.5 EA-02首片：固定流程独立（2026-11-08）

WorkflowDefinition只包含步骤和连线，构造时复制集合；WorkflowGraph负责100节点/500边上限、必填项、重复/断边、单入口和无环校验；FixedWorkflowRunner负责稳定拓扑顺序、必需节点失败向后阻断、可选失败/缺证据标记不完整、节点间预算及观察回调。它不选择工具、不调用模型、不加载注册表、不赋予授权、不创建线程或持久任务。

现有ExpertGraph将eap/v1的步骤/连线适配到WorkflowDefinition，继续执行能力词表、开关、规则需求及专家声明校验；ExpertExecutionService通过同一运行器驱动既有Handler，每个节点仍在原resolveFor/授权上下文中执行。SQL规则、模型增强、资源释放和Task结果保存归原服务。45秒调度预算仍包含授权查询准备，零剩余预算产生失败/阻断证据且不调用节点；达到预算后只阻止后续节点，正在运行的I/O仍须原Handler自行实施超时/取消，不能宣传为硬性整轮45秒终止。

既有SQL输入、输出字段、v1清单、URL、内置资源和数据库不变；预算错误文本改为不绑定SQL默认秒数的“流程达到调度预算”，同时在恰好耗尽预算时拒绝启动节点。通用流程结构校验不等于专家权限或业务有效性校验；消费方必须显式提供已授权的节点执行回调。新模型不是新的持久化清单版本，也未开放通用执行HTTP入口。

本片使固定流程成为可复用执行基础；专家角色/行为策略的版本化合同、应用请求的SQL专用字段解耦、长事务拆解与Agent行为仍是后续项（能力层输入分离见下一片）。保留90秒事务并不代表已完成EA-04，后续模型/工具循环须在持久任务和短事务合同下实现。

### 11.6 EA-02第二片：能力输入按领域分离（2026-11-08）

此前core的CapabilityRequest要求所有能力调用都实现sql/question/databaseId/explainPlan/enhanceWithModel/pattern，CapabilityContext也以sql命名通用文本。现CapabilityRequest仅标识领域输入，SQL模块的DatabaseEvidenceInput持有数据库资料ID/执行计划快照契约，local模块的WorkspaceSearchInput仅提供pattern；CapabilityContext.input为已准备的领域文本，requestAs只对显式实现的领域接口做类型检查，不按同名属性推断，不做反射/JSON转换或跨领域回退。

现有ExpertExecutionService.Request保留六字段JSON与SQL校验/脱敏，作为产品兼容请求同时实现两个领域接口；SQL解析读取已准备的context.input，元数据/计划处理器读取DatabaseEvidenceInput，工作区检索读取WorkspaceSearchInput。知识、MCP及CLI的既有上下文构造不需要填充SQL接口成员。输入类型不是权限：数据库资料必须继续查询持久专家grant；工作区由执行上下文传入，输入无权指定cwd；工具权限仍由原注册表/调用方执行边界决定。

缺少/错误领域输入归类为缺少上下文；数据库读取/本地进程不启动，计划缺失返回plan.loaded=false，而非NullPointerException。空/超长检索输入的原拒绝规则保留。同名databaseId/pattern字段但未实现接口的对象不视为有效领域输入。

Java消费方需将CapabilityContext.sql()改为input()，并让自定义请求实现相应领域接口；本次未承诺Java二进制兼容。HTTP URL/JSON六字段、专家清单、数据库迁移与业务调用顺序保持。应用层ExpertExecutionService仍是SQL产品兼容服务，尚未实现通用Agent请求/专业行为绑定；90秒事务与持久任务改造仍是EA-04关口，不能据此宣称所有SQL语义已从workflow消除。

### 11.7 EA-02第三片（历史快照，绑定进度见11.8）：按专家选择分析策略（2026-11-08）

core新增ExpertAnalysisPolicyResolver，输入为服务端加载的ExpertManifest，输出为所选ExpertAnalysisPolicy或空；执行服务不再持有全局单一策略，而在校验当前专家和输入后、打开执行资源之前解析一次。所选策略随Run传递给规则解析、事实发布、判定、汇总与可选增强；allowedFacts复制为不可变集合，后续修改选择器或其原始集合不能改变在途执行的策略引用/事实范围。策略实现仍须共享无状态或自行保证线程安全，这不是策略对象所有内部配置的深复制。

未知/未配置策略返回503 EXPERT_ANALYSIS_POLICY_UNAVAILABLE，资源、工具和Task保存均不启动；解析器抛出异常也直接失败，不退回任意可用策略。解析来源不含HTTP策略ID，不新增工具授权或平行能力注册表。宿主可按专家定义选择不同领域策略，不需改通用调度代码；直接Java消费仍可显式传入固定策略，原构造方式保留。

完整产品在FullApplicationConfiguration显式提供SQL兼容选择器，保留现有v1专家结果。用户提供自己的Resolver Bean时默认定义退让；没有把所有可见策略Bean按顺序猜测匹配，也不按expertId包含sql等字符串推断专业角色。测试覆盖同服务多策略、并发隔离、单次解析与词表固定、空/异常拒绝、产品默认与用户覆盖装配。当前产品仍未持久化专家与行为/策略的绑定；SQL专用输入输出、Agent模式、角色配置及EA-04长事务/任务机制仍待。


### 11.8 EA-02第四片：专业分析行为版本持久绑定（2026-11-08，历史快照；自主模式见11.9）

专业行为引用现为`behavior: {"id":"sql-analysis","version":1}`，随专家manifest持久保存；缺省旧清单通过宿主显式兼容绑定解析，首次管理保存后固定版本。省略字段的旧编辑器更新保留现有绑定；null不表示清除。清单只能引用宿主已安装的精确行为版本，无法提交实现类/提示词来获得执行逻辑或权限。完整产品只发布SQL分析v1，其模式仍为fixed-workflow。专家目录公开版本合同，保存/启用/执行共同拒绝未知行为版本。

行为变更继续经过原草稿/revision/撤权/重新启用流程；一次执行使用已加载绑定和不可变事实词表，结果及持久节点观察记录该行为版本。数据库UPSERT原子保留旧编辑器省略的绑定，并在同事务验证实际保存值；陈旧读取与存储值冲突时拒绝并回滚。已完成本地PostgreSQL保存重载、独立连接读取、旧编辑器兼容、行为变更撤权、提供方移除后的拒绝/停用、陈旧预读回滚、执行选择及历史版本保留回归；行为/Handler使用确定性测试替身，不作为真实模型或SQL专业效果验收。

实现与命令详见[模块组合第十轮](backend-module-composition.md#implementation)。本片不修改数据库迁移或内置专家资源；UI行为选择、完整角色与行为独立规则目录、SQL请求/结果解耦仍待，EA-03/EA-04未完成。11.5～11.7中有关“持久绑定尚待”的文字保留为各片当时的历史快照。


### 11.9 EA-03：SQL只读自主Agent（2026-11-08，历史快照；恢复与审批见11.10）

新增显式`sql-readonly-agent@1`，使用`eap/v2 Expert`的`agent.goal/tools`；steps/edges必须为空。它不会把旧v1流程重新解释为自主目标。后端管理保存、激活与目录识别模式、允许工具及必需sql.parse；原sql-analysis v1和DAG入口保留，新Agent绑定从旧入口调用返回冲突。

`ai-sql/SqlExpertAgentService`先复用sql.parse进行确定性抽取；缺SQL或解析失败直接要求补充，不请求模型。有效输入后复用Spring AI ToolCallingAdvisor/ToolCallingManager进行多轮工具交互：模型可选择read_evidence、request_input或finish_analysis。工具只支持sql.parse、授权数据库表/索引快照、用户提供的EXPLAIN与授权知识检索；sql.parse先由服务运行，其余按模型观察选择，重复工具拒绝。每次只允许一个工具调用；工具不接受新SQL、资料ID、路径、提示词或授权参数，始终使用原始请求与专家声明/grant交集。返回自由文本不算完成，必须调用终结工具；缺证据/阻断规则覆盖模型的completed建议，结论始终unverified。

`engine-core/ExpertAgentAccess`是现有产品授权/持久化端口；workflow的实现复用ExpertDefinitionMapper/Service、grant表和Task/Observation表。每次模型前后重验enabled/revision/清单及已用能力开关；每次本地读取持专家共享锁至读取结束，重新查询授权，不在模型或网络等待期间持事务。run只在进程中拥有临时执行状态；开始时唯一UUID插入Task，结束记录状态、模型调用数、行为版本/revision和脱敏观察。完成后不接受同UUID重试。

边界：4个并发槽、45秒调用等待预算、最多6轮模型/6次工具（每工具最多4次，证据源只读一次）、80k上下文字符/16k单轮输出/16k取证输出，模型maxTokens=2048。超时或DELETE取消中断worker并封闭后续工具/模型入口；不配合中断的Provider仍占用槽至退出，不能继续执行迟到工具，也不能把终态改回成功；不宣称能撤回已发送的网络请求。仅支持当前具有工具协议的chat-completions连接；已有Responses/ChatGPT纯文本适配明确返回AGENT_MODEL_TOOLS_UNSUPPORTED，不静默退化。

接口与完整样例见[模块组合第十一轮](backend-module-composition.md#implementation)。本轮只做本地Fake模型与本地PostgreSQL验证，无真实模型计费、业务SQL执行、MCP/CLI写操作或数据库DDL。进程崩溃可能留下running Task，本轮不自动接管或重放；逐动作持久化、断线独立任务、跨重启恢复/UNKNOWN、写操作审批、前端UI及真实模型效果仍属于后续验收。


### 11.10 EA-04首片：持久续跑与单SQL候选文件审批（2026-11-08，历史快照；自动调度与UI见11.11）

原Task下新增一对一续跑记录，固定专家版本与输入，提交取证检查点并在模型调用前扣减持久预算。新owner/60秒租约阻止旧线程提交；单次45秒等待、最多3次尝试/累计6次模型请求、24小时总有效期。重启不自动调用模型，由显式resume继续；已提交证据复用，知识/资料grant重验，终态和取消不可重放。独立JVM在模型边界强制退出后，已验证另一JVM复用检查点与累计预算。

写切片仅允许用户预先指定单个SQL候选路径。模型只调用propose_sql生成候选，不持有文件应用或数据库执行工具。候选/基线/专家版本摘要及15分钟有效期绑定审批；独立人工批准后复用现有CodeChangeService执行，决定记录本地操作员，重试不二次写入，基线变化/撤权/过期拒绝，写中断UNKNOWN不重放。实现、接口、确切验证结果见[模块组合第十二轮](backend-module-composition.md#implementation)。V23/V24为增量迁移，已应用历史不改写。

这是SQL Agent显式恢复与文件候选审批切片，不代表旧Chat/SSE自动持久恢复，也不代表通用Agent后台调度、外部进程接管、数据库写审批/执行或用户验收完成。旧DAG90秒事务、UNKNOWN人工处置、前端行为轨迹、真实供应商效果仍待。


### 11.11 EA-04接续：自动后台调度与审批UI（2026-11-08）

显式queue持久化输入/专家快照和automatic许可后返回202；ApplicationReady后的有界调度复用原resume/CAS租约与累计预算。历史手动任务不自动启动；显式后台任务重启后继续，最多3次尝试、累计6次模型调用，授权失效终止。每宿主4个调度槽，100项活动队列限额由数据库短事务串行准入。V25增量迁移保留历史版本，自动许可不可变。

专家页新增提交/列表/证据/候选Diff及独立批准拒绝。离页不取消服务端任务，返回读取持久状态；写审批仍需用户确认当前proposalId/digest，待审批、UNKNOWN或终态不被调度器重放。预览模式禁用，旧DAG编辑器不覆盖v2清单。复用交付服务，不执行SQL。基础SQL Agent创建仅包含解析与用户EXPLAIN，不授予数据库/知识权限。

实库/Fake模型验证双调度器竞争、优雅重启与独立JVM硬退出自动恢复、限额/取消/撤权/幂等/审批隔离；组件回归覆盖审批/拒绝、重挂载、错误/过期/UNKNOWN/预览、费用确认和迟到响应隔离。确切命令与证据见[模块组合第十三轮](backend-module-composition.md#implementation)。后续真实Chromium视觉回归已完成（四档宽度、浅深色、真实Monaco、模拟审批动作与重挂载），修复共享确认框溢出及Diff销毁错误。真实供应商效果、原生桌面缩放/用户接受、通用写工具/UNKNOWN人工处置及旧DAG长事务仍待；浏览器夹具不替代真实模型/写入业务验收。


11.11验收接续（历史阻塞快照，已由11.12解除）：真实默认GPT API/gpt-6.1-sol Responses文本请求成功（5.45秒），但真实SQL Agent任务在EAP的AGENT_MODEL_TOOLS_UNSUPPORTED门禁失败，模型调用0、无候选/写入。现有Responses适配器仅支持文本，不能将连通性当作自主工具行为通过；已请求用户选择补齐工具协议或提供chat-completions连接，未擅改连接。Windows原生100%（96 DPI）下有界面Chromium/viewport:null回归通过；其他系统缩放仍因桌面控制通道缺失未验。详见模块组合接续和浏览器README。

### 11.12 Responses工具与真实SQL候选整链（2026-11-08）

用户明确授权补齐工具支持。普通API Responses通过既有Spring AI ToolCallingAdvisor执行工具；适配器只负责function声明、完成响应校验、call_id输出匹配、加密reasoning回传。失败/截断/未知工具/重复ID/非法参数均不执行工具。账号计划SQL Agent门禁与Chat Git门禁保留。

真实原连接gpt-6.1-sol执行两轮：read_evidence读取用户提供的EXPLAIN，再propose_sql；审批前目标不存在，经真实页面确认后写入一个SELECT常量文件，独立读回一致，重复审批与服务重启均不重写/不增加模型调用。代理按用户授权执行测试审批，不等于用户最终接受；未执行SQL，不证明查询语义或性能。运行ID、hash、截图、回归数字见[模块组合第十四轮](backend-module-composition.md#responses-tools-acceptance)。

### 11.13 专家工作区分层（2026-11-08）

用户授权将平铺面板改为专家列表/概览/配置/任务/审阅父子页面；SQL Agent目标和工具按原v2合同保存，DAG编辑器保留。后续截图反馈的终态轮询抖动和整列配置已修复：配置按类别Tabs，运行中静默更新，终态只手动刷新。前端132文件773项、类型/架构/构建及真实125%只读UI复核通过；审批写入仍由原服务端绑定校验，未调用模型或再次写入文件。范围/限制见[界面记录](expert-workspace-navigation.md)。

接续：用户批准一次性独立编辑工作台并提交推送，现已复用@eap/ui EditorWorkbench接入固定流程/SQL Agent/GrapesJS；节点库/结构树/属性选择一致、未知目录不虚构能力、草稿保护与原型手工预览已验。当前前端134文件786项与新工作台7组浏览器技术检查通过；前段773项/原生125%为历史快照。真实模型执行与服务端授权合同未变，原生150%及用户最终接受仍待，见上述界面记录。

<a id="git-operation-executions"></a>
## Git 程序与持久调用（status / diff）

### status首片（历史阶段，2026-11-09，e2c53c7）

以下仅status的范围与授权是已提交历史；当前接续合同见下方diff段落。

范围由本轮用户确认：复用现有 Git 程序与 status/diff 操作模型，只交付 status 新执行口；记录跨重启保留，UNKNOWN 阻止重复启动，人工解除与进程接管不在本片。

本片已获用户提交并推送授权，随本次提交交付；验证与剩余关口保持下述限定范围，提交及推送不替代用户产品接受。

- 程序目录是 CliProgram / CliOperation / handler 的投影，不另建注册表。git-status / git-diff 继续作为专家引用与开关标识。路径、版本及探测缓存归 git；可信目录与程序管理共用探测结果。旧操作级探测响应保留原 id。
- 程序级路径优先；无程序覆盖时，兼容一致的历史操作覆盖。历史status/diff覆盖冲突时显示绑定冲突并拒绝运行，不静默选择。整个调用捕获一个已解析绝对路径。
- 固定接口基路径为 /api/cli-programs/git/operations/git-status/executions：POST只接收requestId，持久化后返回202；GET列表默认20条、最多100条；GET /{id}读快照；POST /{id}/cancel记录取消意图。不同requestId遇在途/UNKNOWN返回409并附阻塞记录；同requestId读回原记录。
- 读写按服务端规范工作区隔离。请求不接受路径、参数、批准字段或其他操作；保留Host/Origin/JSON门禁。旧同步invoke复用同一服务，停止HTTP等待不构成进程取消。
- 状态为CREATED/RUNNING/CANCELLING/SUCCEEDED/FAILED/REJECTED/TIMED_OUT/CANCELLED/UNKNOWN。取消覆盖根目录、filter配置与最终status；预检与安全参数仍由GitCapability生成。只有未启动或退出且进程树清理完成时确认取消。迟到取消不覆盖已完成结果。
- 存储端口与JDBC适配留在现有workflow产品服务，API只增取消信号/身份回调，local/core不依赖数据库。创建、领取、取消和结果写回使用短事务；运行期间无事务。stdout/stderr脱敏后各限8000字符，带截断标记和有序步骤证据。
- V26新增独立工具调用表，V27补列注释。只读核查确认本机服务已应用首版V26，校验和为 -716806117；保留原稿，不repair或改写已应用历史。实库用例在UUID临时schema中验证V26/V27与仓储SQL，只清理自己的schema。
- 服务重启把遗留在途记录标UNKNOWN，不重放、不按PID销毁。UI停止轮询，保留记录并阻止同工作区/操作重复启动；人工处置另片。
- UI复用Button/Badge/Collapse/Feedback；L4面板留capability域，DTO/HTTP在runtime-client，文案走i18n，无新共享类别。KeepAlive离页只停止观测，返回重读；网络错误暂停轮询且不重试执行，迟到响应按观测代次丢弃。

实现、失败修复、命令与验证边界见[阶段记录](../records/backend-composition-history.md#tool-operation-executions)。此合同不关闭通用TC-01、用户接受或其他CLI业务验收。

### diff接续合同（历史阶段，8abbd21，2026-11-09）

- 复用同一ToolExecutionService、存储和面板，仅允许git-status/git-diff。HTTP路径为 `/api/cli-programs/git/operations/{operation}/executions`，旧status URL、同步invoke及客户端包装保留；未知操作404，POST仍只接受规范UUID requestId，Host/Origin/JSON门禁覆盖两种操作。
- 工作区由服务端规范化，列表、详情、取消和在途/UNKNOWN互锁按工作区＋操作隔离。跨操作详情/取消404；同操作requestId读回原记录，工作区内跨操作复用requestId返回409 REQUEST_ID_OPERATION_CONFLICT且不带另一操作记录，插入竞争后同样校验。
- status/diff可各有一项在途，共享现有16槽容量。授权及派发分别重验对应开关/Handler/Capability、工作区和捕获的Git绝对路径；保留旧status错误码。UNKNOWN仅阻塞对应操作，重启不接管PID、不重放、不提供人工解除。
- diff复用GitCapability默认命令，读取已跟踪文件的未暂存差异，不含仅暂存或未跟踪文件；不接受自定义路径、参数、ref。安全预检与环境不变，最终证据步骤为diff。取消覆盖root/filters/diff，继续等待退出与进程树清理证据；stdout/stderr脱敏后各限8000字符。
- V28只扩展capability CHECK到两种操作；V26/V27及原requestId唯一约束、按操作在途索引和快照一致性约束保留。实库测试在UUID自有schema验证V26/V27已有status记录经V28升级仍可读，未修改应用Flyway历史。用户后续启动full-application，应用库V28成功迁移并只读核验，checksum=-329790285与源码一致；V26/V27校验和保留。
- 前端同一L4面板按稳定operation key挂载两个实例，各自维护requestId、历史、轮询与观测代次；默认status兼容，旧status操作测试标识保留。基础交互复用@eap/ui，DTO/HTTP与有限操作类型在runtime-client，文案中英文同步。无新共享包/类别。
- mock目录将diff演示快照改为已启用，启动读取对应操作开关；输出明示模拟。组件回归分别覆盖两种操作及双实例隔离，真实Git与mock浏览器证据分列。

本轮范围由已批准计划确定；用户已授权提交并推送，随本次提交交付，最终提交号和远端对齐由Git回读确认。命令、失败修复与验证边界见[diff接续记录](../records/backend-composition-history.md#git-diff-operation-executions)；UNKNOWN人工处置、跨重启进程接管及用户接受继续保留。

### 工具UNKNOWN人工核对关闭（历史阶段，bb83f31，2026-11-09）

范围仅内置git-status/git-diff的独立ToolExecution，不推广到SQL Agent、候选写入、Mission或任意CLI。真实diff HTTP标记差异、规范工作区/三步退出清理、幂等/迟到取消/越操作拒绝及独立JDBC读回已验；见[本轮记录](../records/backend-composition-history.md#tool-unknown-manual-review)。

- POST `/api/cli-programs/git/operations/{operation}/executions/{id}/resolve-unknown`只接受规范UUID requestId、10～2000字符note、processTreeStopped=true。本地操作员身份由服务端固定；未知操作/越工作区或操作404，非法输入400，在途owner、非UNKNOWN或冲突核对409；沿用Host/Origin/JSON门禁。停用操作仍可核对旧记录，不能由此自动启动或扩权。
- 服务不把PID消失、无PID、父进程退出或超时当作进程树结束证据。操作员须先在OS核对本次执行及其相关子进程均已结束，并说明核对依据。页面展开已有脱敏进程身份/命令/证据作为线索，要求独立勾选和ConfirmBox二次确认；代理/测试夹具的核对不算用户产品接受。
- 在既有短行锁中重验UNKNOWN且本服务active map不持有该执行；保存独立resolution（核对requestId、脱敏有界说明、规范原说明SHA-256幂等摘要、local-operator、时间、人工确认）。相同requestId/规范说明幂等返回；不同请求或说明409，第一次核对不可覆盖。仅支持一个执行宿主，与既有启动UNKNOWN处理一致，不新增多宿主进程所有权协议。
- 状态为CLOSED_UNKNOWN，展示“人工关闭（结果仍未知）”。原stdout/stderr、步骤、未知原因、exitCode/exitEvidence、cancelRequested及finishedAt保留，不伪造成功/取消、退出时间或OS清理证据。重启/旧启动requestId/迟到取消保持该记录；原partial index自然释放对应操作阻塞，只允许后来显式新requestId启动，不重跑旧执行、不杀进程。
- V29增量扩展状态CHECK并约束CLOSED_UNKNOWN必须附完整人工核对记录；历史无resolution JSON兼容，V26～V28不改。核对存储失败事务回滚，UNKNOWN互锁不释放。自有schema回归覆盖升级、缺审计拒绝/回滚、读回、并发核对、重启与再次手动启动。full-application恢复后V29已成功迁移，checksum=-508415836只读回读与源码一致；真实HTTP已验已成功记录/越操作/恶意Origin拒绝，未制造真实孤儿进程。
- 前端和mock复用原面板/DTO链路；响应丢失时暂停、锁定原核对内容，经重新查询后才允许显式重提同一请求。离页只停止观测，返回读回审计；无自动重提、自动恢复执行或隐式解锁。UI基础组件复用@eap/ui，业务留L4 capability，文案走i18n，无新增共享类别。

真实孤儿进程核对演练、跨重启进程接管、用户接受及其他领域UNKNOWN继续独立；本轮已获用户提交并推送授权，随本次提交交付；结果以Git回读为准。

### 当前进程身份线索（2026-11-09）

- GET `/api/cli-programs/git/operations/{operation}/executions/{id}/process-review`复用规范工作区/操作隔离，仅UNKNOWN/CLOSED_UNKNOWN允许查询；其他状态409、跨操作/工作区或未知ID404。客户端只传执行ID，不接受PID、路径、argv或系统扫描条件。
- 从持久步骤读取已捕获processPid/processStartedAt/processExecutable，最多前8步及每步32个已观察子进程身份；API类型在eap-api，本地ProcessHandle观察器在engine-local，workflow只负责范围/步骤投影，web提供HTTP，不引入框架/依赖或第二执行器。
- 比较完整启动时刻和绝对规范可执行路径，区分NOT_CAPTURED/NOT_FOUND/MATCHING_ALIVE/MATCHING_EXITED/IDENTITY_MISMATCH/UNVERIFIABLE/UNAVAILABLE。PID存在不足以确认身份；不读取命令参数、环境或文件内容，不枚举进程/子孙或发出终止动作。路径脱敏并限1000字符；权限/平台不可用返回不确定线索。
- 返回临时观测时间、执行ID/当时状态与截断标记，completeProcessTreeEvidence固定false。父进程缺失、身份不符、已退出或无法核验均不证明子进程已结束；绝不修改持久状态/退出证据/核对审计，也不替代人工进程树确认。人工关闭仍由原独立接口裁决。
- 面板仅显式点击后读取，展示捕获/当前时间与路径、状态及不完整边界；无自动轮询/自动解锁。离页清除临时观察并丢弃迟到响应，返回读取持久记录后须重新点击。旧UNKNOWN处置与CLOSED_UNKNOWN历史保留，复用@eap/ui基础组件，无新共享类别或数据库迁移。
- 隔离测试创建自有Java父子进程，终止父进程后仍观测子存活，最后清理精确自有进程。该证据验证语义及OS观察器，不是用户异常Git进程的完整人工接受，更不是跨重启接管。

前一阶段已作为b6e9748提交并推送，命令、结果与限制保留在[当前进程线索记录](../records/backend-composition-history.md#tool-process-review)。本轮接续证据见[已观察子进程身份](../records/backend-composition-history.md#tool-descendant-evidence)，接续已获用户提交并推送授权，随本次提交交付。


### 已观察子进程身份的有界持久与核对（2026-11-09）

- 复用DefaultProcessExecutor现有descendants观察循环与ManagedProcessControl，新增兼容default回调。每步最多保存32个执行期间已观察身份（PID、完整启动时间、可执行路径），第33个置截断；子进程信息不可读时只保留不充分线索。身份依据不包含argv、环境或进程用户，不新增系统扫描或终止接口。
- 子进程证据与清理句柄独立：达到证据上限后仍保留全部已观察句柄用于原有ProcessTree清理。只对新句柄捕获身份；累计快照仅变更时通知，普通通知间隔至少250ms，正常清理前强制刷新剩余快照。32个身份加截断最多33次变更通知/步骤。finally继续原清理；通知持久失败抛回workflow记UNKNOWN，不把失败写库当完成。
- 启动步骤保存空子进程快照以标识新版本；后续回调在既有短事务更新步骤，最终返回合并既有证据及metadata。中断/Reader错误的已捕获身份仍随结果保存；finally不新增可能遮蔽原异常的存储回调。进程瞬时创建/脱离、轮询间隙、最后清理枚举、崩溃及尚未刷新的窗口均可能缺失，证据不完整。无新迁移，V26～V29不变。
- process-review每步返回descendantsCaptured、descendantsTruncated及descendants，并再次按32限额投影（最多8步）；历史无列表为未捕获，空列表仅表示未观察到，非法列表项给NOT_CAPTURED；超量/截断不隐去提示。复用同一身份检查器，不修改持久记录/人工审计，completeProcessTreeEvidence仍固定false。
- 前端保留显式检查/离页清除/迟到响应隔离与人工确认；父与子共用身份呈现，区分历史缺失、未观察到、截断，任何结果均不自动勾选或解锁。业务留L4 capability，DTO在runtime-client，复用@eap/ui原语，无新增共享类别。mock子进程存活/截断仅为模拟，不能替代OS证据或用户接受。

实际验证：真实status HTTP执行三步均捕获并保存1个子进程完整身份，独立只读JDBC快照与HTTP一致；另有64项最终定向（含自有schema）、956项完整离线（851通过/105门控跳过）及834项前端测试和14组Chromium/mock验证。完整命令、文件检查及限制见[本轮记录](../records/backend-composition-history.md#tool-descendant-evidence)，不把正常执行或模拟核对升级为异常人工接受。


### 受控异常UNKNOWN整链与历史执行详情（2026-11-09）

- d7c14288ec7c6fd01b6a87d5c0397968f38b8f4d已按用户授权提交并推送，HEAD/origin/main/远端ref一致。以下按本次授权提交。
- 测试夹具限于full宿主测试目录：通过EAP_RUN_TOOL_UNKNOWN_REVIEW=true显式运行，同时要求已批准本机EAP_RUN_BOARD_PERSISTENCE=true及Playwright/Chromium路径。UUID自有schema仅应用V26～V29及测试开关表；既有服务/控制器/JDBC/事务/Host-Origin门禁和Vue面板实际接线，测试宿主监听随机loopback端口。无产品故障注入接口或模型调用，测试注册不进入产品装配。
- 故障仅在测试ProcessExecutor适配器中替代一次CLI命令，启动自有Java父子进程；保存全部已观察身份后强制终止自有宿主，持久步骤仍RUNNING，重启初始化转UNKNOWN并保留同操作互锁。Java子进程就绪显式握手，不能将Windows conhost等首个后代误作目标子进程；捕获辅助进程同样按完整身份核对/清理。
- 实际Chromium面板检查父子存活→精确停止父但子仍存活→精确停止全部已捕获自有进程。每阶段检查均不改状态、审计或勾选；停止后仍要求说明/勾选/ConfirmBox二次确认。CLOSED_UNKNOWN保留原步骤、stdout/stderr、取消意图、未知原因与退出字段；同核对幂等，冲突409、跨操作404、旧启动requestId及迟到取消不改原记录，显式新请求才执行实际Git；再重启读回关闭记录不变。
- 补齐实际页面缺口：新执行成为当前记录后，历史Collapse新增公共Button“查看执行详情”，调用原gitOperationExecution(operation,id)隔离GET，随后可检查旧CLOSED_UNKNOWN身份。沿用generation/AbortController丢弃离页或迟到响应，读取失败进入既有不确定态并显式重查；选择历史不取消、启动或核对执行，其他UNKNOWN/在途记录仍由records互锁。重新查询保留原有“优先在途/UNKNOWN，否则最近”的规则。
- 生产后端端口与持久合同复用，无新增路由/迁移/权限；新增后端门控验收与前端领域入口。UI已搜索并复用@eap/ui Button/Collapse/ConfirmBox，L4 capability业务与i18n原位，测试夹具统一置__tests__，无新共享类别或暂存登记。
- 整链验证只证明受控Java进程替代与实际HTTP/PostgreSQL/Vue路径，不证明真实Git故障、跨重启进程接管或用户产品接受。测试结束停止所有自有宿主/进程、删除自身schema，并比对应用schema工具记录的ID/摘要完全不变；不自动解除产品UNKNOWN。命令、失败修复与证据见[本轮记录](../records/backend-composition-history.md#tool-unknown-controlled-acceptance)。

本轮最终验证：65项定向全部通过（含受控整链7组真实浏览器检查与JDBC对照）；完整离线957项中851通过/106门控跳过；前端137文件840项通过，typecheck/build/architecture/lint/stylelint/格式通过。应用按原参数恢复PID38636，health=200/ok；29份迁移校验通过、V26～V29不改。工具应用记录摘要不变，自有schema/宿主/进程及临时监听清理完毕；接续代码按本次授权提交，见[证据](../records/backend-composition-history.md#tool-unknown-controlled-acceptance)。


### 真实Git异常与关闭后原始证据（历史阶段47433d8，2026-11-09）

- a641892956a845f1310c69f09cf69fa18bd0b2bd已按用户授权提交并推送；本轮接续按本次授权提交。
- 复用ToolUnknownReviewFixture/AcceptanceTest，新增EAP_RUN_REAL_GIT_UNKNOWN显式门控，并同时要求原UNKNOWN验收及已批准本机持久门控。真实Git模式保持GitCapability、注册程序、原命令数组、环境和DefaultProcessExecutor不变；root/filters/status均执行实际Git。独立仓库2000个自有未跟踪文件提供大于管道缓冲区的状态输出；测试started回调在身份持久后等待，避免Git在故障注入前自然完成。
- 测试仅对已知父PID的后代做外部OS审计，核对PID/完整启动时间/可执行路径后精确终止实际Git；外部审计记录不注入产品步骤或伪装成执行器捕获证据。放行原执行器取得真实非零退出及清理结果，再在结果返回workflow前中断宿主。持久记录仍RUNNING、无该步骤退出字段；重启初始化保留UNKNOWN，不能从PID缺失或测试外部已知失败补造业务退出结果。
- 实际Vue/HTTP/PostgreSQL核对验证无自动勾选或解锁，说明+独立勾选+二次确认保存CLOSED_UNKNOWN，同核对幂等/冲突拒绝、跨操作拒绝、原步骤/未知原因/退出字段保留，新请求才运行正常实际Git，再次重启审计保持。故障为“真实Git强制终止加宿主丢失持久结果”，不推广为所有Git故障。
- 对照场景在自有无索引仓库写入有界损坏索引，让实际Git在宿主正常时返回明确失败；要求FAILED、非零exitCode及退出证据、无unconfirmedReason；删除仅本测试创建的索引后再次执行成功。对照结果独立记录，不将普通Git非零退出一律标UNKNOWN。
- 前端原始命令/步骤证据Collapse复用既有DTO与隔离GET，对UNKNOWN/CLOSED_UNKNOWN均可读，仍只有UNKNOWN提供核对表单。新增说明：步骤状态是原执行时保存的事实，人工关闭不改写历史RUNNING，不据此推断当前进程存活。业务留L4 capability/i18n、公共Collapse原位，无新API/迁移/共享类别。
- 测试结束精确清理自有进程/宿主/schema，比较应用工具记录ID/摘要不变；首轮真实Git已通过，最终实测/对照结果见[本轮记录](../records/backend-composition-history.md#real-git-unknown-review)。用户产品接受、其他Git异常矩阵与跨重启接管仍独立。

最终定向66项全部通过（原Java/真实Git两类共13组实际浏览器检查）；真实Git异常exit1但持久结果丢失仍UNKNOWN，索引损坏正常观测为FAILED/exit128/有退出证据，修复后SUCCEEDED。原记录/JDBC/重启与应用库不变断言通过。前端842项、工程检查及关闭后原证据只读展示回归通过；完整离线和服务恢复以[本轮记录](../records/backend-composition-history.md#real-git-unknown-review)收尾为准。

最终收尾：完整离线958项中851通过/107门控跳过，32模块成功，0失败/错误；与66项定向实测分列。原应用按原参数恢复PID41284，health=200/ok，29份迁移校验通过、V26～V29不变；既有记录及路由隔离复核通过，测试资源清理完成。当前真实Git异常仅覆盖status及索引损坏对照，diff异常、其他矩阵和用户产品接受仍独立。20文件/UTF-8/176处链接/敏感/空白检查通过，接续按本次授权提交。


### 真实git-diff异常/恢复与核对操作身份（历史阶段067c3d8，2026-11-10）

- 从已推送47433d89a0e39d39c00449c2f8fd0019c9743c14接续，不重复提交/改写历史迁移。测试复用原ToolUnknownReviewFixture/AcceptanceTest和真实浏览器runner，新增EAP_RUN_REAL_GIT_DIFF_UNKNOWN门控；operation只允许git-status/git-diff，同一代码路径保留Java/status回归。
- diff的root/filters/diff均由原GitCapability/DefaultProcessExecutor运行，不替换程序/argv/环境。在自有仓库暂存tracked.txt基线和staged-only.txt，仅修改tracked工作文件并保留untracked.txt；大差异让实际Git在身份持久后等待期间保持在途。故障仍为精确终止实际Git、取得非零结果后在workflow持久提交前中断测试宿主，重启保留UNKNOWN，不伪造退出字段。
- 核对链验证同操作互锁、跨操作requestId复用409、其他操作实际执行成功、跨操作详情拒绝、不完整人工确认拒绝及记录不变；实际面板说明/勾选/二次确认关闭，幂等/冲突、旧请求/迟到取消、显式恢复、历史原证据与再次重启读回均沿用生产接口。
- 恢复diff仅包含已跟踪文件未暂存差异，必须含专用标记并排除仅暂存/未跟踪标记。损坏索引的正常宿主对照须FAILED且有退出证据、无未知原因；finally恢复精确原index字节，重试成功后比较索引与三个工作文件字节不变。未执行提交、重置或清理用户仓库。
- 前端核对ConfirmBox增加当前操作的本地化名称及git-status/git-diff ID，与记录ID和工作区共同呈现。复用已有title/i18n、@eap/ui ConfirmBox和L4面板，无新共享模块/API/迁移。确认内容只用于辨识，人工确认与后端操作隔离门禁保留。
- 首轮遇辅助进程已退出竞争：OS审计先isAlive后检查身份时可能已MATCHING_EXITED；测试清理只对MATCHING_ALIVE发终止，NOT_FOUND/MATCHING_EXITED及PID复用IDENTITY_MISMATCH均跳过终止；退出断言按原身份而非PID是否存在，不确定信息仍失败。外部核对保存os-review.json，禁止终止复用后的未知进程。此修复限测试清理，不把进程缺失作为产品树退出证明。
- 当前原full-application未运行，验收只用隔离宿主，结束保持原启动状态。结果、失败及最终检查见[本轮记录](../records/backend-composition-history.md#real-git-diff-unknown-review)。完整树退出证明、跨重启接管、其他异常与产品用户接受独立。

本轮最终定向67项全部通过（Java7组/status6组/diff6组实际浏览器检查，共19组，0pageerror），包含diff损坏索引明确FAILED/exit128、精确还原index后SUCCEEDED，以及diff输出范围和index/文件字节保持、JDBC/HTTP关闭快照与重启审计不变。前端842项/面板45项与工程检查通过；最终证据见[记录](../records/backend-composition-history.md#real-git-diff-unknown-review)。其他异常矩阵、跨重启接管和产品用户接受仍独立。

最终完整离线959项：851通过/108门控跳过，32模块成功，0失败/错误，与67项明确门控实测分列。最终3个自有schema经独立只读JDBC核对不存在，应用记录摘要不变、fixture JVM/监听清理；full-application起始未运行，保持原状态。应用库29份迁移/最新V29，V26～V29校验和不变。19文件/13文本UTF-8/182处链接/敏感/空白检查通过；接续按本次授权提交，用户产品接受独立。


### status/diff取消、超时与结果返回中断合同（2026-11-10，接续按本次授权提交）

067c3d8已按用户授权推送并核对本地/远端一致。本轮复用原独立ToolExecution、实际Git执行器与HTTP/JDBC/面板，不引入新状态或迁移，测试门控EAP_RUN_GIT_INTERRUPTION_MATRIX独立于原Java/真实异常门控。

- 取消意图与取消确认继续分离：HTTP已持久CANCELLING/cancelRequested不代表CANCELLED；结果返回前宿主中断，重启UNKNOWN保留意图。UNKNOWN/CLOSED_UNKNOWN且cancelRequested时面板展示曾请求取消但未保存确认结果；关闭审计不清除该意图。
- 真实执行器已经得到CANCELLED/130、TIMED_OUT/124或SUCCEEDED/0，若workflow尚未持久结果，不能由重启或进程检查补造终态。测试timeout仅目标命令用实际1ns截止期，预检/恢复仍复用原执行器；测试回调等待不算超时。正常返回相同结果须落入对应终态、有退出/清理证据，禁止UNKNOWN人工关闭，随后显式新请求成功。
- 实际服务已提交CLOSED_UNKNOWN而核对HTTP响应中断，页面保留不确定态/原请求、禁止重复提交且不自动重提；显式重新查询读回已关闭审计。测试代理只中断真实响应传输，不模拟DTO、不增加产品故障路由。
- 六组真实矩阵全部通过，44组Chromium断言/0pageerror；原字段/JDBC/重启、跨操作互锁及diff范围/索引/文件字节不变均核验。前端844项/面板47项与工程检查通过。完整命令、失败及资源收尾见[主题记录](../records/backend-composition-history.md#git-interruption-unknown-review)；用户产品接受、完整树退出证明、跨重启接管及其他权限/IO/平台异常独立。

最终兼容定向67通过/1矩阵门控跳过（原三场景19组浏览器检查）；完整离线960项中851通过/109门控跳过、32模块成功，0失败/错误。独立只读数据库/迁移/临时schema、原记录摘要及自有进程/监听收尾均通过；full-application保持原未运行状态。六组矩阵与完整离线分列，详见上述主题记录和当前台账。
