# P1-C 真实委派 Smoke Test 与获准重试

2026-10-23。首次执行后，用户明确授权网络调整后重试一次；共启动两个 EAP 主任务，每次各一次、无自动重试。没有第三次尝试。前次历史失败证据保留。

## 结果

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

## 实际参数及边界

固定二进制位于 `C:/Users/LH/AppData/Local/OpenAI/Codex/bin/37f54d68e5533a51/codex.exe`。每次参数数组为：

```text
exec --model gpt-6.1-sol --json --sandbox workspace-write --ephemeral --ignore-user-config
-c sandbox_workspace_write.network_access=false
-c sandbox_workspace_write.exclude_tmpdir_env_var=true
-c sandbox_workspace_write.exclude_slash_tmp=true
--cd <本次独立临时仓库> <任务说明；审计中脱敏>
```

任务要求只创建 hello.txt，UTF-8 内容严格为 `Hello from EAP Codex smoke test`、无换行；禁止其他文件修改、commit/push/merge、网络工具、提权或系统初始化。没有危险绕过参数或全局配置改动。普通额度检查允许使用，5小时已用5%、周已用11%；未充值或扩展预算。正常 Medium，ChatGPT 已登录，未读取认证正文。EAP 自动重试为0；Codex 内部网络重试和Agent轮次不受EAP精确控制。

## 独立结果与证据

仓库分别为：

- `C:/Users/LH/AppData/Local/Temp/eap-codex-smoke-1416275903348413823/repo`
- `C:/Users/LH/AppData/Local/Temp/eap-codex-smoke-17683078329453654582/repo`

两者均新建、无 remote；前后 git status 仅 `?? .eap-codex-test`，该标记由测试夹具预先创建并经独立读取确认未变；git diff 为空。目录仅 `.git` 和标记，没有 hello.txt 或额外仓库文件。未对全机文件变动进行监控。执行器报告已清理且活跃数0，独立检查未发现命令行匹配仓库的 codex 进程；不能宣称全面证明所有脱离父子关系的后代均不存在。

证据目录（相对于本报告）：

- `p1-c-real-delegation-20261023-report.md/`
- `p1-c-real-delegation-20261023-report.md/`

各有 once.lock、result.json（脱敏输出、解析事件、状态和Git）、independent.json、harness.json、Maven日志、manifest.json（SHA256与长度）。日志常见凭据模式检查未命中，未输出密钥；这不是任意敏感内容零泄漏的形式证明。平台 Result.artifacts 仍为空：本轮为手工留存证据文件和清单，没有实现平台 Artifact 存储或引用注册。最初独立检查脚本的 Get-FileHash 不可用，随后改用 .NET SHA256 完成清单；模型任务没有因此重跑。

## 测试、缺陷与验收判断

每次 Maven 定向运行 `-pl eap-runtime -am -Dtest=CodexRealSmokeTest -Dsurefire.failIfNoSpecifiedTests=false -Deap.smoke.evidence=<新目录> test`，通过环境变量显式启用。两次各1测试、0失败，Maven退出0，耗时约27.658/25.178秒。夹具通过仅表示证据收集结束，不表示委派业务成功；本轮未重跑完整后端回归。

本轮唯一代码调整为测试夹具的目标文本和安全提示；未改生产Adapter。状态映射没有把 turn.completed 错当进程成功，也没有把审批通过当验证通过。尚需后续授权处理的缺口：工具策略拒绝未成为结构化独立错误分类；turn.completed 后进程未退出的原因未确定；Result.artifacts 无平台引用；“Reading additional input from stdin...”也不足以独立证明参数或stdin缺陷，不能据此猜测修复。

结论：模型通信与JSONL解析已有真实证据，真实文件委派未完成，P1-C端到端成功验收不通过。UNVERIFIED保持正确。P1-D未实施。没有提交、推送、扩大权限或再重试，等待下一轮授权。


## 后续真实文件委派最终归档（2026-10-23）

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
