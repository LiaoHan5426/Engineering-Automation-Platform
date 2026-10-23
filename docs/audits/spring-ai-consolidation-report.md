# Spring AI 统一化、测试迁移与 Codex 测试产物清理

2026-10-23，Asia/Shanghai。基线：HEAD `a9b14bc` 加当前工作区已有成果。没有重置、暂存、提交或推送。

## 范围和事实依据

- 核对根、backend、frontend AGENTS、架构、路线图、开发验收指南及首轮 Spring AI 报告。
- 参考附件为 `J:/Downloads/EAP-frontend-architecture-adjustment-v1.5.md`；文件开头仍写 v1.4、旧 GitHub 1b9a556 基线，后续含 v1.5 的 2D 治理章节。该材料用于目标架构，不替代本地现状，也不自动授权其中复制式实施指令。
- 本轮主请求在删除限制第 9 条截断；补充确认是清理此前 Codex CLI 测试生成文件。仅清理已证明的项目内产物，不延伸到系统 Temp、J:/Code/test 或其他项目。
- Java 25、Boot 4.1.1、Spring AI 2.0.2、Maven 结构不变；未添加依赖、迁移或自研 Provider/Agent 框架。

## 生产实现调整

| 文件/边界 | 本轮调整 |
|---|---|
| ai/AiErrors.java | 共用安全错误分类，读取公开 SDK 状态/错误码或公开 HTTP 异常；不输出异常正文 |
| ai/EngineeringChatService.java | 认证、超时、取消等分类传播到 Outcome/执行终态；只读工具拒绝额外参数，保留现有权限、Trace、Artifact |
| ai/EngineeringAiConfiguration.java | 旧连接属性迁移检查；启用 AI 时拒绝过期属性，关闭 AI 时只警告；校验 HTTPS/loopback HTTP 及禁止 URL userinfo |
| llm/OpenAiCompatibleProvider.java | 保留 SQL 必需兼容桥，继续委托 ChatClient；没有 ChatModel 时不实例化依赖模型的 Builder；统一未配置、空响应和异常错误码 |
| llm/LlmGateway.java | 保留 Optional complete 接口和业务缓存/失败回退；增加可返回失败证据的调用方法，缓存隔离 provider/model/温度/token预算/请求内容，失败不入缓存 |
| application/service/SqlExpertService.java | Outcome 增补 error 并保留旧构造器；toResponse 输出错误码，保留路由、压缩、确定性结果及成功结果转换 |
| application/service/ExpertExecutionService.java | 未配置/失败模型归为 unavailable；只有决策主动跳过才是 skipped；模型文本仍为 unverified-observation |
| llm/LlmProvider.java | 更正文档：该接口是 SQL 兼容契约，不是新的通用 Provider 基础 |

错误语义：

| 条件 | 错误码/行为 |
|---|---|
| 没有配置模型 | AI_NOT_CONFIGURED；Chat REJECTED；SQL 回退且 unavailable |
| HTTP 401 | AI_AUTHENTICATION_FAILED |
| SDK 明确 model_not_found | AI_MODEL_UNAVAILABLE |
| 普通 HTTP 404 | AI_RESOURCE_NOT_FOUND，不能仅凭 404 判断模型不存在 |
| Provider HTTP 403 / 429 | AI_PROVIDER_PERMISSION_DENIED / AI_RATE_LIMITED |
| 超时/取消异常 | AI_TIMED_OUT / AI_CANCELLED；Chat 执行状态 TIMED_OUT / CANCELLED |
| 工具授权拒绝 | TOOL_PERMISSION_DENIED，保留工具证据，不扩大授权 |
| 无参 Git 工具收到参数 | TOOL_INVALID_ARGUMENTS，不调用 handler；模型不能指定目录或 Shell |
| 调用异常/空响应 | AI_PROVIDER_ERROR / AI_EMPTY_RESPONSE，SQL 失败回退 |

超时/取消新增测试验证模型边界异常的分类和状态传播，不代表新增了可主动取消供应商请求的 HTTP API。既有真实进程取消、超时、清理测试继续保留，未重写生命周期夹具。

旧配置迁移见 [environment.md](../environment.md)。保留 SQL 的温度、压缩/token 预算、缓存与启用业务开关；连接、认证、模型、SDK 超时使用 Spring AI 配置。配置成功不等于连接成功，更不等于模型任务验证通过。

## 原有测试迁移与夹具核对

不是只新增一组测试：

- 修改原 `LlmPipelineTest`：原直接调用旧端点策略的测试迁移为真实兼容桥 → ChatClient → Fake ChatModel，严格校验模型/预算/system prompt 与结果；旧端点安全断言迁移到真实 Spring AI 配置上下文，包含 HTTPS、HTTP loopback、远程 HTTP、userinfo、非法 URL。
- 修改原 `ExpertExecutionTest.gatewayWithoutProvidersIsNotUsedAndNeverBlocksDeterministicResult`：从只断言 gateway.available=false，扩展到真正执行 SQL 专家流程、检查确定性解析结果、模型未配置错误与 unavailable 分类，并校验保存的任务状态。
- 原 Spring AI 工具测试复用共享 `FakeChatModels`，新增无参工具参数拒绝及超时/取消分类。会话、调用上限、真实 Git、权限拒绝、Artifact 与异常测试全部保留。
- 新 `SqlExpertServiceTest`：确定性决策不调用模型、低置信度/显式增强、缓存命中、模型缺失、失败回退、失败不缓存后恢复、请求/预算隔离和空结果；全部通过公开 Spring AI Fake 模型接口。
- 新 `AiErrorsTest`：公开 HTTP 异常和 SDK ErrorObject/NotFoundException，区分明确模型缺失与普通 404，错误内容不外泄。
- 共享测试夹具 `ai/FakeChatModels.java` 统一 model script、公共 ChatModel 选项和 SQL 兼容桥构造；不模拟旧 JSON 协议。
- 搜索发现 backend 测试原本没有旧 Mock HTTP Server、JSON 模型响应资源或重复 Fake LlmProvider 可删除，因此未编造这类清理成果。没有删除有效测试、扩大 skip 或修改断言来获取绿色结果。
- 保留条件测试 CodexRealSmokeTest、CodexLocalConfigTest 和数据库测试：已有授权 gate 仍有效，不自动运行真实模型，也不删除防重锁。

## 清理记录

初轮清理曾逐项核验路径、大小和SHA-256后删除82文件；该次汇总保留如下。现有 [清理清单](codex-test-cleanup-manifest.json) 已更新为本次专项盘点、引用关系和目录级清理结果，初轮冗余逐项记录已收敛为历史摘要。

实际删除 **82 文件，4442 字节，0 个目录**：

- 80 个零字节 stdout/stderr，只来自已识别的 native/workspace/snapshot-selftest 沙箱快照；同项结构化 data.json、result.json 和 summary 均保留。原 result 中空流路径是历史引用，可按清理清单确认已退役，不再要求它们作为现存文件可打开。
- `docs/audits/p1c-temp-paired-probe.ps1`：一次性包装器，原模板与实验输出仍在，不再供当前测试使用。
- `docs/audits/temp-probe-runner-418a2c91f90e4cb7b638885dd2df2d3c.ps1`：该包装器生成的重复脚本，已核对模板生成逻辑，无当前测试引用。

保留：所有审计报告、决策、有效源码/测试、非空日志、模型 JSONL/错误、Artifact、哈希、一次性锁、前后 DACL 数据及原始脚本模板。尤其保留 5e0358ac-4614-4d39-aee3-ca285b685a9c 的真实失败证据及后续 exec probe 证据。

未清理/需另行明确的项：系统 Temp 下历史 Git 仓库、J:/Code/test、归属不明文件；本轮没有删除 Git 元数据、递归清空 Temp、清理全局缓存、回滚 DACL 或调整系统配置。空间释放很小是因为优先保留有价值证据，而不是把整个 audits 目录当垃圾。

`.gitignore` 增加本地 `.eap-ai-artifacts/` 和一次性 `docs/audits/temp-probe-runner-*.ps1`，没有整体忽略审计目录或当前测试。

## v1.5 文档收敛

更新现有 roadmap、architecture、agent-development-guide、environment、pipeline、runtime-workflow 和 README，不另建平行路线图。路线图明确：

1. Spring AI 通用模型/工具能力已实现并离线验证，SQL 保留业务兼容桥。
2. Chat UI 未接入 EngineeringChatService；本轮没有把服务 Bean 当作可用的用户聊天入口，也没有新增未审阅的 API/UI。
3. Chat、Builder 是目标预装 Workspace Plugin；插件机制和原型仍待实施/确认。
4. Mission 生命周期独立，ChatMemory、Expert DAG、CLI 注册表不等于 Mission Runtime。
5. 独立 P1-D 验证未实施；Builder 仓库交付需执行、权限及独立验收基础；Electron 更后。
6. Codex 保留为独立编码 Agent 适配器，真实文件委派仍未验收；不继续历史沙箱排查。

## 验证与环境说明

完整命令：

```powershell
rtk proxy powershell -NoProfile -File scripts/verify-p0.ps1 -Name backend -TimeoutSeconds 180
rtk git diff --check
```

底层 `mvn -B -ntp -f backend/pom.xml test`。未启用任何真实模型或数据库 gate。

受限宿主中第一次相关测试 34 项有 1 失败；定向复核证明 Git 初始化被拒绝写入 `.../Packages/sandbox.../AC/Temp/junit-.../.git/config`。这是执行上下文的限制，不是降低断言或放宽生产工具权限的理由。通过工具自动审批，在普通宿主运行回归，无管理员提权或 ACL 调整。

第一轮普通宿主完整回归 189 项出现 1 个新增 SDK 异常夹具构造错误（headers 必填）；补充空 headers 后完整 189 项通过，0 失败/错误，4 条件跳过，74.66 秒，退出码 0。再增强原 SQL 专家流程测试及工具参数验证后执行最终完整回归，结果见下方最终记录。

四项 skip 保持原语义：CliProgramIntegrationTest、DatabaseSchemaProbeTest（数据库），CodexLocalConfigTest（真实 CLI 配置），CodexRealSmokeTest（真实模型授权）。不算通过。Mockito/JDK 动态 attach 警告仍存在。

最终完整回归：**190 项，186 通过，0 失败，0 错误，原有 4 条条件跳过；78.69 秒，退出码 0，未超时。**
相对基线 165 项，增加 25 个测试用例，同时迁移上述原有测试，未减少原有测试数。
历史日志已退役；最终190项回归结论保留于本报告，原运行结果及测试统计摘要另保留在清理清单的 savedFinalValidation 字段。没有为本次清理重新运行这些测试。
`git diff --check` 退出码 0；只有原有 LF/CRLF 工作副本提示，无 whitespace 错误。
本轮未修改前端源码，因此没有把未执行的前端构建/测试标为通过；没有验证真实供应商连接。

## 原则、限制与下一步

KISS/YAGNI：只共享错误分类和测试夹具，保留已有服务，不开发第二套 Provider 或 Agent Runtime。DRY：模型协议/循环使用 Spring AI，工程工具和证据继续复用现有实现。SOLID：框架模型边界、SQL 业务缓存、工具授权与审计分别负责，保持旧接口兼容。

下一步是审阅 Chat 工作台的最小接入：连接状态明确区分未配置/已配置未验证/真实调用失败或成功，通过现有工作区和会话导出服务端上下文，只暴露本轮已有只读工具与执行证据。该 UI、HTTP API、真实模型验收、插件框架、Mission 和 P1-D 本轮均没有实现，不自动进入下一阶段。没有调用真实付费模型、修改全局认证或安全策略。

> 2026-10-23专项清理：上述历史中间产物路径已转向保留的最终报告；历史结论不变，原始输出不再长期保存。

## docs/audits 专项清理最终交付（2026-10-23）

本节为用户追加授权后的目录级清理，取代此前“只删82文件、不删目录”的保留策略；没有重新开发AI功能或重新调用模型。

<!-- AUDIT_CLEANUP_STATS -->
| 指标 | 清理前 | 清理后 |
|---|---:|---:|
| 文件数 | 323 | 21 |
| 子目录数 | 24 | 0 |
| 总大小（逻辑字节） | 796126 | 207321 |

净释放 588805 字节；原始删除文件合计629141字节，差额为保留清单和合并报告的增量。
<!-- /AUDIT_CLEANUP_STATS -->

盘点覆盖全部原323文件和24子目录。清单 currentCleanup.inventory 记录每个文件的路径、用途、Git跟踪/忽略状态、保留或删除动作；referenceIds 对应 referenceSources 的引用文件索引，避免重复保存长路径。previousCleanup 仅保留上一轮82文件/4442字节的历史汇总。

本轮实际删除302个历史文件，原始文件合计629141字节；净释放数字扣除了新增盘点/引用清单和最终结论的空间。两个本轮自用临时清理程序已经删除，不计入历史文件数量。没有保留新的清理目录。

实际递归删除15个顶层目录，含其全部嵌套目录（共24个子目录）：

```text
j-code-test-68e422a5849e4558b11376b6d012e8fc
native-a45ff83b5084436fb7dafbde7064dd41
p0-logs
p1c-config-compatibility
p1c-evidence-example-20261023
p1c-smoke-20261023
real-delegation-8ecf2f574056412da40b8f1d7bd5a9a6
real-delegation-retry-f222fff889bf49628297bfe0c84dee03
real-exec-probe-76b8a018cd0c46f49a450f4dbc2f2ecb
real-file-smoke-a0feddd682804671abf23096f85f5532
sandbox-preflight-once
sandbox-write-probe-4b8770ae18a24fc99f729f719bb25d70
snapshot-selftest-20261023-191555
temp-paired-31232d55042f4400a2af4af10b5eeacd
workspace-fd1ec9631d86458d8d8c0e1fe8a1462c
```

另删9个冗余根文件：6份已归并的权限/预检中间报告，以及沙箱写入一次性脚本、只读规则匹配脚本和规则结果副本。具体名称、大小、原Git状态及引用见清单。删除前逐项检查绝对目标路径限定在docs/audits、无Git元数据、无symlink/junction；没有执行git clean、清理系统Temp或修改ACL。

保留20份有用报告及1份现有清理清单：Spring AI集成/收敛报告、extension-capability-audit、P0和P1-A/B/C实施及契约结论等。Windows已结束实验结论归并到 [沙箱诊断最终报告](p1-c-windows-sandbox-compatibility-diagnosis.md)，真实补丁拒绝/生命周期/Artifact结论归并到 [委派最终报告](p1-c-real-delegation-20261023-report.md)。旧raw JSONL与副本不再被误认为永久保留要求。未发现额外需要删除的用途不明目录；没有处理目标目录之外的用户文件。

本次Git变化：未删除已跟踪资源；主要删除此前未跟踪或被忽略的实验产物。保留报告和清单为原有工作区文件的增量更新，3个脚本只调整输出/保留方式；路线图仅同步清理进度，开发指南同步保留规则。原有未提交生产代码、测试及前端修改不属于本次工作，未覆盖、暂存、提交或推送。

防堆积及脚本验证：

- verify-p0.ps1 默认写入 backend/eap-runtime/target/validation-logs。成功时打印摘要并删除该次stdout/stderr；失败/超时保留，-KeepLogs或显式-LogDirectory也保留。命令内容、超时和进程清理逻辑不变。
- collect-sandbox-snapshot.ps1 与 sandbox-preflight-once.ps1 默认输出迁入Maven target。配对快照需供调用方比较，因此保留诊断周期数据，不立即删除；不再自动形成永久审计档案。
- node --version 正常模式退出0、logsRetained=false，两个输出文件已删除；-KeepLogs模式退出0、日志实际存在；独立子进程空PATH模拟命令失败，退出1、日志保留成功。只修改该子进程环境，未修改全局PATH。
- 三个PowerShell脚本AST解析通过，默认路径不再含docs/audits。未运行沙箱脚本、快照系统调查或完整Maven回归，未修改实际测试/业务逻辑。
- 当前docs下所有Markdown本地文件链接检查0失效目标，失效中间产物链接已经转向最终报告；完整历史路径仅作为盘点/删除记录保留。git diff --check退出0，仅已有LF/CRLF提示。

后续只将正式验收结论写入audits；可再生输出保持在构建目录。删除结束实验的旧锁不授权重跑真实模型，相关代码gate保持原样。本次完成实际清理后停止。

## docs 全目录整理追加交付（2026-10-23）

本节为用户随后追加的整个docs整理，前节21文件/20报告的数字仅是上一阶段快照。当前全目录数据以本节和清单docsCleanup字段为准。

<!-- DOCS_ORGANIZATION_STATS -->
| 指标 | 整理前 | 整理后 |
|---|---:|---:|
| 文件数 | 41 | 28 |
| 子目录数 | 3 | 3 |
| 总大小（逻辑字节） | 956435 | 775954 |

净减少 180481 字节（已扣除文档入口、合并内容与盘点记录增量）。
<!-- /DOCS_ORGANIZATION_STATS -->

删除14个已被替代的文件，原文件合计157899字节；另将过长的前端原型说明和P1-C实施报告收敛为当前合同，合并保留有效结论，而不是平移到新的archive目录。新增一个 [文档入口](../README.md)，没有新增审计目录或重复路线图。

实际删除：

```text
conversation-interaction.md
knowledge-page-ia-review.md
navigation-structure-refactor.md
prototype/knowledge-restructure.html
audits/p1-c-config-compatibility-report.md
audits/p1-c-exec-config-contract-review.md
audits/p1-c-model-selection-report.md
audits/p1-c-noninteractive-approval-review-and-fix.md
audits/p1-c-offline-root-cause-analysis.md
audits/p1-c-patch-rejection-fix-and-config-review.md
audits/p1-c-real-smoke-report.md
audits/p1-c-smoke-gpt-6.1-sol-report.md
audits/p1-c-workspace-write-boundary-review.md
audits/sandbox-snapshot-tool-repair-report.md
```

合并去向与理由：

- 旧知识库IA、会话和导航评审演进关系已结束，将目的地/事务/确认、未保存状态、专家授权、会话与运行分离等有效规则合并到 [前端原型合同](../frontend-prototype.md)。过时页签方案及私有verify-console.js运行路径不再与当前方案并列。
- 无引用的知识库结构HTML只是旧提案；仍被scripts/test-conversation-prototype.cjs引用的console.html保留，SHA-256与整理前一致，未改变其内嵌脚本或交互。
- Codex配置、显式模型、支持证据、重试边界、非交互审批、错误与Artifact合同合并到 [P1-C实施结论](p1-c-implementation-report.md)。真实文件委派仍未通过、有效只读来源未知，不因整理改变验收状态。
- 保留architecture（平台概览）、module-layout（源码与包边界）和backend-architecture（API/执行参考），三者职责不同，不按标题相似误删。保留decisions、运行指南、专家规则、MCP设计、Electron目标设计和Spring AI最终报告。
- 更正roadmap中2026-10-15测试表的历史属性，明确外部verify-console.js不是仓库当前命令；外部编码Agent使用已有AgentAdapter/CodexAdapter，不再要求创建重复CodingAgentProvider。environment不再宣称尚不存在的apps/desktop已可构建。

脚本检查：docs下没有独立ps1/py/js/cjs/mjs/sh/cmd/bat文件；此前实验脚本已清理，本次仅删除失效HTML提案，不移动或删除仍使用的项目scripts工具。没有执行内嵌脚本、真实模型、沙箱、系统调查或生产功能。

引用与验证：已重定向旧评审链接、MCP设计引用及文档入口，历史审计中的原文件名注明是当时记录，避免改写原始事实。清单保留删除前路径、Git状态、用途与SHA-256。Markdown本地文件链接检查通过；git diff --check通过。未改Vue/Java/测试代码，未重跑Maven或前端构建，未把历史回归数字当作本轮测试结果。

所有删除均限定docs内，删除前验证完整路径、无Git元数据、无symlink/junction及目标哈希未变化。原有未提交生产代码/前端修改不属于本轮工作，未覆盖、暂存、提交或推送；未处理外部项目、系统Temp或全局配置。本轮整理结束。
