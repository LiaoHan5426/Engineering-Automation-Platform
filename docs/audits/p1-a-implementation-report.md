# P1-A CLI执行策略与证据契约

2026-10-23，HEAD a9b14bc40b1730378f3bed705afc86cc4394ec49。保留已有App.vue、verify-p0.ps1及P0日志/报告/P1设计修改；未提交、推送或操作正式目标仓库。仅实施P1-A。

## 实际变更

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

## 语义与边界

executionId由平台UUID生成，不复用Expert执行ID。事件按同一executionId产生CREATED→RUNNING→终态（拒绝则无RUNNING），含序号和时间。进程exit0对应SUCCEEDED但verification始终UNVERIFIED。Approval不会因进程成功变成APPROVED；PENDING/DENIED不能执行。审批状态是服务器可信调用参数，尚无审批决定API，不能接受客户端自报批准。权限策略必须由服务器创建，不能用执行请求反过来授权自己。

固定参数数组就是首版精确模板，任何不同参数被拒绝；未新增参数占位符DSL。cwd以toRealPath规范化且必须位于authorizedRoot之下，消除普通链接路径的词法绕过；校验到启动间仍存在路径竞态，不能当OS沙箱。现有Handler使用服务器注入workspace作为授权根，不从前端请求读取根。

环境通过allow-list校验并在ProcessBuilder清空继承值后注入。自定义CLI默认仅透传SystemRoot/WINDIR/TEMP/TMP/PATH，真实bootstrap值来自服务器环境；其余宿主秘密不透传。PATH本身属于可信主机配置，二进制定位仍复用LocalBinaries，不新增发现注册机制。工具若需要HOME等变量会显式缺失，需后续经策略评审开放，不暗中退回继承全部环境。

审计输出保留commandSummary、环境变量名（不含值）、stdout/stderr摘要、exitCode、durationMillis和固定错误码。显式标记的敏感参数及环境值逐字替换，并复用SensitiveData处理password/token等赋值；另识别分离的--token/--password等参数。摘要最多8000字符；底层原有1MiB读流限额不变。原始Observation.metadata.command不复制进新证据。任意未知秘密无法自动识别，必须用sensitiveArguments声明；不要记录原始Request/Policy的toString。

Artifact目前仅定义关联引用，Result返回空列表；无文件生成、访问或清理接口，不能宣称Artifact存储已完成。Retention为Spring配置Bean：eap.cli.retention.metadata-days=30、log-days=7、artifact-days=7，可通过标准Spring属性覆盖；非正值拒绝。它只描述保留政策，没有定时任务或数据删除。

兼容范围：自定义登记CLI接入新合同；旧内置Git/ripgrep、CLI probe仍用旧run，保留原先语义。新runIsolated默认拒绝不支持的执行器，第三方旧实现不能悄悄忽略环境限制。Windows native是真实验证目标；Linux/WSL没有运行验收，也未实现新取消接口/Job Object。默认运行时超时继续沿用20秒，不在P1-A伪装为可取消执行。

## 验证

命令：`rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-p0.ps1 -Name backend -TimeoutSeconds 120`（正常宿主环境）。最终耗时15.74秒，exit0，115项：113通过，2跳过，失败/错误0。日志：spring-ai-consolidation-report.md。

新增五项测试覆盖：合法真实Java进程成功/失败；不授权cwd、模板不符、环境变量不允许及待审批拒绝；裸环境秘密/敏感参数/日志赋值脱敏；事件ID序号与状态独立；保留默认值/非法值；实际子进程不继承PATH且cwd正确。现有CLI/Capability/Expert回归通过，原进程输出/超时测试也通过。未新增数据库迁移，现有V1–V12顺序未变。数据库CLI集成与Schema probe按原条件跳过，未宣称真实数据库保存链路已验证；junction专项及HTTP登记→执行完整集成也尚未运行。`git diff --check`通过。

## 原则、后续与确认

KISS/YAGNI：固定模板、同步短调用和三类状态，不引入调度器/动态DSL。DRY：复用进程执行器、脱敏、注册与Expert证据路径。SRP：策略/证据在服务，进程读流在执行器，审批/业务验证不混进exitCode。

P1-B依赖executionId与结果/事件合同，实现真实取消、状态查询、清理失败与平台进程树边界；需先决定执行记录的持久化/查询方式。P1-C在B可控生命周期基础上接Codex，只能用独立临时Git仓库。P1-D读取独立diff/build/test证据后才允许写Verification通过，当前没有这个写入口。

待确认：是否接受首版只接入自定义CLI、固定数组模板及明确的环境allow-list；是否授权在专用数据库开展完整登记→Expert→证据保存验收；是否在P1-B另行批准执行记录持久化/查询与Windows进程树适配。P1-B/C/D均未实施，保留策略自动清理未实施。

> 2026-10-23专项清理：上述历史中间产物路径已转向保留的最终报告；历史结论不变，原始输出不再长期保存。
