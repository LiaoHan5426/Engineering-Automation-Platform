# P1 CLI / Codex 委派实施设计（待确认）

本文件只提出设计，不授权生产代码修改。前置：处理P0类型错误；确定真实外部CLI鉴权与隔离验证环境。保留 Capability/Expert/Rule、CLI program/operation 和 ProcessExecutor 的现有实现。

## 契约与职责

- CLI operation继续描述确定性固定操作；新增参数Schema和argv模板只支持声明字段，不支持shell插值。程序级声明允许的环境变量名和执行策略，秘密通过运行时注入，不进入配置或日志。
- RepositoryExecutionScope保存canonical root、工作目录、允许修改路径、基线commit、已有dirty文件及授权；校验符号链接/junction逃逸。cwd限制不能充当进程沙箱，任意CLI仍可能联网或访问其他目录，需明确可信程序边界。
- ProcessExecutionRequest包含argv、cwd、环境变量、timeout、outputLimit、取消令牌与correlationId。现有run接口保留兼容入口，新服务处理策略与记录，执行器仅管进程。返回start/end、exitCode、timedOut/cancelled、截断信息与脱敏输出，分开业务成功与进程成功。
- CodingAgentProvider独立于普通CLI：probe、describe、execute、cancel；输入目标、范围、完成标准、策略，输出候选Observation及Artifact引用。Codex适配器调用真实CLI；具体版本、非交互参数、结构化事件和鉴权探测在实施时用本机帮助核实，当前不编造命令参数。
- IndependentVerifier自行读取Git diff，核对范围和用户dirty基线，执行批准的build/test命令，生成verification结果。Provider无权将任务标为业务完成。当前同步Expert DAG可以调用受控能力，但不在P1偷建Mission调度器。

## 最小切片

1. 执行策略与证据：复用CLI登记及Handler，增加参数/环境/cwd契约和明确错误分类；API类型同步runtime-client。验收包含非法参数、未授权路径、配置与执行记录一致。
2. 可取消进程：超时与显式取消共用进程树终止，取消幂等，日志持续排空/限额。验收真实成功、非零退出、超时、取消及派生进程终止，不使用仅Mock的取消测试。
3. Codex适配：只读probe与鉴权状态，不输出凭据；显式委派批准后在隔离Git工作树执行。先分析模式，再开放限定目录修改；不自动提交、推送或合并。
4. 独立验证：保存基线、原始执行证据、diff摘要和测试报告；越界修改、失败构建和仅文本声称完成均返回未验收，交用户审阅。

不引入第二套Capability Registry；Skill仅预留version/source/dependencies/scope引用，P1不实施Skill安装器。插件生命周期不能拥有执行状态。生产持久化采用现有Task/Observation适配，新增表/迁移须先提交字段差异与兼容方案，避免提前固化Mission模型。

## 验收与回退

真实小型临时Vue/Vite仓库中：确定性CLI成功/失败、工作目录含空格/中文、参数注入、环境秘密脱敏、取消后代、外部CLI缺失/鉴权失败、真实Codex限定变更、越界拒绝、测试失败不完成、用户dirty文件不覆盖。无鉴权时真实Codex用例标未验证，不能用Fake代替通过。所有开关默认不扩大权限，旧CLI/Expert测试继续通过；适配失败可停用而保留历史证据。

用户原则认可四切片方向；本次仅授权设计完善，尚未授权P1生产实现。P0模板类型问题已单独授权并修复。

## 可被未来 Mission 复用的执行合同

平台生成executionId（UUID），外部Codex session/thread ID仅作关联字段，不能替代平台ID。请求包括可选ownerRef（当前Task、未来Mission/Run/Step）、provider/program/operation、RepositoryExecutionScope、策略快照及验证合同。返回ExecutionHandle：status、cancel(reason)、事件订阅和结果查询。执行服务不依赖HTTP请求、Vue组件或看板插件，不自行决定任务完成、不管理计划队列；未来Mission通过该接口提交和观察执行。

状态最小集合：created/running/cancelling/succeeded/failed/cancelled/timed_out；succeeded仅表示执行成功，verificationStatus独立为pending/passed/failed/unverified。cancel与完成竞态由单一终态写入规则处理，重复取消幂等；重试创建新executionId并关联previousExecutionId，不覆盖旧证据。P1不承诺崩溃后自动重启进程，重启发现未终结执行应标记interrupted（作为失败原因）并保留证据，恢复调度属于后续Mission。

事件统一包含executionId、单执行递增seq、timestamp、schemaVersion、type和脱敏payload，覆盖started/output/progress/cancel_requested/terminated/artifact_created/verification_completed。stdout/stderr分流、限额；慢订阅者不能阻塞排空，丢弃输出必须有截断事件。原始provider事件与平台事件分层，未知provider类型保留受限脱敏记录，不直接驱动平台终态。P1-A先定义记录接口及现有Task/Observation适配；持久化新表和迁移另行评审，不能将内存事件宣称为可跨重启恢复。

Artifact包含artifactId/executionId、kind、受控相对路径、MIME、大小、SHA256、createdAt、来源及验证关联。diff、日志、测试报告和候选文件属于产物，引用必须验证在执行产物根目录内；拒绝symlink/junction逃逸。访问Artifact需重新核对执行范围，不能接受CLI返回的任意绝对文件路径。生命周期由平台管理，插件停用不删除产物。

## 操作系统执行与清理边界

| 环境 | 启动/路径 | 取消与清理设计 | 验证限制 |
|---|---|---|---|
| Windows native | 优先exe+argv；cmd/bat需要单独受控适配，不对任意输入套cmd /c；canonical路径考虑大小写、盘符、UNC、junction | 优先采用Job Object管理后代及kill-on-close；Java descendants仅作为受限退路，存在枚举竞态；权限拒绝返回cleanup_failed，不能谎报取消完成 | 先Windows验收，需验证孙进程、父进程先退出、空格/中文路径；Job Object实现与依赖在P1-B评审 |
| Linux | argv直接执行，区分符号链接、大小写和权限位 | 独立进程组/会话，先TERM、宽限后KILL并确认进程退出和流关闭；实现方式须验证，不能假设Java ProcessBuilder自动创建进程组 | 在真实Linux执行同组/派生逃逸测试；未运行不得标支持 |
| WSL | 显式distribution和Linux cwd，Windows路径转换只能对获准挂载根进行；环境不机械从Windows复制 | 只杀wsl.exe不能证明Linux子进程终止；需要发行版内执行句柄和进程组取消桥，禁止用终止整个发行版代替单执行取消 | 未有桥接PoC前标unsupported，不能冒充native Linux或Windows能力 |

P1-B把平台差异放在ProcessExecutionBackend接口，保留现有ProcessExecutor兼容调用；首版仅承诺通过真实验证的平台，Windows完成不自动代表WSL/Linux通过。

## Codex版本与协议核对（2026-10-23）

只读运行本机 `codex --version` 和 `codex exec --help`，得到 `codex-cli 0.163.0-alpha.11.2`（桌面应用附带二进制）。本机支持exec、stdin `-`、--json、--output-schema、--output-last-message、--sandbox、--cd。探测同时出现沙箱临时目录访问警告，因此未宣称鉴权或真实执行已验收。

已读取[官方CLI参考](https://learn.chatgpt.com/docs/developer-commands?surface=cli)，核对JSON事件及结构化最终输出选项。实现时保存binary路径/版本/help摘要，建立该版本能力矩阵和JSONL样本回放；alpha升级必须重新验收。--json事件流与--output-schema约束的最终响应是两种合同，不把最终文本当工具执行证据。首版选择exec子进程适配，不同时开发app-server/MCP等第二条通道。模型、审批/沙箱参数不照抄旧博客或文档示例；参数必须同时符合本机help、官方文档及平台授权，缺能力明确拒绝，禁止自动退回绕过审批/沙箱的选项。本次未发起模型请求。

## 每切片的最小可运行验收与测试

| 切片 | 最小可运行交付 | 必测证据 |
|---|---|---|
| P1-A 执行策略与证据 | 现有登记入口新增一个可信程序及成功/失败两个操作，带executionId和脱敏事件/产物引用，现有Expert可调用 | 参数Schema单测；真实进程确认cwd/env/exitCode；越权路径、junction、参数和秘密拒绝/脱敏；旧注册、停用、Expert测试不退步 |
| P1-B 可取消进程 | 以executionId取消运行中操作，独立于发起HTTP连接；超时、显式取消及清理失败可区分 | 真实长进程和孙进程；取消/完成竞态、重复取消、输出压力、宽限后强杀、权限拒绝；逐OS测试报告，不只Mock |
| P1-C Codex CLI适配 | 版本探测及受限真实exec调用，结构化事件关联平台executionId，指定隔离仓库，无自动提交/推送 | 缺binary/鉴权失败/无效JSONL/未知事件/截断/取消样本测试；真实只读任务及批准后的限定修改；无鉴权标未验证，不能用样本替代真实调用 |
| P1-D 独立验证 | 平台自行生成diff、范围校验和build/test Artifact；执行成功与验证通过分开 | 临时Vue/Vite仓库真实通过/失败构建与测试；越界文件、untracked、dirty基线、链接逃逸、伪造成功声明；失败保持未验收，已有用户文件不覆盖 |

## 仍需确认

建议先单独批准P1-A，再以其契约评审B/C/D；需要确认首版是否仅承诺Windows native、Linux/WSL分别待验证；真实Codex测试使用哪个独立仓库及鉴权环境、允许的网络/写入范围和模型成本边界；实际执行记录与Artifact保留期限。生产实现、数据库迁移和新增平台依赖均未获本轮授权。不另建Capability/CLI注册体系、不提前实现Mission调度器或复杂插件运行时。
