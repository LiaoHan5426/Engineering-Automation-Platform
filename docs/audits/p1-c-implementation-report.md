# P1-C Codex 适配实施与验收结论

本文统一已结束的模型选择、配置兼容、非交互审批、工具拒绝分类及工作区路径核对记录。更早逐轮报告已合并退役；当前路线以 [roadmap](../roadmap.md) 和 [分阶段设计](../decisions/p1-cli-codex-design.md) 为准。

## 已实现边界

- 通用模型调用采用Spring AI；CodexAdapter是独立的外部编码Agent适配器，不能代替ChatModel/ChatClient基础设施。
- 复用P1-A执行策略与证据、P1-B runManaged/status/cancel，通过原有CLI/Capability/Expert体系调用；不是第二套调度器或注册表。
- 任务包含repository、instructions、明确model和审批，生成executionId，保留Git前后状态、结构化事件、接收时间、进程生命周期与Artifact引用。
- execution成功、EAP approval和verification独立；外部结果是观察，独立Diff/Build/Test验收仍属于未实施的P1-D。
- Windows native仅是受信任本地开发工具的尽力进程清理环境，不是不可信代码沙箱；Linux/WSL未获真实验证，不宣称支持。

## 当前参数与策略合同

历史验证使用CLI 0.163.0-alpha.11.2、模型gpt-6.1-sol；这些是已保存的版本事实，不是当前所有机器的可用性承诺。实际参数数组以CodexAdapter源码及契约测试为准。

1. 显式 --model 传递合法模型，不拼接Shell，不静默选择默认/替代模型，不自动重启任务。
2. 模型格式合法性与服务端支持性分开。缓存仅是非权威证据；缺失不等于永久不支持。支持未知但用户明确授权的模型可受控试一次；明确不支持继续拒绝，服务端拒绝保留错误分类。
3. 请求workspace-write、approval_policy=never、正确--cd并保留工具网络限制与目录约束。never不授予写权限，也不提供运行中交互审批。
4. 不使用danger-full-access、危险沙箱绕过或ignore-rules，不修改managed requirements、execpolicy和全局配置。真实委派仅可在另行授权的全新独立Git仓库执行。
5. 历史model_providers.openai.request_max_retries/stream_max_retries覆盖曾因内置Provider ID保留规则被拒绝，已删除；不创建冒充内置Provider的自定义Provider。EAP启动次数不等于服务端请求次数，不能精确控制Codex内部网络重试或Agent模型轮次。
6. repository、ProcessBuilder.directory、--cd、Git根和目标hello.txt路径已核对一致；没有证据支持通过任意增加writable roots解决工具拒绝。

配置事实与权限实际生效必须分开；Fake参数正确不能证明真实补丁工具获得写权限。历史CLI/help核对不能作为无限次重新调查或调用模型的授权。

## 证据与错误语义

JSONL有本地receivedAt与原始顺序；执行器记录启动、退出、超时、清理阶段。超时/取消终态优先保留，不因工具错误改写为普通失败。

明确的blocked by policy及patch rejected/read-only sandbox/user approval settings拒绝均可观察为TOOL_POLICY_DENIED，进入Outcome.error和Trace.toolError。CLI退出0仍需保留该错误；SUCCEEDED只描述执行层正常结束，不能说文件任务已完成。

脱敏JSONL、stderr及进程Trace复用Artifact存储，引用含executionId、类型、相对路径、大小和SHA-256。Artifact保存错误与委派失败分开，归档失败不能声称证据闭环完成。不归档凭据、认证配置或未经处理的敏感内容。元数据30天、日志/Artifact7天是可配置策略，未自动删除运行期存储。

具体实现和离线证据见 [执行证据报告](p1-c-execution-evidence-closure-report.md)。本次清理不改变运行期策略，仅退役已结束实验的审计副本。

## 真实验证结论与剩余关口

[真实委派最终报告](p1-c-real-delegation-20261023-report.md) 保留关键案例：模型通信成功，JSONL响应、正常CLI退出和Artifact核验已观察；文件补丁仍被read-only sandbox拒绝，hello.txt未生成，P1-C真实文件委派验收不通过。

[Windows最终结论](p1-c-windows-sandbox-compatibility-diagnosis.md) 保留无模型预检以及J盘/Temp原生sandbox写入成功与DACL副作用。原生入口成功不等同于exec/apply_patch恢复，具体只读策略来源仍未知，历史调查已暂停。

早期报告分别记录过128、131、133、136、144等阶段测试数，只代表当时切片。最近完整后端回归190项、186通过、4条件跳过、0失败/错误，见 [Spring AI收敛报告](spring-ai-consolidation-report.md)；本轮文档整理没有重跑这些测试。

真实模型、沙箱启动、系统初始化均需新授权；清理旧脚本/锁不授权重跑。后续交互审批可评估Codex App Server，但未实现。P1-D、Mission及完整Agent Runtime均不在本轮范围。
