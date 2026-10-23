# P1-B 进程生命周期、查询与取消

2026-10-23，基于现有未提交P0/P1-A增量实施，全部用户修改保留；无提交/推送/数据库迁移。仅P1-B，无Mission、Codex、MCP客户端或第二套Capability Registry。

## 接口与关键Diff

- api/ProcessExecutor新增runManaged(executionId,...)、status、cancel、snapshots默认接口；旧run/runIsolated继续同步返回Observation。默认实现不提供生命周期查询，不虚构支持能力。
- api/CliExecution新增CANCELLING/CANCELLED及Snapshot(executionId,status,cleanupComplete)。
- core/DefaultProcessExecutor复用原执行循环，新增最多256项进程内状态快照、20ms观察循环、取消标记、后代ProcessHandle跟踪、受限输出与关闭清理。注册表不存stdout/stderr、argv或环境秘密；结果仍走已有Expert证据。
- CliExecutionService将平台executionId传至runManaged；以查询状态判断终态，避免把程序自行退出124/130误认成超时/取消。
- web/controller/CliExecutionController提供GET /api/cli-executions、GET /api/cli-executions/{id}、POST /api/cli-executions/{id}/cancel。列表只返回状态快照，用户可在同步Expert请求结束前发现executionId并取消。不提供未经校验的任意命令启动接口。
- CliProgramsTest调整Mock与验证至runManaged；新增ProcessLifecycleTest六项真实Windows进程测试；CliExecutionServiceTest增加真实junction拒绝测试。

## 状态与竞态语义

CREATED→RUNNING→SUCCEEDED/FAILED/TIMED_OUT；取消将CREATED/RUNNING原子改为CANCELLING，执行线程清理后返回CANCELLED。完成提交与取消共用每执行锁，先取得终态者生效；已是终态时取消不重写。重复取消返回同一快照，不重复启动清理；未知ID返回404。timeout/cancel同时发生只保留一个终态。CANCELLING响应表示请求已接受，不代表进程已结束，调用方需继续查询cleanupComplete。

审批与验证状态沿用P1-A，不随取消/成功自动授权或验收。进程自行exit124/130仍为FAILED，只有执行循环决定TIMED_OUT/CANCELLED。清理未确认成功时状态FAILED，输出明确CLEANUP_FAILED或错误摘要；资源释放标记与清理成功标记分开，不能以句柄释放当作子进程终止证明。

同步调用未改为队列/后台Mission；多个请求可在各自线程执行，状态、输出读流与进程句柄逐执行隔离。stdin立即关闭，stdout/stderr各保留最多1MiB并继续排空超额字节；对内存构成明确上限。每执行有独立读流executor，在finally关闭三个流、清除进程引用并shutdownNow。状态快照容量256，达到上限先淘汰已释放快照，仍满则拒绝新执行；这是易失查询缓存，不是30天执行记录存储，也不删除持久化历史或Artifact。不具备跨重启恢复能力。

Spring对AutoCloseable执行器调用close，拒绝新执行、标记当前执行取消并最多等待8秒。关闭属于尽力清理，不承诺JVM被强杀时清理成功。

## Windows真实验证及风险

真实测试涵盖：正常/非零退出（沿用P1-A）；超时及双流各2MiB输出限额（既有DefaultProcessExecutorTest）；主动/重复/完成后/未知ID取消；超时竞争；并发不同输出；创建子Java进程、记录PID、取消后确认PID已退出；关闭时清理与拒绝再启动；中文/空格目录及Windows bootstrap+业务环境变量；cmd mklink /J创建临时junction指向授权根之外，策略拒绝且测试只删除该临时链接。

首次新增中文路径断言失败，发现Java子进程管道输出编码使用Windows默认值，而执行器固定UTF-8读取。测试子进程明确-Dstdout.encoding=UTF-8/-Dstderr.encoding=UTF-8后重跑，未降低路径断言。生产CLI输出当前需UTF-8；其他编码适配尚未实现。

本轮Windows采用ProcessHandle后代枚举/保存及destroyForcibly，无Job Object依赖。真实普通子进程用例通过不等于OS级进程容器：20ms枚举窗口中快速派生/重挂接、脱离父进程、权限不允许终止的后代可能逃逸；无法证明不存在未观察到的后代。不能将该方案用于不可信任意CLI隔离。cwd toRealPath拒绝junction逃逸，但校验到启动仍有TOCTOU窗口。Linux/WSL没有运行验收或进程组桥接，不声明支持。

## 验证命令与范围

`rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-p0.ps1 -Name backend -TimeoutSeconds 120`，在P0确认的正常宿主环境运行。测试断言不跳过；保留原来数据库相关两项条件跳过。无数据库端到端或真实HTTP服务器验收；新增Controller通过编译，生命周期语义由真实执行器测试验证。完整最终计数与耗时见本报告末尾及原始日志。

## 后续P1-C建议

Codex适配复用runManaged/status/cancel及P1-A校验/证据，不能直接绕开Policy；ID由平台生成，外部线程ID只关联。先在独立临时Git仓库验证UTF-8 JSONL、进程清理和鉴权错误，再增加模型委派，需单独授权。若要允许不可信CLI/长时Codex，应先评审Windows Job Object或其他强进程归属机制；实时逐行事件/Artifact持久化尚未实现，不可把当前结束时stdout摘要称为流式协议适配。

待确认：是否接受当前普通可信native CLI的尽力进程树清理边界；是否下一步先加固Windows进程归属再进入P1-C。P1-D独立Diff/Build/Test与数据库完整集成仍单独规划，未实施。

最终完整回归：122项，120通过、2跳过，失败0、错误0，exit0，墙钟16.04秒（Maven报告14.135秒）。ProcessLifecycleTest六项真实生命周期测试全部通过。日志为spring-ai-consolidation-report.md及对应stderr/result.json。`git diff --check`通过。输出限额、进程清理与策略校验复用原执行器/服务，避免重复注册和引入分布式复杂度；生命周期与审批/验证职责保持分离。

> 2026-10-23专项清理：上述历史中间产物路径已转向保留的最终报告；历史结论不变，原始输出不再长期保存。
