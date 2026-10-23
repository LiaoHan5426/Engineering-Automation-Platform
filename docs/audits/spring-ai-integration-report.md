# Spring AI 最小集成实施报告

> 后续更新：本报告保留首轮实现与 165 项基线事实。配置迁移、错误分类、旧测试迁移、
> 190 项完整回归及 Codex 生成产物清理见 [统一化收尾报告](spring-ai-consolidation-report.md)。

日期：2026-10-23。起始 HEAD：`a9b14bc`。保留进入本轮时全部未提交、未跟踪文件；未提交或推送。

## 版本与官方依据

- Spring Boot 保持 4.1.1，Java 25，现有 backend 双模块结构不变。
- 采用稳定版 Spring AI 2.0.2 BOM；[官方 Getting Started](https://docs.spring.io/spring-ai/reference/getting-started.html) 明确 2.0.x 支持 Boot 4.0.x/4.1.x，并支持 Maven Central。
- runtime 引入 `org.springframework.ai:spring-ai-starter-model-openai`，遵循[官方 OpenAI 配置](https://docs.spring.io/spring-ai/reference/api/chat/openai-chat.html)。2.0 使用官方 OpenAI Java SDK。
- [ChatClient](https://docs.spring.io/spring-ai/reference/api/chatclient.html)、[Tool Calling](https://docs.spring.io/spring-ai/reference/api/tools.html)、[ChatMemory](https://docs.spring.io/spring-ai/reference/api/chat-memory.html) 为实现依据。
- 使用框架 `ToolCallingAdvisor` 和 `ToolCallingManager`，没有自写工具循环。框架 manager 每轮最多 4 次工具调用，禁止 resolver fallback；不向模型暴露其他工具。

## 本轮文件与职责

| 文件 | 修改及原因 |
| --- | --- |
| backend/pom.xml | 导入 Spring AI 2.0.2 BOM，SDK 留在 runtime，不污染 eap-api |
| backend/eap-runtime/pom.xml | 官方 OpenAI Starter |
| backend/eap-runtime/src/main/resources/application.yml | 模型默认关闭、显式连接配置、30 秒单请求超时、重试限制、关闭未用模型类型 |
| backend/eap-runtime/src/main/java/com/lh/eap/ai/EngineeringAiConfiguration.java | 接入官方自动配置的 ChatClient.Builder，官方内存 Advisor 和工具 Advisor；OpenAI 缺少密钥时报明确配置错误 |
| backend/eap-runtime/src/main/java/com/lh/eap/ai/EngineeringChatService.java | 可注入的同步应用服务；请求绑定工作区、权限检查、Git 工具、Outcome/Trace/Artifact |
| backend/eap-runtime/src/main/java/com/lh/eap/llm/OpenAiCompatibleProvider.java | 保留 SQL 流程的 LlmProvider 兼容入口，删除手写 HTTP/JSON 协议实现，委托 Spring AI；保留 deterministic fallback 和缓存 |
| backend/eap-runtime/src/main/java/com/lh/eap/application/service/FileExecutionArtifactStore.java | 在已有存储的类型 allow-list 中增加 ai-trace，其他安全检查不变 |
| backend/eap-runtime/src/test/java/com/lh/eap/ai/EngineeringChatServiceTest.java | 13 项离线行为与证据测试 |
| backend/eap-runtime/src/test/java/com/lh/eap/ai/EngineeringAiConfigurationTest.java | 3 项真实 Spring 上下文/官方自动配置测试，不请求模型 |
| backend/eap-runtime/src/test/java/com/lh/eap/core/DefaultProcessExecutorTest.java | 子 JVM 使用绝对测试类目录，不继承扩大的完整依赖类路径 |
| backend/eap-runtime/src/test/java/com/lh/eap/core/ProcessLifecycleTest.java | 同上，保留已有生命周期断言与夹具逻辑 |

新增依赖后，进程测试暴露了原夹具将 Surefire 的整个 JVM 类路径传给子 JVM 的问题：Unicode 工作目录下探针类无法加载、子进程 PID 文件未生成、输出测试失败。探针仅依赖 JDK，因此改用其 CodeSource 的绝对测试类目录。修复后真实进程测试通过；没有增加超时、删除测试或降低断言。

未修改 CodexAdapter、其参数及现有执行策略；未增加第二套 Capability Registry、ModelProvider 框架、Agent Runtime、数据库迁移或 P1-D。

## 可运行入口与配置

入口为 Spring Bean `EngineeringChatService.chat(Request)`，本轮没有增加无鉴权 HTTP 入口或前端界面。

默认 `EAP_AI_PROVIDER=none`，无密钥仍能创建应用服务；调用返回 `AI_NOT_CONFIGURED`/REJECTED。启用 OpenAI 后缺少密钥会以带配置项名称的异常阻止错误配置启动；不会记录密钥。

部署时由操作者提供以下环境配置；本轮没有设置真实密钥或启用真实请求：

```text
EAP_AI_PROVIDER=openai
OPENAI_API_KEY=<由部署环境注入，不写入仓库>
EAP_AI_MODEL=<操作者确认可用的 OpenAI API 模型>
EAP_AI_BASE_URL=https://api.openai.com
EAP_AI_AUTHORIZED_ROOT=<可信仓库或仓库父目录绝对路径>
EAP_AI_ARTIFACT_ROOT=<可信 Artifact 根目录，父目录必须已存在>
```

模型未显式设置时配置默认 `gpt-4.1-mini`，不是模型可用性承诺。API 凭据及额度与 Codex CLI 登录独立；本轮没有读取或复用 CLI 认证。更换供应商时替换官方 Starter/ChatModel 配置，应用服务仍面向 Spring AI ChatClient。

调用示例（请求中的权限与身份必须来自可信服务端，不可直接照搬 HTTP 字段）：

```java
var result = engineeringChatService.chat(new EngineeringChatService.Request(
    authenticatedPrincipal, conversationId, authorizedRepository, gitReadGrant, userMessage));
```

旧 SQL 增强仍需要 `EAP_LLM_ENABLED=true`，并额外正确配置 Spring AI；单独开启旧开关不再通过旧 HTTP 实现发请求。旧 `EAP_LLM_BASE_URL`、`EAP_LLM_MODEL`、连接超时和远程开关迁移到上述 Spring AI 配置；不能继续把旧属性保存成功视为连接配置生效。原压缩、确定性决策、缓存继续保留。LlmProvider 仅为现有 SQL 调用方兼容契约，不新增自研 Provider 实现体系。

## 完整离线工具流程

`Request → ChatClient → Fake ChatModel 请求 gitStatus → Spring AI ToolCallingAdvisor → EAP 权限检查 → 既有 GitInspectionHandler → CapabilityRegistry/GitCapability → ProcessExecutor → ToolResponseMessage → Fake ChatModel 最终回答`。

- 工具没有模型可控的目录、命令和参数。仅暴露只读 `gitStatus`。
- 执行前核对服务端 `gitAllowed`、配置的授权根、`toRealPath()` 后路径边界，以及现有 `CapabilityHandlerRegistry.resolveFor` 的开关/作用域。路径无法解析或权限未授予则不执行。
- `gitReadGrant` 不是模型提供的布尔值；目前服务端调用方负责从真实授权上下文导出。本轮没有新增公共请求入口或审批 UI。
- 真实 Git 流程测试在 JUnit 新建临时仓库内执行 git init/status；无 remote，无模型、提交、推送。
- 原工具权限判断继续由 EAP 负责，框架负责模型协议和工具循环。未直接运行模型生成的任意 Shell。

## 会话与证据

- 使用 Spring AI MessageWindowChatMemory（20 条窗口）与 MessageChatMemoryAdvisor，内存不跨重启恢复。
- 会话键由服务端 principal（含长度前缀）与 conversationId 组成；测试证明不同用户、不同会话隔离，同会话能读取此前上下文。
- ChatMemory 不是审计历史；本轮未实现持久化任务运行时，也未承诺同一会话并发请求顺序。
- 每次执行独立生成 executionId；Outcome 中复用现有 CliExecution.Result、Trace、事件和 Artifact。它是已有证据 DTO 的复用，不表示模型通过 CLI 执行；exitCode 为 null。
- 状态：SUCCEEDED 表示模型调用链完成；工具拒绝仍在 Outcome.error 与 Trace.toolError 可见。APPROVAL 为 NOT_REQUIRED，因为本轮只读工具通过服务端授权，不伪造审批通过。Verification 始终 UNVERIFIED。
- 错误包含 AI_NOT_CONFIGURED、AI_PROVIDER_ERROR、AI_EMPTY_RESPONSE、TOOL_PERMISSION_DENIED、TOOL_FAILED、TOOL_CALL_LIMIT。供应商异常正文不输出或归档，避免 HTTP headers、凭据或提示词泄漏。
- ai-trace 通过现有 ExecutionArtifactStore 保存，引用含 executionId、类型、相对路径、大小、SHA-256。归档内容仅受控状态码、开始/结束时间、工具事件顺序及接收时间；不保存提示词、原始模型负载、凭据或工具原文。对返回的回答与工具结果进行现有脱敏、Bearer/sk 模式脱敏和 16 KiB 摘要限制。
- Artifact 失败通过独立 artifactError=ARTIFACT_SAVE_FAILED 表示，不改写模型执行状态，也不能据此宣称证据闭环成功。保存失败、两个执行的引用隔离均有测试。
- 复用既有保留期限策略，不执行自动删除。审计文件不是 HTTP 下载或访问授权 API。

## 测试与限制

完整回归：

```powershell
rtk proxy powershell -NoProfile -File scripts/verify-p0.ps1 -Name backend -TimeoutSeconds 180
```

底层为 `mvn -B -ntp -f backend/pom.xml test`。结果 165 项，失败 0，错误 0，跳过 4；161 项实际通过；外层 76.48 秒，退出码 0，没有超时。

该次完整回归结论保留于本报告；后续回归汇总见 [收敛报告](spring-ai-consolidation-report.md)。历史可再生 stdout/stderr 已专项清理，不再作为现存文件提供。

随后补充 Artifact 内工具事件明细及对应断言，再运行上述两组新增测试的定向回归：16 项全部通过，退出码 0，Maven 耗时 12.318 秒；未扩大到新的功能范围。

```powershell
rtk proxy mvn -B -ntp -f backend/pom.xml -pl eap-runtime -am "-Dtest=EngineeringChatServiceTest,EngineeringAiConfigurationTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
rtk git diff --check
```

新增 16 项覆盖普通对话、框架工具调用与结果回传、真实 Git status、请求授权拒绝、全局开关拒绝、路径逃逸、工具异常脱敏、模型异常、默认关闭、缺少密钥、官方 Provider 构造、用户/会话隔离、调用次数限制、Artifact 成功/失败及实例隔离。

四项原有条件跳过：CliProgramIntegrationTest（数据库）、DatabaseSchemaProbeTest（数据库）、CodexLocalConfigTest（真实本机 CLI 配置）、CodexRealSmokeTest（真实付费模型授权）。没有启用这些测试；跳过不能算通过。

Mockito/JDK 动态 Agent 警告仍存在，无测试失败。本轮未调用真实模型，未证明真实供应商网络、认证、模型可用性、计费或长期会话持久化；未启动真实应用数据库迁移。

## 原则与下一步

KISS/YAGNI：单个官方供应商、单个只读工具、可注入服务，未建立供应商插件框架或完整 Agent Runtime。DRY：删除旧手写 HTTP 接入，复用官方工具循环、既有 Git handler、权限注册和 Artifact 存储。SOLID：应用服务只负责工程授权与证据，框架负责模型/工具协议，原 SQL 调用方经薄兼容桥保留。

后续可按需求增加官方 Starter 或受控工程 ToolCallback；应先明确工具风险和授权来源。CodexAdapter 作为独立外部编码 Agent 继续保留，不作为通用聊天基础。真实供应商测试、对话入口接入、持久化记忆及外部 Agent 委派分别另行授权；本轮停止，不继续排查历史 Codex exec 沙箱，不进入 P1-D。

> 2026-10-23专项清理：上述历史中间产物路径已转向保留的最终报告；历史结论不变，原始输出不再长期保存。
