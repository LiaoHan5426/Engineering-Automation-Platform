# 聊天上下文交互、DSH 插件兼容与执行计划评估

日期：2026-11-14。状态：**G1局部实现已技术验证：聊天内连接配置及真实执行摘要；完整内置计划、DSH前端兼容模块、消息图尚未实施，用户接受待确认。** 本文补充[CT-02 聊天方案](deepseek-chat-adaptation.md)，不把“参考 DSH”理解为直接更换 Vue/Spring AI 或已经支持所有 DSH 插件。当前进度统一见[台账](../planning-status.md#ct-02-chat-adaptation)。

## 1. 日常操作留在当前对话

重构前基线（34fb18f）依据：[TaskComposer](../../frontend/apps/web/src/features/chat/TaskComposer.vue)的专家管理和模型设置入口会跳转全页；[DesktopNavigation](../../frontend/apps/web/src/features/DesktopNavigation.vue)在专家/设置区域显示返回来源会话，并按 workbench.origin 返回；[App](../../frontend/apps/web/src/App.vue)离开任务工作面时记录的是来源视图并关闭面板，来源本身不是精确会话身份。已有[知识选择](../../frontend/apps/web/src/features/chat/KnowledgeExpertSelector.vue)及[Skill 选择](../../frontend/apps/web/src/features/chat/SkillSelector.vue)使用 Dialog，可复用其上下文保护模式。问题应在入口和交互承载方式解决，不能只删“返回”按钮而仍让普通选择离开对话。

| 操作意图 | 默认承载 | 保留的完整工作面 |
|---|---|---|
| 选择模型/连接/专家角色/场景预设、知识或 Skill 版本及资源 | 会话内 Dialog；列表选择、预览、确认采用分开 | 连接目录、专家目录及场景完整管理仍可从全局入口访问 |
| 为当前选择补建或编辑一条连接、角色说明、会话指令；重命名/删除会话；目标约束编辑、摘要预览、导出 | 有界 Dialog，复用领域编辑器及原保存合同 | 多对象批量管理、专业行为/工作流设计不包进通用大弹窗 |
| 文件浏览、引用/文档/Skill 详情、当前候选 Diff、执行证据 | Drawer/现有侧栏；终端保留底部 dock | 全量 Git 诊断、独立验证与复杂审批按原工作面进入 |
| 专家执行/SQL Agent 编辑、全任务审阅、看板 Task/Run/交付、GrapesJS、SQL 分析、全局插件/权限管理 | 可深链的完整工作面，局部详情再用 Dialog/Drawer | 这些工作面不因聊天重做而塞进弹窗；原授权、审批、UNKNOWN 和草稿规则继续有效 |

“管理全部”是从有界选择器主动升级到完整工作面的显式动作；这种升级可以保留返回来源入口。普通选择、预览及小表单以关闭回到原对话，不再靠全页跳转后“返回当前对话”。复用同一领域服务和编辑器，避免弹窗版与路由版各写一套 API/状态。展示原语归 `@eap/ui`，上下文宿主和领域编排归 feature；App 只装配，遵守[共享模块边界](frontend-ui-shared-module-boundaries.md)与[既有专家工作区合同](expert-workspace-navigation.md)。

上下文宿主捕获调用方的会话ID、分支/目标对象、触发控件和请求代次，不能只依赖最后一次全局 origin。保存后读回本对象，更新选择目录不自动换用新连接/专家、不发送消息、不改变授权。取消或过期返回不得覆盖另一会话；草稿、附件、阅读位置及原面板保留。默认单一活动侧面板，浮层嵌套只在必要确认时发生，窄屏侧栏转全宽详情并仍有明确关闭动作。

交互验收覆盖入口清单中的每一项：普通操作不改变主聊天/Work URL或活动会话；关闭按钮、Escape、遮罩、浏览器后退及窄屏的焦点/未保存保护一致；保存错误在弹窗内，保存已成功但读回失败只重试读取；选择后继续编辑原草稿。显式进入完整管理后的刷新、深链、后退/来源返回恢复精确会话，不新建或选错会话。现有来源返回测试应迁移到保留的全工作面流程，不能简单删掉。

### DSH会话区域与交互复用

按追加评审意见，会话区域也参照DSH，减少重新发明交互。采用“区域合同/纯逻辑优先复用、Vue展示按合同适配”的路线，不把chat-demo与DSH各做一套界面：chat-demo提供消息富文本/分支体验，DSH补会话壳、面板与扩展装配；最终仍是一个EAP聊天工作面。

| DSH固定源码 | 已有机制及EAP映射 | 复用方式与限制 |
|---|---|---|
| [AppFrame](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-layout/src/client/AppFrame.tsx) | 左会话/全局导航、中对话、右上下文面板；frame级ResizeObserver与尺寸拖拽；bottom/overlay在正文滚动区之外 | EAP沿现有会话轨/消息输入区/摘要证据侧栏与终端dock适配；布局只管几何，不拥有会话选择；窄屏折叠/抽屉与阅读位置同验 |
| [Conversation装配](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-conversation/src/client/apply.ts) | Header/Content/Session/InputBar与todo/queue贡献，草稿/提交/文件接入控制器分离 | 复用EAP既有draft/input/附件/事件管理，按槽位组织区域；不复制整份React/Cordis装配或新建平行输入管理器；队列只在真实有排队合同后展示 |
| [Dockkit](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-dockkit/src/index.ts) | 纯TS操作/回放/几何引擎与React渲染层分离；一次手势提交一个稳定意图 | 确需split/tab/float时才评估独立逻辑复用/移植；根出口也导出React组件，先查依赖/公开出口/构建，不为Dialog/Drawer引入全套停靠系统 |
| [Settings装配](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-settings/src/client/index.ts) | 权威配置描述/镜像、变更和重连刷新、effect清理 | EAP沿原Java读取/保存/读回与runtime-client，不复制DSH Remote；刷新目录不能清空未保存编辑或默默切换会话模型 |
| [插件管理装配](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-plugin-manager/src/client/index.ts) | 插件是全局主面板及列表/详情导航，不属于某会话；打开不改变当前session | EAP全局管理保留完整工作面，但保持对话选择/草稿；聊天内只提供选择/状态/跳转。这也说明不是DSH所有内容都应变成弹窗 |

实施前逐项搜索EAP现有原语与管理器，记录“保留/移植纯逻辑/按合同改写/不引入”的选择及依赖成本；优先复用现有能力和不含宿主依赖的算法，移植源码保留固定revision、版权与许可。原型验证三栏、面板切换、Dialog/Drawer、输入/草稿和窄屏后再接生产；纯源码对照不证明区域布局或原UI插件可运行。

## 2. EAP内置执行计划与摘要面板

最新用户决定：不采用独立DSH宿主；计划由EAP内置，DSH仅作行为参考。确定的前端模块、升级逻辑、领域合同和切片见[实施路线](dsh-frontend-adaptation.md)。下述上游todo语义只用于对照，不是引入DSH日志/运行时的前置。

重构前[SessionPanel](../../frontend/apps/web/src/components/SessionPanel.vue)的“任务列表”是草稿、sending、候选文件数、终端和验收入口等五个固定步骤；当时[ChatBinding](../../frontend/apps/web/src/features/shell/workbench.ts)未提供执行事件或结构化 todo。它不能作为执行进度真相，也不应静态显示“无执行号/验收未完成”来替代实际证据。[ChatTurn](../../frontend/apps/web/src/features/chat/chatSession.ts)已有执行身份、状态、工具事件与候选，[事件投影辅助函数](../../frontend/apps/web/src/features/chat/eventProjector.ts)尚未被生产发送链调用，且projectEvents本身仅按sequence去重、未先隔离执行身份；不能将其单测当作在线去重/恢复保证。当前摘要适配应只投影ChatTurn已观察到的数据，不伪造有序回放或后台接管能力。

DSH 参考固定为 [39163dd3](https://github.com/deepseek-ai/deepseek-harness/tree/39163dd30f703a79079e2d2446545cff3c453738)。[todo 类型](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/todo/tool-todo/src/types.ts)只有 content 与 pending/in_progress/completed，无稳定条目ID；[todo_write](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/todo/tool-todo/src/index.ts)要求所属 agent 会话，每次追加 `todo/write` **完整列表快照**，同一轮内回放以最新一次为准，可按配置允许多个进行中；实际投影在turn/start清为null，turn/end保留刚结束的列表直至下一轮开始（stateVersion 2）。列表是会话日志投影，不是业务任务状态，不是工具成功或验收证据；不能把数组下标当作跨版本任务身份。DSH列表的事件历史属于agent会话，但当前展示不跨新轮自动延续；README/类型注释的“最新列表”概述不能覆盖实现的turn/start重置。这说明上游不是永久站立计划；EAP按自己的执行级planId/revision合同实现，不复制无条目ID的日志投影。

| 摘要区域 | 唯一权威来源 | 行为与边界 |
|---|---|---|
| 会话概览 | 当前会话/分支、模型及引用投影 | 保留当前概览，详细内容按需展开，不重复铺陈全部诊断 |
| 当前执行 | 选中 ChatTurn 的 executionId、状态及真实事件 | 显示进行中/取消中/真实终态；切换分支不改变执行。历史或不可恢复要明确，不能合成后台任务 |
| 执行计划 | EAP Chat执行域的结构化计划，唯一权威PlanStore | 没有列表不伪造；稳定条目ID、执行关联、完整快照及revision。没有DSH运行目标或第二份DSH todo |
| 产物与验证 | 原 Proposal/Generation、验证结果、Task/Run 和人工决定 | 链接原证据；计划全部 completed 不自动应用源码、通过检查、完成看板任务或确认验收 |

原生计划采用执行级归属、稳定条目ID、CAS/幂等完整快照、后端持久化和GET读回，具体[领域合同](dsh-frontend-adaptation.md#4-任务计划由-eap-内置)已确定。任务工作记忆只保存目标/约束/事实，计划不放进前端localStorage或另一个插件状态库。既有PLAN模式无工具承诺保持，自动计划更新只在具备工具能力且有明确预算的执行中注册，不由模型文字自动触发。

取消/失败保留最后快照，重试为新执行/新计划；计划completed不是工具、验证或接受证据。首片不实现依赖图/调度器，后续按用户需求扩展同一合同。新旧会话/执行隔离、并发冲突、取消迟到更新、刷新/重启后历史读回须验证；持久计划不等于CT-01后台执行接管。

## 3. DSH 插件复用评估

确定采用[独立前端适配模块](dsh-frontend-adaptation.md#2-独立前端模块的具体内容)，在现有Vue内嵌DSH浏览器兼容区域，不部署Node宿主；目标是让已有插件在明确客户端依赖与版本下尽量复用原包；是否“直接使用”必须逐插件、逐贡献类型验证，不能只凭 npm 安装成功或 UI 能显示就宣称兼容。

### 3.1 宿主合同与兼容矩阵

固定版本的[manifest类型](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/util/package-manifest/src/types.ts)使用 npm dependencies/peerDependencies、engines.dsh/node，及 dsh.manifestVersion、bundle.patch/platforms、profile.bundles、client.platform/inject/immediately/external。bundle.patch 是 Loader 组合，不是 Vue 组件清单；client.inject 是客户端包图依赖，不等同于 Cordis 服务注入。[原生Skill工具](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/skill/tool-skill/src/index.ts)需要 agents/tools/skills/workingDirectory 服务、agent执行上下文及生命周期。Java后端不能直接执行这些Node模块。

[客户端模块服务](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/modules/src/index.ts)扫描宿主挂载项并生成 `window.__DSH_BOOT__` 图、bundle与资源；[Web模块表](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/web/src/platform.ts)共享 React/Cordis/store/slots 等模块身份。[ui-theme包](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-theme/package.json)有Host及 ./client 双入口和服务/槽位依赖。因此 Vue 内挂一个 React root 只解决DOM挂载，不会得到完整插件兼容。该版本源码要求 Node >=24.9.0、pnpm 11.28.5；不能覆盖EAP现有Vite+/workspace工具链。

| 插件/资源类型 | EAP现状与可行路径 | 能否直接使用原包 |
|---|---|---|
| SKILL.md指令、静态文本资源 | 复用原材料，经现有Skill导入、来源/digest/路径/预算/能力校验；脚本及复杂资源另评估 | 有条件复用内容，不等于支持DSH的Skill运行时 |
| 独立MCP服务器/端点 | 用EAP自己的MCP客户端连接同一服务器，逐项验证传输、协议版本、认证、工具/资源/音频、超时取消 | 最适合首先验证的服务端产物复用；DSH的MCP客户端插件本身不是Java插件 |
| 原生Host工具、服务、模型/provider、Agent生命周期插件 | 逐能力映射现有Java工具/服务，缺失能力需真实适配，不部署DSH运行时 | Node Host原实现不能在浏览器直接运行，不把声明导入记作原包兼容 |
| Host/client双入口UI插件 | 由独立前端模块提供受信构建图、React/Cordis共享身份/槽位与生命周期；逐namespace补EAP后端门面 | 复用已核对的client部分；无等价后端服务不能标整包兼容，不使用完整DSH iframe或独立Host |
| 无DSH依赖的普通JS库 | 按现有依赖、许可、体积及浏览器兼容检查选择性复用 | 库复用，不证明插件兼容 |
| 本机可执行/浏览器/桌面能力包 | 还需目标OS、程序、显示服务、工作目录和授权；platform声明仅作准入输入 | 逐部署验证，缺依赖明确不可用，不自动安装或降级 |

[DSH MCP实现](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/mcp/mcp-client/src/index.ts)的传输、命名及资源能力与EAP不应默认视为同等；不支持的协议/结果类型必须清楚拒绝。Claude Code等hook适配也只覆盖其实现子集，不能据此承诺兼容任意其他生态插件。

### 3.2 已确定路线及被替代的比较

采用`@eap/dsh-adapter`：受信构建阶段生成模块图与产物，浏览器嵌入兼容区域，现有PluginHost装配，原Java执行/审批保持权威。浏览器模块合同明确无Node导入；此前“DSH原包执行一律需要独立Node”过于笼统，应限定为Host侧Node实现。浏览器client依赖闭包存在可复用路径，但不是挂一个React root就兼容。

此前SDK/stdio独立宿主与完整应用嵌入只属于**已被本轮决定排除的历史比较**，不再是G2/G3选项。上游[SDK协议](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/sdk/protocol/README.md)驱动agent/session，[API网关](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/api/gateway/README.md)仅导出声明服务，均不是任意插件函数入口；本方案不引入它们的独立执行目标。

模块的baseline/manifest/graph/runtime/bridge/view/compat/upgrade职责、真实client复用范围和升级六步见[确定路线](dsh-frontend-adaptation.md)。原服务缺失时明确不可用，不写空成功响应或通用远程代理；不为支持一个插件创建第二套会话、计划或授权状态。

### 3.3 安装、凭据与运行安全

[DSH插件管理器](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/boot/plugin-manager/README.md)说明Host插件在进程内执行，不受工作区沙箱约束。来源可信、固定版本/校验、依赖脚本授权、配置与实际激活分别验证；“安装成功、选中、启用、激活、可调用、需重启、失败”是不同观察，不能一个开关代表全部，也不凭空新增一套通用生命周期枚举。回滚配置/lock不保证撤销脚本和文件副作用。首批只选受审静态构建产物；前端Manifest不能沙箱同页任意代码，不开放市场或任意URL加载，不创建独立DSH profile/home/process。

[凭据存储](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/credentials/credentials-local/README.md)是Host能力；完整secret不传到浏览器、配置导出或日志。共享同用户目录不等于租户隔离，轮换/重连、卸载后凭据保留/撤销/删除分别定义。安装、配置、启用、工具授权、授予构建脚本权限是不同动作，不因聊天选择插件而自动合并。

仓库已有[dsh-ai-team兼容失败记录](dsh-ai-team-batch.md)：npm包安装成功但缺失宿主导出导致激活失败，并涉及自动提交/合并行为。仅作为历史反例，不据此判定所有DSH插件不可用，也不重新启动已停止的旧适配任务；新的试点必须核对确切runtime/plugin版本组合与副作用。

## 4. 分步实施与证据关口

| 阶段 | 本轮规划交付/后续实施 | 通过条件 |
|---|---|---|
| G0 源码与交互评审 | 当前文档阶段；完成入口分类、DSH区域对照、插件分类矩阵、会话/执行/todo归属 | 有固定源码与明确未知项；可点击原型明确模拟，用户先接受交互；不以文档代替已实现 |
| G1 上下文与真实执行投影 | **局部已实现**：聊天连接设置复用共享编辑器，保留全局目录；摘要投影最近ChatTurn并删除固定步骤。其余聊天壳/交互尚未全量迁移 | 每个受影响入口、原草稿/引用/焦点/滚动、来源恢复、真实执行事件和UNKNOWN逐项验证；同场景真实Before/After |
| G2 前端模块与内置计划 | 按[确定路线](dsh-frontend-adaptation.md)的P1/T1纵向切片；前端兼容区域、受信原client插件，EAP持久PlanStore/工具/API/Mock/摘要 | 插件加载/缺依赖/卸载与计划CAS/幂等/隔离/取消/读回通过；无独立DSH宿主，无平行计划真相 |
| G3 跟随升级与扩展 | 按确定路线P2/T2演练固定候选升级/回退，按实际需求增加已验证服务/插件与计划能力 | 基线/包锁/适配/夹具/证据同PR；原生包范围准确，真实Before/After；不承诺未来版本自动兼容 |

前一轮交付只更新方案；本次依实施请求完成上述局部G1产品UI，使用隔离开发服务和浏览器HTTP夹具验证，未安装DSH插件、迁移会话、执行真实模型或改后端协议。后续实施需按上述合同先做最小可验证切片，不新增平行Capability注册表，不新增DSH执行目标或重复实现EAP已有工程写入/审批路径。用户接受、Mock交互、真实后端、供应商/DSH动态能力及构建/静态检查分别记录。

规划阶段的证据为固定版本源码审阅、原实现与文档对照。后续G1的[15文件189项定向回归及完整验证记录](../records/chat-g1-validation.md)、类型/架构/构建及实际浏览器证据分别见[连接设置](../evidence/chat-model-context/README.md)与[执行摘要](../evidence/chat-execution-summary/README.md)。DSH动态插件/SDK、真实模型/MCP和数据库仍未运行；规划中的兼容结论是附条件可行性，未证明现有EAP已支持DSH原生插件。

规划阶段文档验证（历史证据）：`git diff --check`通过；Python 3检查六份变更Markdown的UTF-8无BOM、277个本地文件链接目标及18个固定DSH源码链接在上游树中存在，均通过。独立只读复核对照实际代码纠正了DSH todo新轮重置行为；外部链接树校验与源码审阅不是运行时兼容验证。

## 5. G1实现边界与后续架构前置

- 连接编辑：`ModelSettings`和`TaskComposer`共用应用L3的`ModelConnectionEditor`/`ModelCatalogEditor`，原设置页的重复表单已移除。新聊天入口只打开当前连接或新建，不切路由、不自动发送；共享编辑器已读回的目录直接更新同一个会话目录，不重复GET、不改变草稿的待选模型，并使旧读取结果失效。保存成功但目录读取失败只重试读取，不重复提交；未保存和在途表单通过现有离开保护链处理。
- 执行摘要：由当前会话最近assistant的ChatTurn构造只读投影，显示实际状态/工具记录及观察边界；本地历史RUNNING不等于后台执行，首帧前不伪造已确认执行。保留原候选、审批、应用、验证和接受，未新增todo状态库、执行器或恢复协议。
- 尚未实现：DSH原生插件/SDK调用和原生结构化任务计划、后端消息图/分支、富文本、多模态/MCP。完整聊天界面区域调整及用户交互接受也未宣称完成。

用户已明确后续执行归属：不部署DSH宿主，插件集中独立前端模块跟随基线升级，任务计划EAP内置。此前等待执行目标决策的前置已解除。插件所需的具体Java服务门面、计划领域持久化及消息图仍按确定路线分步实施；这些能力尚未编码，不把本次方案收敛或已有G1提升为全范围完成。
