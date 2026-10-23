# P1-C 定向策略核对与执行证据闭环

日期：2026-10-23（Asia/Shanghai）。本轮仅只读策略检查、最小生产实现及离线测试。没有模型请求、新沙箱启动、全局配置/策略修改、P1-D、提交或推送；保留既有修改与历史失败证据。

## 1. 策略拒绝来源

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

## 2. 最小代码调整

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

## 3. 失败语义与脱敏

- Result.status表达OS进程生命周期；Result.approval是EAP审批；verification始终UNVERIFIED。
- Trace.toolError保存TOOL_POLICY_DENIED提示，原始原因保留在脱敏stderr/事件中；当前基于受限文本识别，不冒充权威规则来源。
- 即使turn.completed或进程exit0，工具拒绝仍可使Outcome.error=TOOL_POLICY_DENIED。
- TIMED_OUT/CANCELLED优先保持；Artifact保存失败写artifactError=ARTIFACT_SAVE_FAILED，不把进程成功改成模型/业务成功。若进程成功但归档失败，Outcome.error也明确失败；部分已保存引用保留。
- 未提供新Trace的旧执行器返回EXECUTION_TRACE_UNAVAILABLE，旧公共构造方式仍可调用。
- 归档前应用已有SensitiveData、显式敏感参数/环境值脱敏，另处理Bearer和常见sk形式密钥。仅归档处理后内容，不读取认证文件；未知任意秘密仍无法靠正则保证识别。测试检查secret-value不出现在产物中。

本地存储以可信平台指定根为边界；默认位于专用测试根的 `.eap-execution-artifacts`，测试仓库之外。注册表示Result返回真实可核对文件引用，不包括HTTP下载API、数据库索引或跨重启任务恢复。可信本地目录假设及Windows尽力清理限制保留，不是对抗恶意本地账户的沙箱。

## 4. Artifact实例

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

## 5. 测试结果

最终命令：

```powershell
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-p0.ps1 -Name backend -TimeoutSeconds 120
# 包装实际执行 mvn -B -ntp -f backend/pom.xml test
```

最终144项：140通过、4条件跳过、0失败/错误；exit0，墙钟55.82秒，Maven53.997秒。日志 `spring-ai-consolidation-report.md`。CodexAdapterTest 18项、FileExecutionArtifactStoreTest 2项均通过。四项跳过为数据库条件测试2、真实模型Smoke1、本机独立配置检查1；未操作未授权数据库。

覆盖正常完成、延迟退出、本机事件时间先于退出、turn.completed后仍运行至超时、策略拒绝（含超过stderr摘要才出现）、取消、超过8000字符的完整JSONL、超过1MiB的截断、Artifact哈希/大小/脱敏、保存失败与进程成功分离、两个Adapter并发证据隔离、非法kind和junction逃逸拒绝、不覆盖旧文件。既有CLI/Capability/Expert与进程回归保留通过。

中间一次定向Maven命令被PowerShell拆分带点-D参数而失败，后改用引用参数；一次测试编译失败因夹具java变量遮蔽包名，改为显式import；两者都没有调用模型或降低断言。失败与中间成功日志保留，最终结果以上述完整回归为准。git diff --check通过（仅已有CRLF提示）。

## 6. 剩余验收与下一步

证据闭环最小实现及离线测试已完成，仍不是P1-C真实文件委派成功。历史拒绝的具体策略来源尚未证明，修改后的exec配置及新产物链也没有真实模型验证；20秒是否足够仍待新时间证据判定。

下一次真实测试具备更好的观测和失败留证能力，**尚未具备“策略已确认允许”的保证**。若用户接受来源未确认且遇拒绝即停的边界，可另行批准一次受控调用；本轮不请求自动批准、不实际调用。新调用必须新仓库/ID/锁、明确模型/超时、重查登录额度，拒绝不绕过，UNVERIFIED不变。若要求先证明具体策略允许，则当前证据不足，不能以matchedRules为空替代证明。P1-D仍未实施。

官方来源（滚动文档，本机帮助作版本交叉核对）：

- https://learn.chatgpt.com/docs/agent-configuration/rules
- https://learn.chatgpt.com/docs/non-interactive-mode
- https://learn.chatgpt.com/docs/config-file/config-reference
- https://learn.chatgpt.com/docs/enterprise/managed-configuration

KISS/YAGNI：复用现有执行链和DTO，只增加有界Trace及小存储接口；DRY：统一在执行服务脱敏和归档；SOLID：提供方协议解析、进程采集、文件存储各自负责。未扩大为通用Agent审批系统或独立工程验收。

> 2026-10-23专项清理：上述历史中间产物路径已转向保留的最终报告；历史结论不变，原始输出不再长期保存。
