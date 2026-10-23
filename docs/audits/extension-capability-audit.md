# 扩展能力审计（2026-10-23）

基线 HEAD：`1b9a556a7bc29a6e87d6554325eadfa08adf5404`。当时本地已有 application.yml、App.vue、style.css、console.test.ts、roadmap、backend-architecture、frontend-prototype、navigation-structure-refactor、console.html 修改，以及 conversation-interaction.md 和 test-conversation-prototype.cjs 未跟踪文件；均不属于当次审计修改。此处保留历史文件名，不表示这些路径仍存在；旧交互评审现已合并到 [前端原型合同](../frontend-prototype.md)。

已读取提供的 v1.5 文件：页首版本仍为 v1.4，末尾包含 v1.5 §2D；内部旧指令要求直接制作原型，与本轮用户授权边界冲突。本轮只治理指导文件和审计，不实施插件/Mission/Builder。代码和配置核对优先于文档“已完成”声明。

## 模块证据矩阵

以下 Java 路径均相对 `backend/eap-runtime/src/main/java/com/lh/eap/`；迁移相对 `backend/eap-runtime/src/main/resources/db/migration/`。静态成立不代表真实业务验收通过。

| 模块/分类 | 入口、表与执行链证据 | 问题及严重程度 | 复用/调整建议与验收 |
|---|---|---|---|
| CLI：部分流程 | `web/controller/CliProgramController.java` → `application/service/CliProgramService.java` → `persistence/mapper/CliProgramMapper.java`；V12 cli_program/cli_operation，V9 cli_channel；`runtime/handler/CliOperationHandler.java` → `core/DefaultProcessExecutor.java` | 高：固定参数并非受控参数模板；无独立 Mission 取消入口和每操作环境变量策略；cwd 由运行时注入，未证明多仓库权限隔离。继承宿主环境，参数数组不能阻止工具自身写入/联网 | 保留两级登记、PATH 发现、binary override。执行器已有20秒默认超时、并行读两流、每流1MiB限制、124/130错误码、终止后代。补策略/取消令牌后，用自定义成功/失败操作与恶意路径、超时、取消进程树验证 |
| Codex 委派：尚未实现专用闭环 | 普通 CLI 可登记任意可执行文件；`application/service/DeterministicTaskPlanner.java` 仅关键词选择 status/diff/search；未发现 CodingAgentProvider 实现 | 高：不能把 Codex 二进制可发现、普通 CLI 操作当作动态目标委派、授权及独立验收 | 后续专用适配器处理目标、cwd、鉴权、流输出、取消；独立读取 diff 并构建测试；本次未启动真实模型/外部 Agent |
| MCP：配置框架/部分隔离 | `application/service/McpServerService.java`、`persistence/mapper/McpServerRegistry.java`、`runtime/mcp/McpSessionRegistry.java` 与 McpCallScope；V8 mcp_server/expert_mcp_grant | 高：无协议客户端或生产 MCP Handler，未实现 initialize/tools/list/tools/call；远端 probe 没有连接却 reachable=true，list usable 仅由 trusted/enabled 决定。stdio probe 按空白拆首段，带空格路径会误判。工具名限制不能覆盖所有真实工具名。中：rows() 吞数据库异常为空列表，混淆故障和空配置 | 保留默认禁用/信任及专家授权；区分 declared/connected/discovered/callable；补可逆工具名映射、transport/session/timeout。真实协议验收当前被缺少客户端阻断，不能通过独立客户端测试冒充 EAP 集成通过 |
| Skill：尚未发现独立实现 | 主代码检索 Skill，无独立 Manifest/loader/store/安装入口 | 中：Expert、规则和知识无法替代版本化按需指令加载 | 后续最小独立 Manifest、本地导入、作用域/依赖检查、启停和回退；用不改 Java 的新 Skill 被 Agent 按需使用验收 |
| Knowledge：部分流程 | `web/controller/KnowledgeController.java` → `application/service/KnowledgeManagementService.java` → KnowledgeManagementMapper/KnowledgeRepository；`runtime/handler/KnowledgeSearchHandler.java`；V1/V3/V5/V6 | 中：1500字符固定切块（考虑代理对）；有 SHA256、事务导入和删除；没有文档正文更新 API、去重闭环、不可变引用版本/完整质量评测。管理搜索全库，专家搜索走 allowed grants，两者不能混淆 | 保留 PostgreSQL FTS+ILIKE 与中文双字匹配和默认拒绝授权；先补更新/引用/检索评测，再决定混合搜索。真实数据库导入→搜索→引用→更新→删除尚未验证 |
| Capability：已实现，业务验证未完成 | `runtime/handler/CapabilityHandlerRegistry.java`、`application/service/CapabilityCatalog.java`、CapabilitySettings；V9；CapabilityManagementController | 中：静态重复注册会拒绝；动态 CLI 特判是技术耦合点；数据库故障与缺省启用语义需专项检查。不要新增第二套工具执行注册 | 保留统一 Handler 与描述符、启停和 resolveFor；测试重复 ID、停用、草稿/已启用引用及动态操作变更 |
| Expert：部分流程 | ExpertController/ExpertExecutionController → ExpertDefinitionService/ExpertExecutionService → `domain/expert/ExpertGraph.java` → Handler → Rule → TaskRepository；V2/V4/V6/V7 | 高：同步请求事务（90秒）内遍历固定 DAG，45秒预算仅节点之间检查；不能视为后台自主任务、持久化检查点或暂停恢复。completed 表示既有流程状态，不证明独立验收 | 保留 DAG、依赖阻塞、授权和 finally 关闭会话。后续 Mission 包装而非重写规则引擎；验证断开页面和重启恢复、审批及验收失败不能完成 |
| Rule：已实现，仍有设计债 | `rules/RuleEngine.java`、RulePackService、RulePackManagementService、RulePackController；V7 rule_pack；`runtime/sql/SqlMetadataInspector.java` | 中：规则/事实/producer分离可复用；roadmap 明示仍有 Java 建议与关键词路由硬编码，须逐条确认后迁移。无不可变规则修订证据 | 保留配置判断与 blocked rules；用缺生产者、未知事实、无效规则和草稿 dry-run 验收，防止“未执行”变成“无发现” |

## 可运行验证与限制

本轮启动 `rtk proxy mvn -f backend/pom.xml test`：进入 reactor 和 Surefire，输出在 CapabilityCatalogTest/Mockito self-attach 后无后续输出；没有收到最终退出码，不能宣布通过。历史 target/surefire-reports 存在不代表本轮结果。CliProgramIntegrationTest 明确由 `EAP_RUN_CLI_INTEGRATION=true` 控制，创建/删除一次性数据库；本轮没有开启，未对用户数据库执行迁移或破坏性操作。

启动 `rtk proxy pnpm --dir frontend typecheck`、`test run`、`build`：未获得完成输出，均未验证。直接调用 mvn/pnpm 的诊断重试同样未及时完成，不能归因于 RTK，也不能将其当成功。Maven 启动出现 Access is denied，但随后继续编译/进入测试；原因尚未定位。没有通过依赖下载/重装去改写基线。

DefaultProcessExecutorTest 存在真实进程输出上限和超时测试，CliProgramsTest/CapabilityManagementTest/ExpertExecutionTest/ExpertWorkflowTest/ExpertScopedCapabilityTest 覆盖相关边界；McpSessionIsolationTest 使用 FakeMcpToolHandler，仅证明内存隔离，不证明协议。LlmPipelineTest 不等于真实外部模型验收。本轮 CLI 实际业务进程测试、知识库数据库检索和 API 闭环未取得通过证据。缺少 MCP 客户端使平台真实 MCP 工具调用无法开展；不为完成审计而越界实现协议客户端。

## 后续计划（待用户确认，未执行）

验证会话收尾：上述无输出的八个命令会话（含诊断重试）已发送中断并返回 exit_code=1；这是本轮主动中断，不是测试断言失败证据。`rtk git diff --check` 返回0；它只证明空白格式检查通过，不证明业务验收。运行验证仍未完成，阶段二不能标为完整验收通过。

1. 完成运行基线诊断，获得全量后端/前端测试退出码；检查可用的隔离 PostgreSQL 测试库，明确集成测试授权范围。退出条件：结果、跳过项与原始日志可追踪。
2. 基础能力切片：先修正 MCP 健康语义，确定 CLI cwd/env/取消/证据契约；协议 PoC 独立评审后连接本地真实服务器完成发现/调用/拒绝/超时/隔离。退出条件：真实协议测试通过。
3. 可信内置插件最小实现：Manifest/SDK/Registry、贡献撤销、配置/实例、动态导航，包装已有页面；Chat/Mission/Builder 三插件交互原型明确 Mock。停用保留数据，多实例配置隔离，旧管理页回归通过；用户确认交互后再接真实执行。
4. Mission：先持久化状态/事件与单 worker，继而检查点、审批、取消、有限重试和恢复；区分 Session/Mission/Run/Step/ToolCall/Artifact。退出条件：无 UI 后台持续执行、重启恢复且验收失败不会完成。
5. Skill、Knowledge 质量与外部 Agent 适配按能力契约接入；用真实调用和独立验证验收，不建立万能扩展接口。
6. Builder GrapesJS 最小映射 PoC：编辑器数据+语义 Schema、Vue 预览、保存重开；然后不可变版本和 Handoff，最后受控目标仓库交付。退出条件：无 AI 可操作、未知映射拒绝、未覆盖手写代码、diff/build/test及人工验收。
7. Electron 最后实施，复用 Renderer 并限制 IPC。

依赖调整理由：先验证 CLI/MCP 契约可避免工作台/Skill/Mission 重复造执行接口；插件交互确认之前不实现调度器。以上均为待批准计划，未改业务代码、未新增迁移、未推送或合并。
