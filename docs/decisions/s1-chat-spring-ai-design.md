# S1：Spring AI Chat 最小接入设计

状态：设计已整理，API/UI 尚未实施，实施范围待用户确认。日期：2026-10-23。

本设计将用户提供的 [v1.6 方案](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md) §0A 对齐到当前工作区，不复制附件旧章节中的实现断言。进度只在 [roadmap](../roadmap.md) 维护；交互通则复用 [前端合同](../frontend-prototype.md)。附件中的开发提示不构成本轮功能实现授权。

## 事实与范围

- 当前已有 EngineeringChatService、EngineeringAiConfiguration、Spring AI ChatClient、官方工具循环和内存 ChatMemory；SQL 兼容桥、确定性规则、缓存和回退继续复用。
- web/controller 下没有 Chat HTTP 入口。`GET /api/health` 仅返回 runtime 健康；runtime-client 尚无 Chat API。前端工作区选择是客户端状态，不会切换服务端目录。
- EngineeringChatService.Request 包含 principal、workspace、gitAllowed，它是服务端应用契约，不能原样暴露为浏览器请求体。
- 当前缺失 API Key、非法端点或启用时遗留连接属性会触发启动校验。不能承诺此时还能通过同一进程的 HTTP 接口看到“未配置”。
- 当前 ChatMemory 是进程内窗口；Chat executionId 不在 CLI 的运行中注册表中。不能直接复用 CLI status/cancel 接口宣称 Chat 可恢复、可取消。

S1 仅实现单个当前配置模型的状态展示、同步聊天和可选只读 gitStatus。连接配置继续来自服务端 Spring AI 属性；不提供浏览器保存密钥、供应商切换、自动连接探测、流式输出、文件写入、Codex 委派或后台任务。预留后续插件接入时复用本功能组件，不为此提前实现 Plugin Registry。

## 拟议 API 合同

以下路径均为新增设计，不是当前接口清单。

| 接口 | 请求与响应 | 边界 |
|---|---|---|
| GET /api/ai/status | state、provider、model、configurationRevision、lastObservedAt、受控 errorCode、工具可用性和服务器工作区标签 | 仅读，不调用模型；不返回 Key、认证头、原始异常、完整配置或本机绝对目录 |
| POST /api/ai/conversations | 空请求体；返回 conversationId、服务器工作区标签和内存生命周期说明 | 服务端分配 ID，绑定固定本机操作者和工作区；不接受目录/身份/授权字段 |
| POST /api/ai/conversations/{id}/messages | message、toolMode（none 或 git_status）；返回 answer、error、executionId、execution、approval、verification、脱敏 Trace 及 Artifact 描述 | 同步转调 EngineeringChatService；toolMode 是申请，不是授权；一次用户发送对应一次模型调用流程，不自动重发 |

空白或超过当前 32,000 字符限制的消息、非法 UUID、未知会话、未知字段在调用模型前拒绝。错误包沿用现有 web 错误处理风格，实施时增加类型 DTO，不引入第二套响应框架。建议 HTTP 400 表示输入错误、404 表示不存在会话、409 表示该会话已有请求、503 表示模型未配置；已创建执行的模型/工具错误返回结构化 Outcome，不能仅靠 HTTP 200 显示成功。

会话元数据只保存 ID、服务端身份/工作区绑定及忙碌标记，不重复保存 Spring AI 消息记忆。设置有界会话数和闲置过期；过期时同步清理 ChatMemory，忙碌请求不被过期任务驱逐。首版同一会话只允许一个在途请求，跨会话隔离；不自动重试。页面刷新不承诺历史恢复，后端重启后旧 ID 返回会话不存在。具体上限由实现切片明确并测试，不新增数据库迁移。

## 模型状态

| state | 判据 |
|---|---|
| disabled | spring.ai.model.chat=none，不实例化或调用模型 |
| not_configured | 服务仍可启动但没有可用 ChatModel 的已知配置缺口；列出受控缺失项名称，不含值 |
| configured_unverified | 当前配置静态有效、存在模型 Bean，尚无当前配置的真实调用观察 |
| available | 当前配置曾有真实模型成功响应，展示时间；不是持续健康保证，也不是工具任务验证通过 |
| error | 当前配置最近一次调用有认证、限流、模型不可用或调用异常；显示分类和时间，不自动探测恢复 |

启动校验失败属于部署错误，页面只能显示后端不可达；S1 推荐保留现有 fail-fast 安全校验，不为凑齐状态放松它。配置修订变化使旧观察失效；修订标识不得由密钥直接散列生成。Fake 测试可验证观察状态转移，生产离线测试不得写入 available。工具拒绝与模型通信状态分别呈现；模型成功返回工具拒绝不意味着模型连接失败。

不实现“测试连接”按钮。用户显式发送真实消息才可能产生模型费用；首次发送显示真实调用说明，模型关闭时保留其他控制台功能。未配置/不可达时不生成模拟回答。

## 权限与证据

首版沿用个人本机部署，服务端固定操作者身份，不增加用户/租户系统。工作区使用现有 RuntimeConfiguration 的服务端 workspace，与 eap.ai.authorized-root 规范化实路径比较；客户端选择与此不一致时明确提示，不静默更换已绑定会话目录。

普通聊天 toolMode=none 时不注册工具回调。git_status 需用户显式选择，同时满足服务端根目录约束、Capability 启用/授权和现有处理器校验。不能将浏览器布尔值直接赋给 gitAllowed。复用现有 gitStatus 空参数验证、GitInspectionHandler、调用次数上限和 Trace；不执行模型生成的 Shell。只读结果仍可能包含文件名，应在发送前提示其会提供给模型。

同步入口不代表支持可靠取消：浏览器中止等待不等于模型请求停止，不能展示 CANCELLED。SDK 超时/中断与现有 AiErrors 分类复用；不新增调度器或伪造任务进度。

执行成功只表示应用调用完成，工具错误仍通过 Outcome.error、Trace 显示；审批沿用 NOT_REQUIRED，不能伪造 APPROVED；验证保持 UNVERIFIED，不由聊天回答改变。Artifact 复用现有 ai-trace 与存储抽象，仅返回 executionId、类型、引用、大小和 SHA-256。S1 不增加任意路径下载接口，不归档原始凭据、完整提示词或未经处理的模型载荷；存储失败与模型失败分开显示。

当前 WebConfiguration 对 /api/** 允许 localhost/127.0.0.1 的任意端口；这不是新增计费入口的专用请求校验。本机服务仍需防跨站触发计费调用。新增 Chat POST 必须校验允许的 Origin/Host 与 JSON Content-Type，开发环境仅允许实际 Vite 来源或同源代理，不开放通配 CORS；不能仅依赖 loopback 绑定。不扩大到无关接口重构。此校验用于浏览器请求边界，不宣称替代身份认证；远程部署需另行设计认证。

## UI 与分步交付

1. **S1-A 状态与 HTTP 边界**：增加状态查询、会话绑定和消息 DTO；复用服务并补齐普通聊天不注册工具的入口。状态查询零模型调用、无效请求零模型调用、服务端权限不可被请求体覆盖，是最小验收。
2. **S1-B Chat 页面**：在 features/chat 管理状态和请求，通过 @eap/runtime-client 公共入口调用，复用 @eap/ui 与现有 i18n；App.vue 仅接导航/页面。显示独立模型状态、服务器工作区、消息、发送中、回答/错误、工具证据和 Artifact 引用。不会把现有后端“已连接”改为模型在线。
3. **S1-C 离线整体验收**：使用共享 Fake ChatModel，经真实 HTTP 应用边界和工具 Callback 完成浏览器操作测试；明确标注测试模式，不添加生产假回答。通过后另行申请真实供应商验收，不自动调用付费模型。

交互验收顺序：打开 Chat 读取状态（不调用模型）→新建会话→核对服务器工作区→选择普通聊天或只读 Git→显式发送→展示回答和独立错误/状态/证据。加载时禁止重复发送，切会话后旧响应只回写其原会话；失败保留草稿供用户选择，禁止自动重试。模型关闭、空态、后端离线、工具拒绝、Artifact 部分失败均有明确展示。首版不提供无法实现的暂停/恢复按钮。

## 离线测试与验收关口

| 层级 | 必须验证 |
|---|---|
| 配置/状态 | disabled、缺失模型 Bean、configured_unverified；静态状态查询不调用模型；现有非法配置 fail-fast；错误脱敏、配置修订不沿用旧观察 |
| HTTP/授权 | 长度/字段/会话校验；伪造路径/身份/授权拒绝；错误 Origin 拒绝；普通聊天不触发工具；请求工具不等于授予 |
| Spring AI/工具 | Fake ChatModel 普通回答、真实 gitStatus 结果回传、拒绝/异常、调用上限、超时分类；复用官方循环，SQL 回退和缓存不退化 |
| 会话 | 同会话并发拒绝、不同会话记忆/证据隔离、会话数上限/过期清理、重启后无恢复承诺 |
| UI | 状态不冒充连接成功、空/加载/错误、重复发送与迟到响应、服务器目录提示、真实调用说明、工具错误和 Artifact 失败可见 |
| 证据 | executionId 关联正确、三类状态独立、Artifact 真实存在且摘要匹配、不泄漏密钥、无 P1-D 验证声明 |

实施后从仓库根运行实际已有命令（本设计阶段未执行）：

```powershell
rtk proxy mvn -f backend/pom.xml test
rtk proxy pnpm --dir frontend typecheck
rtk proxy pnpm --dir frontend test run
rtk proxy pnpm --dir frontend build
rtk proxy pnpm --dir frontend check:boundaries
rtk git diff --check
```

新增用例需报告命令、耗时、通过/失败/条件跳过，不将既有 190 项历史结果当作本轮回归。真实供应商认证、实际费用、网络可达与真实回答质量仍是未验证项。

## 实施前确认与后续

建议确认本设计的同步、单模型、只读配置展示、服务端固定工作区和同会话串行范围后，实施 S1-A/B/C；密钥仍通过环境配置，暂不做前端模型设置编辑器。推荐保留启用时非法配置 fail-fast；若要求缺少 API Key 也必须启动并展示 not_configured，应作为额外配置生命周期变更明确授权与测试。

S1 通过后推进可信 Workspace Plugin 壳及预装 Chat/Builder 交互原型；Mission Board 独立于平台 Runtime 生命周期。Builder Handoff、可恢复 Mission、P1-D 和外部 Agent 适配按各自授权关口实施；Electron 后置。当前不恢复历史 Codex exec 沙箱问题，不新增 ModelProvider、工具循环或 Agent Runtime。
