# 阶段验证记录

> 2026-11-12 从规划台账迁入。下文按原阶段保存实现、命令、失败、跳过与证据；“本轮”“当前”“待验”和提交授权均指记录当时，不是新的执行指令。最新状态以[规划台账](../planning-status.md)为准。证据路径中的 `target/` 默认指 `backend/eap-applications/eap-full-application/target/`；包产出只覆盖其记录时点。

## 阅读索引

- [近期源码 Agent 与任务交接](#application-task-continuation-validation)
- [真实供应商跨路由交付](#real-route-model-validation)
- [源码 UNKNOWN 核对](#source-write-review-validation)
- [前轮工具异常与恢复](#tool-execution-validation)

<a id="application-task-continuation-validation"></a>

### 源码应用到原任务验证工作面（2026-11-12）

绑定任务的持久候选核对为APPLIED后提供明确“继续验证与交付”。聊天从服务端候选的任务绑定打开原任务执行页；看板候选在当前任务内切换执行页。应用哈希、会话/候选ID收入默认收起的记录详情。使用现有公共Button/Collapse及原任务精确GET，无新API、数据库字段或兼容入口；URL只保存project/task页面位置，不携带或推断授权、revision和交付归因。

看板精确读取当前任务，支持最近200条列表外的任务；返回身份核对、刷新恢复、关闭清除定位、读取失败显式重查、相同地址延迟事件去重及快速切换后的迟到结果隔离均已实现。现有未保存和在途保护保留；打开页面不会启动Run、验证、模型调用或接受交付。

前端定向三文件38项通过（PreviewBoard最终18项，ProposalApplication及BoardCodeCandidates未变化20项沿用同轮通过结果）；vue-tsc、lint和vsh通过。最终vp build4752模块通过，保留既有大chunk提示。首次新增失败恢复用例发现测试环境延迟hashchange重复触发GET，已修复同地址去重；另补迟到结果场景并通过，不削弱断言或网络守卫。

完整应用/UUID独立PostgreSQL/最终生产包/全局Playwright与真实390px Chromium整链1项通过、0跳过：任务准备→源码Agent（显式Fake）→候选→明确应用→点击继续→精确GET核对原任务/project/r1→运行记录加载完成→刷新仍在该任务执行页。0自动Run、0pageerror，数据库仍ready/r1、APPLIED、0Mission，实际文件读回一致。最终证据 `target/engineering-agent-17461642663158242443/{browser-validation,validation}.json`，同目录应用及交接截图已查看。没有为导航修改重复真实供应商或未变化的独立构建/验证/技术决定链；这些已有证据独立保留。此结果仅证明交接连续性，不表示本轮已运行独立验证或用户接受。

<a id="engineering-agent-validation"></a>

### 绑定任务的按需源码工程 Agent（2026-11-12）

CP-01/02/03接续：已准备代码任务可明确选择智能体，单次发送为CODE目的及CODE_SOURCES工具面。沿现有Spring AI/生成快照/候选/人工应用，不新建执行状态、调度器或数据库迁移。模型通过read_selected_sources读取本次固定的1～8份源码，每份一次、最多4次工具调用；首轮不预填工作区源码正文。每次读前及模型返回前核对授权、全体基线和任务快照；漏读或复核失败拒绝候选。账户计划、未绑定任务及chat/plan请求拒绝该工具面；独立Mock明确503，不伪造仓库读取。详见[合同](../decisions/chat-engineering-task-slice.md#bounded-engineering-agent)。

后端CodeSourceAgentTest最终5项通过、0跳过：Spring公开工具循环、非法/越界/重复输入、取消/授权复核失败、模型跳过读取、最后一次读取后任务变化、用途与绑定门禁。授权变化由受控回调模拟，非真实OS撤权。已有EngineeringChatServiceTest20项沿用本轮未变化证据。前端TaskComposer/chatSession/ChatWorkspace定向73项及Mock5项通过；vue-tsc、lint、vsh通过，最终vp build4751模块通过，保留原有大chunk提示；领域检查20状态域、23错误目录、526码、11对资源。

完整应用/UUID独立PostgreSQL/当前生产包/全局Playwright与真实390px Chromium：显式Fake首轮整链1项通过，证据 `target/engineering-agent-2316107227500167340`；一次工具读取、两次模型调用、两文件候选、0自动应用、明确确认后APPLIED及文件内容读回一致，任务仍ready/r1、0Mission。接着通过配置的真实API模型执行同一源码Agent链，1项通过/0跳过，证据 `target/engineering-agent-4817512777160895262/{browser-validation,validation}.json`。没有注册Fake客户端，实际工具读取和完整候选门禁后人工应用成功；此为真实供应商验证，不把Fake计数当作供应商调用次数，也不等于用户接受。

浏览器截图检查发现源码编辑区撑满窄屏导致候选被遮挡，已修复为绑定任务默认收起源码编辑、输入区高度有界并可独立滚动。仅为这项UI变化复跑Fake完整应用整链，最终1项通过/0跳过，证据 `target/engineering-agent-13208808851315558901/{browser-validation,validation}.json` 及同目录两张截图，已查看；对话区222px、确认应用按钮实际可见且未被遮挡、0pageerror。真实模型未因截图修复重复调用。该切片终止于明确应用；既有独立验证/技术决定、UNKNOWN等未变化范围沿用原证据，不宣称本轮重测。没有修改日常库、保留现有vp/pnpm工作区文件改动。

当前仅提供请求内的有界源码Agent；后台执行、推理跨重启恢复、任意Shell/网络工具、其他工程范围和用户接受仍独立。预算为有界字符预留，不是精确token计量；多文件写入不承诺OS事务。临时schema由夹具精确清理，证据工作区保留。

预算复核接续：将原工具循环上限提取为ChatClients.MAX_TOOL_CALLS，源码工具说明及预算读取同一值。预留包含全部源码JSON、每次最大参数、工具schema与消息信封，不仅计源码正文。该后端变化后定向5项及Fake完整应用整链1项通过、0跳过；最终证据为 `target/engineering-agent-8835536526659630661/{browser-validation,validation}.json`，仍222px、0pageerror，最终审批截图已查看。前述真实供应商结果保留，未重复调用。git diff --check通过，相关当前文档UTF-8无BOM、无连续问号或替换字符。

<a id="board-task-planning-validation"></a>

### 待规划原任务到实现候选应用（2026-11-12）

看板planned/ready任务新增明确“规划此任务”，原project/id/revision及原型随任务草稿交接，采用后执行模式plan/工具none，不把taskRef一律推成代码生成。保存计划后的planned任务可在准备完整、服务端allowedColumns允许时明确“标记为待处理”，沿原updateBoardTask CAS，用保存后的revision。保存与ready更新共用字段/预期列/revision结果校验和GET核对；未知/冲突不能进入源码准备。实现草稿采用切回原chat执行模式及code目的，不自动发送、执行Run或完成任务；无新接口、表或兼容分支。

前端TaskPlanDialog、任务草稿、ChatWorkspace采用、workbench及看板定向31项通过；其中ready响应丢失后仅GET核对、无重复更新，继续采用新revision。类型、lint、vsh通过，vp build4750模块通过并保留chunk提示。full-application/独立PostgreSQL/当前生产包/390px Chromium整链1项通过、0跳过：planned任务r1→绑定只读规划→人工回写r2→明确ready r3→源码准备→新实现草稿r3→候选生成→人工确认应用；后端核对原任务/备注/r3、1 generation、APPLIED及实际文件字节一致，0Mission执行。证据 `target/task-planning-14547557683007632807/browser-validation.json`、`validation.json`和同目录截图，已查看。模型为显式Fake，1次规划+1次代码调用；不是自主Agent或用户接受，未重复下游独立验证/技术决定的既有未变化实链。

初次夹具未通过新会话模型选择器，发送被正确禁用；补明确选模后，夹具又将代码响应配置到completion路径，而实际生产代码使用conversational，导致INVALID_CODE_PROPOSAL；修正Fake按现有系统合同返回计划/候选后完整通过。失败现场保留，不改变生产模型路径或放宽候选合同。

<a id="scenario-skill-validation"></a>

### 场景声明到精确Skill会话引用（2026-11-12）

自定义场景可从既有Skill目录添加/移除ID声明，沿原revision配置保存并读回；详情按需观测真实启用版本数量及失败状态。会话提供场景技能入口，复用SkillSelector过滤声明ID、显示未导入项和禁用版本，读取正文/选资源/预览/明确采用后持有原skillRef及skillResourcePaths。不自动选择最新版或发送，不扩工具权限，不复制Skill状态到场景表。通用技能选择仍保留独立引用职责，当前会话引用可见；多个声明不冒充多技能同时执行。

前端选择器5项、场景页及目录23项通过；类型、lint、vsh通过，vp build4750模块通过，保留大chunk提示。full-application/独立PostgreSQL/当前生产包/390px Chromium整链1项通过、0跳过：创建场景、添加声明、实际PUT保存/刷新恢复、观测1个启用版本、禁用版本不可选、精确版本及资源采用、真实Chat发送/回答；后端确认场景指令进入系统消息、Skill正文和资源进入模型用户材料，1次显式Fake模型调用、0工具执行/0生成记录。证据 `target/scenario-skill-4822733917143860057/browser-validation.json`、`validation.json`及同目录截图，已查看。首次整链断言错把场景指令查在用户消息，修正至现有系统指令合同；一次开发服务器空白超时现场保留，最终采用本轮生产构建验证。旧场景测试仍断言按控制台origin猜预览地址，已改为当前明确地址合同的“未登记无链接”断言，网络守卫保留，新增目录调用明确mock。真实供应商效果、多个Skill同时引用及任意工具/MCP资源组合仍独立。

<a id="skill-directory-validation"></a>

### Skill 本地文本目录到版本及模型材料（2026-11-12）

正式Skill管理页支持浏览器选择根SKILL.md及最多四个文本资源，保留嵌套相对路径，整批验证后替换原文/资源/来源草稿。无效目录不改草稿，选择不保存或执行；复用既有预览、来源确认、不可变版本和CAS启停合同，没有目录读取API、数据库迁移或第二套解析保存机制。公共FileUpload仅增加directory原语，领域逻辑在Skill页面及skillDirectory；英文/中文文案同步。

本轮生产 `vp build` 4750模块通过，保留原有大chunk提示。同步主计划时发现此前脚本追加段落的问号乱码，已按已验证事实改写会话执行、PB-02及Skill对应行，并核对相关当前文档无连续问号乱码；未改变历史证据的通过/失败结论。

前端目录读取、SkillManager和FileUpload定向29项通过；类型、lint、vsh通过。SkillTextParserTest8项通过。full-application/独立PostgreSQL/390px Chromium整链1项通过、0跳过：非法脚本目录保留草稿、真实目录选取/路径保留、预览后明确来源确认、两次保存两个不可变版本、默认禁用、旧版本启停及刷新恢复；后端确认原文/资源保留、信任记录、精确启用版本与资源进入Fake模型输入，0工具执行/0生成记录。证据 `target/skill-directory-18238415298149075471/browser-validation.json`、`validation.json`及同目录截图。首次通过截图发现长摘要/正文窄屏撑宽，补min-width/换行并重跑该整链通过，新增弹窗无横向溢出断言；已查看修复截图。真实供应商对Skill的效果与用户接受独立，ZIP/脚本/远端仓库未开放，之前未变化交付链路不重复测试。详见[扩展边界](../decisions/extension-boundaries.md)及[共享UI落点](../decisions/frontend-ui-shared-module-boundaries.md)。

本批提交前基线：`2450bf29fe4a2e47fef69b7f402426a31bc4146b`，提交前HEAD与远端main已核一致。三文件页面交付、分域状态/错误合同、会话优化、全站工作面与独立Mock/request及V33～V35文件纳入同批提交；隔离验收工作树中的提交仅用于验证。以下阶段结果均沿用，不当成本次提交时重新执行；分阶段的旧提交描述按当时快照理解。

<a id="knowledge-document-update-validation"></a>

2026-11-12HTTP写出诊断接续：此前多轮关闭期警告已限定复现为 `/api/capabilities` 响应提交后的Jackson写出异常。统一错误处理按Spring断连识别停止二次500写出，真正序列化失败保留原500；增加不含原路径/正文的路由模板、原因类名和提交状态诊断。ClientDisconnectHandlingTest2项、PlatformProblemContractTest4项及完整应用/隔离PostgreSQL/Chromium知识更新1项，共7项通过、0跳过。最终知识场景日志中该写出警告为0；真实序列化对照用例仍有预期WARN。证据 `target/knowledge-update-13672438733010643794/browser-validation.json` 和Surefire报告。此结果只关闭该复现场景，其他历史日志按历史证据保留；没有通过忽略HTTP500或删断言换取通过。

2026-11-12检索摘录接续：知识命中不再固定裁前1200字符，而在完整分段脱敏后围绕首个匹配词生成有界摘录，保留最多200字符前文，不拆Unicode代理对；没有可定位词时保留开头。保持原排序、SQL授权范围与命中身份，不引入模型或第二套检索器。KnowledgeExcerptTest3项、PostgresKnowledgeRetrievalTest2项通过/0跳过；实库第1400字符附近命中词摘录校验已通过，同一完整应用验证保留正文更新/检索/删除及浏览器编辑回读断言，1项通过/0跳过，证据 `target/knowledge-update-14367212719785355030/validation.json`。真实模型页面交付当前仍受两个连接存储文件PermissionError阻塞，已请求可读连接存储路径，未输出凭据或改动其权限。

### 知识正文原位更新（2026-11-12）

新增正文PUT、独立编辑弹窗、保存后同ID读回与Mock合同。服务端同事务锁定文档/校验旧内容SHA-256/替换全部分段，保持文档身份与授权关系；旧哈希409、跨库404、敏感内容和限额沿用。新增与更新复用分段函数，无新表/迁移、无删除重建或旧接口兼容路径。不是不可变文档历史或发布回滚。

完整应用/隔离PostgreSQL实库验证1项通过：旧分段全部移除、新正文跨3段可检索、旧词不再命中、旧哈希及跨库拒绝、删除后新词不命中；模型0调用。编辑组件1项通过，类型/架构/lint通过，领域检查19状态域/23目录/526错误码/11对资源。真实390px Chromium知识管理页面编辑标题/正文、PUT保存、同ID读回及列表/详情显示新内容通过，0pageerror；证据 `target/knowledge-update-14861931038413585284/validation.json`、`browser-validation.json` 和 `document-updated-narrow.png`。生产构建4748模块通过，原大chunk提示保留；用户接受、不可变历史、引用展示更细粒度版本和真实业务语料质量仍待。

<a id="planning-task-handoff-validation"></a>

2026-11-12：补齐已保存计划到实现材料的遗漏。任务 notes 随原任务锁内读取进入规划/生成 TaskSnapshot、持久 JSON 及已有模型输入预算；看板/聊天共用草稿包含 notes。不新增计划字段、兼容路径或迁移。定向 BoardApplicationEvidenceTest 50项及 PlanningModeAcceptanceTest 1项通过、0跳过，后者验证真实390px Chromium采用草稿包含计划及最新revision、独立PostgreSQL生成快照落库读回一致、下一次Fake模型调用实际收到保存的计划。证据 `target/planning-mode-17816836823409283160/validation.json`、同目录截图及Surefire报告；vue-tsc、lint、vsh通过。首次编译暴露测试构造参数误改，已修正重跑通过。真实供应商质量及用户接受未覆盖。

2026-11-12：规划回写后可从保存面板直接进入源码准备，采用返回或 GET 核对后的最新任务 revision；仅 ready、准备完整且无在途执行开放，不自动转换状态或发送。看板/聊天共用任务草稿构造，保留明确采用及新会话确认。组件定向3项、vue-tsc、lint、vsh通过；full-application/独立PostgreSQL/390px Chromium整链1项通过、0跳过，覆盖保存响应丢失→GET确认→源码核对→采用实现草稿，pageErrors为空。证据 `target/planning-mode-4757136937202164274/validation.json` 及同目录截图。首次运行的模板事件语法错误已改用具名函数修复后重跑通过；真实模型质量仍未验证，既有未变化范围沿用原证据。

2026-11-12任务核对及保存恢复：新增按project/id精确GET读取原任务，替换规划面板的限200条列表查找；前端客户端/独立Mock同步合同。保存响应不明冻结编辑，只GET原任务核对版本和提交字段，不自动重发。组件3项通过，Mock精确项目读取1项通过/8未选择；完整应用/隔离PostgreSQL/Chromium新增实际落库后丢弃更新响应→只GET恢复通过1项/0跳过，证据 `target/planning-mode-16608342543303676240/validation.json` 及对应浏览器脚本断言，记录单次更新POST，原任务revision及字段读回一致。类型、架构、lint及生产构建（4745模块）通过，原大chunk提示保留。结果不等于数据库事务归因证明、跨刷新未提交草稿持久化或用户验收；原关闭期HTTP写出警告独立保留。

2026-11-12计划回写接续：绑定任务的规划回答新增明确采用面板，读取当前任务版本后编辑目标、条件及备注，复用原CAS更新；旧版本/执行在途/不允许状态阻断采用，未保存关闭确认、超长备注阻断，原计划保留。组件定向2项通过，类型/lint/架构通过；真实完整应用/PostgreSQL/Chromium已验证打开原任务、显式采用、编辑备注、实际CAS保存并读回新revision，1项通过/0跳过，证据 `target/planning-mode-12196233737833548968/validation.json` 及 `planning-task-update-narrow.png`。没有新API、状态、表或兼容分支，未改变已有任务创建与交付门禁。

2026-11-12接续：已有任务绑定现在可切换只读规划；服务端通过原任务锁、project/id/revision核对读取planned/ready快照及原型，无执行在途才允许。新增只读存储操作不插入生成记录；读取后即释放事务，模型等待不持锁。完整应用/隔离PostgreSQL/390px Chromium 的同一交接用例已扩展并通过：采用任务实现草稿后切换规划、再次发送，任务仍ready，源码/生成/候选/执行表不变。明确Fake模型共2次调用，证据 `target/planning-mode-16690450961136932404/validation.json`。TaskContext定向2项通过；类型检查通过。最终实库回归另确认旧revision、错项目、done任务拒绝，1项通过/0跳过。最终证据目录为 `planning-mode-1992262809647374344`，上述早期证据保留。工具拒绝用例改用独立会话防止其失败事件混入交接会话。结果回写已由本轮显式采用/CAS编辑切片补齐，当前快照仅证明模型调用前读取的版本，不承诺模型运行期间任务不变。

### 规划回答→任务准备→实现草稿（2026-11-11）

助手回答现可转入本机任务草稿，完整原回答只读对照、目标和条件明确编辑，关闭/刷新保留；已有/损坏/并发修改的草稿不会被覆盖，超4000字目标不自动截断。看板创建改为公共Dialog，错误、项目和来源都在弹窗内，普通未保存表单关闭有确认。后端直接复用现有幂等创建、会话关联及状态门禁，无新API、表或状态；草稿只在显式提交后创建 `planned` 任务。

真实完整应用＋隔离PostgreSQL＋390px Chromium 已通过连续操作：实际规划回答→编辑任务需求→关闭/继续→刷新读回→真实创建落库后丢弃POST响应→冻结原请求→再次刷新并按同一requestId/相同正文重试→仅一条任务、来源会话关联→显式转ready→真实源码核对→明确采用实现草稿，绑定原Task/revision及入口路径。模型仍只有一次明确Fake调用，`code_generation`/`code_proposal`/`mission_execution`均为0，源文件字节保持；原回答/本机会话关联不作为执行或生成归因证据。证据 `eap-full-application/target/planning-mode-8428837453639103086/validation.json`、同目录 `planning-task-draft-narrow.png` 和 `planning-task-implementation-narrow.png`；1项通过、0跳过、0pageerror，自有schema/宿主已清理。

定向回归覆盖原看板14项、长回答完整保留与缩短后刷新恢复1项、草稿隔离/并发保护/坏存储与读回失败3项，共18项分批经失败修复后通过。创建表单移动到Dialog后，测试改用实际teleport位置；ACCEPT旧夹具补齐真实预览地址，并等待预览确认可用后勾选，未放宽接受门禁。真实浏览器初次全局文本定位同时命中隐藏会话与来源对照，已限定到当前对照面板，无业务断言削弱。`vue-tsc --build`、`vsh check`、受影响文件 `vp lint` 及生产 `vp build`（4742模块）通过，原大chunk提示保留。既有源码应用→独立验证→人工决定链路未重复执行。外部模型凭据读取限制及既有关闭期HTTP写出警告保持独立，不记作用户接受。

命令：`EAP_PLANNING_CHROMIUM=true` 下执行 `rtk proxy mvn -q -f backend/pom.xml -pl :eap-full-application -am test -Dtest=PlanningModeAcceptanceTest -Dsurefire.failIfNoSpecifiedTests=false`，fork JVM 使用仓库内 `-Djava.io.tmpdir`，Playwright/Chromium 路径明确传入；前端本地 `vp test run apps/web/__tests__/features/shell/PreviewBoard.test.ts apps/web/__tests__/features/shell/boardTaskHandoff.test.ts`，修复后只重跑失败的 `full board`、`links the active` 及新增 `oversized answer` 用例。此前规划功能和未变化范围沿用对应证据，本次扩展同一验收用例验证新增交接路径。

<a id="planning-mode-validation"></a>

### 只读规划模式（2026-11-11）

CP-01/02/03 的规划选择已接通实际后端合同：`TaskMode.PLAN` 与前端常量一一对应；请求复用既有会话和流式执行路径，以明确引用、保存的设计和当前服务绑定工作区内的选定源码生成只读计划。服务端拒绝规划加工具请求，底层也不注册 Git；源码读取沿用完整内容、敏感信息及24KB/文件、48KB合计门禁，不创建代码生成或候选行。原模型/目标/工具设置保留，切回聊天继续使用；任务执行绑定和 Agent 不在本片开放。

前端发送合同与保留设置的回归通过；TaskComposer 新行为及原编辑交互15项通过，ChatSession57项通过；Mock 规划定向1项通过，其余4项未选择。后端 TaskContext2项、规划底层无工具1项通过。分域合同检查为19状态域、23错误目录、525码、11对资源。类型、vsh及受影响文件lint通过。生产构建4741模块通过，原大chunk提示保留，未修改阈值或忽略名单。

真实 full-application、隔离 PostgreSQL、390px Chromium 已完成实际规划发送/源码材料/流式回答/拒绝直接Git请求/刷新计划与模式/切回聊天，0 pageerror；数据库 `code_generation`、`code_proposal` 均为0，源码字节保持，模型为明确 Fake ChatModel。截图复核发现常驻任务摘要和源码选集挤占正文，已调整为按需展开（失效标记保留）。最终规划用例及受影响的记忆编辑/摘要/导出/Work草稿整链共2项通过、0跳过；证据分别为 `eap-full-application/target/planning-mode-295258147370909910/validation.json`、同目录 `planning-mode-narrow.png` 和 `target/model-history-3690015829032915876/validation.json`。刷新使用实际保存状态，不重新注入原会话数据；源码选集仍可展开编辑。早期失败是验证夹具漏了会话对应的空消息数组，修正夹具完整结构，未放宽源码/工具/数据库断言。

真实模型连接存储当前仍 PermissionError，环境没有可用模型凭据配置，因此未调用外部模型；供应商规划质量、已有任务的规划回写及Agent执行及用户接受不在上述通过结论内。此前关闭宿主的 `HttpMessageNotWritableException` 警告仍记录为待查，不宣称日志无错误。没有修改日常库或新增迁移。整链命令为 reactor `test -Dtest=PlanningModeAcceptanceTest,ModelHistoryAcceptanceTest`，显式 `EAP_PLANNING_CHROMIUM=true` / `EAP_MODEL_HISTORY_CHROMIUM=true` 与本机 Playwright/Chromium 路径；后者因摘要布局受影响才重跑，其余既有交付整链沿用证据。

<a id="dependency-preparation-validation"></a>

2026-11-12：正式准备面板新增只读参考源码选择与正文核对，后端code-references接口复用完整源码/授权/敏感信息读取边界，客户端和独立Mock同步；参考快照沿现有附件合同带入任务草稿，不增加候选写入文件或第二套上下文协议。路径/重复/存在性与敏感内容拒绝、16000/24000字符预算由服务端执行，前端核对返回顺序及UTF-8字节，改选使结果失效。CodeProposalBoundaryTest15项、草稿采用3项通过；full-application/隔离PostgreSQL/390px Chromium整链1项通过、0跳过，正式面板读取Host.ts→明确采用→Chat显示只读附件→发送→Fake模型实际收到完整宿主源码，准备/规划阶段无候选或执行记录。证据 `target/planning-mode-9852427234143459345/validation.json`、同目录窄屏截图及Surefire报告。类型、lint、vsh通过，vp build4749模块通过并保留原chunk告警。首轮仅因附件标签与发送预览同名导致测试选择歧义，改为精确按钮角色后通过；没有修改产品以规避断言。本轮未重复真实供应商六文件交付，沿用[真实模型证据](#real-route-model-validation)。

### 实现准备的入口依赖读取（2026-11-11）

PB-02 新增显式读取入口依赖，递归带出本地模块、字符串懒加载页面及 CSS/JSON；复用候选图解析和源码授权/预算，不扫描整个仓库，不创建生成或执行意图。用户仍明确核对并带入草稿；手工编辑选集立即使核对失效。后端 CodeProposalBoundaryTest 13 项通过，另新增循环/歧义/超过八文件边界 1 项通过；RouteResourceDeliveryTest 的两个既有图回归通过，旧完整交付用例未启用并沿用前证据。新增真实完整应用/隔离 PostgreSQL/390px Chromium 用例 1 项通过、0 跳过：替换旧关联选择、读取四文件、显式采用、修改入口使核对失效、重新读取以及公共样式加载后的窄屏边界断言，0 pageerror、0 模型调用。证据 `eap-full-application/target/dependency-preparation-17309832906097189310/validation.json` 和同目录 `dependency-preparation-narrow.png`。这是正式准备组件经真实 HTTP 的交互验证，不扩大为真实模型效果或用户接受。

首次浏览器用例因隔离宿主未配置页面来源而 403，显式加入该测试本机 origin 后通过；生产守卫未放宽。截图复核补充等待正式公共样式和对话框边界断言后再通过。前端类型、vsh 架构检查、受影响源码 lint 通过。既有应用→独立验证→人工决定整链未重复执行。

执行命令：后端 reactor `test -Dtest=CodeProposalBoundaryTest,RouteResourceDeliveryTest`（新增浏览器失败后仅重跑 `RouteResourceDeliveryTest#readsDependenciesInActualPreparationDialogWithoutGeneratingOrWriting`；追加范围边界仅跑 `CodeProposalBoundaryTest#dependencyDiscoveryRejectsCyclesAmbiguityAndExcessiveScope`），均指定仓库内 JVM 临时目录；浏览器开关 `EAP_DEPENDENCY_PREPARATION=true`，Playwright/Chromium 使用明确本机路径。前端直接本地 `vue-tsc --build`、`vsh check`、受影响文件 `vp lint`；Mock 新增定向用例 `vp test run apps/backend-mock/__tests__/chatBackend.test.ts -t 'does not fabricate repository'` 为 1 通过、3 未选择，证明两个只读接口均不制造工作区证据。没有变更数据库结构、状态词表或错误目录，无新增迁移及兼容分支。

<a id="integration-build-source-check"></a>

### 当前完整应用包产出（2026-11-11）

full宿主POM增加eap.application.final-name，默认仍为artifactId-version；允许现有宿主运行时明确使用新文件名，复用同一Boot打包配置，不改变数据目录、主类或依赖。未clean、停止旧进程或删除旧文件。首次PowerShell未引用含点参数导致生命周期解析失败，正确引用后reactor package -DskipTests退出0。

已生成eap-full-application-review-20261111-1640.jar（137081485字节），SHA-256 0826078c95bb422acfc394692c6b4ae0e78d05ffe527362bc739ca1266ac588b。ZIP完整性、Boot JarLauncher、唯一EapApplication及165个嵌套依赖核对通过；打包时 AiConversationRegistry/AiChatApplication/AiChatController/BoardDeliveryService 包内字节码与当时 target/classes 一致。该包早于本轮入口依赖开发，不包含后续源码。PackagedHostAcceptanceTest 独立 JVM 隔离启动已通过 1 项、0 跳过：PropertiesLauncher 仅注入隔离数据源配置，应用类及生产依赖从 Boot 包加载；健康、创建会话、查询模型历史均 HTTP 200，0 模型调用，自有进程/schema 已清理。证据为 full-application/target/packaged-host-9945522815703317316/validation.json 和 application.log。此结果不证明默认配置的普通 java -jar、日常库迁移或真实模型业务；真实模型凭据读取仍独立待验，未重复已有启动测试。

### 集成构建与Work草稿来源核对（2026-11-11）

前端生产vp build通过（4740模块），仍有大chunk提示，未修改阈值或忽略名单。后端reactor package -DskipTests完成编译但Boot repackage无法将现有jar重命名为jar.original而失败，不能记作打包成功；未停止现有宿主、删除文件或修改权限。既有真实模型连接存储权限问题仍独立待处理。

Work文档草稿补入来源正文与executionId：按回答位置重开时必须与来源一致，无法读取/损坏/来源变化均拒绝载入和覆盖旧草稿，保留当前回答编辑/下载。没有旧格式兼容加载分支。定向两项通过，覆盖正常保存重开及位置复用时拒绝旧草稿；类型和受影响lint通过。此前390px真实文档编辑下载证据沿用，不宣称本轮来源保护已增加浏览器验收。

<a id=work-document-validation></a>

### Work回答到文档（2026-11-11）

复用ChatWorkspace及原回答，Work模式的助手正文新增编辑为文档入口。公共Dialog中编辑标题和Markdown正文，显式保存本机草稿或下载；原对话和执行状态不改变。草稿按API目标/会话/回答位置隔离，保存后读回确认；读取/写入失败保留编辑并提示下载，未保存关闭须确认。此处是浏览器本机草稿，不是后台持久执行或交付验收。没有另建办公会话、模型连接或后端文档库。

类型、架构、lint/样式检查通过。完整应用＋隔离PostgreSQL＋Chromium390px：Work中打开既有助手回答、修改标题/正文、保存并重开读回、取消放弃修改、实际下载并读取Markdown全文及文件名；原会话草稿保留。ModelHistoryAcceptanceTest 1项通过/0跳过，证据eap-full-application/target/model-history-3354662658746506624/validation.json及work-document-narrow.png。该回答是明确测试数据，未验证真实供应商办公质量；Word/PDF、外部系统写入及自动工具执行仍未实现。关闭阶段既有日志警告保持待查。

<a id=real-route-model-validation></a>

### 当前真实跨路由交付验证（2026-11-12）

权限环境变化后两个连接文件均可读，本轮使用根目录既有gpt-6.1-sol/Responses配置，未修改配置或输出密钥。真实模型经生产send返回六文件、五依赖边的PREBOUND候选；页面确认后应用相同字节，独立typecheck/test/build均PASSED，真实Chromium完成概览/详情、按需chunk、加载/失败提示、刷新/返回、原型对照和技术ACCEPT持久读回。定向整链1项通过、0跳过，证据 `target/route-resource-6651313753437464854/validation.json` 与同目录真实结果、截图；非捕获输出重放或确定性候选。生成后新增的全链接点击断言另在同一已构建产物补验，`navigation-validation.json`记录两页6个链接均通过，0新模型调用/0重建。已查看详情及原型对照截图。

首份真实输出在 `target/route-resource-8075011784713040101` 保留：宿主源码未提供导致新增 `/detail` history链接，而宿主使用hash路由，首轮页面入口亦超时；诊断重放 `target/route-resource-4519203006790782443` 明确标识捕获真实输出，不算新调用/原次整链，并定位链接选择歧义和导航合同缺口。补充只读宿主源码参考、明确hash导航合同与精确链接定位后，重新真实生成通过。未手改候选以冒充模型输出，也没有自动重试或确定性回退。前端脚本通过全局vp Playwright加载，执行使用vp；历史权限阻断与pnpm记录仅为当时事实。

当前仍不覆盖任意路由框架、其他资源类型、自动Agent实现或用户产品接受；技术ACCEPT是本地测试操作者决定。以下2026-11-11阻断记录保留为历史快照。

### 真实候选隔离与设计身份核对补正（2026-11-11）

真实模型验收模式现在跳过确定性prepareGeneration/proposePrepared，只有生产send产生候选，避免遗留另一份候选混入目录或证据。确定性模式仍保留自身基线冲突断言，两种模式无运行时互相回退。交付页原型ID不匹配时接受按钮明确阻断，拒绝及备注仍可操作；版本查看器同时核对返回ID和预期hash，不把错误版本当作对照。前端定向28项通过，reactor两项组件图回归通过；类型检查通过。连接存储权限阻断仍只影响真实模型效果验证，本轮未重试模型或宣称浏览器新验收。

### 当前源码真实模型跨路由验证准备（2026-11-11）

RouteResourceDeliveryTest增加显式EAP_ROUTE_REAL_MODEL模式，沿生产AiChatApplication.send准备真实PREBOUND上下文并只请求一次模型候选，复用原候选应用/独立检查/真实Chromium路径；证据provider由实际模式记录，不能把确定性候选标为真实模型。必须显式指定EAP_ROUTE_CONNECTION_STORE且开始前检查可读，未获候选失败后不自动重试模型，不从旧宿主转取凭据。

本轮确认旧component宿主仍可响应且有模型，但当前源码隔离宿主读取本机日常连接存储时PermissionError/CONNECTION_STORE_UNREADABLE，失败发生在open会话、模型调用前。没有修改权限、读取密钥输出或调用外部模型；自有schema及宿主清理。真实模型跨路由效果仍未验证，原确定性整链成功证据保持历史事实。显式可读连接存储是后续该实链的必要环境输入，不阻塞其他开发。

<a id=chat-export-validation></a>

### 本地会话Markdown导出（2026-11-11）

Chat更多菜单原禁用导出已接通。仅操作者明确选择后预览已加载会话正文、原状态/错误码/执行及产物引用，再点击下载UTF-8 Markdown到本机；无网络上传，无后端副本，不包含草稿、附件正文、知识材料或连接设置。文本以大于内容内反引号长度的代码围栏保存，预览按纯文本渲染。流式进行中/无会话/无已加载消息禁用导出；切换会话关闭旧预览。导出不是执行恢复、全部历史备份或人工接受证据。

定向格式/范围回归1项通过，类型、架构、lint和样式检查通过。完整应用＋隔离PostgreSQL＋真实Chromium390px：打开导出预览并实际下载，读取文件核对已加载正文保留、当前草稿和测试连接密钥不含，关闭后原工作面保留，浏览器errors为空。ModelHistoryAcceptanceTest 1项通过/0跳过，证据eap-full-application/target/model-history-8952692628136724255/validation.json及chat-export-narrow.png，已查看截图。该实链复用已有受控completion，非外部模型效果；关闭阶段既有日志警告仍保留。

<a id=delivery-prototype-comparison-validation></a>

### 交付内绑定设计对照（2026-11-11）

交付决定页新增本次Run固定设计版本对照入口，复用PrototypeVersionViewer与原contentHash校验；不加载当前设计器草稿，不新增API/Store/渲染器。交付与Run原型ID不一致时显示提示，不回退；切换任务/Run/revision关闭对照。打开和关闭不修改交付草稿。

BoardRunDelivery定向27项通过；类型、架构、lint和样式通过。完整应用＋隔离PostgreSQL/Git＋真实Chromium：从六文件交付打开固定设计、查看保存预览和条件、关闭后预览URL仍保留；随后打开实际构建页面、技术ACCEPT及刷新地址读回。RouteResourceDeliveryTest 3项通过、0跳过。证据为eap-full-application/target/route-resource-11445603427436748892/validation.json与delivery-prototype-comparison.png，已查看截图。首轮脚本同名关闭按钮定位不唯一，收窄公共关闭控件后通过，未改生产关闭逻辑。候选为确定性测试数据，非真实模型效果一致性或用户接受；关闭阶段既有日志警告仍保留。

<a id=delivery-preview-address-validation></a>

### 明确登记交付预览地址（2026-11-11）

- 删除pagePreview按window.origin自动推断EAP/#chat的逻辑，通用检查/会话摘要/场景未登记目标时显示缺少预览。人工交付页明确输入本机HTTP/HTTPS地址，可新标签打开；修改地址立即撤销旧预览确认。ACCEPT必须携带合法previewUrl，REJECT可为空。后端与前端均拒绝远程地址、凭据、非法协议/端口和控制字符，不做HTTP探测或替用户启动预览。
- 地址写入原Decision JSON并纳入原幂等指纹，刷新读回可重新打开；无新表/新服务器/第二执行器。HTTP决定合同必填previewUrl，缺失直接拒绝，当前调用方/测试/恢复请求同步，不留兼容入口。独立Mock仍拒绝不存在的Run交付，不伪造已验证页面。
- 前端五文件78项通过；新增修改地址撤销确认断言后两文件34项通过。后端controller/application共6项及地址11项通过；类型/架构/lint/样式通过。旧测试将JSON视为非法已按当前1至8文件资源合同改为exe，不削弱路径检查。
- Chromium151＋完整应用＋隔离PostgreSQL/Git：六文件受控应用、独立typecheck/test/build、登记构建产物的#/detail、实际点击新标签并确认详情标题、技术ACCEPT及刷新原地址读回；RouteResourceDeliveryTest 3项通过/0跳过。证据为eap-full-application/target/route-resource-18226643717814222626/validation.json及脚本弹出页/持久href断言。首轮夹具误填#detail，修正为实际#/detail后通过；生产不猜路由。候选仍确定性测试数据，不代表外部模型或用户接受；登记地址不证明页面与源码同源，用户仍需核对。关闭阶段既有日志警告保留。

<a id=history-summary-validation></a>

### 明确生成历史摘要与采用（2026-11-11）

- POST /api/ai/conversations/{id}/model-history/summary读取真实SDK窗口，在同一会话exclusive边界内验证工作区及绑定模型配置，复用既有无记忆/无工具completion客户端；不增加临时模型窗口、持久摘要库或自动回退。发送前脱敏并执行字符预算，超限不截断；输出为空/超8K拒绝，返回前再校验配置未撤销。现有cancel接口可请求取消，响应丢失不自动再次调用模型。
- 用户确认模型调用后预览并编辑摘要，明确追加当前草稿；不发送、不写任务记忆、不清空历史、不授予权限。未采用的编辑关闭须确认。清空历史仍走独立确认及GET核对。contextSensitive保持互锁，含知识/Skill派生上下文的会话拒绝可复用摘要，不能绕过撤权/版本失效保护。
- HistorySummaryTest 5项通过，覆盖completion隔离、原窗口/任务记忆不变、敏感/超限拒绝、忙碌与输出限制及生成中配置撤销、取消丢弃预览且保留原窗口。前端Mock合同3项通过，类型/架构/lint/样式通过；18状态域、23错误目录、525错误码与11组双语资源检查通过。
- 完整应用＋隔离PostgreSQL＋Chromium390px：实际Chat生成确认、编辑摘要、明确采用，然后单独清空真实SDK窗口并截断成功响应，GET恢复后草稿包含原内容、目标/约束及已编辑摘要；宿主确认仅1次completion、无对话模型调用。证据：eap-full-application/target/model-history-12530637223593052849/validation.json及cleared-narrow.png。模型为受控Fake响应，外部供应商效果/摘要质量未验证。关闭阶段既有HttpMessageNotWritableException警告保留。

此处实现人工预览和采用的摘要流程，不是自动替换模型历史；自动发送仍保留COMPRESSION_NOT_ENABLED备注，自动分段、真实token及用户接受继续待办。

<a id=task-memory-editor-validation></a>

### 任务记忆编辑与明确采用（2026-11-11）

- 任务摘要不再仅有单目标输入；公共Dialog编辑目标和最多16条约束，关闭未保存内容须确认。事实、执行证据及依赖引用仍只读。保存和带入草稿是两个操作，采用只追加目标/约束，不发送、不覆盖原草稿、不注入system提示词或解引用旧资料。失效记录不允许直接采用。
- PUT /api/ai/conversations/{id}/working-memory必须携带expectedUpdatedAt；服务端在同一会话锁下比较版本，不匹配返回409 WORKING_MEMORY_CHANGED，保留原记录。每次变更的updatedAt单调递增，避免同一时刻写入丢失冲突。无版本的旧HTTP请求拒绝；runtime-client、Mock、原恢复脚本和定向测试同步迁移，没有兼容解析分支。目标超过500字或约束超16条/每条200字明确拒绝，不截断。
- 后端WorkingMemoryApiTest/TaskWorkingMemoryTest/WorkingMemoryAdversarialTest/WorkingMemoryPersistenceTest/ConversationContextEfficiencyTest共16项通过。前端Mock＋会话恢复8项通过，Mock新增冲突断言后3项通过；类型/架构/lint/样式及分域合同检查通过，错误码524个，中英文资源成对。
- 真实完整应用＋隔离PostgreSQL＋Chromium390px：并发更新后旧版本保存拒绝且保留输入；确认放弃后重新读取、编辑目标和两条约束、保存并明确追加原草稿；清空真实SDK历史响应中断后仅GET恢复，原草稿和采用文本保留，宿主核对目标/约束及只读引用。证据：eap-full-application/target/model-history-14681535409625506607/validation.json。外部模型未调用，自动摘要与产品接受不由此证明。

<a id=model-history-validation></a>

### 模型历史预算与显式清空（2026-11-11）

- 预算读取同一ChatMemory窗口，对消息（含工具记录）的SDK字符串表示做保守字符估算，计入system＋user＋history总和并预留输出；本轮材料仍单独受64K字符限制。使用饱和加法拒绝溢出，不返回任何历史正文。不宣称供应商token精确计量或自动摘要。
- GET/DELETE /api/ai/conversations/{id}/model-history复用会话注册表；清空仅允许空闲会话，不改变TaskWorkingMemory、模型绑定、页面对话记录或敏感材料sticky互锁。页面使用公共Dialog/ConfirmBox，响应丢失后只GET核对，不自动重发。Mock同步HTTP合同，仅维护模拟历史用量。
- 后端ContextBudgetTest 6项、AiConversationRegistryTest 11项、ModelHistoryAcceptanceTest 1项全部通过/0跳过。前端Mock及预算展示6项通过，Mock后续同步清理后3项通过；类型检查和受影响lint通过。
- 真实完整应用＋隔离PostgreSQL＋Chromium：390px实际Chat打开历史、确认清空、截断实际成功DELETE响应、GET恢复、仅1次DELETE；Escape关闭，浏览器草稿保留，Java权威断言任务记忆未改变且SDK窗口为空。证据：eap-full-application/target/model-history-9572588761590587685/validation.json及cleared-narrow.png。外部模型未调用；任务继续发送和真实模型效果不由此证明。
- 首轮夹具使用错误存储scope，修正为真实API scope；随后发现确认后原按钮禁用造成焦点丢失，修复后复验通过。独立宿主关闭阶段仍有HttpMessageNotWritableException警告，未将其视为已解决。

<a id=delivery-workflow-navigation></a>

### 连续交付导航实链（2026-11-11）

源码核对已有证据后可进入同一Run独立验证；只有整体PASSED提供人工交付入口。切换关闭原弹窗，保留同一Task/project/Run，不自动执行、提交或接受。服务端继续核对当前证据与门禁。

定向前端30项通过，vue-tsc及受影响lint通过。Chromium151＋完整应用＋隔离PostgreSQL/Git整链已通过390px验证→交付、技术ACCEPT及刷新读回；RouteResourceDeliveryTest共3项通过、0跳过。证据：eap-full-application/target/route-resource-615692185173562113/validation.json及verification-next-step-narrow.png。候选由确定性夹具提供，非模型效果或用户接受。

初次pnpm全局存储锁拒绝访问；尝试外部目录链接被SOURCE_LINK门禁拒绝。最终从EAP_ROUTE_DEPENDENCIES复制已安装、逐项核对固定版本的测试工具到新隔离工作区后通过，未削弱生产源码安全规则。未复用旧源码或旧交付结果。宿主关闭时有HttpMessageNotWritableException警告，测试通过不消除该关闭阶段日志。

<a id="validation-baseline"></a>

<a id="interactive-design-validation"></a>

### 初版交互设计与版本任务入口（2026-11-11）

| 范围 | 当前实现 | 验收边界 |
| --- | --- | --- |
| 设计与预览 | 增加 form/select/checkbox/dialog，属性面板配置标签/初始值/必填/选项与按钮目标；TOGGLE/SUBMIT/RESET 走声明式临时预览状态。删除无业务意义的点击计数。 | 仅当前预览，提交不发送业务数据；关闭/切换设计不回写不可变版本。 |
| 后端与 Mock | 同一发布合同校验节点唯一性、动作类型/目标和字段选项；前端纯合同由独立 Mock 复用。沿用现有 JSON 版本表，不新增兼容入口或旧计数分支。 | 设计交互通过不等于生成代码已达到设计要求；用户产品接受仍独立。 |
| 版本到任务 | 版本详情显式选择项目、目标和条件创建待规划任务，服务端原子保存版本引用；指纹包含版本且幂等，不触发模型/执行。页面发送前保存固定请求，不明时显式核对原请求。 | 不自动变更任务准备状态或仓库授权。 |
| 任务到实现草稿 | 待处理任务的“准备实现”选择入口/关联文件，复用授权文件树及服务端完整源码只读核对；已有/新增状态与字节可见。改动即使旧结果失效，明确带入后原任务/原型/文件整体采用。 | 核对不保存快照或调用模型；发送时再次执行原有 revision/授权/基线门禁，无准备票据或第二注册表。 |
| 实现准备实链 | 真实完整应用和Chromium从原型创建任务、转待处理，核对两个已有文件＋一个新增文件；修改路径使采用按钮禁用，重新核对后进入Chat并明确采用，实际输入框保留同一任务、入口及关联路径。CodeProposalBoundaryTest新增核对与实际生成读取一致的用例，连同原边界12项通过；草稿采用3项通过。 | 生成前只读核对不创建候选。当前沙箱拒绝系统临时目录的首轮回归失败，改用fork JVM参数 `-DargLine=-Djava.io.tmpdir=J:/Code/Engineering-Automation-Platform/backend/target/local-java-tmp` 后12项通过；未修改生产安全规则或削弱测试。 |
| 真实浏览器与实库 | 完整应用＋UUID自有schema＋Chromium：真实 Grapes 新建设计、添加表单/弹窗、属性编辑、必填校验、本地提交和重置；保存后刷新恢复、390px弹窗/Escape；HTTP发布一次并在版本预览重现交互，原版本正文保持不变。实际创建原型任务并在服务端提交后中断响应，明确按原请求核对返回同一任务；改内容409，看板打开原版本。 | 数据库确认1个版本、1个关联任务、0个源码候选；未调用模型、未执行任务。自有宿主/浏览器关闭，自有schema删除；日常库未迁移。 |
| 定向回归 | Java：PrototypeCanonicalTest 7、PrototypePublicationServiceTest 5、BoardTaskServiceTest 8及PrototypeInteractionAcceptanceTest 1通过。前端4文件22项＋prototypeSchema 7项通过；补改Mock请求合同后单用例通过。类型、架构、受影响lint/格式/样式及18组wire词表核对通过。 | 已通过且未变化的路由/源码UNKNOWN验收沿用；单用例选择产生的7项未执行不计新验证。 |

复验：设置 EAP_PROTOTYPE_INTERACTION_CHROMIUM=true、EAP_PLAYWRIGHT_MODULE 和 EAP_CHROMIUM，执行 `rtk proxy mvn -f backend/pom.xml -pl :eap-full-application -am test "-Dtest=PrototypeInteractionAcceptanceTest" "-Dsurefire.failIfNoSpecifiedTests=false"`；需已有本机开发库连接。浏览器脚本为 `frontend/apps/web/__tests__/browser/prototype-interaction-live.mjs`，证据写入自有 `eap-full-application/target/prototype-interaction-*`。组件及版本合同见[交互设计](../decisions/builder-prototype-delivery-contract.md#interactive-design)。

<a id="route-resource-delivery-validation"></a>

### 跨路由与本地文本资源交付（2026-11-11）

| 范围 | 当前合同 | 边界 |
| --- | --- | --- |
| 依赖与持久快照 | 路由入口、页面、CSS 和 JSON 共用 1～8 文件合同；立即加载、明确字符串的按需模块、CSS 导入均参与精确顺序、连通无环、写前哈希和应用读回。候选详情显示服务端识别的加载类型。 | 按需目标必须已选且带 .vue/.ts/.js 后缀；拒绝计算路径、模板路径、import 选项、require、glob、未声明引用、外部 CSS、CSS URL 和无效 JSON。 |
| 交付证据 | 同一 PREBOUND 记录关联原型、任务、全部文件和独立验证；看板路径检查及服务端证据采集同步纳入 JSON。 | 不引入新表、重复状态机或兼容接口；计算式路由、媒体、用户产品接受仍独立。 |
| 真实整链 | Chromium 151、完整应用、PostgreSQL 隔离 schema 和实际 Git 工作区：2 路由、6 文件、5 依赖；JSON 基线变化拒绝候选。页面确认应用后独立运行 typecheck/test/build，均通过且文件哈希一致。打开构建产物验证路由往返、刷新、CSS 级联与 JSON 文案；提交 PREBOUND 源码证据并完成技术 ACCEPT。 | 候选内容由确定性夹具提供；外部模型未调用。技术 ACCEPT 由自动化操作，用户产品接受仍独立。 |
| 定向回归 | Java 5 项：路由资源合同与整链、任务输入、原组件图拒绝分支、交付路径守卫。前端 47 项：候选审阅、拒绝投影、看板候选与交付表单。类型、架构和分域错误合同检查通过。 | 源码 UNKNOWN 批次沿用已通过证据；未重跑旧整链或全量套件。 |
| 懒加载接续实链 | Chromium 151、完整应用及隔离 PostgreSQL/Git：总览不请求详情 chunk，导航后才请求并呈现加载中状态；释放请求后显示详情及 CSS/JSON，刷新重新请求，同页往返复用模块。独立浏览器上下文中断 chunk 请求后显示失败提示并可返回总览；交付技术 ACCEPT 刷新后可读且无再次接受入口。 | 实际网络拦截故障；候选仍由确定性夹具提供，不代表模型效果或用户接受。重用既有应用/验证机制，无新增页面执行器。 |
| 本轮必要回归 | Java 5 项：明确懒加载图、资源合同、原组件图、模型输入合同和上述整链；前端候选组件 13 项及独立 Mock 2 项通过。类型、架构、格式/lint 与 17 组前后端 wire 词表及 523 个错误码资源核对通过。 | 前一轮静态路由 47 项等未变化结果沿用。词法检查防止注释、字符串及 Vue 模板文字生成伪依赖；不宣称完整 TS 编译器或代码沙箱。 |

复验：有本机开发 PostgreSQL 配置、Playwright 和 Chromium 时，设置 `EAP_ROUTE_RESOURCE_CHROMIUM=true`、`EAP_PLAYWRIGHT_MODULE`、`EAP_CHROMIUM`，执行 `rtk proxy mvn -f backend/pom.xml -pl :eap-full-application -am test "-Dtest=RouteResourceDeliveryTest" "-Dsurefire.failIfNoSpecifiedTests=false"`。隔离样例通过 pnpm 安装固定版本依赖，缓存齐备可设置 `EAP_ROUTE_OFFLINE=true`；数据库只使用并清理自有 schema。证据写入 `eap-full-application/target/route-resource-*`。参见[交付约束](../decisions/builder-prototype-delivery-contract.md#route-resource-delivery)。

<a id="source-write-review-validation"></a>

### 源码写入 UNKNOWN 人工核对和恢复（2026-11-11）

| 范围 | 当前合同 | 验证边界 |
| --- | --- | --- |
| 工作区与原候选 | `APPLYING` 和 `UNKNOWN` 继续互锁；V36 将人工关闭及文件摘要写入原候选，`CLOSED_UNKNOWN` 保留原原因、时间及空结果。关闭后的记录不可改写，原候选不可再次应用。 | 文件读取失败、授权失效或摘要变化都拒绝关闭；只核对原候选的路径。数据库锁约束本宿主的操作，文件比对不是跨文件原子快照。 |
| 页面及恢复 | 能力目录无需 Chat 会话即可发现待核对记录；候选详情复用相同面板。确认前展示逐项摘要、说明与明确确认；POST 响应不明时只 GET 原记录。 | 解除阻塞后按磁盘当前基线新建候选；核对不会生成原候选的应用、独立验证或用户接受证据。独立 Mock 不制造核对成功。 |
| 实库与恢复 | PostgreSQL 17.5 自有 schema 中持久领取 V35 候选，夹具只写入其中一份文件。V36 迁移后启动完整应用，读回 `UNKNOWN`，拒绝在途再次生成、跨工作区读取、不可读目标及未确认的关闭。关闭后原记录和审计冻结、同请求读回、新候选从当前基线应用，交付目录只显示新应用。 | 受控模拟部分源码效果；迁移、启动恢复、数据库约束与文件读写均实际执行。未迁移日常应用库。 |
| 真实浏览器 | Chromium 151 连接完整应用，390px 能力目录核对混合文件摘要；改动一份文件后 POST 返回 `409 CODE_REVIEW_CHANGED`，重新确认后提交。截断真实成功响应，页面只 GET 原记录，刷新与切换看板后均可重新打开审计，无重复 POST、无页面异常。 | 截断发生在浏览器网络层；没有伪造成功响应或调用外部模型。该结果是技术验收，跨路由/资源图与用户产品接受仍独立。 |
| 定向回归 | Java 14 项（`CodeProposalBoundaryTest` 11、`DomainWireAndMessagesTest` 2、`SourceWriteReviewPersistenceTest` 1），前端候选组件与独立 Mock 合同 20 项。状态和中英文资源合同、前端类型及架构检查通过。 | 沿用已通过且未受影响的旧验收，不重跑旧整链。见[源码核对决定](../decisions/builder-prototype-delivery-contract.md#source-write-review)。 |

复验：有本机开发 PostgreSQL 配置时，设置 `EAP_RUN_SINGLE_CONTRACTS=true`，执行 `rtk proxy mvn -f backend/pom.xml -pl :eap-full-application -am test "-Dtest=SourceWriteReviewPersistenceTest" "-Dsurefire.failIfNoSpecifiedTests=false"`。同时设置 `EAP_SOURCE_REVIEW_CHROMIUM=true`、`EAP_PLAYWRIGHT_MODULE` 与 `EAP_CHROMIUM` 可启用真实浏览器。脚本从 `frontend` 运行，完整应用与 Vite 只绑定回环；证据、截图写到本次测试的 `eap-full-application/target/source-write-review-*` 目录，退出时删除 UUID 隔离 schema。

<a id="product-workspaces"></a>

### 全站工作面、独立 Mock 与通用传输（2026-11-11，用户目标4～8，已纳入本批提交）

[当前合同](../decisions/frontend-product-workspaces-and-transport.md)；[逐页及交互证据](../../frontend/apps/web/__tests__/browser/artifacts/product-workspaces/README.md)。此前会话优化记录仅覆盖其列明范围，不能当作全站目标4～8完成证据。此前保存的相关未提交改动一并纳入本批；沿用既有验证，不重跑外部模型交付或后端未变化测试。

| 用户目标 | 当前实现及验证 | 边界 |
|---|---|---|
| 4 产品展示 | 清理会话/能力/设计器/规则等失效演示说明和共享确认框开发备注；诊断、规则全文与技术材料通过详情入口查看；真正影响授权/UNKNOWN核对的信息保留 | 不以批量隐藏警告替代产品设计；未进行全站静态文案英文化 |
| 5 逐页布局 | 16入口真实加载态1440/390走查；规则列表→包详情→单条弹窗、试算/词表分Tabs；知识/资料/技能/CLI/MCP表单弹窗；插件详情与能力诊断分面；模型/专家/场景/看板/设计器已有子页与面板保留 | 真实后端创建/保存/放弃/读回/删除、插件启停恢复及窄屏键盘焦点/草稿验证通过；其他系统缩放和完整辅助技术矩阵未穷尽 |
| 6 独立 Mock | apps/backend-mock 独立loopback Node进程；web模式仅选代理；正式src无Mock开关/专用完成状态/故障参数；同一HTTP/SSE/Problem合同；服务端一次性故障控制 | 模拟数据仅保存在Mock进程；不连接Java/供应商、不代表真实CLI或数据库持久化；不支持的合同返回错误 |
| 7 通用客户端 | @eap/request负责Axios配置/拦截器、动态headers、超时/取消、流握手、multipart上传/下载；runtime-client保留业务合同，web装配进度条；UI FileUpload可注入请求且显式上传 | 无业务API、默认凭据/刷新地址、自动重放写操作；技能页文件选择仅写草稿，预览/信任/保存独立 |
| 8 精简测试与规则 | 删除6个已移除演示/模式及重复SSR测试文件及旧布局/本地看板/Mock专用用例，Mock测试迁回所属包；保留授权/UNKNOWN/取消/去重/恢复/迟到响应保护；新增传输/上传/独立服务/架构边界的行为验证 | 测试守卫保留；最终149文件921项通过，0失败/跳过；typecheck/build/architecture及受影响格式/lint/新增样式检查通过，详见本节证据README，不把旧通过结果称为本轮重跑 |
| 相邻问题修复 | ref.value决定规则复制路径；资料放弃真正恢复baseline；保存事件仅刷新父级概览，清除重复刷新重置确认框竞态 | 沿用一个保存/读回合同，无旧兼容分支；本轮无需Java或数据库迁移 |

<a id="conversation-optimization"></a>

### 会话结构与产品展示优化（2026-11-10，已纳入本批提交）

前一批会话/上下文范围的历史记录（不覆盖本次全站目标4～8）；[当前恢复合同](../decisions/chat-engineering-task-slice.md#会话失效与显式重试当前合同2026-11-10)和[证据／命令](../../frontend/apps/web/__tests__/browser/artifacts/conversation-optimization/README.md)。此处为实施阶段验证快照；对应实现已纳入本批提交，不重跑原外部模型交付。

| 目标 | 当前实现与证据 | 边界 |
|---|---|---|
| 会话及上下文流程 | 只读重查／明确恢复／普通换模／当前草稿重试分工；恢复与绑定合为一次严格请求，拒绝先于注册表变化；历史启动读取3次→1次，100个连续delta仅1次检查点写入；草稿／终态／页面生命周期flush；重复依赖／清理快照不重写 | 无跨请求授权缓存，无历史自动重放；最近一个150ms流式展示检查点不是独立执行证据 |
| 减少重复 | chatHistory负责存储，applyBinding负责本地绑定投影，后端updateBinding负责清理／发布；模型授权只读取同一连接文档；恢复响应共享类型；摘要及上下文提取Chat域组件 | 保留敏感清理与文件保存的同步安全边界，不引入异步双写机制 |
| Java import | 118个生产Java文件变化；113个import整理通过代码token和原始字面量／注释等价核对；5个逻辑文件单独验证 | 同名类型冲突仍可必要限定；reactor生产及测试编译通过 |
| 产品展示 | 上下文、附件、来源、原始诊断及检查设置默认收起；正常任务摘要、单一预览入口、真实检查状态；无明细不显示完整通过，人工验收独立 | 复用@eap/ui；不是全站历史文案重写或用户产品接受 |
| 验证 | 后端12类55项；前端74文件461项，末次异步保护4文件78项；真实HTTP6组、浏览器中英2组，3种宽度无横溢；typecheck/build/architecture及目标格式/lint通过 | 单元测试网络守卫保留；完整根格式及stylelint存量治理未重跑、不宣称全绿；外部模型0次 |

<a id="state-i18n-audit"></a>

### 分域状态与后端中英文错误合同（2026-11-10，已批准集中实施，已纳入本批提交）

[实施合同与边界](../decisions/domain-status-and-backend-i18n.md)；[验证命令及限制](../records/delivery-history.md#domain-status-i18n)；[当前源码对齐](../../frontend/apps/web/__tests__/browser/artifacts/status-i18n/source-contract-check.json)。原[审计扫描](../audits/state-i18n-audit-2026-11-10.json)保留为实施前历史快照，311/137及224码等数字不是当前实现规模。

| 范围 | 已完成实现和验证 | 明确边界 |
|---|---|---|
| 分域状态 | 16组Java wire枚举与前端as const逐值核对；复用CliExecution；工具/Mission/候选/验证/看板/专家/Chat/连接/场景/Skill按职责归属；SQL绑定对应分类；非法值拒绝 | DTO/JDBC边界可保留String wire字段并由所属枚举严格校验；不是全部Java字段都改为enum。Mission UNKNOWN是观察投影，storedStatus和数据库终态独立 |
| 统一错误合同 | 23个分域错误目录516码，11组中英资源；ProblemResponses统一Advice/Filter/工具/Board/Skill出口，保留execution及清理标志；未分类错误安全脱敏 | code控制业务，detail展示；无code/detail双解析。内部诊断、命令输出、模型原文及历史执行证据不机械翻译；未扩成全站UI翻译工程 |
| 语言与Mock | Axios/专用实例/SSE共用当前locale；Accept-Language权重、变体及默认明确；SSE入口捕获locale，快照按查看语言重读；Mock包括异常出口返回当前合同 | 中英切换不写入持久状态；journal哈希不变；Mock仍明确模拟，无真实CLI/供应商完成声明 |
| 回归 | 前端149文件914项通过；后续变化14文件230项、请求中切换语言2文件61项及看板末次1文件14项通过；typecheck/build/architecture通过。后端普通跨模块首轮失败已修复，157项修复回归及55项后续回归通过；真实数据库9个用例中1项旧夹具修复后单项补跑通过 | 沿用未变化模块通过结果，未重复此前真实模型交付。环境门控的其余集成用例未全部启用；完整check格式及stylelint存量问题单列，不宣称全部工程检查通过 |
| 真实整链 | full装配+自有schema/工作区：HTTP12组、Chromium中英2组、真实JDBC核对；基线冲突/UNKNOWN阻塞/存储失败/撤权/过期/非法UUID/Filter/SSE/人工关闭去重；2次确定性失败provider调用，外部模型0次 | 确定性时钟/provider/数据库失败注入在测试夹具，生产代码无QA入口；技术验证不是用户产品接受 |
| 数据库与进程 | V33/V34及原页面交付证据hash保留；开发库及自有schema的V35列注释已核对；8080现有IDE full实际中英文请求通过，独立页面交付jar宿主恢复并验证 | V35仅补companion_sources注释，不修改已应用迁移或新增兼容分支。8080不是本轮新jar进程，不能用旧健康响应当新启动证据 |

<a id="component-page-delivery-validation"></a>

### 有界组件图与完整证据页面（2026-11-10，接续2450bf2，已纳入本批提交）

[合同、命令和失败过程](../records/delivery-history.md#component-page-delivery)；[5组真实页面结果](../../frontend/apps/web/__tests__/browser/artifacts/component-page-delivery/result.json)；[JDBC逐文件核对](../../frontend/apps/web/__tests__/browser/artifacts/component-page-delivery/database-verification.json)。

| 范围 | 实现及实际证据 | 边界 |
|---|---|---|
| 先行提交 | 2450bf2已推送，HEAD/origin/main/远端main一致；沿用上一批后端4/前端45/浏览器6组结果，未重跑测试/构建/模型 | 阶段新增已纳入本批主工作区提交；隔离验收提交本身不推送到main |
| 统一合同 | targetPath入口＋componentPaths最多7个；全部完整源码/哈希随Task/原型快照在模型前保存；单个24KB、合计48KB；返回精确1～8文件集合及顺序 | 单文件是空companions的同一叶子合同；当前JSON/DTO必填companionFiles，无旧格式回读兜底 |
| 静态图 | 多文件限定frontend内Vue/TS/JS，显式相对引用、入口连通、无循环；仅四个公共包，未声明/动态引用及不支持的import/re-export语法拒绝 | 有界静态ES子集，不是完整TS/Vue编译器，不推断路由/资源/动态模块 |
| 受控应用/归因 | 全集合预检→暂存→再核基线→逐文件替换→全读回；目录paths/fileCount、审阅及交付逐项核对原快照、APPLIED文件集合与独立验证hash | 同一CodeChangeService/持久状态/任务工作区锁；可能有副作用后的失败保留UNKNOWN/APPLYING并阻塞，不自动回滚他人源码 |
| 实际页面 | 真实模型生成Panel/Summary/model三个关联源码，任务候选页显示全量新增/修改计数、筛选、选中详情、完整正文/基线/UTF8字节与空态；公共控件复用@eap/ui | 只读展示；应用/独立验证/决定仍明确操作；未新建UI包/执行器 |
| 数据库 | 正式full实际执行V33（伴随完整源码/候选计数）及V34（替换Board交付旧单文件CHECK），34份Flyway validate通过 | V33旧叶子一次性补空元数据，不虚构内容/归因；已应用迁移未重写，无clean/repair/baseline |
| 新后端定向 | ComponentTaskContextTest 1、ComponentGraphDeliveryTest 2、ComponentDeliveryConstraintTest 1通过/0跳过；其余恢复回归沿用已通过1项 | 实库自有schema迁移；覆盖漏文件/断图/循环/未声明/动态引用、伴随基线冲突、数据库结果中断UNKNOWN、V33拒绝→V34接受三文件且错误Task/9文件仍拒绝 |
| 独立验证 | 仅一次正式验证：typecheck PASSED、147测试文件906项 PASSED、build PASSED，全部exit0及进程树清理true，710文件验证前后source完全一致 | V34仅修后端DB约束，恢复提交复用同一已通过验证，没有重复模型或前端全测；保留原chunk警告 |
| 正式浏览器/JDBC | 无Chat历史任务页审3份真实Diff→确认apply全部读回；筛选/选择/空态；Run→选择服务端paths3→CHAT_APPLIED_PREBOUND→显式技术ACCEPT；重复决定幂等/第二决定409/刷新只读 | 模型1次36.76s，1 Generation/1 Proposal；原task r2、提交r3、决定done/r4；0pageerror/0外部网络；代理技术核验不是用户产品接受 |
| 主工作区质量收尾 | 三个真实模型文件按精确应用hash导回，再仅做格式/CSS顺序及Button显式class规范化，差异另存；规范化后新面板2项通过；实际390px撑宽修复后1440/390页面通过，工程检查见主题记录 | 正式交付原hash/完整候选/隔离源码不变；主工作区最终hash独立列示，不冒充与已交付字节完全相同 |
| 后续关口（原阶段快照） | 任意复杂页面、跨路由/资源图、完整设计交互及用户产品接受；源码UNKNOWN已接续到[本轮核对](#source-write-review-validation) | 当前限定图与只读页面实链通过不关闭整个PB/RK/PL/SC |

<a id="board-code-recovery-validation"></a>

### 任务持久源码候选与正式重启恢复（2026-11-10，已随2450bf2提交；以下为原阶段证据）

[合同、命令和失败过程](../records/delivery-history.md#board-code-recovery)；[6组正式页面结果](../../frontend/apps/web/__tests__/browser/artifacts/board-code-recovery/result.json)；[JDBC独立回读](../../frontend/apps/web/__tests__/browser/artifacts/board-code-recovery/database-verification.json)。

| 范围 | 实现及实际证据 | 边界 |
|---|---|---|
| 先行提交 | b9a9b12提交推送42文件，HEAD/origin/main/远端一致；沿用后端4/前端37/正式897项与4组旧结果，未重复测试 | 暂存展示patch混入CRCRLF，只将可读diff按LF重建；原候选JSON/源码/哈希不改 |
| 持久恢复入口 | GET任务code-proposals目录/详情，项目/Task/操作者/当前进程工作区隔离；最多20条/截断，可查看原revision；无需Chat注册表/本地历史 | 无新表/迁移；code_generation/code_proposal仍唯一权威；任务目录不替代源码/Task应用校验 |
| 明确动作 | task侧apply/refuse要求精确project/current revision/confirmed=true，conversation由服务端原始记录推导；apply复用CodeChangeService及原claim锁/源码基线/读回；旧任务版本不能应用但可明确拒绝 | APPLIED只读/幂等；READ_ONLY403、UNKNOWN/APPLYING互锁不释放，无盲目重试、重连或重新生成 |
| 页面/共享落点 | 任务详情新增源码候选页签，明确读取→原Task/原型生成快照→Monaco Diff→确认应用或二次确认拒绝；失败旧快照禁写、迟到请求隔离、在途关闭/Run阻止 | GenerationBaseline/ProposalApplication移到components供Chat和Board复用，删旧文件无转发壳；public UI继续复用@eap/ui，无第二应用面板实现 |
| 后端新定向 | BoardCodeProposalRecoveryTest/ControllerTest/FullApplicationCompositionTest共4项通过/0跳过；UUID自有schema真实V1～V32、文件与JDBC；重建service无Chat也能读取应用，隔离/只读/旧revision拒绝、REFUSED重放/UNKNOWN阻塞 | 测试只删除自有schema，不建/删数据库；不是新模型效果验证 |
| 前端新定向 | 5文件45项通过（候选/共享应用/生成快照23项，受影响看板/Mock22项）；复核5项覆盖每次独立JSON对象回读不循环、列表状态同步、丢响应核对及旧版本拒绝 | 重叠17/5项重跑不累加；共享面板由数组watch改稳定身份key，真实浏览器先发现循环读取后修复 |
| 正式重启 | 真实主full及隔离full JVM重建，原模型Chat返回404；原真实候选仍APPLIED且generation/hash保持，任务接口可读 | 主PID8824/8080，隔离PID40872/54445健康；32份迁移未变，无repair/clean/baseline，不复活Chat |
| 浏览器/JDBC | 全新存储生产App6组、0pageerror/0外呼/0模型：真Monaco、确认后真实文件写入并丢弃POST响应→GET恢复、刷新APPLIED、readonly403/旧revision409、明确REFUSED、跨Task/project/workspace404 | 新待应用/只读/旧版本为明确确定性夹具，非真实模型；原真实模型已应用记录只读核对。1次浏览器apply、1次refuse，3任务仍ready/r1/r1/r2，未接受交付 |
| 工程检查 | typecheck/architecture/build通过；相关TS/Vue及浏览器脚本format/lint通过，新组件stylelint通过；保留大chunk提示 | 不重跑上一批897项或真实模型；变动涉及的新定向独立执行，无全stylelint/平台穷举声明 |
| 后续关口 | 候选恢复不等于恢复模型记忆、流式事件、在途进程或UNKNOWN人工解除 | 复杂页面、多文件、UNKNOWN人工处置及用户产品接受独立，不重复新增注册表/执行机制 |

<a id="prebound-page-delivery-validation"></a>

### PREBOUND真实单文件页面交付（2026-11-10，已随b9a9b12提交；以下为原阶段证据）

[合同、命令与失败过程](../records/delivery-history.md#prebound-page-delivery)；[4组正式页面结果](../../frontend/apps/web/__tests__/browser/artifacts/prebound-page-delivery/result.json)；[JDBC独立回读](../../frontend/apps/web/__tests__/browser/artifacts/prebound-page-delivery/database-verification.json)。

| 范围 | 实现与实际验证 | 边界 |
|---|---|---|
| 真实阻断修复 | V16的生成快照约束仍要求已删除buttonPresses/interaction；V32直接替换为requestId及语义原型合同，拒绝旧字段，不改V16/V30/V31 | 开发库迁移前绑定快照0行，无旧数据补字段/转换；V32正式checksum=753706238，32份Flyway validate通过 |
| 前后端交付入口 | GET delivery/applications按原Run任务版本/项目/工作区/操作者筛选APPLIED PREBOUND，最多20条并报告截断，无源码正文；页面明确读取/选择后填原会话、候选和单路径，失败旧快照禁选/迟到响应失效 | 目录只提供发现，不替代submit/decide的源码、时间、原型、任务及独立验证核对；EXTERNAL_MANUAL/POST_HOC是现有不同业务来源，不是旧兼容入口 |
| 真实候选 | 已配置gpt-6.1-sol/Responses仅1次模型请求，18.21秒；生成前持久task r2/语义原型/完整目标源码，返回唯一GenerationBaseline.vue候选，生成阶段文件未改 | 外部模型输出先审diff；无工具/其他文件/自动应用。真实模型负责生成，Git Run只负责只读检查 |
| 实际页面改进 | 折叠标题显示生成前绑定Badge，展开提示应用后还需独立验证及明确决定；无绑定不显示PREBOUND归因。生产App页面确认后应用，原意图/结果/重复请求保持同hash | 模型精确应用后的文件hash d3fd0494…已带回主工作区；无额外授权、导航、请求或自动接受 |
| 正式独立验证 | 隔离EAP工作树、真正full Boot jar/原开发库/原模型配置；真实Git Run SUCCEEDED/0；原生vp依次typecheck/test/build均PASSED、exit0、清理true，682文件源码前后快照相同 | 唯一一次完整验证：145文件897项通过，58.04秒；不把输出截断当零告警，不宣称OS沙箱；依赖预先离线安装 |
| 交付与决定 | 生产看板选择服务端应用证据→提交CHAT_APPLIED_PREBOUND→显式勾选/确认技术ACCEPT→task done/r4；缺人工声明400、重复决定幂等、第二决定409、刷新恢复证据 | 操作说明明确Automated technical ACCEPT，不是用户产品接受；原任务版本r2、提交后r3、最终r4分别保留，无源码重写 |
| 新定向回归 | 后端2类4项通过/0跳过（含真实V31拒绝→V32→PREBOUND应用及目录隔离/截断）；前端3文件37项通过（4+27+6，集合分阶段不重复累加） | 首轮root导入因CRLF/LF保护停止及Teleport定位失败，修正后失败2文件33项通过；非业务门禁放宽 |
| 工程检查 | 主工作区typecheck/architecture通过；11个TS/Vue/浏览器脚本格式/lint通过；模型文件仅check不重写；新候选组件stylelint通过 | BoardRunDelivery和GenerationBaseline样式与HEAD完全相同，扩展stylelint的13项旧问题保留；未称全stylelint通过；build大chunk及i18n/networkGuard既有诊断保留 |
| 证据与资源 | 4组真实生产App/JDBC检查，0pageerror/0浏览器外呼；JDBC确认1 generation/1 proposal、正确绑定、hash和时间顺序、3项检查及决定。主8080和隔离正式宿主健康，浏览器/Vite已关闭 | 后端这1次真实模型外呼独立记录；隔离工作树及宿主保留便于核对，未提交main或推送，无数据库clean/repair/baseline |
| 剩余关口 | 本轮覆盖已有组件的单文件实际改页，不关闭整项PB/RK、复杂页面、多文件图约束、UNKNOWN人工恢复、用户交互及最终产品接受 | 后续按目标需求批量推进，不新造执行器或兼容机制 |

<a id="publication-recovery-validation"></a>

### 正式开发库迁移与发布响应恢复（2026-11-10，已随edada58提交；以下为V31阶段快照）

[实现、失败过程及命令](../records/architecture-history.md#publication-recovery)；[正式V30页面结果](../../frontend/apps/web/__tests__/browser/artifacts/full-current-contract/result.json)；[V31恢复整链](../../frontend/apps/web/__tests__/browser/artifacts/prototype-publication-recovery/result.json)；[独立数据库回读](../../frontend/apps/web/__tests__/browser/artifacts/prototype-publication-recovery/database-verification.json)。

| 范围 | 本批实际结果 | 边界 |
|---|---|---|
| 提交推送 | 原179文件提交1ce0c4b，HEAD/origin/main/远端main一致；差异、UTF-8、链接和有限敏感模式通过 | 本次发布恢复随提交交付，沿用下列已记录结果；仅复核差异、编码、链接与敏感模式，不重跑测试 |
| 旧原型处置 | 唯一非语义版本6b8dcc1f…备份后删除；旧测试Run快照删除1行，任务清关联并revision 2→3；原SUCCEEDED执行保留；其他表数量/摘要不变 | 仅该记录及两处引用，未清库/重置；原始备份留忽略的backend/target/development-v30-transition |
| 正式迁移 | 正式Boot jar执行V30 checksum=-1792803472、V31 checksum=-2146259443；31份Flyway validate通过，原记录/快照引用0 | 无clean/repair/baseline；V31为合规版本一次性分配request_id，不改正文/hash/创建时间，不恢复旧语义 |
| 正式V30整链 | 5组：真实生产App设计/HTTP发布/JDBC回读/交互预览、停用刷新重启草稿及版本保留、场景依赖、真实Git status/diff幂等及旧URL404、固定SQL专家 | 正式main与真实应用库，无测试Host/模型替身；SQL明确不增强模型；0pageerror/0外呼；不是用户人工接受 |
| 发布唯一契约 | requestId必填；唯一索引与冲突回读确保同身份同内容同版本，异内容409；GET publication只读核对，不存在404，缺身份400；同步client/Mock/全部调用方 | 不保留旧无身份入口/默认ID；显式新身份仍可发布新版本 |
| 前端恢复 | 按A/B持久保存冻结请求，发请求前存储读回；未知时阻止新发布/停用/替换文档；刷新不重发，显式查到原版本或404后显式原内容重试，后续编辑保留 | 浏览器本地证据不是服务器第二份发布状态；损坏/不可写存储阻塞并提示，不自动丢弃 |
| 新增定向 | 后端2类6项通过/0跳过；前端3文件9项通过；12个TS/Vue格式和lint、1个Vue stylelint、typecheck/architecture/build通过 | 不重跑旧260/250等集合；build仍有大chunk提示；其他旧测试仅同步当前必填签名并编译 |
| V31真实整链 | 3组：提交响应丢失→刷新→显式查询；发送前中断→404→保留新编辑的原请求重试；12并发同身份唯一版本、冲突409/缺身份400/GET不写；JDBC逐身份仅1行、原版本hash不变 | 断网由浏览器拦截控制，后端为真实正式服务/JDBC；0pageerror/0外呼；保留脚本失败过程 |
| 当前宿主 | 真正com.lh.eap.EapApplication可执行jar，PID36288，8080 health=200，EAP_WORKSPACE/EAP_AUTHORIZED_ROOT明确绑定本仓库 | JVM启动参数无测试故障注入；本地进程/日志留backend/target/full-application-live；不是IDEA调试启动 |
| 未关闭项 | 真实模型源码交付、完整页面交付及用户产品接受仍独立 | 下一批按既有PREBOUND/候选/受控应用/独立验证/人工决定集中推进，不新增兼容路径 |

<a id="single-contract-validation"></a>

### 五组非需求双轨集中收敛（2026-11-10，已提交推送1ce0c4b）

[实现记录与失败边界](../records/architecture-history.md#single-contract-convergence)；[机器证据及截图](../../frontend/apps/web/__tests__/browser/artifacts/single-contract-convergence/result.json)。该批与PL-02/SC-03已提交推送；下列旧测试结果沿用，当前正式库接续见上表。

| 范围 | 实现与实际验证 | 剩余边界 |
|---|---|---|
| 授权配置 | full/starter统一runtime授权键；构造调用方/配置/文档同步；旧键无效、空配置共置、显式无效拒绝均验证 | 不是新增远端授权或放宽父目录 |
| CLI程序绑定 | cli_channel列改program_id并加程序FK，读写/删除/目录同步；删除旧键回读和冲突机制，清除不会复活旧操作绑定 | V30拒绝未登记/旧操作键，实库预检此类0行 |
| 专家 | 行为版本/steps/edges显式必填，定义/保存/执行/内置种子/SDK/编辑器统一；无自动补绑定、旧编辑器SQL保留或旧图转换 | 固定DAG与Agent业务模式保留；实库自定义专家预检不合规0行 |
| 语义版本 | Builder旧演示/计数配置/发布入口删除；HTTP/DTO/表移除按钮计数/固定交互，前后端校验语义与映射；异步版本切换保护保留 | 交付单不等于源码生成/执行；旧非语义版本不自动迁成设计 |
| Git入口 | 同步invoke服务/controller/装配/client/Mock全部删除；目录统一持久start/get/cancel/核对；真实旧URL404，status/diff同requestId返回原执行 | 不新增执行器；39项执行回归及5项HTTP覆盖UNKNOWN等边界 |
| 后端定向 | 多组成功结果按类去重42报告288项：260通过、28环境门控跳过，0失败/错误；模块clean/test-compile与最小/完整组合通过 | 不是一次全量reactor结果；28项旧实库门控未启用，新持久合同由独立schema真实整链验证 |
| 前端定向 | 39文件250项通过；SDK与简化model另2文件4项通过（model重叠）；56个TS/Vue格式和lint、3个相关Vue样式检查通过；typecheck/architecture/build通过；末次Schema/SDK两文件9项通过（重叠） | 不累加重叠集合；构建保留大chunk提示；原有全量/无关页面stylelint未重跑 |
| 真实整链 | SingleContractAcceptanceTest与DesignerLifecycleAcceptanceTest共2项通过/0跳过；真实V1～V30 Flyway/PostgreSQL/HTTP/Git，以及7组Chromium/GrapesJS检查；原Git索引/文件、应用记录保持，独立schema/宿主/浏览器清理 | 临时宿主使用生产controller/service/store与无模型测试组合；响应延迟、关系改名、Host激活失败为测试控制；没有模型/源码写入 |
| 日常库预检（迁移前历史） | 当时V29、非语义原型1，migrationReady=false | 已按本次授权备份并清理精确引用，正式宿主成功迁移V30及V31；当前结果见上表 |

<a id="development-dual-path-validation"></a>

### 开发阶段演进规则与双轨排查（首次排查历史快照，五组现状见上）

详见[架构审计](../records/architecture-history.md#development-dual-path-audit)。本次是规则落地及相关源码排查，不替代PL-02/SC-03原有整链证据。

| 范围 | 本次结果 | 边界与后续 |
|---|---|---|
| 仓库规则 | 根AGENTS明确兼容须有当前需求依据，允许授权范围内必要破坏性重构；同一职责一个权威状态源/契约/生产路径，替换同步清理调用方、测试、文档 | 不扩大数据操作授权，不覆盖已有未提交改动；合理分层、显式Mock、外部协议适配单独判断 |
| 已清理 | 桌面桥只读window.eap，删除eapDesktop及废弃类型别名；原型保存不再将旧当前快照补入历史或生成legacy-snapshot | 未引入替代兼容机制；正常草稿/本地历史/不可变发布版本职责保留 |
| 确认待收敛 | 工作区授权双配置键、CLI程序/旧操作绑定、专家显式行为/隐式默认、Builder语义设计/旧计数发布、Git持久操作/旧同步invoke，共5组 | 源码可达证据，未查询实际库中旧行；后续按授权配置与CLI→专家→Builder→invoke整体收敛 |
| 本次验证 | 5文件30项定向测试、typecheck、preload合同、check:architecture通过；5个受影响TS文件lint/格式检查通过 | 首轮格式检查发现3文件问题，格式化后通过；未重跑旧完整套件、Maven或真实数据库/浏览器整链 |
| 文件检查 | 变更文本UTF-8无BOM、Markdown本地链接/锚点及git diff --check核对 | 规则和审计不代表所有遗留已消除；没有提交、推送或修改数据库 |

<a id="designer-scenario-validation"></a>
### PL-02 / SC-03 设计器贡献与场景依赖原阶段证据（2026-11-10，历史快照；后随1ce0c4b提交）

以下为V30收敛之前的PL-02阶段证据；“无迁移/LIKE三表/56文件”等仅代表当时快照。当前迁移、夹具与实际结果以上述五组收敛表为准。结果与截图见[摘要](../../frontend/apps/web/__tests__/browser/artifacts/designer-scenario-lifecycle/result.json)，实现/失败/命令见[主题记录](../records/frontend-history.md#designer-scenario-lifecycle)。

| 检查 | 本批实际结果 | 边界 |
|---|---|---|
| 提交/推送 | PL-01共34文件提交fe08a99并推送，本地/远端一致；仅做差异/编码/敏感检查，沿用已有测试结果 | 没有重复运行PL-01测试；本批新增纳入本批提交 |
| PL-02生命周期 | 设计器贡献依赖/显式服务观测/缺失提示；A/B停用前保存恢复草稿并确认，发布或存储未确认阻止停用；销毁画布/观察结果，启用重建且保留独立草稿/本地历史/服务器版本；激活错误按插件隔离 | 复用Host/PluginSlot/Builder/GrapesJS，无新SDK/能力注册表；本地草稿不是已发布版本，不自动发布/取消/执行 |
| 开发阶段调整 | 停止读取/迁移旧全局草稿；ScenarioWorkspace只接受实际Host，移除独立启用布尔值；删除编辑器失败时合成占位设计保存的逻辑；关闭GrapesJS遥测 | 不保留兼容双轨；数据库结构无需改变，本批无迁移；真实设计器不可用即禁用编辑/保存/发布 |
| SC-03前后端 | GET /api/scenarios/workflows/prototype-to-code/dependencies返回固定可信插件/服务/资源合同与版本总数；必需设计器及版本服务/资源，可选看板；503为可用性未知，旧快照保留；副本保留workflow、revision保存/读回 | 声明与观测不授予权限；客户端标签installed不能绕过Host/服务检查；既有仓库、模型、验证门禁保留；核心版本API不受UI停用控制 |
| 真实整链 | 最终31模块SUCCESS、1项门控整链通过/0跳过、7组Chromium检查；真实GrapesJS编辑→HTTP/JDBC发布2版本→发布响应等待时拒绝停用→A/B未发布草稿→停用/刷新/激活失败/重建恢复→实库关系故障/修复→副本配置保存 | 3张UUID自有表LIKE INCLUDING ALL，检查/默认/索引保留、不复制FK/触发器；延迟响应和表重命名只在测试宿主/schema；本地激活失败为明确注入；非正式full启动、迁移重跑或模型改页 |
| 请求/数据 | 最终0pageerror、0外呼，仅2次版本POST+1次场景PUT；原版本ID/hash保持，JDBC确认每实例1版本、1场景、0交付单，应用3表完整数量/摘要不变 | 没有自动发布、重复请求、源码写入或后台任务；早期多出的写请求后关闭默认遥测并收口出站审计 |
| 后端配套 | 服务4、HTTP3、原版本HTTP1、模块边界8、完整组合2，共18项通过/0跳过 | 配套在第3次尝试通过；其中整链当时失败，保留该reactor失败。之后仅复验失败整链，最终第6次单项SUCCESS，不合称一次19项reactor成功 |
| 前端回归 | 受影响49文件282项通过；后续16文件66项通过；末次激活并存隔离12文件38项、文档替换保护4文件9项、观测原因/刷新保护3文件9项通过；最终typecheck/build/architecture通过 | 集合有重叠不累加；真实整链证据保留第6次，最后两项局部加固采用对应回归，没有为刷新数字重复全量/整链 |
| 静态检查 | 36个前端文件lint、35目标格式与5个设计器相关Vue stylelint通过；两个既有页面的扩展stylelint未通过 | ScenarioWorkspace既有82项，ChatWorkspace既有selector解析TypeError；HEAD相同样式已复现，两个页面CSS内容未变，不改检查白名单；未重跑旧全量，保留新定向证据 |
| 文件/VCS | 56个实际变更文件：53文本UTF-8无BOM/无替换字符、3截图；234处本地文档链接/锚点、3类有限敏感模式及差异空白通过 | HEAD/origin/main/远端保持fe08a99；本批新增纳入本批提交，无临时schema/宿主或5187监听 |
| 资源 | 6次尝试会话均记录自有schema删除、应用记录不变、host/browser停止；独立只读JDBC无自有schema/连接，原3条工具记录摘要保持，29份应用迁移未改 | 正式full未启停；浏览器存储配额/损坏、其他平台、完整用户接受与真实代码交付独立 |

<a id="board-runtime-validation"></a>
### PL-01 项目观测、在途停用与恢复（历史阶段fe08a99，2026-11-10，已提交推送）

集中完成前后端及真实核心生命周期，结果和截图见[摘要](../../frontend/apps/web/__tests__/browser/artifacts/board-runtime-lifecycle/result.json)，命令及范围见[主题记录](../records/frontend-history.md#board-runtime-lifecycle)。

| 检查 | 本轮实际结果 | 边界 |
|---|---|---|
| 提交/推送 | 上一批28文件已提交ed84ab9818b520cf460005439042cede5cf018b4并推送，HEAD/origin/main/远端main一致 | 本轮PL-01新增工作区按本次用户授权提交并推送，不覆盖上一批证据 |
| 后端观测 | GET /api/board/runtime按非空且≤120字符项目精确聚合；单SQL语句快照；完整Task/Run计数及Run/验证/写入在途/未知数；UNKNOWN优先、最多20条标识及truncated | 核心只读，无执行器探测/调度/删除/授权/UNKNOWN关闭；保留storedStatus，不建第二状态机，不返回路径/正文/输出 |
| 前端生命周期 | 显式检查/重复去重/离页abort与晚结果隔离；失败保留旧快照并标识；停用确认/取消、本地保存失败回滚、停用仍可检查、刷新保持停用和重启用恢复原记录 | 复用@eap/ui ConfirmBox/Feedback/Collapse；plugins为L4，DTO在runtime-client，无新包；不自动重新执行或取消核心工作 |
| 真实整链 | 31模块SUCCESS，12项全部通过、0跳过；6组真实Chromium检查、0pageerror/0浏览器写请求；实际Git Run在停用期间完成SUCCEEDED/0，取消意图false、输出与退出证据可读，唯一原Run保持 | 真实HTTP/PostgreSQL与生产组件；执行器started回调测试门锁只延缓收集，Git命令/生产执行与持久化复用，非正式full宿主实启动 |
| 持久投影矩阵 | 26Run：1在途+25因unconfirmed_reason展示未知；验证/写入分别1在途+1未知；20标识及truncated；其他项目0；读前后表摘要不变 | 这部分是约束内持久夹具，无真实验证/写进程；7表LIKE INCLUDING ALL复制检查/默认/索引，不复制FK/触发器，不等于重跑迁移 |
| 前端回归 | 全量139文件872项通过；typecheck/build/check:architecture及目标lint/stylelint通过；已查看390px停用在途/未知列表，1440/900/390无横溢 | 首轮新增测试曾2失败，修正不存在的spy与ConfirmBox API后通过；保留既有网络保护/Node localStorage/大chunk提示；不等于用户接受 |
| 后端完整离线 | 32模块SUCCESS，165报告978项：865通过、113门控跳过，0失败/错误，5分38秒；新增正式组合Bean断言通过 | 子进程关闭全部EAP_RUN_*门控；与已实测12项分列，不把门控跳过当通过 |
| 资源/数据 | 两次整链自有schema已删、7张应用表全行count/hash不变；最终记录Git捕获身份已退出、测试host/browser停止；独立只读JDBC无自有schema/连接，应用3条工具记录摘要不变 | 正式full-application未启停；现有29份迁移不变；不根据PID缺失生成业务终态 |
| 文件/VCS | 34个实际变更文件：31文本UTF-8无BOM/无替换字符、3截图；222处本地文档链接/锚点、3类有限敏感模式、差异空白及15个前端目标文件格式通过；远端main再次读回ed84ab9 | 上一批已推送；本轮PL-01新增代码、测试、证据及主方案/台账/决定等文档按本次授权提交推送；不存在fixture JVM或5187监听 |
| 剩余关口 | PL-01用户产品接受、其他核心服务/平台异常独立；下一批PL-02/SC-03与TC-02既有实例能力协调 | 工具异常转维护回归，不以物理IO/跨平台穷举阻塞其余产品功能；无通用插件SDK/外部安装器 |

<a id="tool-execution-validation"></a>
### 数据库写入与授权失效恢复整组交付（历史阶段ed84ab9，2026-11-10，已提交推送）

按用户集中推进要求，终态/人工核对审计写入、工作区/程序失效及后端校验/前端交互一起交付。结果与6张截图见[摘要](../../frontend/apps/web/__tests__/browser/artifacts/git-database-authorization-recovery/result.json)，完整失败与命令见[主题记录](../records/backend-composition-history.md#git-database-authorization-recovery)。

| 检查 | 本轮实际结果 | 边界 |
|---|---|---|
| 提交/推送 | fef287f已推送，本地/远端一致，提交后工作树干净 | 本轮新增改动按本次用户授权提交并推送 |
| 后端恢复能力 | 只读readiness区分工作区可访问/执行授权/阻塞；每个Git阶段启动前重新校验；应用服务归一化事务异常，HTTP稳定503/TOOL_EXECUTION_STORE_UNAVAILABLE | 不授予权限/修改审计/接管PID，保留已完成步骤；后续拒绝用NO_FURTHER_PROCESS_STARTED |
| 前端恢复能力 | 存储/工作区/停用/绑定分原因指引；保留输入/原请求，修复后显式查询；补读20条历史之外的阻塞；核对响应校验记录/操作/原请求审计身份 | L4原位、DTO在runtime-client、复用@eap/ui，无新共享类别；新前后端版本需配套更新 |
| 数据库边界 | 两操作×终态/审计提交前后共8场景，按PID及自有schema application_name核对后终止测试PG连接，实际57P01/08006 | 提交前回滚保持UNKNOWN；提交后SUCCEEDED/CLOSED_UNKNOWN保持。后置故障在实际commit后、Spring返回前，不等于抓包级COMMIT确认丢失或全库断网 |
| 授权整链 | 两操作×工作区/绑定失效共4场景；工作区失效详情/核对403且输入保留；绑定失效允许历史核对，关闭后仍禁止新执行，修复查询后恢复 | 只动自有测试目录/绑定，不修改生产Git/授权；检查不变更UNKNOWN/原证据 |
| 新整链覆盖 | 12场景、84组真实浏览器检查最终通过，0pageerror；8场景首轮通过，4审计修复后重验通过 | 首轮/审计复验失败reactor独立记录，不能合称整个reactor成功；最终应用层归一化后的受影响4场景再验见下 |
| 前端验证 | 定向3文件69项、全量137文件855项通过；typecheck/build/architecture、目标lint/stylelint/7文件格式通过 | 已查看390px工作区不可访问/审计未确认，记录和输入保留；既有大chunk/网络防护/Node localStorage提示保留 |
| 最终后端定向 | 31模块SUCCESS，4报告56项全部通过/0跳过，4分31秒：服务39、HTTP5、模块边界8及真实审计4；最新审计28组浏览器检查通过 | 事务异常归一化已移到应用层，边界规则保持；与首批8个成功场景合计12个验收场景，不将早先失败reactor改称成功 |
| 最终完整离线 | 32模块SUCCESS，163报告976项：864通过、112门控跳过，0失败/错误，6分27秒 | 仅子进程关闭全部EAP_RUN_*门控；与12个真实场景/56项定向分别记录，首轮974项1边界失败保留 |
| 资源/迁移 | 当前12个成功摘要会话及全部20个尝试会话清理记录通过；独立只读JDBC确认无自有schema/测试数据库连接，原3条应用工具记录/摘要不变；无fixture JVM/5187监听 | 已应用迁移29份，V26～V29数据库/源码CRC一致；本轮未启停正式full-application，隔离宿主不等于完整装配启动 |
| 文件/VCS | 28文件：22文本UTF-8无BOM/无替换字符、6截图；201处本地文档目标/锚点、有限敏感模式及差异空白通过 | fef287f已推送；本轮新增代码、测试、证据与7份文档按本次用户授权提交并推送；剩余物理IO/全库分区/跨平台和用户接受独立，不阻塞其他产品批次 |

### 取消响应丢失、权限/IO异常UNKNOWN核对恢复（历史阶段fef287f，2026-11-10）

从已推送5e0ec5b接续。结果及4张截图见[矩阵摘要](../../frontend/apps/web/__tests__/browser/artifacts/git-cancel-permission-io/result.json)；完整命令、门控与复现过程见[主题记录](../records/backend-composition-history.md#git-cancel-permission-io-review)。

| 检查 | 本轮实际结果 | 边界 |
|---|---|---|
| 提交/推送 | 5e0ec5b08010d40aafed1e3a64385cfa6700d81f已推送，HEAD/origin/main/远端main一致；提交后工作树干净 | 提交的是上一轮18文件；本表接续改动按本次用户授权提交并推送 |
| 前端缺口复现/修复 | 取消响应丢失后仍可再次取消，两个操作组件回归先复现2失败/47通过；补按钮与事件入口uncertain守卫后49项通过 | 复用现有@eap/ui Button、L4业务状态及网络提示；保留后端取消幂等，不自动重提 |
| 真实矩阵 | 31模块闭包SUCCESS；6项全部通过、0跳过；status/diff × cancel-lost/permission/io，共50组真实Chromium检查、0pageerror，7分49秒 | 取消HTTP传输、实际Windows index ACL READ_DATA拒绝及NOSHARE_READ共享限制；不是物理磁盘损坏/其他OS验收 |
| 取消响应丢失 | 实际服务保存CANCELLING/cancelRequested后响应正文中断；取消POST仅1次，页面不确定态禁止取消/启动，显式重查恢复CANCELLING；随后结果保存中断、重启UNKNOWN核对/恢复通过 | 不能从客户端请求/网络中断推断CANCELLED；正常持久对照为CANCELLED/130，有退出证据 |
| 权限与IO | Java实际分别AccessDeniedException/FileSystemException，Git均FAILED/128且stderr指向index；workflow未保存结果时重启UNKNOWN；正常保存相同错误为FAILED/128并拒绝人工关闭，修复后SUCCEEDED | 仅自有index权限/句柄；原ACL/字节精确恢复，diff索引/三个工作文件字节及输出范围不变，未修改应用仓库/生产权限 |
| UNKNOWN整链 | 操作互锁/越操作拒绝、说明/勾选/二次确认、关闭响应丢失重查、原字段/JDBC/历史/重启审计均保持；六组正常终态对照及新请求恢复通过 | 完整树证明仍false，不从PID缺失补造退出；跨重启进程接管及产品用户接受独立 |
| 前端全量 | 137文件846项、面板49项通过；typecheck/build/check:architecture、目标lint/stylelint与3文件格式通过 | 已查看390px取消未确认及1440px重查CANCELLING，无横溢；既有网络防护/Node localStorage及大chunk提示保留 |
| 后端兼容定向 | 31模块闭包SUCCESS；10报告69项：67通过、2矩阵门控跳过，0失败/错误，3分09秒；原Java/status/diff三场景共19组真实浏览器检查通过 | 本轮6项已独立实测，前轮矩阵保留原证据；门控跳过不计作通过 |
| 后端完整离线 | 32模块SUCCESS；163报告961项：851通过、110门控跳过，0失败/错误，5分57秒 | 仅子进程关闭已有EAP_RUN_*及两个矩阵门控；与6项新实测、67项兼容实测分列 |
| 资源/迁移 | 九个成功会话cleanup均true；独立只读JDBC确认无自有UNKNOWN schema，应用原3条工具记录/摘要不变；无fixture JVM，5187已关闭，full-application保持未运行 | 29份已应用迁移，V26～V29源码CRC/数据库校验和一致，无迁移改动；自有index ACL/字节已恢复，句柄已释放 |
| 文件收尾 | 17文件：13文本UTF-8无BOM/无替换字符、4截图；196处本地文档目标/锚点、3类有限敏感模式及差异空白通过 | 5e0ec5b已推送；本轮接续代码、测试、证据及7份文档按本次用户授权提交并推送；物理IO/数据库写入中断、其他权限范围/平台及用户接受独立 |

### status/diff取消、超时及结果返回中断UNKNOWN恢复（历史阶段5e0ec5b，2026-11-10）

从已推送067c3d8接续；先提交旧切片，再验证六组真实矩阵，不复用历史测试数字。结果与4张截图见[矩阵摘要](../../frontend/apps/web/__tests__/browser/artifacts/git-interruption-unknown/result.json)，故障方式、失败和完整命令见[主题记录](../records/backend-composition-history.md#git-interruption-unknown-review)。

| 检查 | 本轮实际结果 | 边界 |
|---|---|---|
| 提交/推送 | 067c3d864cf065e1fd2acd9d3ce5be85f9d6c47e已推送，HEAD/origin/main/远端main一致；提交后工作树干净 | 提交的是上一轮19文件；本表接续新代码/测试/文档按本次用户授权提交并推送 |
| 真实矩阵 | 31模块闭包SUCCESS；6项全部通过、0跳过；status/diff × cancel/timeout/return，共44组实际Chromium检查，0pageerror，7分17秒 | 实际Git命令/环境与执行器实现；timeout仅目标使用测试专用1ns截止期，started等待不计入deadline，不证明默认20秒配置或所有OS平台 |
| UNKNOWN及取消意图 | 实际执行器CANCELLED/130、TIMED_OUT/124或SUCCEEDED/0均已观察退出/清理，但返回workflow前宿主中断；重启UNKNOWN、原步骤/输出/退出字段保留，取消请求仍true | 不能从外部已知退出或PID未找到补造业务终态；owner在途/同操作启动409、跨操作隔离、人工确认门禁仍生效 |
| 正常结果对照 | 六组结果正常返回后分别持久CANCELLED/130、TIMED_OUT/124或SUCCEEDED/0，有退出证据/无未知原因；resolve-unknown均409，新请求恢复SUCCEEDED | 与结果未持久化UNKNOWN独立；diff三组均核验恢复范围、index及工作文件字节不变，索引损坏对照FAILED/128并精确恢复 |
| 核对响应中断 | 六组真实200/CLOSED_UNKNOWN响应完整到达测试代理后，向页面发送实际响应头并中断body；页面暂停/禁止重复提交，核对POST仅1次，显式重查恢复CLOSED_UNKNOWN/原审计 | 非mock DTO；不新增产品故障接口，不改生产Origin；原取消意图关闭后仍显示，不升级为取消成功 |
| 前端 | 137文件844项及面板47项通过；typecheck/build/check:architecture、目标lint/stylelint和4文件格式通过 | L4原面板复用@eap/ui Feedback；中英i18n；已查看390px响应丢失/确认与1440px历史证据，三宽度无横溢；既有网络防护/Node localStorage及大chunk提示保留 |
| 后端兼容定向 | 31模块闭包SUCCESS；10报告68项：67通过、1矩阵门控跳过，0失败/错误，3分13秒；原Java7组/status6组/diff6组浏览器检查共19组、0pageerror | 本轮矩阵6项已独立实测通过，此处有意不重复六组；不把跳过计作通过 |
| 后端完整离线 | 32模块SUCCESS；163报告960项：851通过、109门控跳过，0失败/错误，6分08秒 | 仅子进程关闭全部已有EAP_RUN_*及新矩阵门控；与六组矩阵、67项兼容实测分列，不拼接覆盖率 |
| 资源/迁移 | 九组成功会话及首轮失败会话cleanup均true；独立只读SQL确认无自有UNKNOWN schema，应用原3条执行记录/摘要不变；无fixture JVM，5187已关闭，full-application仍未运行 | 已应用迁移29份；V26～V29源码CRC/数据库校验和一致，无迁移改动或应用clean/repair/baseline |
| 文件收尾 | 18文件：14文本UTF-8无BOM/无替换字符、4张截图；191处本地文档目标/锚点、3类有限敏感模式及差异空白通过 | 原067c3d8已推送；本轮接续代码、测试、证据和7份文档按本次用户授权提交并推送；用户产品接受及剩余平台/权限/IO矩阵独立 |

### 真实git-diff异常/恢复UNKNOWN核对与操作身份（历史阶段，067c3d8，2026-11-10）

从已推送47433d8接续；开始无EapApplication在运行，保留原启动状态。复用既有真实Git夹具/生产服务/面板，新增操作参数及diff门控，确认框显示操作名和稳定ID，证据见[本轮记录](../records/backend-composition-history.md#real-git-diff-unknown-review)。

| 检查 | 本轮实际结果 | 边界 |
|---|---|---|
| 前端首轮定向 | 面板1文件45项通过，两个操作均校验确认框名称与ID | 公共ConfirmBox、既有i18n标题与L4业务原位，无新UI类别 |
| diff异常首轮 | 门控验收清理辅助进程时失败；尚未走到页面 | 退出竞争MATCHING_EXITED及随后PID复用IDENTITY_MISMATCH，均未据此终止未知身份；修正测试清理后重跑，失败日志保留 |
| 最终定向/整链 | 31模块闭包SUCCESS；10报告67项全部通过、0跳过；Java7组、status6组、diff6组共19组真实浏览器检查，0pageerror | 跨操作详情/关闭404、requestId复用409、不完整确认400；UNKNOWN仅阻塞自身操作，其他操作实际成功；原字段/JDBC/重启读回不变 |
| diff异常/恢复 | 最终diff执行5e0ad68d-4e7f-4e28-bcfb-a1367a118796，实际Git异常exit1后在workflow返回前中断宿主，重启UNKNOWN并完成页面核对关闭/恢复 | 原Git命令/环境/执行器不变；独立OS审计不注入产品证据，完整树证明仍false |
| 明确失败对照/范围 | 损坏索引709f26bd-c6e3-4ea8-b7c6-42da9a76606c为FAILED/exit128/“进程树已清理”、无未知原因；恢复精确原index后944493a0-6c35-43ee-a019-24f27218ac02为SUCCEEDED | diff-scope四项true：未暂存标记存在、仅暂存/未跟踪排除、索引/三个工作文件字节保持；[结果与截图](../../frontend/apps/web/__tests__/browser/artifacts/real-git-diff-unknown/result.json)保留 |
| 前端最终 | 全量137文件842项、面板45项通过；typecheck/build/check:architecture、目标lint/stylelint及3文件格式检查通过 | 确认框显示本地化操作名及ID；已查看最终390px确认框及1440px历史证据展开，无横向溢出；既有大chunk/测试网络防护/Node localStorage提示保留 |
| 完整离线 | 32模块SUCCESS；163报告959项：851通过、108门控跳过，0失败/错误，5分29秒 | 仅该子进程关闭已有EAP_RUN_*及三项整链门控；与67项实测分列，日志/时间窗汇总backend/target/real-git-diff-unknown-offline-* |
| 资源/迁移 | 独立只读SQL确认最终三个自有schema已不存在；清理记录及应用工具记录摘要不变断言通过；无fixture JVM/5187监听，原full-application仍未运行 | 应用库29份已应用迁移、最新V29；V26～V29数据库和源码CRC一致，无迁移改动，不重用旧PID或擅自启动 |
| 文件收尾 | 19个变更文件，13个文本UTF-8无BOM、6张diff截图；182处本地文档目标/锚点、3类有限敏感模式与差异空白通过 | 当前改动按本次用户授权提交并推送，结果以Git回读为准，产品用户接受及其他异常矩阵独立 |

### 真实Git status异常UNKNOWN核对与关闭后原始证据（历史阶段，47433d8，2026-11-09）

先按用户授权提交并推送a641892956a845f1310c69f09cf69fa18bd0b2bd（23文件，feat: 验证受控 UNKNOWN 核对并支持历史执行详情），HEAD/origin/main/远端ref一致且工作树干净，再推进以下接续。证据见[本轮记录](../records/backend-composition-history.md#real-git-unknown-review)。

| 检查 | 本轮结果 | 边界 |
|---|---|---|
| 真实Git首轮 | 单独门控1项通过，实际Git异常exit1、退出/清理证据已由测试执行器观察；持久业务尚未收到结果时宿主中断，重启UNKNOWN整链6组真实浏览器断言通过、0pageerror | 原Git程序/参数/环境/DefaultProcessExecutor不变，外部OS审计与产品捕获证据分开；关闭不补造退出字段，精确自有schema/进程/宿主清理，应用记录摘要不变 |
| 前端 | 137文件842项通过；面板定向45项通过；typecheck/build/check:architecture、目标lint/stylelint与4文件格式检查通过 | UNKNOWN及CLOSED_UNKNOWN均只读展示原命令/步骤证据；关闭后不再出现核对表单，历史RUNNING明确不代表当前存活 |
| 最终定向/对照 | 31模块闭包SUCCESS；10报告66项全部通过、0跳过；含Java演练7组和真实Git6组实际浏览器检查，0pageerror | 真实Git异常exit1后丢失持久结果经UNKNOWN完整核对；索引损坏明确FAILED/exit128/进程树已清理且无未知原因，修复后SUCCEEDED。导入编译失败已修复，未将之前47项当成功 |
| 实测留存 | 最终真实Git执行2315f97c-ee0d-4b63-b491-3b99e44de604，关闭审计/JDBC/重启不变；[结果与截图](../../frontend/apps/web/__tests__/browser/artifacts/real-git-unknown/result.json) | 已查看最终1440px历史原证据展开和390px确认框；应用记录摘要不变、自有schema/宿主/进程清理通过 |
| 后端完整离线 | 32模块SUCCESS；163报告958项：851通过、107门控跳过，0失败/错误；6分21秒 | 仅该子进程关闭已有EAP_RUN_*及两项整链门控，与66项实测分列；日志/时间窗汇总backend/target/real-git-unknown-offline-* |
| 应用恢复/迁移 | 按原参数恢复full-application，PID41284，health=200/ok；29份迁移验证通过，无新迁移，V26～V29源码/数据库校验和一致 | 已有真实status记录不变，成功检查409、越操作404、恶意Origin403；无在途执行、测试fixture JVM或5187监听 |
| 文件收尾 | 20个变更文件（14文本/6截图），UTF-8无BOM；176处本地Markdown目标/锚点、3类有限敏感模式与差异空白检查通过 | 按本次授权提交；本次真实异常覆盖git-status，git-diff异常、其他故障矩阵与产品用户接受独立 |

### 受控异常UNKNOWN整链与历史执行详情（历史阶段，a641892，2026-11-09）

先按用户授权提交并推送d7c14288ec7c6fd01b6a87d5c0397968f38b8f4d（47文件，feat: 持久保存工具执行的子进程身份线索），回读HEAD/origin/main/远端ref一致。以下接续证据见[本轮记录](../records/backend-composition-history.md#tool-unknown-controlled-acceptance)。

| 检查 | 本轮结果 | 边界 |
|---|---|---|
| 受控异常首轮整链 | 门控验收1项通过，含7组真实Chromium/HTTP/PostgreSQL断言，0pageerror；已查看真实父退出/子存活与390px二次确认截图 | 测试宿主替代一次CLI为自有Java父子进程，强制中断后重启UNKNOWN。精确核对/清理后走实际Vue说明/勾选/二次确认、幂等/冲突、旧请求/迟到取消、新请求执行实际Git、历史详情及再重启读回。不是产品用户接受或真实Git故障 |
| 前端 | 全量137文件840项通过；面板定向1文件43项通过；typecheck/build/check:architecture、目标lint/stylelint通过 | 历史详情复用原隔离GET，不启动/取消执行，其他UNKNOWN仍互锁；读取失败与离页迟到响应有组件覆盖。既有大chunk、网络防护及Node localStorage提示保留 |
| 后端完整离线 | 32模块SUCCESS；163报告957项：851通过、106门控跳过，0失败/错误 | 仅子进程关闭全部已有EAP_RUN_*及新整链门控；受控验收在此跳过，不能当完整链路证明。日志/时间窗汇总为backend/target/tool-unknown-review-offline-* |
| 后端最终定向 | 31模块闭包SUCCESS；10报告65项全部通过、0跳过，含受控验收再次通过 | 最终新增JDBC/HTTP关闭快照一致及应用记录摘要不变断言；真实OS/HTTP/PostgreSQL/Vue7组通过，0pageerror。会话backend/target/tool-unknown-review-a1247297-b591-496d-8864-57621b356062 |
| 应用恢复/迁移 | full-application按原参数恢复PID38636，health=200/ok；29份迁移验证通过，无新迁移；V26～V29源码/数据库校验和一致 | 已有真实status记录不变；成功记录检查409、越操作404、恶意Origin403；无在途执行，测试宿主/进程/schema及5187监听已清理 |
| 前端格式/文件 | 6文件格式检查通过；最终受控截图与结果摘要保留到[artifact](../../frontend/apps/web/__tests__/browser/artifacts/tool-unknown-review/result.json) | 已查看最终历史重开1440px与二次确认390px截图；23个变更文件（16文本/7截图）UTF-8无BOM、170处本地文档目标/锚点、3类有限敏感模式及差异空白检查通过 |

### 已观察子进程身份持久与前端核对（历史阶段，d7c1428，2026-11-09）

以下为d7c1428已提交阶段的历史证据，不当作本次重新执行；该阶段从b6e9748接续。完整实现，证据见[记录](../records/backend-composition-history.md#tool-descendant-evidence)。

| 检查 | 本轮结果 | 证据边界 |
|---|---|---|
| 后端最终定向 | 31模块闭包SUCCESS；9报告64项通过、0跳过 | 真实自有父子取消、子身份通知失败清理；40句柄证据限32但全部参与清理；变化通知节流/刷新；历史/空/非法/超量投影；PostgreSQL自有schema读回、重启及检查不写状态。日志backend/target/git-descendants-final-targeted.log |
| 后端完整离线reactor | 32模块SUCCESS；162报告956项：851通过、105门控跳过，0失败/错误 | 仅该子进程关闭EAP_RUN_*门控；与64项实库定向分列。日志及按本次时间窗报告汇总为backend/target/git-descendants-offline-* |
| 前端 | 定向3文件48项、完整137文件834项通过；typecheck/build/check:architecture（含boundaries/circular）、目标lint/stylelint及5文件格式检查通过 | 既有大chunk、测试网络防护及Node localStorage提示保留；历史未捕获/未观察到/截断与子身份显示均保留人工确认边界 |
| 浏览器/mock | Chromium14组通过、0pageerror；1440/900/390px无横溢，已查看390/1440px截图 | 模拟父身份未捕获、子身份匹配存活及截断；不代替真实OS完整树或异常Git人工接受；离页迟到响应由组件测试覆盖 |
| 真实status HTTP/JDBC | 执行da1bea9b-67b6-4d02-b02d-3baeb5cc4b75为SUCCEEDED/exit0；root/filters/status各捕获1个子进程完整身份，未截断，退出/清理证据确认；独立只读JDBC快照与HTTP完全一致 | 此为正常真实Git执行的新增身份字段验收；不等于异常UNKNOWN人工接受或完整进程树证明。证据backend/target/git-descendants-real-http.json |
| 应用恢复/迁移 | 按原参数恢复full-application，PID35768，health=200/ok；29份迁移校验通过、无新迁移；V26～V29数据库/源码校验和一致 | 既有真实diff成功记录不变；检查已成功409、越操作404、恶意Origin403。未在应用schema制造UNKNOWN或孤儿进程；子进程JSON由隔离实库验证 |

文件收尾：47个变更文件中22个文本文件UTF-8无BOM/无替换字符，164处本地Markdown引用含锚点通过，git diff --check及新增内容3类有限敏感模式检查通过；临时mock监听PID34600经命令行核对后停止。本切片按本次用户授权提交并推送，结果以Git回读为准；full-application继续运行。

### 当前进程线索检查（历史阶段，b6e9748，2026-11-09）

以下为b6e9748已提交阶段的保留证据，未当作本次重新执行；本轮已按用户授权完成其提交和推送，HEAD/origin/main/远端refs/heads/main一致。完整证据见[记录](../records/backend-composition-history.md#tool-process-review)。

| 检查 | 本轮结果 | 证据边界 |
|---|---|---|
| 后端首轮定向 | 31模块闭包SUCCESS，47项通过、0跳过 | 4项本地进程测试含真实自有JVM及父退出/子存活；25项工具服务、JSON、HTTP、8项模块边界及自有schema持久回归。补持久不变断言后最终定向47项仍通过，0跳过 |
| 前端 | 定向3文件46项通过；完整137文件832项通过；typecheck、build、check:architecture、改动范围lint/stylelint通过 | 既有大chunk、网络防护及Node localStorage提示保留；进程检查显式触发，不重提执行或核对 |
| 浏览器/mock | 14组通过、0pageerror，1440/900/390px无横溢 | 模拟NOT_CAPTURED线索，不代替真实OS检查；已查看390/1440px线索区域截图；进程状态枚举与真实父子场景由后端覆盖 |
| 后端完整离线reactor | 32模块SUCCESS；161份报告951项：846通过、105门控跳过，0失败/错误 | 仅子进程关闭EAP_RUN_*门控，与最终47项定向/实库分列；日志和时间窗汇总在backend/target/git-process-review-offline-* |
| 服务恢复/文件 | full-application按原参数恢复，PID34672，health=200/ok；新路由对已成功记录409、跨操作404、恶意Origin403，原记录未变；29份迁移校验通过、无新迁移 | V26～V29源码/应用校验和一致；UTF-8/链接/空白/敏感模式检查通过。接续代码、测试、截图及文档按用户授权随本次提交交付，推送结果以Git回读为准 |

### 真实diff HTTP与UNKNOWN人工处置（历史阶段，bb83f31，2026-11-09）

本轮从8abbd21接续，证据见[记录](../records/backend-composition-history.md#tool-unknown-manual-review)。代码、测试及文档按用户授权随本次提交交付，提交号与推送结果以Git回读为准。真实diff执行与模拟UNKNOWN核对分别记录，不把人工关闭当作执行成功/取消。

| 检查 | 本轮结果 | 边界 |
|---|---|---|
| 真实diff HTTP/JDBC | 执行4e6f4bc7-ab7d-462c-b4fa-df3586c93122为SUCCEEDED/exit0，root/filters/diff退出与清理证据齐全；唯一临时标记出现在输出；同requestId读回、迟到取消、跨操作404/409、非法参数400及Origin403通过；独立JDBC快照与HTTP一致 | 临时修改文档后精确恢复原始字节、Git索引未变；持久执行记录保留。未测试真实长耗时Git取消或进程接管 |
| 后端定向 | 65项通过，含V29临时schema升级/历史JSON兼容、核对竞争、幂等/冲突、原证据保留、在途owner拒绝、越操作/工作区拒绝、约束失败回滚与解除互锁 | 真实Git与PostgreSQL，UNKNOWN为自有测试夹具；V29最后加强JSON boolean约束后最终定向仍65项通过，0跳过；应用库迁移见应用恢复行 |
| 后端完整离线reactor | 32模块SUCCESS；160份报告946项：841通过、105门控跳过，0失败/错误 | 仅该子进程关闭EAP_RUN_*门控；日志/时间窗汇总为backend/target/git-unknown-offline-reactor.log及git-unknown-offline-summary.json，不与定向实库拼接覆盖率 |
| 应用恢复与迁移 | 按原启动参数恢复full-application，PID7632；health=200/ok；V29成功应用，checksum=-508415836，与源码一致，V26～V28不变；旧真实diff成功记录保留 | V29于2026-11-09 15:08:09应用；只读回读迁移/约束。真实HTTP核对成功记录409、跨操作404、恶意Origin403；未制造真实孤儿进程 |
| 前端全量 | 137文件824项通过；定向3文件38项通过 | 核对说明、进程树勾选/二次确认、响应丢失后保留原请求、冲突及离页重读；既有网络防护/Node localStorage诊断保留 |
| Chromium/mock | 12组通过、0pageerror，1440/900/390px无横溢；已查看390px确认框及关闭记录截图 | status/diff显式核对、取消确认、关闭、刷新恢复；模拟服务未启动真实进程，不等于孤儿进程人工接受 |
| 前端工程/文件 | typecheck、build、check:architecture、改动范围lint/stylelint及7文件格式检查通过；UTF-8无BOM/链接/差异空白和敏感模式扫描通过；本轮按用户授权随本次提交交付，推送结果以Git回读为准 | 仅既有大chunk提示；复用@eap/ui，L4核对流程留capability，无新增共享类别 |

### Git diff接续验证（历史阶段，8abbd21，2026-11-09）

验证结果与命令见[接续记录](../records/backend-composition-history.md#git-diff-operation-executions)。代码与本轮文档按用户授权随本次提交交付，提交号及推送结果以Git回读为准。用户启动full-application后，应用库V28已只读核验。

| 检查 | 本轮实际结果 | 证据边界 |
|---|---|---|
| 前端全量 | 137文件812项通过 | 修正既有SkillManager首次lazy加载超时导致的级联失败；业务断言保留。网络防护诊断与Node localStorage提示仍存在 |
| 前端工程 | typecheck、build、check:architecture（含boundaries/circular）、改动范围lint/stylelint及格式检查通过 | 构建保留既有大chunk提示；lint保留既有mock测试optional chaining警告。runtime-client补vite-plus开发依赖与锁文件，无版本升级 |
| 后端完整离线reactor | 32模块SUCCESS；160份报告，939项：834通过、105门控跳过、0失败/错误 | 只在该子进程关闭EAP_RUN_*门控；与实库结果分列。日志和时间窗汇总在backend/target/git-diff-reactor* |
| 最终后端定向 | 31模块闭包SUCCESS，60项通过、0跳过 | 全量后保留旧status缺失错误码并补两个Handler用例；最终审查补齐目录diff调用地址，定向覆盖上述变化、目录/执行/取消/竞争/HTTP/JSON/装配及下列实库 |
| 实库与真实Git | UUID自有schema中V26/V27历史status记录经V28仍可读，diff持久读回；真实未暂存差异、仅暂存/未跟踪排除、长输出截断、文件和索引未改、UNKNOWN隔离/唯一约束通过 | 属于最终60项中的1项门控测试；只清理自有schema。应用schema/Flyway V28升级见应用库迁移行；真实diff HTTP执行整链仍未验 |
| Chromium/mock | 10组通过、0pageerror；1440/900/390px无横溢，390/1440截图已查看；diff取消/刷新、status UNKNOWN与diff隔离通过 | 真实浏览器连接模拟服务，不等于真实进程、原生系统缩放或用户接受 |
| 应用库迁移与健康 | 用户启动full-application后只读回读：V28 success=true、checksum=-329790285，源码一致；V26/V27分别为-716806117/1802106427且源码一致；capability约束包含status/diff；GET /api/health为200/ok | V28安装时间2026-11-09 14:30:06；只读事务已回滚。未执行repair/clean/baseline，不代替真实diff执行整链或用户接受 |
| 文件与VCS | V26/V27原稿不变；改动UTF-8无BOM、本地文档链接、差异空白及有限敏感模式扫描通过；按用户授权随本次提交交付，推送结果以Git回读为准 | UNKNOWN人工处置、跨重启进程接管、其他工具与用户接受仍待 |

### Git 程序与status持久调用（历史阶段，e2c53c7，2026-11-09）

| 检查 | 本轮实际结果 | 证据边界 |
|---|---|---|
| 前端全量 | 136文件、797项通过；typecheck、check:architecture、check:boundaries、build及改动范围stylelint/lint通过 | 保留既有网络保护/Node提示与大chunk提醒；无规则放宽 |
| 后端离线reactor | 32模块SUCCESS，930项：829通过、101环境门控跳过、0失败/错误 | 仅该子进程将EAP_RUN_BOARD_PERSISTENCE=false；实库证据另列，不合并覆盖率 |
| 实库与真实Git | 新增临时schema中V26/V27迁移、仓储持久读回、真实Git三个步骤、requestId去重/唯一互锁、重启UNKNOWN及阻塞通过；最终与SchemaAndWiringTest合计5项通过 | 使用原有本机测试连接及门控；只删除UUID自有schema，不重置应用表或Flyway历史 |
| 既有看板实库 | 修正测试代理配置后BoardRunPersistenceTest 36项通过 | 与最终离线全量分列；未移除原断言 |
| 真实进程 | 既有执行器回归增取消信号分支与启动前取消；真实父子进程退出/清理、超时与失败证据通过 | 三个Git阶段的调度/竞态另有模拟回归，不把Java测试进程当真实Git |
| 本机HTTP | 202启动→同ID查询成功；root/filters/status三步，exit0；完成后取消仍SUCCEEDED | 执行3deabe6e-986b-4a09-b49e-2212c17c53a9；核对当前仓库，仅限定实测，不保证服务持续在线 |
| Chromium与mock服务 | 7组通过、0pageerror；1440/900/390px无横溢；缓存导航/取消确认/刷新与UNKNOWN互锁通过，截图已查看 | 模拟服务状态，不代替真实进程、原生系统缩放或用户接受 |
| 迁移历史 | 只读回读本机V26=-716806117、V27=1802106427，源文件校验和一致 | 已应用的V26原稿保留，后续注释独立V27；未repair/clean/baseline |
| 文档与VCS | 主方案TD/TC条目、台账、路线与技术决定同步；UTF-8无BOM、本地链接及git diff --check通过；用户已授权本次提交并推送 | 提交及远端对齐以Git回读为准；用户接受、diff新人工执行、UNKNOWN人工处置与跨重启进程接管仍待 |

首轮失败、修复、实库与浏览器命令，以及一次没有结束状态的中断重跑均保存在[阶段记录](../records/backend-composition-history.md#tool-operation-executions)，中断没有记为通过。离线全量原始日志保留在仓库根tool-execution-offline-reactor-final.log，按本次报告时间窗汇总到full宿主target/tool-execution-offline-summary.json。

### 上一阶段验证（历史，2026-11-09）

| 检查 | 已记录结果 | 证据边界 |
|---|---|---|
| 前端全量 | 134文件、786项通过；typecheck、check:architecture、build及改动范围stylelint通过 | 保留大chunk、Node localStorage及既有夹具网络保护诊断；非全仓样式检查 |
| 后端reactor | 32模块SUCCESS，912项：808通过、104环境门控跳过、0失败/错误 | 本轮未启用额外实库/供应商门控；前轮913项（839通过/74跳过）单独保留，不合并覆盖率 |
| 浏览器交互 | 新工作台7组、原任务/审批UI9组通过，0pageerror | 专家保存/审批写请求由隔离fixture接管；实际GrapesJS编辑、Vue交互预览与本地工程重开通过 |
| 显示比例 | 新工作台当前原生DPR1；Chromium比例覆盖1.25/1.5无横向溢出 | 覆盖比例不等于切换Windows系统缩放；旧布局原生125%记录不能替代新布局125%/150%验收 |
| SQL语义 | 合成CTE与4组反连接候选语义检查通过 | 不证明生产数据、完整作用域或性能等价；真实供应商限定样例见后端记录 |
| 提交与推送 | `c76cded`、`2c7e87b`已推送，整理前工作树干净 | 推送完成不关闭用户产品接受 |

命令、截图与限制见[工作台实施记录](../records/frontend-history.md#expert-workspace-evolution)和[后端实施记录](../records/backend-composition-history.md)。实网证据分别见[Responses审批整链](../records/backend-composition-history.md#responses-tools-acceptance)、[复杂SQL与知识](../records/backend-composition-history.md#complex-sql-acceptance)，均为前轮限定验收，不是本次重新调用。

<a id="developed-content-review-validation"></a>
## 已开发内容复核（2026-11-12）

当前修复及保留理由见[架构复核](architecture-history.md#developed-content-review)，原型任务草稿与请求身份规则见[交互合同](../decisions/builder-prototype-delivery-contract.md#interactive-design)。本节是本次技术验证记录，不关闭用户产品接受。

| 范围 | 实际结果 | 证据边界 |
|---|---|---|
| 后端定向回归 | 31 个 reactor 项目 SUCCESS；62 项通过，0 失败、错误或跳过 | SQL Agent 17、工程 Chat 20、事件流 7、源码 Agent 5、Responses 协议 11、事件日志 2；Fake 模型/本地协议夹具，未调用真实供应商 |
| 前端定向回归 | 3 文件 44 项全部通过 | Composer 行为 15、布局 24、原型任务弹窗 5；覆盖单一菜单入口、草稿取消/放弃/还原、首次明确 4xx 后修正，以及结果未知/恢复请求保留原身份 |
| 类型与模块边界 | `vp run typecheck`、`vp run check:boundaries` 通过 | Vue/TypeScript 及模块引用边界；未宣称全量单元测试或全仓 lint 通过 |
| 前端生产构建 | `vp build` 通过，4752 个模块 | 保留大于 500kB chunk 与插件耗时提示；未据此扩展为性能验收 |
| 侧边栏真实浏览器 | 既有 `http://127.0.0.1:5173/` 完成入口走查及修复复验 | 使用现有 IDEA DevTools 后端和前端；未另启服务、提交任务或发送模型请求 |

后端在 `backend/target/review-20261112` 隔离源码副本运行，避免测试编译覆盖 IDEA 正在使用的原模块 `target/classes`。从该目录执行：

```powershell
mvn -o -pl eap-applications/eap-full-application -am test '-Dtest=EngineeringChatServiceTest,ChatExecutionStreamTest,OpenAiResponsesProtocolTest,SqlExpertAgentServiceTest,CodeSourceAgentTest,ChatExecutionJournalTest' '-Dsurefire.failIfNoSpecifiedTests=false' '-DfailIfNoTests=false'
```

Surefire 报告保留在该副本对应 SQL 与 full-application 模块的 `target/surefire-reports`。最新一次结果为 62 项；此前 60 项执行不重复累计。修复涉及的 `toolCallbacks`、`PAYLOAD_TOO_LARGE` 弃用警告及工具参数 varargs 警告已消除；既有 unchecked、其他测试弃用/内部 API 与 Mockito 动态 agent 提示仍保留。

从 `frontend` 执行：

```powershell
vp test run apps/web/__tests__/features/chat/TaskComposer.test.ts apps/web/__tests__/features/chat/TaskComposer.layout.test.ts apps/web/__tests__/features/shell/PrototypeTaskDialog.test.ts
vp run typecheck
vp run check:boundaries
vp build
```

浏览器走查覆盖 chat、sql、board、scenes、builder-alpha、builder-beta、work、model-settings、appearance、skills、plugins、rules、knowledge、databases、capabilities、expert-catalog、experts 入口。多数页面仅核对加载后的标题和主要入口，不代表逐页全部业务分支验收。深度复验：

- Chat 信息图标仅展示附件用量，点击不再打开添加菜单；“添加”保留文件/指令/动作/专家/Skill/MCP 菜单，Esc 关闭；正文、指令和文件沿用既有发送预览。输入核对草稿后已清空，未发送。
- builder-alpha 打开已有不可变版本后创建任务草稿，修改标题并关闭：确认取消保留草稿，明确放弃才关闭；773px 和 1055px 侧栏宽度核对通过，未创建任务。
- Board 全局创建与 planned/ready 列创建保留不同默认列；模型连接编辑与模型目录管理保留不同职责；场景配置与原型工作面保持分离。未为外观相似而合并不同业务动作。

过程失败另记：初次测试受 Windows 沙箱 `spawn EPERM` 和隔离目录写入限制阻断；后按会话权限执行成功。Maven 首次因 PowerShell 未整段引用点号属性触发 `Unknown lifecycle phase ".failIfNoSpecifiedTests=false"`，修正参数后通过。前端首次 42/44、随后 43/44，失败涉及既有只读规划文案断言及新测试对异步错误反馈的等待；按真实交互合同修正后最终 44/44，未削弱请求身份保护。未执行真实付费模型调用、业务数据库验收、跨重启推理恢复或全页深度人工验收。

<a id="chat-toolbar-review-correction"></a>
## 聊天工具栏补查：工作区与源文件重复（2026-11-12）

用户指出首轮前端检查遗漏“工作区”和“源文件”内容重复。使用同一个侧边栏浏览器与既有 `http://127.0.0.1:5173/#chat` 复现：两个按钮可同时处于选中态，页面同时显示两份授权仓库目录。前者只有只读仓库树，后者另有本地引用/设计版本；两套状态不具备当前业务需求依据，统一保留源文件入口。当前合同见[工具栏职责](../decisions/chat-engineering-task-slice.md)。

补查按实际交互逐项记录，不沿用首轮“入口加载”作为本次完成依据：

| 控件 | 本次观察及验证目标 |
|---|---|
| 源文件 | 授权仓库列表可展开、读取 README；查看不会自动添加引用。保留本地引用/设计版本区域；移除重复工作区树与独立开关 |
| 摘要 | 展示当前会话、策略、任务/后台及来源概况；来源卡片跳源文件并收起摘要，Esc 回到草稿，内容保持 |
| 变更 | 候选、已应用、原有修改、验证各有边界；当前空会话明确未读取工作区，不冒充 clean |
| 终端 | 明确尚未接通，不显示可输入命令的假交互 |
| 更多/重试 | 当前无会话，导出/重试禁用；分享仍未接通并禁用，未产生下载或外发 |

修复后侧边栏浏览器复验：1055×796 的既有页面只保留一个源文件按钮和一份仓库树；四面板的12种有向切换均只激活一个入口，四个关闭按钮均收起面板并保留同一草稿。源文件实际读取 README 成功；真实点击源文件入口后按 Esc，弹层关闭、焦点回到该入口，草稿保留。摘要来源卡片跳转至同一源文件面板。

窄屏使用同一侧边栏浏览器内临时390px iframe，加载既有前端地址形成真实嵌入视口，区别于原生系统缩放或整个侧栏改宽。修复后四个面板均可打开/关闭，范围在视口内、无水平溢出、每次只有一个选中入口，草稿保持；测试 iframe 和核对草稿已清理。未据此宣称全站移动端验收。

定向回归7文件27项通过：工具栏2、工作区授权2、SessionPanel 9、任务草稿1、VerificationChecks 1、pagePreview 7、公共UI扩展5。`vp run typecheck`、`vp run check:boundaries`通过；8个相关文件经`vp fmt`格式化，`git diff --check`通过。`vp build`通过（4749模块，4.95s），保留既有大于500kB chunk提示。从`frontend`执行：

```powershell
vp test run apps/web/__tests__/features/chat/ChatWorkspace.toolbar.test.ts apps/web/__tests__/features/shell/workspaceGate.test.ts apps/web/__tests__/features/shell/SessionPanel.test.ts apps/web/__tests__/features/chat/ChatWorkspace.task.test.ts apps/web/__tests__/features/shell/VerificationChecks.test.ts apps/web/__tests__/features/shell/pagePreview.test.ts apps/web/__tests__/integration/ui-extensions.test.ts
vp run typecheck
vp run check:boundaries
vp build
```

首次扩大定向测试为12/14，两处失败为SessionPanel旧测试凭源码路径猜测`/#chat`，当前交付合同没有预览URL。按实际合同修正，并在真实承载URL的VerificationChecks补齐显式URL原样呈现、证据消失后撤掉链接的双向断言，保留候选/已应用/未接受保护；最终27/27，未修改生产SessionPanel。最终fixture翻译键修正后，主agent另执行`vp test run apps/web/__tests__/features/shell/SessionPanel.test.ts`，9/9通过，不累计到27项中。

此次不发送模型请求或创建测试业务任务，不重启已有服务。首轮遗漏已纠正；本次只宣称聊天工具栏所列范围，不扩展为全站全部业务状态验收。
