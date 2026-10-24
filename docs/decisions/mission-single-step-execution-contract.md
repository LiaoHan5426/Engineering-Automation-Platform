# Mission 单步执行：只读 git-status

状态：契约已确认。只读 git-status 已实现，并已收敛到共享运行时和 Git 能力入口。未知执行会阻塞下一次启动。人工解除机制尚未实现，因此这不是可恢复 Mission。调度、审批流、自动续跑、独立验证和仓库写入仍未实现。日期：2026-10-24。

前置见 [P2 Mission 契约](p2-mission-contract.md)。持久任务壳已完成。只读 git-status 单步执行已实现；调度、审批流、自动续跑和独立验证仍未实现。

## 现状证据

| 对象 | 现在实际做什么 | 不能直接当成 |
|---|---|---|
| `eap.mission` | 一行任务壳。`status`、`execution`、`approval`、`verification`、`grant_state` 被检查约束固定为 `created` / `not_started` / `not_requested` / `not_requested` / `none`。`UNIQUE(handoff_id)` | 执行记录、工作区绑定、授权 |
| `eap.handoff` | 未执行意图。来源只有 `chat` 或 `builder`，`sourceRef` 是会话 id、`draft`、`builder-alpha` 或 `builder-beta` | 文件系统路径或授权 |
| Builder `mockRepositoryLabel` | 浏览器本地字符串，例如「模拟 · ledger」 | 真实仓库路径或 `repository.write` |
| `Path workspace` | 服务端 bean。`EAP_WORKSPACE` 优先，否则当前目录含 `.git` 时用当前目录，否则用父目录。见 `RuntimeConfiguration` | 浏览器提交的路径 |
| `RuntimeWorkspace` | 工作区、授权根和显示标签的共享来源。新键 `eap.runtime.authorized-root` 与旧键 `eap.ai.authorized-root` 冲突时拒绝；两者都空时拒绝；不把根扩大到父目录或整盘。日常服务的根保持为空 | 操作者认证 |
| `git-status` | `GitCapability.command()` 是唯一的参数数组构造。Mission 通过 `executeManaged(平台执行号)` 复用它。`execute()` 仍给聊天里不需要平台执行号的调用 | Mission 自己拼 `[binary, status]` |
| `DefaultProcessExecutor` | 同一 bean 上取消、20 秒超时、状态快照都在进程内存，最多 256 条。平台执行号由调用方传入 `runManaged` | 跨重启进程接管 |
| `CliExecution.Status` | `CREATED`、`RUNNING`、`CANCELLING`、`SUCCEEDED`、`FAILED`、`REJECTED`、`TIMED_OUT`、`CANCELLED`。验证枚举另有 `UNVERIFIED` | Mission 的 `completed` |
| `eap.task` | `TaskService.createTask` 会立刻规划并可能执行能力，停用能力返回 409。重新运行会再执行 | Mission 的执行记录 |
| `CapabilitySettings` | 缺记录视为启用。分析任务会检查停用；`GitInspectionHandler` 自己不检查 | Manifest 申请 |
| 插件 `GRANTS` | 仍是空数组。模拟审批只改本地 `mockApproval` | 服务端授予 |

没有第二套 Capability Registry。本契约不新增执行器、不替换 `GitCapability`，也不把 Mission 写入 `eap.task`。

## 推荐方案

首个候选能力只做现有只读 `git-status`。启动时仍调用已注册的 `GitCapability`，但改走现有 `ProcessExecutor.runManaged`，把平台生成的执行号交给这个 bean。这样超时、取消和进程清理沿用现有实现。20 秒超时和内存中的 256 条快照上限也沿用，不单独做一套。

一次执行是 `eap.mission` 的子记录，不是另一条 Mission，也不是一条分析任务。进程退出码为 0 只表示这一次执行成功。Mission 的 `status` 保持 `created`，`verification` 保持 `not_requested`，`grant_state` 保持 `none`。不调用模型、规划器或其他能力。

### 工作区绑定

Mission 当前只有交接来源。`sourceRef` 和模拟仓库标签都不能解析成路径，也不能充当授权。

可信绑定只在服务端完成：

1. 读取现有 `workspace` bean，再取实路径。
2. `authorized-root` 必须已配置。工作区实路径必须落在该根的实路径之内，并且是目录。越界、根为空、路径不存在，都拒绝启动，不插入执行行。
3. 请求体不允许带路径、仓库标签或工作区 id。带上就拒绝。
4. 执行行保存当时的实路径和工作区标签。标签沿用聊天现有的 `workspaceLabel` 算法，只用于显示。以后启动再读服务端当前工作区，不沿用浏览器里的旧标签。

### 显式启动与授权

创建 Mission 仍然不执行。启动是另一个请求，只允许 `missionId`。服务端把能力固定为 `git-status`。客户端若指定其他能力、状态、授权、审批或路径，拒绝且不插入。

下面几项都不是授予：插件 Manifest 里的 `mission.create` 或 `repository.write`、Builder 模拟审批、请求里自报的 `grant` 或 `approval`、`grant_state=none`。`none` 只表示没有仓库写授权，读到它不能放行。`GRANTS` 保持为空，`grant_state` 也保持 `none`。授权根只是路径边界，工作区落在根内同样不能单独放行。

放行必须同时满足服务端自己的三项，任何一项失败都不插入执行行：

1. 操作者身份是服务端常量 `local-operator`，与现有对话登记相同。请求体不能提交身份。本机部署仍没有用户或租户系统。浏览器来源沿用现有本机 Origin 边界，这不是远程认证。
2. Capability 授权检查使用 `CapabilityHandlerRegistry.resolveFor(null, "git-status")`。`git-status` 是平台能力，不读取专家 Manifest。解析结果必须是现有的 `GitInspectionHandler`，并且 `CapabilitySettings` 没有把它停用。缺记录仍视为启用。解析为空时拒绝。
3. 服务端执行策略由代码固定，不从请求组装。策略包含：允许执行、可执行文件取自 `git-status` 的现有通道、参数模板只有 `status`、目录是服务端工作区实路径、该路径必须落在授权根实路径之内、不接受调用方环境变量。进程环境只沿用现有 CLI 操作的引导变量 `SystemRoot`、`WINDIR`、`TEMP`、`TMP`、`PATH`，不继承整个宿主环境。审批记录为 `NOT_REQUIRED`，不能写成 `APPROVED`。

这三项的结果写入执行证据。证据里要能看出是哪一项拒绝的。路径越界不是 Capability 停用，Capability 停用也不是路径越界。

### 执行生命周期

Mission 与单次 execution 分开。执行状态使用现有枚举。不默认重试，不续跑。终态是 `SUCCEEDED`、`FAILED`、`REJECTED`、`TIMED_OUT`、`CANCELLED`、`INTERRUPTED`。在途状态是 `CREATED`、`RUNNING`、`CANCELLING`。`INTERRUPTED` 只在同一次进程里已经拿到真实退出证据时使用。服务重启本身不写这个终态。

同一 Mission 同时只允许一条在途执行。这由执行表上的部分唯一约束保证，范围是该 Mission 上状态属于在途的行。不能只做「先查再插」。两个启动同时通过校验时，后写入的一行触发约束冲突，服务端再读出已提交的在途行并返回它。冲突不是失败，也不插入第二行。

| 来源状态 | 条件 | 结果 |
|---|---|---|
| 无执行，或上一次已终态 | 显式启动通过校验 | 新的持久执行号，先写 `CREATED`，再进入 `RUNNING` |
| 在途 | 同一次 Mission 又来启动，含并发 | 约束冲突后返回这一条 |
| `RUNNING` | 进程退出码为 0，且取消没有先被执行线程采纳 | `SUCCEEDED` |
| `RUNNING` | 非零退出或执行器失败，且取消没有先被采纳 | `FAILED` |
| `RUNNING` | 超过现有 20 秒，且取消没有先被采纳 | `TIMED_OUT`，不自动再跑 |
| `CREATED` 或 `RUNNING` | 操作者请求取消 | 先记取消请求并进入 `CANCELLING`。此时还不是 `CANCELLED` |
| `CANCELLING` | 执行线程确认进程和子进程都已结束 | `CANCELLED` |
| `CANCELLING` | 进程先于取消采纳已经退出 | 保留 `SUCCEEDED`、`FAILED` 或 `TIMED_OUT`，不改写成 `CANCELLED` |
| 在途 | 服务进程重启，且没有新的进程退出证据 | 行保持在途，写入未知原因。不重新拉起，也不写成 `INTERRUPTED` |
| 任一终态 | 再次显式启动 | 新的执行号。旧行和旧证据不覆盖 |

取消只作用于这一次执行，不删除 Mission、交接或证据。重复取消在 `CANCELLING` 期间返回当前行；终态之后返回该终态，不再改写。第一切片的 HTTP 可以同步等待这一次 Git，因为现有处理器就是同步的；等待期间页面不把结果说成 Mission 完成。

### 取消与完成竞态

取消请求的响应是 `CANCELLING` 或已经存在的终态，不是立刻写成的 `CANCELLED`。只有负责该进程的执行线程可以写终态。它先看进程是否已经退出：

- 取消被采纳时进程仍活着：调用现有 `cancel`，销毁进程并等待它和已记录的子进程结束。确认结束后才写 `CANCELLED`，并在同一事务里更新投影。
- 进程已经退出并得到退出码：写 `SUCCEEDED`、`FAILED` 或 `TIMED_OUT`。后到的取消请求只保留「取消未赶上」的证据，不覆盖这个终态。
- 两边同时到达时以执行线程已经观察到的进程结果为准，不由取消请求覆盖。

### 执行号与启动失败窗口

持久子执行号就是交给 `runManaged` 的进程执行号。不为同一次启动再生成第二个号。插入 `CREATED` 行之后才调用 `runManaged`；调用前该号还没有对应进程。

启动失败按窗口处理，都不另开一条执行来代替：

| 窗口 | 处理 |
|---|---|
| 校验失败，尚未插入 | 不插入，不调用执行器 |
| 已插入 `CREATED`，`runManaged` 因执行器关闭、容量满或重复号而拒绝 | 同一行改为 `FAILED`，记下原因。此时还没有进程，投影一并改为 `failed` |
| 进程已启动，但终态或证据还没写完服务就退出 | 留给重启规则，不在启动请求里假装已经结束 |

`GitCapability.execute` 里的 `run()` 会自己生成执行号。Mission 启动走 `executeManaged(平台执行号)`，不走那条隐藏执行号的路径，也不自己拼命令。

### 重启与残留进程

跨重启进程接管后移。重启时只找出仍为在途的执行行，写入未知原因：`结果未知：服务重启后无法确认进程树是否结束`。行保持 `CREATED`、`RUNNING` 或 `CANCELLING`，因此部分唯一索引继续挡住下一次启动。下一次显式点击返回这一条，不再跑 Git。未知执行会阻塞，直到它离开在途状态。

人工解除机制尚未实现。没有接口可以把这条未知行改成终态、清掉阻塞或从中断处继续。阻塞不等于可恢复 Mission，也不等于自动续跑。

不把缺进程号、执行器不再跟踪、父进程号消失，或身份字段互相一致，当成进程树已经结束。这些情况都不销毁进程，也不写 `INTERRUPTED` 或 `CANCELLED`。同一次进程内的取消仍要等执行器观察到进程退出，才可以写成 `CANCELLED`。本切片没有进程查找或销毁组件。

已记下的进程号、启动时间和归属留在执行行上，供以后独立的接管能力使用。当前恢复路径不查找、不销毁进程。

### 投影

`mission.execution` 是最近一条执行的投影。没有执行行时是 `not_started`。有执行行时，与该行同时提交：`CREATED` 和 `RUNNING` 投影为 `running`，`CANCELLING` 投影为 `cancelling`，终态投影为对应的小写值。更新放在同一次数据库事务里。事务回滚时，子记录和投影一起回到原状。

终态之后再次点击启动会插入新的执行号。部分唯一约束不再挡住它，因为旧行已经不是在途。新行成为投影来源，旧行保持自己的终态。界面把这次点击显示为新执行，不显示成旧结果的重放。

### 证据与验证

每条执行保存：平台执行号、所属 Mission、操作者 `local-operator`、能力名 `git-status`、放行时的策略快照、服务端工作区实路径与标签、进程号与进程启动时间及归属、开始和结束时间、执行状态、退出码、脱敏后的 stdout 与 stderr。脱敏和长度上限沿用现有 `SensitiveData.redact` 与执行结果截断。命令参数只有 `status`，不接受调用方追加参数。策略快照用于事后看出为何放行，不把 `grant_state` 记成放行原因。

证据写入失败时，执行标为 `FAILED`，Mission 不标完成，界面不显示执行成功。`verification` 保持 `not_requested`。没有验证入口，界面不显示「已完成」或「验证通过」。

### 迁移边界

不改 `eap.handoff`，不改已有交接行。不改 `UNIQUE(handoff_id)`，不实现 `previous_mission_id`。

已有 Mission 行继续合法。增量迁移只放宽 `mission.execution`：删掉「只能是 `not_started`」这一条检查，改为允许 `not_started`、`running`、`cancelling`、`succeeded`、`failed`、`timed_out`、`cancelled`、`interrupted`。该列只是最近一次执行的投影，权威状态在执行表。执行表用部分唯一索引保证每个 Mission 至多一条在途记录。`status`、`approval`、`verification`、`grant_state` 的检查保持原样。投影只由服务端在同一事务中写入，请求体不能指定。

不把执行插入 `eap.task` 或 `eap.task_observation`。分析任务的数量和重新运行行为保持不变。

## 首切片范围

范围：上述迁移、执行表、对一条已有 Mission 显式启动一次 `git-status`、查询这一次执行、并发或重复的在途启动返回同一条、取消先进入 `CANCELLING` 并在进程结束后落终态。界面上的启动和结果必须跟创建 Mission 分开。成功文案只能表示这一次只读执行的进程结果。终态后的再次点击发起新执行。重启只记录未知并阻止自动重跑，不接管、不销毁残留进程。

不做：`git-diff`、其他能力、模型、规划器、审批流、自动重试、自动续跑、人工解除未知阻塞、可恢复 Mission、独立验证、仓库写入、调度。

## 验收方案

验收时实际库与单元测试分开报告。至少覆盖：

- 未调用启动时没有执行行，Mission 五个固定列不变。
- 请求携带路径、模拟仓库标签、状态或授权字段时拒绝，不插入。
- 授权根为空，或工作区实路径越出授权根时拒绝，不插入。只满足路径边界、或只看到 `grant_state=none`，也不插入。
- `git-status` 解析不到、不是现有 Git 处理器，或在 `eap.capability_setting` 中停用时拒绝，不插入。请求里的身份、能力名或策略字段不能改变这三项检查。
- 两个启动并发写入时，部分唯一约束只留下一条在途执行，另一个请求返回这一条。终态之后再次点击得到新的执行号，投影改跟新行，旧终态还在。
- 进程失败或超时进入对应终态。取消请求先保持 `CANCELLING`；进程先退出时保留该退出终态，取消先被采纳时等到进程结束后才是 `CANCELLED`。Mission `status` 仍是 `created`，`verification` 仍是 `not_requested`。
- 持久执行号与 `GitCapability.executeManaged` 传入的执行号相同。插入之后、进程启动之前失败时，这一行成为 `FAILED`，没有第二条执行。
- 重启后在途行保持原状态并写入未知原因，进程不被销毁。再次启动返回同一条，不插入新行，也不再跑 Git。缺进程号或父进程号消失都不是终态证据。已终态执行保持原样。
- 启动前后 `eap.task` 的条数和既有任务 id 不变。`eap.handoff` 的检查约束和原交接内容不变。

## 已确认的实施约束

授权根未配置时拒绝启动，不回退成分析任务那种直接使用 `workspace` bean。持久终态必须等进程结束。`DefaultProcessExecutor` 在进程完全退出前可能把内存状态写成 `CANCELLED`；该标记只作为内部信号，不能直接写成 Mission 的 `CANCELLED` 或 `INTERRUPTED`。

## 实施时必须用代码和测试证明

下面两项不能只引用本契约。实施时要有相应代码路径和测试；做不到就保持未执行，不能宣称这一步已经安全。

`resolveFor(null, "git-status")` 的语义是：处理器存在、没有被停用，且不是专家范围能力时返回该处理器。它不检查操作者、授权根或执行策略。测试必须证明启动同时拒绝这些情况，即使解析结果非空：授权根为空、两套根冲突、路径越界、能力已停用、请求自报身份或授权。只断言「能解析到处理器」的测试不能当作授权通过。命令和环境由 `GitCapability` 固定，Mission 不另拼参数。

跨重启时不把缺进程号、父进程消失或身份一致写成进程树已结束。这些情况保持在途并记录未知，不销毁进程，也不自动重跑。同一次进程内，没有真实退出证据时不写 `CANCELLED` 或 `INTERRUPTED`。

上述路径由 `RuntimeWorkspace`、`GitCapability.executeManaged`、`MissionGitAuthorization`、`MissionRunOutcome`，以及重启未知的服务测试和隔离验收覆盖。`local-operator` 只是审计标签。
