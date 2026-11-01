# CLI与外部Agent执行验证总览

## 当前结论与阅读方式

记录受控CLI策略、进程生命周期和Codex适配的历史实施/失败证据。不得把进程退出、适配器存在或模型回复当成真实文件交付成功；历史委派失败不授权自动重试、修改全局策略或付费调用。当前边界以[工具运行合同](../decisions/tool-integration-runtime-boundaries.md)为准。

以下按主题合并完整阶段记录，日期保留在记录中而不再作为文件名。记录中的“本轮/未提交/下一步”和测试数字仅代表当时快照；不得覆盖上面的当前结论、有效产品合同或用户授权。原文完整保留（只调整标题层级、锚点及链接），后续更新本总览，不另建日期报告。

## 记录索引

| 原记录 | 完整章节 |
|---|---|
| `docs/audits/p1-a-implementation-report.md` | [P1-A CLI执行策略与证据契约](#p1-a-implementation-report) |
| `docs/audits/p1-b-implementation-report.md` | [P1-B 进程生命周期、查询与取消](#p1-b-implementation-report) |
| `docs/audits/p1-c-implementation-report.md` | [P1-C Codex 适配实施与验收结论](#p1-c-implementation-report) |
| `docs/audits/p1-c-execution-evidence-closure-report.md` | [P1-C 定向策略核对与执行证据闭环](#p1-c-execution-evidence-closure-report) |
| `docs/audits/p1-c-real-delegation-20261023-report.md` | [P1-C 真实委派 Smoke Test 与获准重试](#p1-c-real-delegation-20261023-report) |
| `docs/audits/p1-c-windows-sandbox-compatibility-diagnosis.md` | [P1-C Windows沙箱兼容性只读诊断](#p1-c-windows-sandbox-compatibility-diagnosis) |

---

<a id="p1-a-implementation-report"></a>

## P1-A CLI执行策略与证据契约

来源：`docs/audits/p1-a-implementation-report.md`；合并基线 `82aa504`。

<!-- record:start docs/audits/p1-a-implementation-report.md -->
<a id="p1-a-implementation-report--p1-a-cli执行策略与证据契约"></a>
### P1-A CLI执行策略与证据契约

2026-10-23，HEAD a9b14bc40b1730378f3bed705afc86cc4394ec49。保留已有App.vue、verify-p0.ps1及P0日志/报告/P1设计修改；未提交、推送或操作正式目标仓库。仅实施P1-A。

<a id="p1-a-implementation-report--实际变更"></a>
#### 实际变更

| 文件（backend下） | 作用 |
|---|---|
| eap-api/.../api/CliExecution.java | Request/Policy/Result/Event/Artifact/Retention及互相独立的Status/Approval/Verification；不可变集合快照 |
| eap-api/.../api/ProcessExecutor.java | 增加runIsolated默认方法，旧实现不支持时明确拒绝；保留原run函数式接口兼容性 |
| eap-runtime/.../core/DefaultProcessExecutor.java | 原执行器复用同一读流/超时逻辑，显式执行清空继承环境后注入获准环境 |
| eap-runtime/.../application/service/CliExecutionService.java | 校验服务器策略、执行及生成脱敏证据；不注册任何新能力 |
| eap-runtime/.../runtime/handler/CliOperationHandler.java | 原动态CLI Handler接入契约，保留现有结果字段并增加execution结果 |
| eap-runtime/.../config/CliRetentionConfiguration.java | 配置30/7/7天保留策略，无自动删除 |
| eap-runtime/src/test/.../CliExecutionServiceTest.java | 五项契约/真实进程测试 |
| eap-runtime/src/test/.../CliProgramsTest.java | 现有Handler回归改为验证显式环境接口，保留脱敏/无事实产出断言 |

最小调用差异：`executor.run(capability, cwd, command)` → `CliExecutionService.execute(request, serverOwnedPolicy)` → 同一个executor的`runIsolated`。原有Capability Registry、CLI程序/操作表、Expert编排不变。未新增HTTP入口、前端类型或数据库迁移；新增Result作为现有Expert证据data.execution传递，复用当前JSON证据保存机制；没有独立执行查询/恢复API。

<a id="p1-a-implementation-report--语义与边界"></a>
#### 语义与边界

executionId由平台UUID生成，不复用Expert执行ID。事件按同一executionId产生CREATED→RUNNING→终态（拒绝则无RUNNING），含序号和时间。进程exit0对应SUCCEEDED但verification始终UNVERIFIED。Approval不会因进程成功变成APPROVED；PENDING/DENIED不能执行。审批状态是服务器可信调用参数，尚无审批决定API，不能接受客户端自报批准。权限策略必须由服务器创建，不能用执行请求反过来授权自己。

固定参数数组就是首版精确模板，任何不同参数被拒绝；未新增参数占位符DSL。cwd以toRealPath规范化且必须位于authorizedRoot之下，消除普通链接路径的词法绕过；校验到启动间仍存在路径竞态，不能当OS沙箱。现有Handler使用服务器注入workspace作为授权根，不从前端请求读取根。

环境通过allow-list校验并在ProcessBuilder清空继承值后注入。自定义CLI默认仅透传SystemRoot/WINDIR/TEMP/TMP/PATH，真实bootstrap值来自服务器环境；其余宿主秘密不透传。PATH本身属于可信主机配置，二进制定位仍复用LocalBinaries，不新增发现注册机制。工具若需要HOME等变量会显式缺失，需后续经策略评审开放，不暗中退回继承全部环境。

审计输出保留commandSummary、环境变量名（不含值）、stdout/stderr摘要、exitCode、durationMillis和固定错误码。显式标记的敏感参数及环境值逐字替换，并复用SensitiveData处理password/token等赋值；另识别分离的--token/--password等参数。摘要最多8000字符；底层原有1MiB读流限额不变。原始Observation.metadata.command不复制进新证据。任意未知秘密无法自动识别，必须用sensitiveArguments声明；不要记录原始Request/Policy的toString。

Artifact目前仅定义关联引用，Result返回空列表；无文件生成、访问或清理接口，不能宣称Artifact存储已完成。Retention为Spring配置Bean：eap.cli.retention.metadata-days=30、log-days=7、artifact-days=7，可通过标准Spring属性覆盖；非正值拒绝。它只描述保留政策，没有定时任务或数据删除。

兼容范围：自定义登记CLI接入新合同；旧内置Git/ripgrep、CLI probe仍用旧run，保留原先语义。新runIsolated默认拒绝不支持的执行器，第三方旧实现不能悄悄忽略环境限制。Windows native是真实验证目标；Linux/WSL没有运行验收，也未实现新取消接口/Job Object。默认运行时超时继续沿用20秒，不在P1-A伪装为可取消执行。

<a id="p1-a-implementation-report--验证"></a>
#### 验证

命令：`rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-p0.ps1 -Name backend -TimeoutSeconds 120`（正常宿主环境）。最终耗时15.74秒，exit0，115项：113通过，2跳过，失败/错误0。日志：spring-ai-consolidation-report.md。

新增五项测试覆盖：合法真实Java进程成功/失败；不授权cwd、模板不符、环境变量不允许及待审批拒绝；裸环境秘密/敏感参数/日志赋值脱敏；事件ID序号与状态独立；保留默认值/非法值；实际子进程不继承PATH且cwd正确。现有CLI/Capability/Expert回归通过，原进程输出/超时测试也通过。未新增数据库迁移，现有V1–V12顺序未变。数据库CLI集成与Schema probe按原条件跳过，未宣称真实数据库保存链路已验证；junction专项及HTTP登记→执行完整集成也尚未运行。`git diff --check`通过。

<a id="p1-a-implementation-report--原则后续与确认"></a>
#### 原则、后续与确认

KISS/YAGNI：固定模板、同步短调用和三类状态，不引入调度器/动态DSL。DRY：复用进程执行器、脱敏、注册与Expert证据路径。SRP：策略/证据在服务，进程读流在执行器，审批/业务验证不混进exitCode。

P1-B依赖executionId与结果/事件合同，实现真实取消、状态查询、清理失败与平台进程树边界；需先决定执行记录的持久化/查询方式。P1-C在B可控生命周期基础上接Codex，只能用独立临时Git仓库。P1-D读取独立diff/build/test证据后才允许写Verification通过，当前没有这个写入口。

待确认：是否接受首版只接入自定义CLI、固定数组模板及明确的环境allow-list；是否授权在专用数据库开展完整登记→Expert→证据保存验收；是否在P1-B另行批准执行记录持久化/查询与Windows进程树适配。P1-B/C/D均未实施，保留策略自动清理未实施。

> 2026-10-23专项清理：上述历史中间产物路径已转向保留的最终报告；历史结论不变，原始输出不再长期保存。
<!-- record:end docs/audits/p1-a-implementation-report.md -->

---

<a id="p1-b-implementation-report"></a>

## P1-B 进程生命周期、查询与取消

来源：`docs/audits/p1-b-implementation-report.md`；合并基线 `82aa504`。

<!-- record:start docs/audits/p1-b-implementation-report.md -->
<a id="p1-b-implementation-report--p1-b-进程生命周期查询与取消"></a>
### P1-B 进程生命周期、查询与取消

2026-10-23，基于现有未提交P0/P1-A增量实施，全部用户修改保留；无提交/推送/数据库迁移。仅P1-B，无Mission、Codex、MCP客户端或第二套Capability Registry。

<a id="p1-b-implementation-report--接口与关键diff"></a>
#### 接口与关键Diff

- api/ProcessExecutor新增runManaged(executionId,...)、status、cancel、snapshots默认接口；旧run/runIsolated继续同步返回Observation。默认实现不提供生命周期查询，不虚构支持能力。
- api/CliExecution新增CANCELLING/CANCELLED及Snapshot(executionId,status,cleanupComplete)。
- core/DefaultProcessExecutor复用原执行循环，新增最多256项进程内状态快照、20ms观察循环、取消标记、后代ProcessHandle跟踪、受限输出与关闭清理。注册表不存stdout/stderr、argv或环境秘密；结果仍走已有Expert证据。
- CliExecutionService将平台executionId传至runManaged；以查询状态判断终态，避免把程序自行退出124/130误认成超时/取消。
- web/controller/CliExecutionController提供GET /api/cli-executions、GET /api/cli-executions/{id}、POST /api/cli-executions/{id}/cancel。列表只返回状态快照，用户可在同步Expert请求结束前发现executionId并取消。不提供未经校验的任意命令启动接口。
- CliProgramsTest调整Mock与验证至runManaged；新增ProcessLifecycleTest六项真实Windows进程测试；CliExecutionServiceTest增加真实junction拒绝测试。

<a id="p1-b-implementation-report--状态与竞态语义"></a>
#### 状态与竞态语义

CREATED→RUNNING→SUCCEEDED/FAILED/TIMED_OUT；取消将CREATED/RUNNING原子改为CANCELLING，执行线程清理后返回CANCELLED。完成提交与取消共用每执行锁，先取得终态者生效；已是终态时取消不重写。重复取消返回同一快照，不重复启动清理；未知ID返回404。timeout/cancel同时发生只保留一个终态。CANCELLING响应表示请求已接受，不代表进程已结束，调用方需继续查询cleanupComplete。

审批与验证状态沿用P1-A，不随取消/成功自动授权或验收。进程自行exit124/130仍为FAILED，只有执行循环决定TIMED_OUT/CANCELLED。清理未确认成功时状态FAILED，输出明确CLEANUP_FAILED或错误摘要；资源释放标记与清理成功标记分开，不能以句柄释放当作子进程终止证明。

同步调用未改为队列/后台Mission；多个请求可在各自线程执行，状态、输出读流与进程句柄逐执行隔离。stdin立即关闭，stdout/stderr各保留最多1MiB并继续排空超额字节；对内存构成明确上限。每执行有独立读流executor，在finally关闭三个流、清除进程引用并shutdownNow。状态快照容量256，达到上限先淘汰已释放快照，仍满则拒绝新执行；这是易失查询缓存，不是30天执行记录存储，也不删除持久化历史或Artifact。不具备跨重启恢复能力。

Spring对AutoCloseable执行器调用close，拒绝新执行、标记当前执行取消并最多等待8秒。关闭属于尽力清理，不承诺JVM被强杀时清理成功。

<a id="p1-b-implementation-report--windows真实验证及风险"></a>
#### Windows真实验证及风险

真实测试涵盖：正常/非零退出（沿用P1-A）；超时及双流各2MiB输出限额（既有DefaultProcessExecutorTest）；主动/重复/完成后/未知ID取消；超时竞争；并发不同输出；创建子Java进程、记录PID、取消后确认PID已退出；关闭时清理与拒绝再启动；中文/空格目录及Windows bootstrap+业务环境变量；cmd mklink /J创建临时junction指向授权根之外，策略拒绝且测试只删除该临时链接。

首次新增中文路径断言失败，发现Java子进程管道输出编码使用Windows默认值，而执行器固定UTF-8读取。测试子进程明确-Dstdout.encoding=UTF-8/-Dstderr.encoding=UTF-8后重跑，未降低路径断言。生产CLI输出当前需UTF-8；其他编码适配尚未实现。

本轮Windows采用ProcessHandle后代枚举/保存及destroyForcibly，无Job Object依赖。真实普通子进程用例通过不等于OS级进程容器：20ms枚举窗口中快速派生/重挂接、脱离父进程、权限不允许终止的后代可能逃逸；无法证明不存在未观察到的后代。不能将该方案用于不可信任意CLI隔离。cwd toRealPath拒绝junction逃逸，但校验到启动仍有TOCTOU窗口。Linux/WSL没有运行验收或进程组桥接，不声明支持。

<a id="p1-b-implementation-report--验证命令与范围"></a>
#### 验证命令与范围

`rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-p0.ps1 -Name backend -TimeoutSeconds 120`，在P0确认的正常宿主环境运行。测试断言不跳过；保留原来数据库相关两项条件跳过。无数据库端到端或真实HTTP服务器验收；新增Controller通过编译，生命周期语义由真实执行器测试验证。完整最终计数与耗时见本报告末尾及原始日志。

<a id="p1-b-implementation-report--后续p1-c建议"></a>
#### 后续P1-C建议

Codex适配复用runManaged/status/cancel及P1-A校验/证据，不能直接绕开Policy；ID由平台生成，外部线程ID只关联。先在独立临时Git仓库验证UTF-8 JSONL、进程清理和鉴权错误，再增加模型委派，需单独授权。若要允许不可信CLI/长时Codex，应先评审Windows Job Object或其他强进程归属机制；实时逐行事件/Artifact持久化尚未实现，不可把当前结束时stdout摘要称为流式协议适配。

待确认：是否接受当前普通可信native CLI的尽力进程树清理边界；是否下一步先加固Windows进程归属再进入P1-C。P1-D独立Diff/Build/Test与数据库完整集成仍单独规划，未实施。

最终完整回归：122项，120通过、2跳过，失败0、错误0，exit0，墙钟16.04秒（Maven报告14.135秒）。ProcessLifecycleTest六项真实生命周期测试全部通过。日志为spring-ai-consolidation-report.md及对应stderr/result.json。`git diff --check`通过。输出限额、进程清理与策略校验复用原执行器/服务，避免重复注册和引入分布式复杂度；生命周期与审批/验证职责保持分离。

> 2026-10-23专项清理：上述历史中间产物路径已转向保留的最终报告；历史结论不变，原始输出不再长期保存。
<!-- record:end docs/audits/p1-b-implementation-report.md -->

---

<a id="p1-c-implementation-report"></a>

## P1-C Codex 适配实施与验收结论

来源：`docs/audits/p1-c-implementation-report.md`；合并基线 `82aa504`。

<!-- record:start docs/audits/p1-c-implementation-report.md -->
<a id="p1-c-implementation-report--p1-c-codex-适配实施与验收结论"></a>
### P1-C Codex 适配实施与验收结论

本文统一已结束的模型选择、配置兼容、非交互审批、工具拒绝分类及工作区路径核对记录。更早逐轮报告已合并退役；当前路线以 [roadmap](../roadmap.md) 和 [分阶段设计](../decisions/p1-cli-codex-design.md) 为准。

<a id="p1-c-implementation-report--已实现边界"></a>
#### 已实现边界

- 通用模型调用采用Spring AI；CodexAdapter是独立的外部编码Agent适配器，不能代替ChatModel/ChatClient基础设施。
- 复用P1-A执行策略与证据、P1-B runManaged/status/cancel，通过原有CLI/Capability/Expert体系调用；不是第二套调度器或注册表。
- 任务包含repository、instructions、明确model和审批，生成executionId，保留Git前后状态、结构化事件、接收时间、进程生命周期与Artifact引用。
- execution成功、EAP approval和verification独立；外部结果是观察，独立Diff/Build/Test验收仍属于未实施的P1-D。
- Windows native仅是受信任本地开发工具的尽力进程清理环境，不是不可信代码沙箱；Linux/WSL未获真实验证，不宣称支持。

<a id="p1-c-implementation-report--当前参数与策略合同"></a>
#### 当前参数与策略合同

历史验证使用CLI 0.163.0-alpha.11.2、模型gpt-6.1-sol；这些是已保存的版本事实，不是当前所有机器的可用性承诺。实际参数数组以CodexAdapter源码及契约测试为准。

1. 显式 --model 传递合法模型，不拼接Shell，不静默选择默认/替代模型，不自动重启任务。
2. 模型格式合法性与服务端支持性分开。缓存仅是非权威证据；缺失不等于永久不支持。支持未知但用户明确授权的模型可受控试一次；明确不支持继续拒绝，服务端拒绝保留错误分类。
3. 请求workspace-write、approval_policy=never、正确--cd并保留工具网络限制与目录约束。never不授予写权限，也不提供运行中交互审批。
4. 不使用danger-full-access、危险沙箱绕过或ignore-rules，不修改managed requirements、execpolicy和全局配置。真实委派仅可在另行授权的全新独立Git仓库执行。
5. 历史model_providers.openai.request_max_retries/stream_max_retries覆盖曾因内置Provider ID保留规则被拒绝，已删除；不创建冒充内置Provider的自定义Provider。EAP启动次数不等于服务端请求次数，不能精确控制Codex内部网络重试或Agent模型轮次。
6. repository、ProcessBuilder.directory、--cd、Git根和目标hello.txt路径已核对一致；没有证据支持通过任意增加writable roots解决工具拒绝。

配置事实与权限实际生效必须分开；Fake参数正确不能证明真实补丁工具获得写权限。历史CLI/help核对不能作为无限次重新调查或调用模型的授权。

<a id="p1-c-implementation-report--证据与错误语义"></a>
#### 证据与错误语义

JSONL有本地receivedAt与原始顺序；执行器记录启动、退出、超时、清理阶段。超时/取消终态优先保留，不因工具错误改写为普通失败。

明确的blocked by policy及patch rejected/read-only sandbox/user approval settings拒绝均可观察为TOOL_POLICY_DENIED，进入Outcome.error和Trace.toolError。CLI退出0仍需保留该错误；SUCCEEDED只描述执行层正常结束，不能说文件任务已完成。

脱敏JSONL、stderr及进程Trace复用Artifact存储，引用含executionId、类型、相对路径、大小和SHA-256。Artifact保存错误与委派失败分开，归档失败不能声称证据闭环完成。不归档凭据、认证配置或未经处理的敏感内容。元数据30天、日志/Artifact7天是可配置策略，未自动删除运行期存储。

具体实现和离线证据见 [执行证据报告](#p1-c-execution-evidence-closure-report)。本次清理不改变运行期策略，仅退役已结束实验的审计副本。

<a id="p1-c-implementation-report--真实验证结论与剩余关口"></a>
#### 真实验证结论与剩余关口

[真实委派最终报告](#p1-c-real-delegation-20261023-report) 保留关键案例：模型通信成功，JSONL响应、正常CLI退出和Artifact核验已观察；文件补丁仍被read-only sandbox拒绝，hello.txt未生成，P1-C真实文件委派验收不通过。

[Windows最终结论](#p1-c-windows-sandbox-compatibility-diagnosis) 保留无模型预检以及J盘/Temp原生sandbox写入成功与DACL副作用。原生入口成功不等同于exec/apply_patch恢复，具体只读策略来源仍未知，历史调查已暂停。

早期报告分别记录过128、131、133、136、144等阶段测试数，只代表当时切片。最近完整后端回归190项、186通过、4条件跳过、0失败/错误，见 [Spring AI收敛报告](../audits/spring-ai-consolidation-report.md)；本轮文档整理没有重跑这些测试。

真实模型、沙箱启动、系统初始化均需新授权；清理旧脚本/锁不授权重跑。后续交互审批可评估Codex App Server，但未实现。P1-D、Mission及完整Agent Runtime均不在本轮范围。
<!-- record:end docs/audits/p1-c-implementation-report.md -->

---

<a id="p1-c-execution-evidence-closure-report"></a>

## P1-C 定向策略核对与执行证据闭环

来源：`docs/audits/p1-c-execution-evidence-closure-report.md`；合并基线 `82aa504`。

<!-- record:start docs/audits/p1-c-execution-evidence-closure-report.md -->
<a id="p1-c-execution-evidence-closure-report--p1-c-定向策略核对与执行证据闭环"></a>
### P1-C 定向策略核对与执行证据闭环

日期：2026-10-23（Asia/Shanghai）。本轮仅只读策略检查、最小生产实现及离线测试。没有模型请求、新沙箱启动、全局配置/策略修改、P1-D、提交或推送；保留既有修改与历史失败证据。

<a id="p1-c-execution-evidence-closure-report--1-策略拒绝来源"></a>
#### 1. 策略拒绝来源

直接复核历史重试 `a196c0ed-ec5e-4dfb-b29a-dc56e9269d2c`：Codex内部exec_command尝试运行PowerShell WriteAllBytes，仅创建指定hello.txt，stderr记录Rejected/blocked by policy。EAP外层进程和模型均已启动，故不是EAP目录/参数校验拒绝；没有证据证明等待用户点击批准。

本机官方工具入口核对：`codex execpolicy check --help`，exit0。按官方规则文档，以参数数组运行：

```text
<固定codex.exe> execpolicy check --pretty
  --rules C:/Users/LH/.codex/rules/default.rules
  -- C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -Command <历史WriteAllBytes脚本>
```

该次只读规则匹配已结束，临时脚本和结果副本已清理，结论保留于本报告：退出码0，0.1739203秒，输出 `{"matchedRules":[]}`。只识别到该用户规则文件，历史临时仓库没有本地rules文件命中。检查不执行历史命令，也不修改规则。

结论：**所检查用户规则文件没有匹配历史命令，不代表完整策略允许执行**。该工具按显式文件评估，没有证明已加载全部managed规则、审批约束或内部工具限制。具体拒绝提供者仍未知，不归因于Windows基础设施。没有忽略规则、添加allow规则或修改managed requirements。

官方配置推荐非交互approval_policy=never；workspace-write控制沙箱写权限，EAP APPROVED控制平台任务授权，这三者不能互相替代。当前保留 `approval_policy='never'`、workspace-write、工具网络关闭与tmp排除；never不会解除forbidden或批准越界请求。

<a id="p1-c-execution-evidence-closure-report--2-最小代码调整"></a>
#### 2. 最小代码调整

| 文件 | 改动 |
| --- | --- |
| eap-api/AgentAdapter.java | Event增加receivedAt，保留旧四参构造器；旧来源没有时间时为null，不伪造时间 |
| eap-api/CliExecution.java | 增加ReceivedLine、Trace；Result增加trace与artifactError，保留旧构造器；复用Artifact DTO |
| core/DefaultProcessExecutor.java | 读取stdout时按行记录本机接收时间及顺序；记录started、exitObserved、timedOut/cancelled、cleanupStarted/cleanupFinished |
| application/service/CliExecutionService.java | 先脱敏完整有界记录，再生成Artifact；摘要仍限8000字符；Artifact保存错误独立于进程状态 |
| application/service/CodexAdapter.java | 主exec使用Artifact存储，版本/认证/Git辅助命令不归档；从逐行记录解析，不再从8000字符摘要解析；取消/超时优先，不被协议/存储错误覆盖 |
| application/service/ExecutionArtifactStore.java | 新增最小存储接口，仅接收可信kind和已脱敏字节 |
| application/service/FileExecutionArtifactStore.java | 本地受控根、UUID文件名、CREATE_NEW不覆盖、真实哈希/大小/相对引用，拒绝root/执行子目录链接逃逸 |

定向搜索没有找到已有Artifact存储实现，只有DTO；因此复用DTO并补小接口，而不是声称复用了不存在的存储抽象。不创建第二套Capability/执行器，不引入数据库迁移、插件或调度器。

正常执行的阶段时间均来自本机Instant；exitObserved是观察时间，不是操作系统精确退出时间。stdout行时间是读到换行时（末尾无换行则EOF）的接收时间，不是服务端生成时间。stdout顺序保留，不宣称stdout/stderr跨通道全序。启动失败等未能取得Trace的旧/异常执行，标EXECUTION_TRACE_UNAVAILABLE，不伪造过程时间。

采集边界：每通道保留最多1MiB，stdout行记录最多16384个完整行及最多一个末尾片段；超过后继续排空管道，并标truncated。JSONL超过摘要上限但未达采集上限仍可完整解析；达到采集上限不宣称完整协议。运行元数据/日志保留策略沿用既有定义，不实现自动删除。

<a id="p1-c-execution-evidence-closure-report--3-失败语义与脱敏"></a>
#### 3. 失败语义与脱敏

- Result.status表达OS进程生命周期；Result.approval是EAP审批；verification始终UNVERIFIED。
- Trace.toolError保存TOOL_POLICY_DENIED提示，原始原因保留在脱敏stderr/事件中；当前基于受限文本识别，不冒充权威规则来源。
- 即使turn.completed或进程exit0，工具拒绝仍可使Outcome.error=TOOL_POLICY_DENIED。
- TIMED_OUT/CANCELLED优先保持；Artifact保存失败写artifactError=ARTIFACT_SAVE_FAILED，不把进程成功改成模型/业务成功。若进程成功但归档失败，Outcome.error也明确失败；部分已保存引用保留。
- 未提供新Trace的旧执行器返回EXECUTION_TRACE_UNAVAILABLE，旧公共构造方式仍可调用。
- 归档前应用已有SensitiveData、显式敏感参数/环境值脱敏，另处理Bearer和常见sk形式密钥。仅归档处理后内容，不读取认证文件；未知任意秘密仍无法靠正则保证识别。测试检查secret-value不出现在产物中。

本地存储以可信平台指定根为边界；默认位于专用测试根的 `.eap-execution-artifacts`，测试仓库之外。注册表示Result返回真实可核对文件引用，不包括HTTP下载API、数据库索引或跨重启任务恢复。可信本地目录假设及Windows尽力清理限制保留，不是对抗恶意本地账户的沙箱。

<a id="p1-c-execution-evidence-closure-report--4-artifact实例"></a>
#### 4. Artifact实例

`p1-c-execution-evidence-closure-report.md`及其相对路径文件保留了**Fake CLI生成的真实文件样本**，不是模型执行验收。独立重算三项SHA256/大小均一致。

```json
{
  "artifactId": "60b44382-755d-4a0d-a5c8-520c5e53195f",
  "executionId": "71dbf65b-23e3-45d3-9c1f-dd139c44795d",
  "kind": "codex-jsonl",
  "relativePath": "71dbf65b-23e3-45d3-9c1f-dd139c44795d/60b44382-755d-4a0d-a5c8-520c5e53195f.json",
  "sha256": "0709b51fda9a1e45aa53e1034f90fb5fc316a884318f023f2ffd3f9d3f4eb11d",
  "sizeBytes": 361
}
```

codex-jsonl是每行{sequence,receivedAt,text}包装，text为原事件脱敏内容，顺序不变。另有stderr与process-trace两种Artifact。样本从测试生成根复制到报告目录，relativePath相对该样本根仍有效。

<a id="p1-c-execution-evidence-closure-report--5-测试结果"></a>
#### 5. 测试结果

最终命令：

```powershell
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-p0.ps1 -Name backend -TimeoutSeconds 120
# 包装实际执行 mvn -B -ntp -f backend/pom.xml test
```

最终144项：140通过、4条件跳过、0失败/错误；exit0，墙钟55.82秒，Maven53.997秒。日志 `spring-ai-consolidation-report.md`。CodexAdapterTest 18项、FileExecutionArtifactStoreTest 2项均通过。四项跳过为数据库条件测试2、真实模型Smoke1、本机独立配置检查1；未操作未授权数据库。

覆盖正常完成、延迟退出、本机事件时间先于退出、turn.completed后仍运行至超时、策略拒绝（含超过stderr摘要才出现）、取消、超过8000字符的完整JSONL、超过1MiB的截断、Artifact哈希/大小/脱敏、保存失败与进程成功分离、两个Adapter并发证据隔离、非法kind和junction逃逸拒绝、不覆盖旧文件。既有CLI/Capability/Expert与进程回归保留通过。

中间一次定向Maven命令被PowerShell拆分带点-D参数而失败，后改用引用参数；一次测试编译失败因夹具java变量遮蔽包名，改为显式import；两者都没有调用模型或降低断言。失败与中间成功日志保留，最终结果以上述完整回归为准。git diff --check通过（仅已有CRLF提示）。

<a id="p1-c-execution-evidence-closure-report--6-剩余验收与下一步"></a>
#### 6. 剩余验收与下一步

证据闭环最小实现及离线测试已完成，仍不是P1-C真实文件委派成功。历史拒绝的具体策略来源尚未证明，修改后的exec配置及新产物链也没有真实模型验证；20秒是否足够仍待新时间证据判定。

下一次真实测试具备更好的观测和失败留证能力，**尚未具备“策略已确认允许”的保证**。若用户接受来源未确认且遇拒绝即停的边界，可另行批准一次受控调用；本轮不请求自动批准、不实际调用。新调用必须新仓库/ID/锁、明确模型/超时、重查登录额度，拒绝不绕过，UNVERIFIED不变。若要求先证明具体策略允许，则当前证据不足，不能以matchedRules为空替代证明。P1-D仍未实施。

官方来源（滚动文档，本机帮助作版本交叉核对）：

- https://learn.chatgpt.com/docs/agent-configuration/rules
- https://learn.chatgpt.com/docs/non-interactive-mode
- https://learn.chatgpt.com/docs/config-file/config-reference
- https://learn.chatgpt.com/docs/enterprise/managed-configuration

KISS/YAGNI：复用现有执行链和DTO，只增加有界Trace及小存储接口；DRY：统一在执行服务脱敏和归档；SOLID：提供方协议解析、进程采集、文件存储各自负责。未扩大为通用Agent审批系统或独立工程验收。

> 2026-10-23专项清理：上述历史中间产物路径已转向保留的最终报告；历史结论不变，原始输出不再长期保存。
<!-- record:end docs/audits/p1-c-execution-evidence-closure-report.md -->

---

<a id="p1-c-real-delegation-20261023-report"></a>

## P1-C 真实委派 Smoke Test 与获准重试

来源：`docs/audits/p1-c-real-delegation-20261023-report.md`；合并基线 `82aa504`。

<!-- record:start docs/audits/p1-c-real-delegation-20261023-report.md -->
<a id="p1-c-real-delegation-20261023-report--p1-c-真实委派-smoke-test-与获准重试"></a>
### P1-C 真实委派 Smoke Test 与获准重试

2026-10-23。首次执行后，用户明确授权网络调整后重试一次；共启动两个 EAP 主任务，每次各一次、无自动重试。没有第三次尝试。前次历史失败证据保留。

<a id="p1-c-real-delegation-20261023-report--结果"></a>
#### 结果

| 项目 | 首次 | 用户另行授权重试 |
| --- | --- | --- |
| executionId | a02d246b-438c-4c47-bc3f-78394d9a05a3 | a196c0ed-ec5e-4dfb-b29a-dc56e9269d2c |
| 会话 ID | 01a1688a-ac1a-7591-81a1-39f8f520f408 | 01a1688c-62ca-7940-b550-80033d787969 |
| 进程状态 / 退出码 | TIMED_OUT / 124（执行器超时代码） | TIMED_OUT / 124（执行器超时代码） |
| EAP 执行耗时 | 20112 ms | 20120 ms |
| approval / verification | APPROVED / UNVERIFIED | APPROVED / UNVERIFIED |
| cleanupComplete / activeCount | true / 0 | true / 0 |
| 模型响应 | 未观察到；模型目录刷新超时 | 有 agent_message 和 turn.completed |
| hello.txt | 不存在 | 不存在 |

两次均通过 `CodexAdapter → CliExecutionService → ProcessExecutor.runManaged`，由现有 `CodexRealSmokeTest` 入口调用。未手工启动模型 CLI 替代 EAP 测试。CLI 自报 0.163.0-alpha.11.2，请求和实际传递模型均为 gpt-6.1-sol。

首次只收到 thread.started、turn.started；stderr 含模型目录刷新 request timed out，不能判定模型推理请求成功。

重试收到五个 JSONL 事件：thread.started、turn.started、两个 item.completed（agent_message）、turn.completed。usage：input_tokens=35144，cached_input_tokens=29824，output_tokens=171。最终响应说明无法创建文件，写操作被策略拒绝；stderr 明确记录 exec_command CreateProcess Rejected / blocked by policy。模型自述“只读环境”仅为观察，不是有效权限配置证明。模型已响应，但工具写入被拒绝，进程也未在截止时间内退出。未绕过拒绝或进一步调查。

<a id="p1-c-real-delegation-20261023-report--实际参数及边界"></a>
#### 实际参数及边界

固定二进制位于 `C:/Users/LH/AppData/Local/OpenAI/Codex/bin/37f54d68e5533a51/codex.exe`。每次参数数组为：

```text
exec --model gpt-6.1-sol --json --sandbox workspace-write --ephemeral --ignore-user-config
-c sandbox_workspace_write.network_access=false
-c sandbox_workspace_write.exclude_tmpdir_env_var=true
-c sandbox_workspace_write.exclude_slash_tmp=true
--cd <本次独立临时仓库> <任务说明；审计中脱敏>
```

任务要求只创建 hello.txt，UTF-8 内容严格为 `Hello from EAP Codex smoke test`、无换行；禁止其他文件修改、commit/push/merge、网络工具、提权或系统初始化。没有危险绕过参数或全局配置改动。普通额度检查允许使用，5小时已用5%、周已用11%；未充值或扩展预算。正常 Medium，ChatGPT 已登录，未读取认证正文。EAP 自动重试为0；Codex 内部网络重试和Agent轮次不受EAP精确控制。

<a id="p1-c-real-delegation-20261023-report--独立结果与证据"></a>
#### 独立结果与证据

仓库分别为：

- `C:/Users/LH/AppData/Local/Temp/eap-codex-smoke-1416275903348413823/repo`
- `C:/Users/LH/AppData/Local/Temp/eap-codex-smoke-17683078329453654582/repo`

两者均新建、无 remote；前后 git status 仅 `?? .eap-codex-test`，该标记由测试夹具预先创建并经独立读取确认未变；git diff 为空。目录仅 `.git` 和标记，没有 hello.txt 或额外仓库文件。未对全机文件变动进行监控。执行器报告已清理且活跃数0，独立检查未发现命令行匹配仓库的 codex 进程；不能宣称全面证明所有脱离父子关系的后代均不存在。

证据目录（相对于本报告）：

- `p1-c-real-delegation-20261023-report.md/`
- `p1-c-real-delegation-20261023-report.md/`

各有 once.lock、result.json（脱敏输出、解析事件、状态和Git）、independent.json、harness.json、Maven日志、manifest.json（SHA256与长度）。日志常见凭据模式检查未命中，未输出密钥；这不是任意敏感内容零泄漏的形式证明。平台 Result.artifacts 仍为空：本轮为手工留存证据文件和清单，没有实现平台 Artifact 存储或引用注册。最初独立检查脚本的 Get-FileHash 不可用，随后改用 .NET SHA256 完成清单；模型任务没有因此重跑。

<a id="p1-c-real-delegation-20261023-report--测试缺陷与验收判断"></a>
#### 测试、缺陷与验收判断

每次 Maven 定向运行 `-pl eap-runtime -am -Dtest=CodexRealSmokeTest -Dsurefire.failIfNoSpecifiedTests=false -Deap.smoke.evidence=<新目录> test`，通过环境变量显式启用。两次各1测试、0失败，Maven退出0，耗时约27.658/25.178秒。夹具通过仅表示证据收集结束，不表示委派业务成功；本轮未重跑完整后端回归。

本轮唯一代码调整为测试夹具的目标文本和安全提示；未改生产Adapter。状态映射没有把 turn.completed 错当进程成功，也没有把审批通过当验证通过。尚需后续授权处理的缺口：工具策略拒绝未成为结构化独立错误分类；turn.completed 后进程未退出的原因未确定；Result.artifacts 无平台引用；“Reading additional input from stdin...”也不足以独立证明参数或stdin缺陷，不能据此猜测修复。

结论：模型通信与JSONL解析已有真实证据，真实文件委派未完成，P1-C端到端成功验收不通过。UNVERIFIED保持正确。P1-D未实施。没有提交、推送、扩大权限或再重试，等待下一轮授权。


<a id="p1-c-real-delegation-20261023-report--后续真实文件委派最终归档2026-10-23"></a>
#### 后续真实文件委派最终归档（2026-10-23）

本节来自已有报告，本轮未发起模型请求；原始实验目录已退役，不改变结论。

| executionId | 既有结果 |
|---|---|
| 5e0358ac-4614-4d39-aee3-ca285b685a9c | gpt-6.1-sol通信成功、CLI退出0、3项Artifact大小/哈希核验通过；文件未生成；当时分类漏报，后续已修复 |
| e6879f6a-c59f-48ac-b230-02fe128f73b0 | 同模型，经EAP完整链路；18851ms，CLI退出0，Outcome.error及Trace.toolError均TOOL_POLICY_DENIED；3项Artifact核验通过；文件未生成 |

直接错误：`patch rejected: writing is blocked by read-only sandbox; rejected by user approval settings`。
两例均SUCCEEDED / APPROVED / UNVERIFIED，分别代表进程正常结束、EAP任务获准、业务结果未独立验证；不能判定文件任务成功。
最终案例turn.completed至退出观察3.2435527秒；cleanupComplete=true、activeCount=0，未超时。JSONL未独立暴露完整补丁参数，不虚构工具事件。
原参数包含workspace-write、approval_policy=never、工具网络禁用及正确cwd，未换PowerShell/Python绕过拒绝。原生sandbox写入成功不等于exec成功；有效只读来源仍未知。
P1-C文件委派验收仍未通过，P1-D未实施，调查暂停。旧raw JSONL/副本与防重锁随已结束目录清理；删除旧锁不授权重跑，真实模型代码gate和单次审批要求不变。

> 2026-10-23专项清理：上述历史中间产物路径已转向保留的最终报告；历史结论不变，原始输出不再长期保存。
<!-- record:end docs/audits/p1-c-real-delegation-20261023-report.md -->

---

<a id="p1-c-windows-sandbox-compatibility-diagnosis"></a>

## P1-C Windows沙箱兼容性只读诊断

来源：`docs/audits/p1-c-windows-sandbox-compatibility-diagnosis.md`；合并基线 `82aa504`。

<!-- record:start docs/audits/p1-c-windows-sandbox-compatibility-diagnosis.md -->
<a id="p1-c-windows-sandbox-compatibility-diagnosis--p1-c-windows沙箱兼容性只读诊断"></a>
### P1-C Windows沙箱兼容性只读诊断

2026-10-23。仅调查，未执行sandbox启动/setup/uninstall/reset，未修改任何系统状态或EAP生产代码，未调用模型、提交或推送。正常宿主只读查询使用的是中完整性用户令牌，不是管理员修复。

<a id="p1-c-windows-sandbox-compatibility-diagnosis--组件版本路径归属"></a>
#### 组件版本、路径、归属

CLI自报0.163.0-alpha.11.2，位于用户AppData/Local/OpenAI/Codex/bin/37f54d68e5533a51/codex.exe。服务为CodexSandboxService.OpenAI.Codex，Running/Auto/LocalSystem，实际映像位于WindowsApps/OpenAI.Codex_26.1016.8622.0_x64__2p2nqsd0c76g0/app/resources/codex-windows-sandbox-service.exe。CLI用户缓存与桌面包服务是不同安装位置，不能仅凭此断定不兼容。

| 文件 | SHA256 |
|---|---|
| 用户缓存CLI | C81ED464E5E7CAFD09A5FA26AF390C480BED8E9FAB2A87A54B285FBD56E7122A |
| runner-0.163.0-alpha.10.2.exe | 0DE2B882D1F763ECDF4FCC3873FEC18DDCF20646B6291DAC54D33A9F9116D4C4 |
| runner-0.163.0-alpha.11.exe | E95DB2235CDE22F645C835E79E84B7FBC1E8130D7BFC997D94CDAAB8042ECFE7 |
| .sandbox-bin/codex.exe | 3553CD6E7DF5A093D8CB8301CD8088A57E0971ABA71DDBE0E67F7F44A15CDF68 |
| 服务实际映像 | 0202B7E5518CCE054B4FB587FEE64CCA64338478FE4E9FE0B6654A0CB7D4EDE1 |

以上文件的PE FileVersion/ProductVersion均为空；不能把文件名版本当运行时协议版本。.NET读取嵌入证书主体均为OpenAI OpCo, LLC。Get-AuthenticodeSignature模块加载失败，未修改环境修复；证书提取不等于WinVerifyTrust、时间戳、吊销或信任链验证成功，数字签名有效性仍未确认。

setup marker版本5，既有两个账户/组/防火墙/服务的事实沿用前次调查。公开main的setup版本也是5，但精确alpha源码未取得，不能证明二进制一致。多个历史runner共存和不同哈希属于已观察到差异，不构成“明确版本损坏”的证据。未运行helper的任何入口来读取版本。

<a id="p1-c-windows-sandbox-compatibility-diagnosis--令牌和执行环境差异"></a>
#### 令牌和执行环境差异

受限工具与正常宿主的用户SID相同（末尾1001），无需将完整SID或账号邮件重复到交付报告。

| 项目 | 此前受限工具 | 正常宿主 |
|---|---|---|
| 完整性 | Low，S-1-16-4096 | Medium，S-1-16-8192 |
| Administrators | deny-only | deny-only |
| 用户主体 | 相同LH | 相同LH |
| 管理员提升 | 无 | 无 |

之前受限环境无法CIM查询/终止部分进程、写Codex arg0目录；正常宿主可以读取服务与文件元数据。这支持“调用上下文权限限制”假设，但不证明helper具体失败API。不得因此自动提权启动。

Get-ExecutionPolicy模块同样加载失败；只读注册表显示HKCU ShellIds ExecutionPolicy=RemoteSigned，HKLM PowerShell政策EnableScripts=1且该处ExecutionPolicy为空。它们不是完整有效策略合并结果，也没有证据将helper失败归因于PowerShell脚本策略。

<a id="p1-c-windows-sandbox-compatibility-diagnosis--managed-policy与requirements"></a>
#### Managed policy与requirements

只读查询未发现C:/ProgramData/OpenAI/Codex/requirements.toml或用户.codex/requirements.toml，ProgramData/OpenAI下限定TOML搜索无命中；查询的HKLM Software/Policies/OpenAI/Codex没有选定限制字段输出，当前进程未发现CODEX配置/requirements覆盖变量。全局已保存windows.sandbox=elevated。

这些是限定位置的“未发现”，不能宣称机器没有强制政策。包安装的策略路径、MDM、云下发要求、LSA/GPO、服务端有效sandbox-state均未完整取得。本轮不启动app-server或sandbox来补证据。完整有效policy仍未知，无证据说明存在强制禁止，也无证据保证不存在。

<a id="p1-c-windows-sandbox-compatibility-diagnosis--错误日志与最可能原因"></a>
#### 错误日志与最可能原因

只读取.sandbox/sandbox.2026-10-23.log的限定尾部，筛选error/fail/denied并排除含命令、payload、环境、token/password/secret等行；没有输出原始命令或秘密。命中的多条setup refresh记录均为errors=[]，不能当成错误证据。最近可见日志尾时间为16:43:54附近，未定位到此前18点后探索失败的对应记录；setup_error.json在查询位置不存在。

所以当前能确认的具体失败仍仅为前次`orchestrator_helper_exit_nonzero`和helper exit Some(1)，没有更细的Win32错误码。此前`sandbox windows --help`并非该版有效windows子命令帮助，不能据其结果认定正确sandbox预检必然失败；其后正确宿主预检被审批阻止、未执行。

按证据排序：

1. 较强假设：低完整性/受限调用上下文阻止helper阶段。依据令牌和同环境访问拒绝；缺少对应日志，未证实具体API。
2. 较弱假设：共享服务、CLI与缓存helper安装归属/版本路径不一致。确有多个安装位置，但没有协议不匹配记录或明确错误。
3. 未证实：工作目录ACL、强制政策或登录权导致失败。现状不足，不应建议先改这些资源。

<a id="p1-c-windows-sandbox-compatibility-diagnosis--临时目录权限与规范化"></a>
#### 临时目录权限与规范化

没有创建新目录，使用前次Smoke留下的独立临时repo作只读样本：C:/Users/LH/AppData/Local/Temp/eap-codex-smoke-1723425824860012776/repo。owner为当前LH用户，AreAccessRulesProtected=false（DACL继承开启），目标Attributes=Directory，icacls显示当前用户/SYSTEM/Administrators继承FullControl，CodexSandboxUsers继承Modify，另有若干SID条目。

FullPath规范化结果与样本路径一致。没有对全部父目录作最终句柄解析或重新验证每个ACE SID用途，不能宣称完整reparse/TOCTOU安全。样本权限不能替代下一次新临时repo权限。未写入文件或ACL进行探测。

<a id="p1-c-windows-sandbox-compatibility-diagnosis--是否支持直接运行预检"></a>
#### 是否支持直接运行预检

现有基础设施、正常宿主Medium令牌及样本工作区ACL支持“先尝试复用，不先重装”的方向；不能证明执行不会触发helper materialization、ACL刷新、状态文件写入或管理员setup。当前证据不足以批准零副作用启动，更没有必要直接申请管理员初始化。

最小运行权限候选是正常LH的Medium令牌、可读CLI/helper、可访问已有服务和所需凭据元数据、仅临时repo的必要写权限。不是管理员令牌；若已有环境必须修复，当前授权下应停止。管理员级setup应在发现明确缺失资源/登录权/版本错误并完成影响评审后再申请。

如下一轮单独批准无模型启动，可考虑官方帮助对应形式（仅计划，未执行）：

    codex -c sandbox_mode=workspace-write
      -c sandbox_workspace_write.network_access=false
      sandbox --cd <新临时repo> -- cmd.exe /d /c exit 0

该命令没有exec或模型任务，但仍可能触发legacy初始化/ACL刷新，不能称严格只读。运行前需核对实际生效实现及managed requirements，不静默切换。仅允许一次有界探测，出现UAC/setup、账户/网络/服务变更要求、超范围ACL、权限拒绝、配置错误或超时即停止；不得同意初始化、降级沙箱或自动重试。具体启动及潜在状态更新必须另授权。

<a id="p1-c-windows-sandbox-compatibility-diagnosis--后续建议与来源"></a>
#### 后续建议与来源

当前建议继续只读补足签名可信度、安装归属和有效policy，而非管理员初始化。若用户愿意接受受限运行期状态刷新，可单独批准正常宿主的无模型预检；其授权不应包含重建账户、防火墙修改、卸载/重装或真实模型请求。

公开资料沿用上轮已核对的[官方Windows沙箱说明](https://learn.chatgpt.com/docs/windows/windows-sandbox)、[setup公开实现](https://github.com/openai/codex/blob/main/codex-rs/windows-sandbox-rs/src/setup.rs)。它们仅提供机制背景，不证明本机alpha全部行为。报告区分已观察事实、原因假设和未确认风险，未执行初始化补证据。


<a id="p1-c-windows-sandbox-compatibility-diagnosis--已结束实验最终归档2026-10-23"></a>
#### 已结束实验最终归档（2026-10-23）

本节合并已退役的权限档案、预检和目录配对实验，不代表本轮重跑。CLI 0.163.0-alpha.11.2。
早期 CLI_ARGUMENT_ERROR 在参数解析阶段停止，不是沙箱后端初始化失败；配置结构成立也不代表后端生效。
后续 Medium 用户的官方 sandbox --permission-profile :workspace --include-managed-config --cd <独立目录> 入口完成无模型预检。
PowerShell 写入配对实验：J:/Code/test 退出0，2.5004024秒；系统Temp新仓库退出0，2.4764647秒；hello.txt均精确等于 Hello from EAP sandbox probe（28字节、UTF-8、无换行），仅该文件新增，无remote。
J盘测试目录自动新增两条可继承DACL允许项，Temp测试目录新增一条；所采Temp父目录owner/SDDL/继承状态不变。不能宣称没有ACL副作用。
原生sandbox与exec/apply_patch不是等价权限路径：后续exec仍拒绝补丁写入；不支持“Temp位置本身必然无法写入”的解释，未发现确定的EAP cwd错配。实际只读策略来源仍未知。
此前初始化资源的持久性风险不因删除审计文件消失。本轮没有运行沙箱、模型或setup，没有改变ACL、账户、网络规则或服务。中间目录、重复日志与快照退役，最终结论保留。
<!-- record:end docs/audits/p1-c-windows-sandbox-compatibility-diagnosis.md -->
