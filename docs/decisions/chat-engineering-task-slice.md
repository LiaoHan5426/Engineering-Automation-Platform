# 聊天工程任务与原型到源码

当前接续（2026-11-10）：已提交基线b9a9b12。PREBOUND真实单文件页面交付已提交推送，沿用已有验证未重复测试；接续任务持久候选恢复见[当前台账](../planning-status.md#board-code-recovery-validation)，不依赖或复活已失效Chat会话。合同与实际边界见[台账](../planning-status.md#prebound-page-delivery-validation)及[主题记录](../records/delivery-history.md#prebound-page-delivery)。生成记录的旧计数原型约束由V32直接替换，任务应用目录仅做只读发现，候选不因被列出而自动提交或接受。以下2026-10-24及后续各段按原阶段理解，旧内存/路径描述不能覆盖当前持久服务。

## 聊天工具栏（2026-11-12 复核修正）

仓库只读浏览统一放在“源文件”，同时保留本地引用和设计版本；移除重复“工作区”文件树入口、专用组件和独立开关。摘要展示当前会话概况，变更展示候选/已应用/原有修改及验证，终端按真实接入状态展示。三者与源文件复用同一个面板选择状态，同一时刻只打开一个；再次点击当前入口或关闭面板均收起，输入草稿保留。源文件弹层沿用公共 Drawer 的关闭与焦点合同。

顶部连接状态中的本地服务路径用于定位服务工作区，不是第二个文件浏览入口。输入框“添加”负责选择附带材料，发送预览负责核对待发送内容，二者与源文件的只读仓库浏览保持明确职责。修正及真实浏览器验证见[补充记录](../records/validation-history.md#chat-toolbar-review-correction)。

## 使用

1. 打开 `#chat` 的折叠连接设置。新增 OpenAI 连接（`https://api.openai.com`、可用的 GPT API 模型）或 DeepSeek（`https://api.deepseek.com`、`deepseek-chat`），填写对应 API Key。支持多个连接；这不是 ChatGPT 网页账号登录或订阅 OAuth。
2. 新建会话并选择连接，切换目标需确认，旧对话不静默发送给新供应商。保存与切换本身不调用模型。
3. 输入需求，“＋引用与专家”可选择文本文件或已保存原型。最多 6 份文件，单份 16000、总计 24000 字符。选择工程、SQL 或 Vue 专家，可编辑本次指导。预装指导在 `backend/eap-runtime/src/main/resources/chat/expert-profiles.json`。原静态专家 DAG 仍保留，尚未全部迁移成聊天 profile。
4. 讨论模式输出回答；代码模式输出 1–8 个完整源码候选，展示实际目标工作区、当前/候选内容。规划模式使用独立 `TaskMode.PLAN` 请求合同，读取明确引用及选定授权源码后输出只读工程计划，不创建生成快照或源码候选、不执行工具。推理强度仅对当前支持的 OpenAI 推理模型开放；DeepSeek 等使用模型默认，不伪装成已支持。

规划请求复用现有会话、连接、流式事件、取消、错误合同和预算。前端执行选择在发送时构造 `mode: plan`，工具固定为 `none`，不修改原来的聊天/代码目的和工具选择；切回聊天继续原设置。服务端校验不依赖界面：规划加工具请求直接拒绝；底层 EngineeringChatService 即使收到内部调用方的工具注册意图，也不为规划注册 Git。选定源码通过既有完整源码读取边界进入计划材料，受服务绑定工作区、路径、敏感信息及单文件/合计限额约束，不调用生成存储。TaskRef 规划现已复用原任务锁和快照合同读取指定版本，允许planned/ready且无在途执行的任务；旧revision、错误项目或不允许的状态拒绝。快照读取不插入生成记录，不领取执行，不新增看板状态。

规划的已保存原型、显式文件、授权知识或 Skill 都是任务材料，不是工具授权；知识/Skill 撤权及派生上下文清理沿用现有机制。独立 Mock 支持无源码的明确模拟规划，不伪造源码读取，有目标源码时返回上下文不可用。工程Agent仅在下述绑定源码合同内开放，其他智能体路径仍禁用。规划验证及尚未覆盖的模型质量见[台账](../planning-status.md#planning-mode-validation)。

<a id="bounded-engineering-agent"></a>

### 绑定任务的有界工程 Agent（2026-11-12）

工程 Agent 复用现有 Spring AI ChatClient/ToolCallingAdvisor、会话串行发送、持久生成快照、候选及人工应用。请求仍为 `TaskMode.CODE`，单次工具面为 `AiToolMode.CODE_SOURCES`；后端要求显式 TaskRef，沿原任务准备、ready/revision、工作区授权及完整源码门禁。前端仅在绑定代码任务、入口及可用API模型齐备时开放选择，账户计划模型拒绝工具；普通Chat/Git与只读Plan保持各自职责，不创建新调度器、Agent表或执行状态。

模型首轮获得任务/原型/显式附件及选集路径和基线信息，源码正文通过 `read_selected_sources` 按需获取。工具仅返回这次已持久固定的1～8份完整快照，不接受任意路径，不读取Shell或网络。每份源码只读一次，复用现有最多4次工具调用限制；输入JSON、路径、重复字段和重复读取严格校验。每次读前复核授权、全部文件基线和完整任务快照；最后一次读取后，模型返回前再复核。未读完、取消或复核失败时清空候选回答、返回稳定错误，不能靠模型自称“已读取”通过。

源码材料继续受24KB/文件、48KB合计及敏感信息门禁。预算按冻结源码JSON和有界工具信封保守预留字符，不声称精确token计量。工具事件进入原trace/artifact/audit；最终候选继续要求精确有序文件集、组件图和基线一致。候选不会自动应用，页面明确确认后才沿唯一持久应用服务写入；后续独立验证及人工决定沿既有看板交付链。多个文件写入仍不构成OS原子事务。

工具循环绑定当前请求，取消沿原会话传播；生成/候选证据持久化不等于模型推理跨重启恢复。不提供任意命令、无人值守写入、后台续跑、外部编码Agent或自动接受。Skill/知识引用不授予该工具面。独立Mock对此返回明确上下文不可用，不模拟真实仓库证据，也不向正式代码注入夹具。

已绑定任务的源码编辑默认收起，路径仍在摘要可见；编辑区高度有界并独立滚动，保留窄屏对话、Diff与审批动作的空间。现有公共Collapse、Feedback及ProposalApplication直接复用，无新基础控件。Fake工具循环、真实供应商和最终浏览器布局证据分开记录，见[当前验证](../planning-status.md#engineering-agent-validation)。

### 从回答交接任务与实现准备（2026-11-11）

2026-11-12：任务绑定规划回答现在保留发送时的 TaskRef，可显式打开“核对并更新原任务”。面板通过原任务精确 GET 接口重新核对 project/id/revision、planned/ready 和 executionActive；旧版本或不允许状态仅展示、不采用。用户明确追加计划到备注草稿，编辑目标/验收条件后使用原 updateBoardTask CAS 保存，不创建新任务或执行。关闭未保存编辑使用公共 ConfirmBox，超过4000字不截断；原计划仍可对照。该来源是本机交互关联，不提升为服务端执行证据。保存期间失败保持草稿和原 revision；没有自动重发或自动覆盖冲突。

保存成功或 GET 核对成功后，仅 ready、准备完整且无执行中的最新任务开放源码准备入口。入口复用 CodePreparationDialog 和原有明确采用草稿流程，使用保存后任务 revision，保留源码核对、依赖选择与新会话确认；不自动提升 planned 状态、不自动发送生成。看板和聊天复用 boardImplementationDraft 构造同一合同，避免两套任务交接格式。真实整链证据见 planning-mode-4757136937202164274；模型为显式 Fake ChatModel，不代表真实供应商质量或用户接受。

任务备注是已核对计划的当前承载字段，必须随目标和验收条件进入实现上下文。规划读取与生成捕获均在原任务锁内将 notes 纳入 TaskSnapshot，使用既有 JSON 快照落库、预算统计及 saved-task 模型材料；后续应用校验比较同一完整快照。前端看板和聊天采用草稿也包含 notes，便于发送前核对。没有新增计划副本、数据库字段或兼容读取分支；独立 Mock 已通过原任务 notes 合同提供相同字段。

2026-11-12看板规划入口：planned/ready且无在途执行的任务可明确选择“规划此任务”，沿原任务草稿采用及新会话确认流程带入原project/id/revision，执行模式为plan，工具none。规划不要求任务先ready、不创建实现目标或生成记录；服务端仍按原锁内规划快照校验。草稿的执行意图为明确字段，不再仅凭taskRef推断必须进入代码生成；实现草稿继续使用原code目的和chat执行模式。

计划保存后，planned任务在目标/验收完整且服务端allowedColumns允许时可明确“标记为待处理”。这是单独的原updateBoardTask CAS操作，使用保存后的revision；不调用执行器或自动提升为运行/完成。保存与转ready共用一次更新结果校验及GET核对逻辑，分别记住本次请求的revision、预期列与字段；未知结果禁止继续准备，GET确认精确结果后才能进入实现。冲突的新revision不能被当作本次成功。原计划仍绑定旧发送版本，不能复用旧输出反复覆盖新任务。当前整链见[看板规划验证](../planning-status.md#board-task-planning-validation)。

当前实现已改用 `GET /board/tasks/{id}?projectId=...` 精确读取，复用 BoardTaskService.find 的项目隔离和执行观测，避免最近200条列表截断导致旧任务不可核对。保存响应不明或返回字段不匹配时冻结输入和再次保存，仅允许明确 GET 核对；只有 revision 恰为原版本+1 且三项提交字段一致才标记保存，仍为原版本时保留草稿允许用户决定，其他版本阻断覆盖。这个恢复仅确认当前字段和版本吻合，不证明更新来源或其他中间历史。

助手回答可显式“转为任务草稿”，进入既有看板创建流程。用户核对项目、标题、目标和验收条件，保存仅创建 `planned` 任务；随后按原准备门禁明确转 `ready`，核对入口/关联文件，再明确采用实现草稿。复用 `POST /board/tasks`、`BoardTaskService` 的同请求幂等、任务状态、会话关联和准备条件，不新增计划执行器、专用任务表、来源类型或状态流。原型原子创建任务保留其独立的不可变设计来源职责。

本机未发送草稿保存原回答和可编辑需求，关闭或刷新可继续；原回答不被需求编辑覆盖，超过4000字的目标必须由用户明确缩短，不能自动截断。已有草稿、损坏存储、并发修改或读回失败均不得被另一条回答覆盖。开始发送后沿用原 `board-create` 请求记录，冻结完整请求及 `requestId`；响应不明时刷新/重试仍使用同一身份。确认创建后才清理对应的来源草稿。未发送草稿与已发送请求属于不同阶段，不是两套后端创建机制。

看板创建表单使用现有公共 Dialog，项目、来源对照、错误与创建恢复都在弹窗内，列表只保留入口。普通未保存表单关闭需明确确认；会话草稿关闭保留本机编辑。会话 ID 只是讨论关联，本机原回答和执行 ID 不是服务端生成归因、权限或执行证据，用户编辑后的需求才是任务准备输入。当前验证使用明确 Fake ChatModel，真实供应商质量和后续源码交付验收仍独立，见[交接整链](../planning-status.md#planning-task-handoff-validation)。
5. 勾选审阅确认，单独应用文件。只读模式在服务端拒绝应用。生成不写文件，不执行命令、不安装依赖。现有根为空时仍可生成审阅，但写入明确拒绝；需要操作者明确将已绑定工作区纳入 `eap.runtime.authorized-root`。本次不改日常授权根。
6. Builder 重开原型版本后可点“引用此版本并生成代码”。服务端按 ID 读取已保存版本，不相信客户端自报正文。普通需求无需先创建原型版本、Handoff、Mission。

## 实现边界

- 复用 Spring AI 和现有连接配置；没有给 GPT/DeepSeek 手写 HTTP 协议。模型和认证、回答质量仍需真实供应商验收，本次不调用付费模型。
- 请求引用的是用户选择的文本，不接受任意磁盘读取路径、身份或授权。候选仅允许相对源码路径，拒绝隐藏目录、路径穿越、链接逃逸及依赖声明文件。申请代码不自动授予写权限。
- 候选保存当前文件基线，应用前变化则拒绝；跨会话不能应用。候选最多 32 份、30 分钟、内存保存，重启丢失。多文件不是文件系统事务，失败时报告已写文件，不盲目回滚覆盖。避免应用时其他进程同时写同一文件。
- 写入结果是 `verification=not_requested`，不表示编译、测试或任务完成。下一步运行项目检查及 Git diff。未实现自动命令执行、提交、推送、部署或外部 Agent 接线。
- 会话发送在串行边界内读取绑定；SQL 缓存与调用固定同一连接快照，避免默认切换串分区。SQL 规则、缓存、失败回退仍属现有 SQL 业务，不应用到普通对话。

## UI 与 Vue 开发 MCP

已评估 [AI Elements Vue](https://www.ai-elements-vue.com/) 及 [shadcn-vue 接替模式](https://www.shadcn-vue.com/docs/ai-elements)。本次采用消息、输入、上下文标签、代码审阅的组合方式，继续复用 `@eap/ui`，没有为聊天 UI 引入第二套模型请求 SDK 或整体替换组件库。

web 包新增开发依赖 `vite-plugin-vue-mcp` 0.3.2，默认关闭。仅开发时设置 `EAP_VUE_MCP=true` 才启用，绑定 `127.0.0.1`，不自动修改 Cursor 配置，生产 build 无端点。连接地址为 `http://127.0.0.1:<port>/__mcp/sse`。

已真实验证 MCP 初始化、工具发现、读取组件树、读取 TaskComposer 状态、将引用菜单展开。它提供运行状态观察/编辑，不自动把状态变成源码，也不替代业务授权。开发状态可能包含表单值；输入真实凭据时保持 MCP 关闭。本次没有读取凭据组件或通过 MCP 发送/写仓库。

## 验证与保留项

- 后端：`rtk proxy mvn -f backend/pom.xml clean test package` 通过，257 项执行：252 通过、0 失败、5 条件跳过；真实数据库、CLI 集成、模型等五个门控保持关闭。
- 前端：`pnpm --dir frontend typecheck`、`test run`、`check:boundaries`、`build` 通过；17 个测试文件、70 项通过。
- `EngineeringTaskFlowTest` 验证专家、文件和保存原型进入公开 Fake ChatModel，返回源码候选，经独立确认写到测试临时工作区；覆盖只读、空根、用户修改保护、跨会话和路径拒绝。
- 浏览器实际切换任务模式和专家、展开引用菜单；没有发送真实付费请求。角色 JSON 最初被旧专家扫描器误识别，启动检查发现后已移到独立 `chat/` 资源目录。
- 代码同步到 F: IDEA 检出后，8080 状态为 disabled，新上下文消息返回 503 / AI_NOT_CONFIGURED，未调用模型。浏览器读取到了原有两份真实保存的结算页版本，并可选为任务上下文；日常授权根不变。
- 原 Builder 隔离数据库验收仍是独立未完成项；本切片不以它为普通需求入口的前置。真实 GPT/DeepSeek、生成代码在用户项目的构建/测试及外部 Agent 委派仍未验证，不因离线测试就宣称完成。

## 会话历史与管理（2026-10-24）

对话页提供会话列表、切换、重命名、归档/恢复和删除确认。正文、标题、草稿及模型绑定标识保存在当前浏览器来源的 localStorage（eap.chat.history.v1），不保存模型密钥，不将附加文件作为历史配置持久化。它不是服务端审计或跨设备同步。清理浏览器数据会丢失这些历史。旧页面仅驻留内存且已丢失的正文无法补回。

切换通过 GET /api/ai/conversations/{id} 确认服务端会话是否有效，并恢复该会话自己的草稿与绑定；服务端超时或重启后，本地正文仍可查看，但不能宣称模型上下文恢复，也不自动重建或重发。归档只隐藏最近列表入口，不延长服务端记忆寿命。

确认删除后，DELETE /api/ai/conversations/{id} 清理对应服务端会话及其 ChatMemory，再删除本地正文和草稿；忙碌会话拒绝删除。删除不级联交接、Mission 或仓库文件。前端正在生成时禁止归档/删除。历史存储失败有可见提示，不报告已持久保存。

## 会话失效与显式重试（当前合同：2026-11-10）

旧“只可查看历史，请新建会话”将模型调用失败、暂时离线与服务端会话丢失混在一起，导致重启后原草稿无法继续。新合同保留“不自动重建/重发”，但不能据此永久锁死用户：

- 模型返回失败而会话仍有效：原会话可编辑草稿并重试，不新建会话、不替换模型。
- 暂时无法检查会话：允许重新检查连接，不把网络错误或无关404永久标成会话丢失。
- 确认会话丢失：显式提供重新连接/重新连接并重试，确认对话框说明服务端模型记忆将从空开始，本地历史不自动重放；无草稿时只重连，不发送空请求。
- 重连保留本地会话ID、项目关联、正文、草稿、附件/指引、模型选择与工作面状态，不另造一条用户会话。缺失或过期时同ID恢复空模型窗口及本地任务摘要；目标必须由用户显式指定，不采用当前全局默认。已有会话使用相同目标时保留模型窗口；明确换目标／配置时先清理上下文，再发布新绑定；忙碌时拒绝。
- `POST /api/ai/conversations/{id}/reconnect`严格接收`{confirmContextReset:true,expectedWorkspaceLabel:<原会话标签>,connectionId:<目标连接>,model:<目标模型>}`。先校验工作区及模型权限，再在注册表锁内完成同ID恢复和绑定，返回`contextReset/memoryCleared/workingMemory`。删除旧两步“恢复后再绑定”调用，旧两字段请求直接拒绝；工作区、授权或清理失败均停止后续发送。Mock同合同迁移，无兼容入口。
- 用户确认后，仅重试当前草稿一次，沿用正常任务组合/审批路径；不重放历史模型工具、旧候选应用或UNKNOWN写入。重连不等于恢复模型记忆、持久Mission或跨重启进程接管。

### 2026-11-10结构与展示优化

- 重新检查是只读GET；只有同时在途的同ID检查合并，完成后新检查重新请求，不用缓存代替授权。连接目录和全局状态同样只合并在途请求。普通换模仍使用独立绑定动作；重试只发送用户确认的当前草稿。
- `chatHistory.ts`负责一次读取启动快照、序列化及流式检查点。流式增量按150ms合并；草稿、当前选择、最终结果、pagehide、隐藏及组件卸载及时flush。展示翻译不进入本地历史。突发浏览器进程终止可能丢失最近一个流式检查点内的展示增量，独立执行证据与UNKNOWN核对不依赖该展示缓存。
- `applyBinding`集中前端绑定投影，后端`updateBinding/Binding.sameTarget`集中绑定及清理顺序。异步结果受选择版本保护，离开再返回同ID也不应用旧快照。模型授权从同一份读取的连接文档完成，仍保留OAuth及发送前权限复核，没有新增跨请求授权缓存。
- 相同材料依赖不重写工作记忆；重复敏感清理仍每次清空模型窗口，但内容和失效原因未变化时不重复写文件。保留同步安全边界，不用异步保存掩盖失败。
- `TaskMemoryPanel`及`TurnContextDetails`为Chat专用L4组合，复用`@eap/ui`控件；`VerificationChecks`复用现有Collapse。默认显示任务目标、上下文字符摘要、检查状态和单一预览入口，原始码／来源／哈希／配置详情需展开；缺少检查明细不显示完整通过，人工验收独立。

当前验证：后端12类55项通过；前端受影响74文件461项通过，末次异步保护4文件78项通过；真实full HTTP6组及Chromium中英2组通过。浏览器每组一次reconnect、零次额外connection请求，明确确认后一次messages；刷新保留两条正文，1440/900/390无页面横溢。恢复阶段供应商调用0次，明确重试共2次确定性流式夹具调用，外部模型0次。详见[当前证据](../../frontend/apps/web/__tests__/browser/artifacts/conversation-optimization/README.md)。对应实现纳入本批提交；提交沿用上述证据，不重复测试，技术验证不等于用户接受。

### 2026-11-05历史验证快照（不作为当前重测）

父任务独立检查代码差异后执行`rtk proxy mvn -f backend/pom.xml test`：四个有测试模块摘要聚合673项、0失败/错误、68条件跳过；日志在受管scratch的`reconnect-parent-backend.log`。未开启数据库/真实模型门禁。新增HTTP/注册表回归覆盖同ID重建、已有会话记忆/绑定/敏感标记保留、工作区变化、忙碌、容量及清理失败不发布新会话。

前端根`check`首次发现新增组件测试1处格式问题，仅格式化该文件后，根检查384格式文件、300 lint文件零问题；随后`rtk proxy pnpm --dir frontend test run --maxWorkers=2`全量110文件632项通过，`typecheck`和`build`通过，根架构检查包含边界门禁。组件测试点击确认/取消/双击并验证调用次数及项目/滚动保留；会话测试覆盖模型缺失/禁用/移除、重连/绑定失败、切换竞态、瞬时离线及无关404。真实与mock使用同一路由/请求合同。

未重启用户服务、未调用真实模型、未提交推送。Node localStorage、Mockito/JDK及构建大chunk告警保留。上述为自动化组件/回环HTTP证据，不宣称真实浏览器用户接受或模型故障已恢复；本地记录续接不等于完整ChatMemory持久化。已有服务需由用户重启加载后使用该入口。

## 聊天 SSE 执行事件与取消（2026-11-07，限定离线与mock交互已验）

破坏性合同：`POST /api/ai/conversations/{id}/messages` 主路径改为 `text/event-stream`（`consumes=application/json`）。校验失败仍在首帧前抛出 HTTP 4xx JSON；成功路径按序推送 `status` / `answer.delta` / `tool` / `approval` / `error` / `final`（`final.payload` 为完整消息信封）。配套：

- `POST /api/ai/conversations/{id}/cancel`（JSON `{}`）：协作取消进行中的 exclusive 轮次；空闲为 no-op。
- `GET /api/ai/conversations/{id}/executions/{executionId}/snapshot?afterSequence=`：进程内游标补齐；非法游标 `CURSOR_INVALID`。
- 前端 `runtime-client` 用 fetch 消费 SSE；发送中可请求取消。2026-11-14实现核查纠正：`eventProjector`是未接入生产发送链的辅助函数，projectEvents仅按sequence去重、未先隔离执行身份；其离线单测不证明线上重复/乱序/缺序恢复。生产ChatTurn仍由流回调直接追加，完整单一路径回放需后续定向实现。

离线证据：`ChatExecutionStreamTest` 4 项；前端 eventProjector/reconnect/wireApi 等定向通过。不宣称跨重启持久事件日志或真实供应商流式验收。

### SSE 回归收敛（接续 1e13b66）

先在同一工作树、现有网络保护下复现707项/673通过/34失败，再分两线修正，不放行开发8080、不修改后端UUID校验或供应商协议：

- **会话生命周期**：首帧前HTTP拒绝撤销本次乐观user/空assistant占位，保留之前正文与当前草稿；接到事件或传输结果未知后保留部分回答、executionId和工具证据，将悬空RUNNING收敛为UNKNOWN，不自动重试。明确终态失败/取消/未知不因error为空而清掉草稿；仅SUCCEEDED与既有明确模拟终态mock_completed按成功处理。晚到结果与预算不污染另一会话。
- **传输与组件合同**：Knowledge/Skill请求仍精确断言引用revision/digest及资源路径；原Axios adapter未覆盖fetch SSE的测试改为worker自有127.0.0.1临时HTTP服务，核对JSON管理请求、发送Accept/正文与SSE final完整信封。组件增加第五参数AbortSignal/onEvent合同断言，不删除原业务断言；补冲突、部分delta后EOF和真实AbortSignal回归。模拟fixture不是模型效果证明。
- **同批剩余门禁**：导航optional Boolean缺省被Vue转换false，显式默认true且保留Host传false；场景删除测试模拟404核对并等待异步删除完成，不绕过零revision UNKNOWN保护；全局发送说明断言迁至当前取消合同，不再断言“不能取消”。

指定预览工具实测：`desktop_preview`打开mock5174，`drive_preview`发送预算超限词，失败只显示预算说明、原草稿保留、无新增空运行回合；编辑后同会话发送普通草稿返回明确模拟回答，草稿清空且无失败重试提示。首次验证发现mock_completed被误当失败，已补兼容回归再复验。mock新建未保存场景→删除→返回列表提示已删除，预设删除仍禁用。真机5173仅验证输入草稿→设置→返回来源会话保留草稿，随后清空自建草稿，未发送真实请求。真实供应商流式/进程取消、窄屏/系统缩放与用户接受仍独立，未因此关闭。

父任务验证（仓库根）：`rtk proxy pnpm --dir frontend test run --maxWorkers=2 --reporter=json`完整128文件724项通过；`rtk proxy pnpm --dir frontend typecheck`、`check:architecture`（含边界）、`build`通过。新增17项不替换原断言：流式证据/终态/切会话/模拟成功及SSE冲突/提前EOF/Abort、导航显式停用覆盖。测试网络guard保留，fixture只连接自己创建的临时loopback服务，不修改runtime-client生产协议或mock生产后端。原mock候选查询404断言按已有PROPOSED实现更新，追加writeAllowed=false、409 BASELINE_UNKNOWN、拒绝后仍未应用。后端未改未跑，不引用历史Maven通过作为本次结果；Node localStorage与大chunk告警保留。

最终完整测试日志仍有10次`EAP_TEST_NETWORK_BLOCKED`诊断（包括网络保护负向回归及既有夹具漏mock），均在测试worker内拦截且退出0；不称日志零错误或已清空所有测试隔离欠账，不通过删除guard消除它们。新增传输fixture只访问自身临时端点。当前34个失败身份程序化比对全部消除；与真实供应商、UI全视口/系统缩放及进程生命周期验收分别记录。

提交前限定独立只读审查通过：未发现本轮阻断缺陷，确认关键授权/UNKNOWN断言没有删除或放宽；审查者重跑受影响11文件130项通过及diff检查通过。审查当时尚未看到规划更新的提醒，由父任务在提交前同步本决定、主方案CT-01验收行、台账与路线图并核对暂存范围关闭。独立定向结果不重复计为另一轮全量执行。

### SSE 接收边界（接续 fdcda56）

复用fetch公开接口，按LF/CRLF空行分帧，支持分隔符跨read、UTF-8跨字节与多行data按LF拼接；注释/无data帧忽略，未知事件类型兼容。畸形JSON、基本事件信封或实际消费的final字段拒绝为502/`AI_RESPONSE_INVALID`，不再跳过坏帧再接受后续成功。完整final即返回，取消reader并释放锁，不等待HTTP EOF、不消费后续事件；清理错误不覆盖原错误。兼容null/缺省及稀疏取消payload，不改变后端协议或将失败升级成功。

单帧上限1,048,576个解码后UTF-16 code units（含metadata，不含空行分隔符），跨read最多额外暂留3个分隔符字符；另有当前read chunk瞬时空间，不宣称总流或进程内存上限。超限502/`AI_RESPONSE_TOO_LARGE`；EOF无完整final为502/`AI_RESPONSE_INCOMPLETE`；错误不附原始正文。真实临时loopback HTTP定向25项通过，包含final后连接不关闭、回调异常清理、部分输出后中断。指定预览mock5174发送成功且清草稿，未调用真实供应商；畸形/超限/取消边界由离线HTTP证明，不冒充真机模型验收。

本轮与PL-01并行后父任务全量130文件752项通过，typecheck/architecture/build通过；施工中全量曾碰到新final-open RED与PL scope校验RED，均是本轮实施证据，不充当干净HEAD基线。保留既有networkGuard、localStorage和构建大chunk告警。

## 上下文预算 CE-01 首片（2026-11-07，离线通过）

在既有 `AiChatApplication` 拼装路径接入 `ContextBudget`：按 CHAR_ESTIMATE 计量 system + 已组装 user material，预留输出字符，超限返回 `CONTEXT_BUDGET_EXCEEDED`（ProblemDetail 携带来源用量，无正文）。history 标 `CHAT_MEMORY_NOT_METERED`；知识/Skill 触发的记忆清空记 `DERIVED_CLEARED_BEFORE_SEND`。成功响应附带可观测 `contextBudget`。旧硬限 `TASK_CONTEXT_TOO_LARGE` 由该合同替代。`ContextBudgetTest` 5 项通过。不宣称 provider token、压缩策略或 MEM-01。

## 上下文预算 UI（2026-11-07，离线通过）

聊天回合展示 `contextBudget` 用量摘要（已用/剩余/预留/计量/来源明细，无正文）；超限映射 `context-budget-exceeded` 并展示可读 Feedback。`contextBudgetView` 单测覆盖成功挂载与错误观测解析。

## 上下文预算 mock 合同与浏览器（2026-11-07，mock 通过）

`mock/chatBackend` 成功 SSE/`final` 附带确定性 `CHAR_ESTIMATE` 观测；消息含 `预算超限验收` 或 `__CONTEXT_BUDGET_EXCEEDED__` 时 HTTP 400 + `CONTEXT_BUDGET_EXCEEDED` + `contextBudget`（无正文）。消息含 `历史未计量验收` 或 `__CHAT_MEMORY_NOT_METERED__` 时计量为 `UNKNOWN`、来源含 `history`、备注含 `CHAT_MEMORY_NOT_METERED`。消息含 `派生清空验收` 或 `__DERIVED_CLEARED__` 时备注含 `DERIVED_CLEARED_BEFORE_SEND` 且 `contextMemoryCleared=true`。`chatBackend`/`contextBudgetView` 定向通过。mock `:5174` 浏览器：普通发送可见 `turn-context-budget`；超限关键字可见 Feedback；历史未计量/派生清空备注已验。不宣称真实 token、压缩策略或用户产品接受。

## 任务工作记忆失效 mock（2026-11-07，mock 通过）

`mock/chatBackend` 在发送含「记忆失效验收」或 `__INVALIDATE_WORKING_MEMORY__` 时将工作记忆标为 `DEPENDENCY_CHANGED` 并清空目标/约束/事实/证据/依赖键；会话 GET 回传后 Chat 面板展示失效。`:5174` 已验。不宣称真实依赖同步或取消 sticky 清空。

## 任务工作记忆 MEM-01 首片（2026-11-07，离线通过）

`TaskWorkingMemory` 与 ChatMemory/浏览器展示历史分层；敏感上下文清空与模型切换会使工作记忆失效，不取消 sticky 清空保护。会话 GET 返回 `workingMemory` 快照与更新后的 `MEMORY_NOTE`。`TaskWorkingMemoryTest` 通过。不宣称跨重启恢复或自动长期记忆。

## 任务工作记忆 UI/PUT（2026-11-07，离线通过）

`PUT /api/ai/conversations/{id}/working-memory` 写入目标/约束/事实引用（无正文）；聊天区展示分层说明并可保存目标。`WorkingMemoryApiTest` 与 `workingMemorySession` 通过。

## 任务工作记忆本地持久（2026-11-07，离线通过）

`FileWorkingMemoryStore` 落盘至 `.eap/working-memory`；进程重启后同会话 ID reconnect 恢复工作记忆、不恢复模型窗口；显式删除清盘。`WorkingMemoryPersistenceTest` 通过。

## 任务工作记忆 Task/Run 关联（2026-11-07，离线通过）

发送路径在 exclusive 下 `linkTaskAndExecution`：`taskRef` 写入 `dependencyKeys`（`task:project:id:rev`），本回合 `executionId` 写入 `evidenceRefs`（`execution:<uuid>`）；已有不同 `task:` 键时先 `TASK_BINDING_CHANGED` 失效再重绑。不复制看板任务状态机。聊天区展示依赖/证据；发送后刷新会话工作记忆。`TaskWorkingMemoryTest` 关联项与 `workingMemorySession` 刷新项通过。

## 任务工作记忆对抗失效（2026-11-07，离线通过）

`syncMaterialDependencies` 同步知识/Skill 依赖键；陈旧键 `DEPENDENCY_CHANGED`。`WorkingMemoryAdversarialTest`：PUT 不取消 sticky 清空、重连不复活模型窗/失效目标、Skill/任务切换丢弃派生内容。sticky 清空保护保留，不宣称可替代清空。

## CE-01模型历史计量及显式清空（2026-11-11）

当前发送路径已替换此前history恒UNKNOWN的实现：读取同一ChatMemory窗口，以消息（含工具记录）的SDK字符串表示做保守字符估算，计入平台总预算并保留输出预留；不声称token精确计量。既有UNKNOWN观察合同仍支持外部未计量来源，但不保留第二条生产历史读取路径。

新增模型历史GET/DELETE接口只返回消息数和字符数；DELETE在会话锁下拒绝busy，不删除会话、不变更任务记忆/绑定，不重置派生敏感上下文sticky规则。页面显式确认后清空，返回中断只GET核对，无自动重放；成功后将焦点转到仍可用的刷新控件。模型历史、页面记录和任务记忆仍各守职责。

后端17项定向与1项完整应用/真实Chromium通过；390px实际Chat验证响应丢失恢复、1次DELETE、Escape及草稿保留，宿主确认SDK窗口为空和任务记忆不变。见[证据与剩余边界](../planning-status.md#model-history-validation)。模型摘要压缩仍未实现，COMPRESSION_NOT_ENABLED保留；本节覆盖此前历史未计量的现状描述，其旧验证记录按历史快照保留。

## MEM-01任务记忆编辑与采用（2026-11-11）

任务工作记忆继续使用唯一State/Store。原PUT合同增加必填expectedUpdatedAt，注册表锁下比较版本并以单调更新时间防止同一时刻丢失更新；不匹配返回WORKING_MEMORY_CHANGED（409，中英文资源），缺失版本为非法请求。可信内部Task/Run关联仍调用同一写入函数，不新增兼容HTTP入口。

前端替换旧单目标编辑为目标/约束Dialog，保留原引用字段；冲突保留输入，明确放弃后可重新读取。带入草稿只追加操作者当前确认的目标和约束，保持用户级材料，不自动加载事实引用、不自动发送。保存不会恢复失效资料或取消sticky清空。后端16项、前端8项及实际Chat390px整链通过，详见[本轮证据](../planning-status.md#task-memory-editor-validation)。自动摘要、自动长期抽取和供应商token计量仍未实现。

## CE-01明确历史摘要预览（2026-11-11）

历史摘要复用ModelConnections.completionClient，它不挂模型记忆或工具；请求复用会话exclusive/cancel与现有绑定检查。输入来自实际SDK窗口，先脱敏及预算校验，超限失败；模型输出为空或超过8K失败，返回前重新核对连接配置。历史摘要是操作者核对的用户级草稿，不构成执行/验收/权限事实，不回写ChatMemory或TaskWorkingMemory。

ModelHistoryDialog明确确认调用、编辑、采用与未采用关闭确认；采用只追加草稿，清空独立确认。敏感派生contextSensitive拒绝可复用摘要，不能借摘要恢复已失效资料。无状态的预览响应丢失不自动重试；不宣称跨重启恢复或自动模型窗口压缩。五项定向（含取消和生成中配置撤销）及一次真实完整应用/Chromium整链通过；测试completion为Fake，真实供应商摘要质量仍待，证据见[台账](../planning-status.md#history-summary-validation)。此前摘要未实现描述为历史快照，当前仅自动替换/分段策略仍未实现。

## 已加载会话本地导出（2026-11-11）

导出是应用层展示记录的显式本地下载，复用chatSession.turns而不建立后端转储API或持久执行副本。预览和Markdown只包含对话正文及原状态/错误码/执行/产物摘要引用；不遍历隐藏上下文、proposal源码、知识正文、附件正文、草稿或连接设置。原正文可能包含操作者输入，下载前显示完整内容由操作者核对。生成代码围栏动态避开正文围栏，预览纯文本，不执行HTML。流式中不导出半成品；会话切换关闭旧预览。格式回归、实际390px下载及读取校验通过，见[证据](../planning-status.md#chat-export-validation)。分享仍未实现，下载不产生分享链接。

## Work本机文档处理首片（2026-11-11）

Work与Code共用ChatWorkspace/createChatSession/模型合同，Work回答可手工编辑为文档。文档编辑使用公共Input/Textarea/Dialog/ConfirmBox，保存是当前浏览器明确操作，下载是另一个操作；不新建后台执行或文档库，不将模型回答状态变成接受。草稿按API目标、会话及回答位置隔离，原对话保持不变；来源状态和执行引用保留展示，文件仅包含用户核对后的标题/正文。真实390px编辑、保存重开、关闭保护及下载读取通过，见[台账](../planning-status.md#work-document-validation)。这只覆盖本机Markdown工作流，非完整办公工具或Word/PDF能力。

Work本机草稿的回答位置只是检索键，不是来源证明。草稿正文及执行ID与当前回答完全一致才加载；无法读取、格式非法或来源不一致时禁止覆盖，允许将当前回答编辑后单独下载。定向2项通过。集成前端生产构建通过，后端Boot重打包因现有jar重命名失败，完整打包仍待，不提升为成功。见[当前集成证据](../planning-status.md#integration-build-source-check)。
