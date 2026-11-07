# Agent 能力、本地运行环境与插件演进

状态：2026-11-05 技术路线回顾；源码检查基线 `main / 119391f`。本轮授权为文档与规划调整，不是框架迁移、工具安装、第三方代码加载、数据库迁移或真实模型调用授权。下列切片均待实施与验收；保留既有交付和未关闭缺陷。

## 1. 结论与适用范围

采用“确定性工程内核＋可治理上下文/记忆＋标准工具协议＋可信功能插件＋场景组合”。当前继续 Spring AI，不因尚未完成应用工程闭环而直接切换 LangChain4j。LangChain4j 保留为有业务触发条件的对照候选，不长期并行维护两套模型工具循环、连接或记忆体系。

本决定细化[主方案](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md)的技术与扩展边界；[台账](../planning-status.md)维护状态，[路线图](../roadmap.md)维护推进顺序。历史 S2 的固定 Chat/Builder A、B 原型不能覆盖现行五入口、Code/Work 共用会话与来源上下文恢复合同。

## 2. 当前事实与缺口

以下为静态源码检查，不是本轮运行验收。已有测试和历史实库证据仅按其原范围引用。

| 范围 | 源码事实与定位 | 未完成 / 不得推断 |
|---|---|---|
| 模型与工具循环 | `backend/pom.xml` 使用 Boot 4.1.1 / Spring AI 2.0.2；`EngineeringAiConfiguration` 使用官方 Memory/ToolCalling Advisor | 配置成功不证明供应商效果；不据此添加第二套循环 |
| 会话记忆 | 20条模型窗口；**MEM-01** 工作记忆分层+PUT/UI+本地持久+Task/Run+知识/Skill 依赖对抗失效 | 模型窗口仍非跨重启；UI 历史在浏览器；长期记忆未启动；sticky 清空保护未取消 |
| 敏感上下文 | `AiConversationRegistry.clearContextMemory`：知识/Skill一旦使用，后续每轮先清空模型记忆，包括移除资源和被拒请求 | 连续对话被主动牺牲；不能简单取消清空，派生回答也可能保留撤权知识 |
| 检索 | PostgreSQL FTS/关键词 + 专家授权引用；**KR-01**：离线 `KEYWORD_PROBE` + `POSTGRES_FTS` 适配 + 每题延迟观测 | 无向量；本机实库同题跑通/排序质量仍缺；引用不证明模型正确使用；KR-02 未触发 |
| 上下文 | `TaskContext`/`AiChatApplication` 拼装；**CE-01 首片**：`ContextBudget` 字符预算/输出预留/超限观测（CHAR_ESTIMATE） | 非 provider token；无压缩选择策略；ChatMemory 未精确计量（标 UNKNOWN）；派生失效仍靠清空保护 |
| 工具调用 | Java Handler可直接执行本地逻辑；CLI经 `CliOperationHandler` / `CliExecutionService` / `DefaultProcessExecutor`，使用argv与cwd；Chat当前受控工具为只读gitStatus | 不是所有工具都走Shell，也不是目录中的工具都向模型开放；cwd限制不是OS沙箱 |
| CLI管理 | `CliProgramService` / `/api/cli-programs` 与 `CliProgramManager.vue` 可登记程序、路径及固定参数操作；`LocalBinaries` 查PATH或指定文件 | 登记不安装；缺少受管版本、来源、更新、回滚、卸载与依赖管理 |
| MCP | 登记/授权/会话隔离；stdio + 分页 + 官方包 + http JSON-RPC + **legacy SSE** | Streamable-HTTP 未接；工具白名单仍为操作者声明；生产授权矩阵仍待 |
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

**KR-01 实库适配（2026-11-07，离线）**：`PostgresKnowledgeRetrieval` 将 `searchAuthorized` 行映射为 baseline Hit（含 `knowledgeBaseId`）；计量标 `POSTGRES_FTS`。`PostgresKnowledgeRetrievalTest` 通过。`RetrievalBaselineDbContrastTest` 在 `EAP_RUN_BOARD_PERSISTENCE=true` 下播种同题 fixture 对照阈值；本机缺口令时跳过，不宣称已跑通实库。未启动 KR-02。

**KR-01 延迟观测（2026-11-07，离线）**：`RetrievalBaseline.CaseResult.durationMs` 与 `Report.totalSearchDurationMs` 记录每题检索耗时；不设通过阈值（成本账证据），`RetrievalBaselineTest` 校验汇总一致。未启动 KR-02。

**MEM-01 首片（2026-11-07，离线）**：`TaskWorkingMemory` 保存目标/约束/事实引用/证据引用/依赖键（无正文）；与 `display_history`/`model_window`/`binding` 分层。`clearContextMemory` 与换模 `bind(..., clearMemory=true)` 失效工作记忆；sticky 清空保护不取消。会话响应附带快照。`TaskWorkingMemoryTest` 通过。

**MEM-01 本地持久（2026-11-07，离线）**：`FileWorkingMemoryStore` 写入 `<workspace>/.eap/working-memory/<id>.json`；同 ID reconnect 可恢复工作记忆且**不**恢复 ChatMemory；空闲驱逐不删盘，显式 DELETE 才清盘；失效原因可落盘回读。`WorkingMemoryPersistenceTest` 3 项通过。无自动长期抽取。

**MEM-01 Task/Run 关联（2026-11-07，离线）**：有 `taskRef` 的发送在 exclusive 下写入任务依赖键与本回合执行证据引用；换任务失效原目标/约束后重绑；不复制看板状态机。`TaskWorkingMemoryTest` 关联项通过。

**MEM-01 对抗失效（2026-11-07，离线）**：`syncMaterialDependencies` 在知识/Skill 发送路径写入 `knowledge:`/`skill:` 依赖；陈旧键触发 `DEPENDENCY_CHANGED`。对抗用例证明：PUT 不能取消 sticky 模型窗清空；重连不复活 ChatMemory/已失效目标；Skill digest 或任务切换丢弃派生工作记忆。`WorkingMemoryAdversarialTest` 通过。**不**取消 sticky 清空，未宣称可替代清空。

## 4. 协议与框架选择

- MCP连接工具/资源；A2A面向独立Agent互操作；内部静态DAG不必套通信协议，也不是自主规划。
- MCP首片：EAP作为Client，锁定SDK及一个只读服务器版本，验证initialize、分页发现、schema、授权call、拒绝、协议错误、超时、连接清理和跨专家/执行隔离。先核对现有stdio/http/sse登记格式与目标传输映射，不直接将旧http字段视为已支持Streamable HTTP。
- **MCP-01 stdio（2026-11-07）**：`StdioMcpCommand` 解析登记 endpoint（禁 shell/元字符）；`StdioMcpTransport` 子进程逐行 JSON-RPC、通知无响应、超时 `MCP_TIMEOUT`、close 时 destroy；`McpClientService` 在无内存传输时按 registry `transport=stdio`+endpoint 启动。假子进程 `FakeStdioMcpServerMain` 验证 initialize→list→call→清理。http/sse 仍 `MCP_TRANSPORT_UNSUPPORTED`。
- **MCP-01 分页与官方只读包（2026-11-07）**：`McpProtocolClient.listTools` 跟随 `nextCursor`（页数上限 32）。锁定 `@modelcontextprotocol/server-everything@2.2.1`（`OfficialReadonlyMcpLock`）；`EAP_RUN_MCP_OFFICIAL=true` 下 `OfficialReadonlyMcpStdioTest` 完成 initialize→分页 list→`echo` call→清理。不宣称生产授权或 http/sse。
- **MCP-01 http JSON-RPC（2026-11-07）**：`HttpMcpTransport`/`HttpMcpEndpoint` 对 registry `transport=http` 做单端点 POST（禁 userinfo、不跟随重定向）；本地 HttpServer 对照 initialize/list/call。不宣称 Streamable-HTTP。
- **MCP-01 legacy SSE（2026-11-07）**：`SseMcpTransport` 对 `transport=sse`：GET 收 `endpoint` 事件，POST 到消息 URL，经 SSE `message` 按 JSON-RPC id 配对；`SseMcpTransportTest` 通过。不宣称 Streamable-HTTP。
- 本地stdio进程的argv、cwd、环境和生命周期仍须约束；远端目标的认证/网络范围独立处理。MCP Roots及工具只读标注不是强制沙箱。不先将已有Java/CLI能力全部包装为MCP Server。
- A2A与EAP作为MCP Server延期至明确互操作需求；不得为对齐教材章节而全部实施。
- LangChain4j对照仅在自主协作等明确需求，或Spring AI出现可复现阻碍时启动。相同模型、业务样例、授权和验收合同下比较复杂度、正确性、token成本、延迟、取消/错误处理、兼容性与迁移回归；不预设胜者。具体版本、Java25/Boot4.1.1兼容性及模块稳定性待实验验证。
- 保留SQL业务回退/缓存、连接选择、自定义ChatModel、工具限额、授权、敏感记忆隔离和独立验证；框架迁移是独立决定，不是本轮规划更新的附带动作。

## 5. 工具供给与本地目录

### 5.1 系统引用与受管工具并存

系统工具只引用路径，不擅自升级/卸载。EAP受管工具安装到专用目录，记录来源、锁定版本、平台架构、校验、实际入口、依赖和使用者；复用现有CLI程序/操作登记与执行器，不另建Capability Registry。

首片仅选一种可信来源的一个便携工具或一个独立Python venv。安装是明确用户动作：展示网络下载/第三方代码风险；验证包内容与路径，拒绝解压路径逃逸；验证失败不激活，安装失败回滚。更新保留可回退版本；在途使用阻止删除；移除受管工具不能删除系统安装或用户项目。模型不能因缺依赖而静默安装，也不默认使用最新版、不经批准全局pip/npm安装。

### 5.2 逻辑布局（目标，物理路径待平台切片确认）

**FS-01 首片盘点（2026-11-07，只读探测）**：`GET /api/runtime/data-layout` 返回下列逻辑项的解析路径与 `exists`，不执行迁移。默认相对进程工作区（`EAP_WORKSPACE` 或含 `.git` 的 `user.dir`）展开：

| 逻辑路径 | 含义 |
|---|---|
| `data-root` | `.eap/` 应用数据根 |
| `config/model-connections` | `eap.ai.connection-store`（默认 `.eap/model-connections.json`） |
| `artifacts/ai` | `eap.ai.artifact-root`（默认 `.eap-ai-artifacts`） |
| `workspace/process` | 进程检测到的工作区 |
| `workspace/authorized-root` | `eap.runtime.authorized-root` 绑定结果 |
| `cache` / `logs` / `tools` / `tasks` | 目标布局占位，尚未强制创建 |

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

## 6. 核心、插件与场景

核心负责仓库绑定、Task/Run、策略/审批、执行、持久化、目录及独立验证。插件负责功能工作面、面板、命令、设置与实例配置；场景组合指引、依赖、默认配置、交互流程和输出合同。

看板UI适合可信插件，但复用EAP Task/Run及同一API/状态规则；原型编辑器适合插件，继续复用GrapesJS/语义Schema/不可变版本；“原型到代码”是组合这些插件及核心服务的场景，不是单个页面插件或另一套执行系统。Hermes Kanban是持久任务/派发系统，不只是前端插件；只参考其分层，不接其SQLite、Dispatcher或React UI。

### 6.1 先可信内置贡献，后外部安装

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
| CE-01 / KR-01 | **CE-01/KR-01 部分交付**：字符预算观测 + 用量 UI；预定检索 fixture + KEYWORD_PROBE；POSTGRES_FTS 适配；每题延迟观测 | CE-01 剩余 token/压缩/Memory 计量；本机实库同题跑通与排序质量；KR-02 仅证据触发 |
| FS-01 | 数据根、目录归属与前端/本机执行分界；盘点旧数据 | 迁移/读回/失败恢复、边界与清理合同；不启动未经批准迁移 |
| TD-01 / P0 | 可信定义发现与已知CLI绑定，先复用现有Git能力；受管包/MCP/插件来源随对应切片接入 | 无需重复录入、路径来源/冲突/未知版本、停用保留、失效与执行快照；不执行未知脚本、不整盘扫描或自动授权 |
| TC-01 / P0 | 明确输入输出/入口/范围/策略及结果契约；从目录选择已有只读Git能力并实际调用/呈现 | 无权限拒绝、参数/范围重校验、真实结果、适配缺失通用呈现、错误/超时/取消语义；不新增任意执行口 |
| TC-02 / P1 | TC-01职责合同后验证前端交互实例，协调实际Host而非等待完整SDK | 人工读取草稿/选中状态、多实例/revision/关闭断线、保存版本区别；模型反向调用另行评审 |
| MCP-01 | **部分交付**：stdio + 分页 + 官方包 + http JSON-RPC + legacy SSE；假子进程与拒绝/超时/隔离已有证据 | Streamable-HTTP、生产授权白名单与更多官方包矩阵 |
| PL-01 | 现有看板可信贡献迁移；不改Task/Run语义 | 激活回滚、启停/刷新恢复、实例隔离、在途停用、依赖缺失；无第二状态源 |
| MEM-01 | **部分交付**：状态机+PUT/UI+本地持久+Task/Run+知识/Skill 依赖对抗失效（`WorkingMemoryAdversarialTest`）；敏感清空/换模/换任务/换依赖失效；显式删除清盘 | sticky 清空仍保留；长期自动抽取延期 |
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
