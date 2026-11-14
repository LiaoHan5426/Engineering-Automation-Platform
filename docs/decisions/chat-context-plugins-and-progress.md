# 聊天上下文交互、DSH 插件兼容与执行计划评估

日期：2026-11-14。状态：**按 PR #7 人工评审补充的技术方案，未实施、未动态验证、未取得交互接受。** 本文补充[CT-02 聊天方案](deepseek-chat-adaptation.md)，不把“参考 DSH”理解为直接更换 Vue/Spring AI 或已经支持所有 DSH 插件。当前进度统一见[台账](../planning-status.md#ct-02-chat-adaptation)。

## 1. 日常操作留在当前对话

现状依据：[TaskComposer](../../frontend/apps/web/src/features/chat/TaskComposer.vue)的专家管理和模型设置入口会跳转全页；[DesktopNavigation](../../frontend/apps/web/src/features/DesktopNavigation.vue)在专家/设置区域显示返回来源会话，并按 workbench.origin 返回；[App](../../frontend/apps/web/src/App.vue)离开任务工作面时记录的是来源视图并关闭面板，来源本身不是精确会话身份。已有[知识选择](../../frontend/apps/web/src/features/chat/KnowledgeExpertSelector.vue)及[Skill 选择](../../frontend/apps/web/src/features/chat/SkillSelector.vue)使用 Dialog，可复用其上下文保护模式。问题应在入口和交互承载方式解决，不能只删“返回”按钮而仍让普通选择离开对话。

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

## 2. DSH 执行任务列表与摘要面板

[SessionPanel](../../frontend/apps/web/src/components/SessionPanel.vue)现有“任务列表”是草稿、sending、候选文件数、终端和验收入口等五个固定步骤；[ChatBinding](../../frontend/apps/web/src/features/shell/workbench.ts)未提供执行事件或结构化 todo。它不能作为执行进度真相，也不应静态显示“无执行号/验收未完成”来替代实际证据。[ChatTurn](../../frontend/apps/web/src/features/chat/chatSession.ts)已有执行身份、状态、工具事件与候选，[事件投影](../../frontend/apps/web/src/features/chat/eventProjector.ts)已有执行身份和序号去重；优先利用这些真实数据。

DSH 参考固定为 [39163dd3](https://github.com/deepseek-ai/deepseek-harness/tree/39163dd30f703a79079e2d2446545cff3c453738)。[todo 类型](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/todo/tool-todo/src/types.ts)只有 content 与 pending/in_progress/completed，无稳定条目ID；[todo_write](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/todo/tool-todo/src/index.ts)要求所属 agent 会话，每次追加 `todo/write` **完整列表快照**，同一轮内回放以最新一次为准，可按配置允许多个进行中；实际投影在turn/start清为null，turn/end保留刚结束的列表直至下一轮开始（stateVersion 2）。列表是会话日志投影，不是业务任务状态，不是工具成功或验收证据；不能把数组下标当作跨版本任务身份。DSH列表的事件历史属于agent会话，但当前展示不跨新轮自动延续；README/类型注释的“最新列表”概述不能覆盖实现的turn/start重置。EAP桥接需映射轮次边界，不能误写为永久站立计划或EAP每执行独占列表。

| 摘要区域 | 唯一权威来源 | 行为与边界 |
|---|---|---|
| 会话概览 | 当前会话/分支、模型及引用投影 | 保留当前概览，详细内容按需展开，不重复铺陈全部诊断 |
| 当前执行 | 选中 ChatTurn 的 executionId、状态及真实事件 | 显示进行中/取消中/真实终态；切换分支不改变执行。历史或不可恢复要明确，不能合成后台任务 |
| 执行计划 | 原生 EAP 执行域的结构化计划，或显式选择的 DSH agent 会话的 todo 投影 | 按执行目标选择一个权威来源；没有列表则不伪造进度。DSH 列表保留源session/事件序号及产生更新的执行关联，不伪装为 EAP 原生执行状态 |
| 产物与验证 | 原 Proposal/Generation、验证结果、Task/Run 和人工决定 | 链接原证据；计划全部 completed 不自动应用源码、通过检查、完成看板任务或确认验收 |

原生 EAP 路径需在现有执行域定义有界完整快照、revision/序号、会话/执行/消息关联、更新权限和读取接口；先确定是否需要跨轮延续，再设计条目身份与重排语义。状态词表由该域的后端常量拥有，前端从合同派生，不增全局状态枚举；与 DSH 源协议之间显式适配，非法状态应拒绝。模型只可写计划说明及进展，不能写审批/验收真相。若没有实际执行能力，PLAN 的文字计划仍只是计划材料，不自动拆成看板任务或启动 Run。

任务工作记忆的目标/约束/事实与执行计划职责不同，不把 todo 塞进工作记忆或另建前端 localStorage 权威库。原生列表随现有事件/快照合同同步后端、runtime-client、独立 Mock 和 UI；DSH 列表由 DSH 日志拥有，EAP只读投影，不双写两套列表。分支、会话、目标 agent 之间分别隔离；并行子 agent 列表注明归属，不能混成一份主计划。

先替换误导的固定步骤为真实当前执行投影，再接结构化计划。验收包括首次无列表、完整替换/清空、DSH新轮开始清空及轮终态保留、重复/乱序/序号缺口、多个进行中策略、切换会话/分支、取消/失败后未完成项保留及真实终态。执行停止不自动把剩余项改为完成；不向 DSH 三态中塞入 EAP 的 UNKNOWN。刷新、日志淘汰及重启分别按实际存储能力说明，不能用浏览器历史或 DSH 持久日志为原生 EAP 跨重启接管背书。

## 3. DSH 插件复用评估

目标是让已有插件在明确宿主与版本下尽量复用原包；是否“直接使用”必须逐插件、逐贡献类型验证，不能只凭 npm 安装成功或 UI 能显示就宣称兼容。

### 3.1 宿主合同与兼容矩阵

固定版本的[manifest类型](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/util/package-manifest/src/types.ts)使用 npm dependencies/peerDependencies、engines.dsh/node，及 dsh.manifestVersion、bundle.patch/platforms、profile.bundles、client.platform/inject/immediately/external。bundle.patch 是 Loader 组合，不是 Vue 组件清单；client.inject 是客户端包图依赖，不等同于 Cordis 服务注入。[原生Skill工具](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/skill/tool-skill/src/index.ts)需要 agents/tools/skills/workingDirectory 服务、agent执行上下文及生命周期。Java后端不能直接执行这些Node模块。

[客户端模块服务](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/modules/src/index.ts)扫描宿主挂载项并生成 `window.__DSH_BOOT__` 图、bundle与资源；[Web模块表](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/web/src/platform.ts)共享 React/Cordis/store/slots 等模块身份。[ui-theme包](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-theme/package.json)有Host及 ./client 双入口和服务/槽位依赖。因此 Vue 内挂一个 React root 只解决DOM挂载，不会得到完整插件兼容。该版本源码要求 Node >=24.9.0、pnpm 11.28.5；不能覆盖EAP现有Vite+/workspace工具链。

| 插件/资源类型 | EAP现状与可行路径 | 能否直接使用原包 |
|---|---|---|
| SKILL.md指令、静态文本资源 | 复用原材料，经现有Skill导入、来源/digest/路径/预算/能力校验；脚本及复杂资源另评估 | 有条件复用内容，不等于支持DSH的Skill运行时 |
| 独立MCP服务器/端点 | 用EAP自己的MCP客户端连接同一服务器，逐项验证传输、协议版本、认证、工具/资源/音频、超时取消 | 最适合首先验证的服务端产物复用；DSH的MCP客户端插件本身不是Java插件 |
| 原生Host工具、服务、模型/provider、Agent生命周期插件 | 在版本匹配且服务齐全的DSH Node宿主运行；EAP通过显式桥接消费结果 | 原包可在DSH宿主试点，当前EAP不能原生加载；移植Java或包装远程服务属于适配 |
| Host/client双入口UI插件 | 需完整boot图、共享模块、Cordis服务、store/React槽位、remote、主题/资源与dispose | 当前Vue Host不兼容，保留为独立兼容宿主试点；完整DSH iframe是另一工作面，不算EAP原生插件 |
| 无DSH依赖的普通JS库 | 按现有依赖、许可、体积及浏览器兼容检查选择性复用 | 库复用，不证明插件兼容 |
| 本机可执行/浏览器/桌面能力包 | 还需目标OS、程序、显示服务、工作目录和授权；platform声明仅作准入输入 | 逐部署验证，缺依赖明确不可用，不自动安装或降级 |

[DSH MCP实现](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/mcp/mcp-client/src/index.ts)的传输、命名及资源能力与EAP不应默认视为同等；不支持的协议/结果类型必须清楚拒绝。Claude Code等hook适配也只覆盖其实现子集，不能据此承诺兼容任意其他生态插件。

### 3.2 三条集成路径的取舍

1. **EAP原生协议/材料复用（优先）**：原Skill材料、同一MCP服务器或普通无框架逻辑进入现有EAP路径。复用范围有限但不增加第二套模型循环；最先用这一条交付可验证增强。
2. **保留原生插件的DSH宿主桥接（条件试点）**：[SDK协议](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/sdk/protocol/README.md)和[stdio服务端](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/sdk/server/README.md)确实存在，NDJSON JSON-RPC可由Java适配。但它驱动完整agent/session，不是通用plugin.invoke或tools/call。prompt回执只是排队入箱；事件/状态是会话/agent级，不是每次请求独占结果。当前无per-session close或prompt-cancel、无协议版本协商，且事件通知包含运行时各会话，必须做所有权隔离。选择DSH目标时，由DSH单独拥有其会话、模型工具循环和日志；EAP负责接入/显示及核心业务边界，不能两个Agent同时执行同一对话。
3. **DSH客户端兼容宿主或完整应用嵌入（后置比较）**：适合确实需要原UI插件的场景，需测完整依赖闭包、隔离与交互成本。完整应用iframe必须处理来源、身份、导航、文件及审批归属，不靠共享cookie或任意postMessage放权；选择性移植区域交互通常更适合现有Vue。不能为一句“插件兼容”重写全站。

上游另有[类型化API网关](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/api/gateway/README.md)，按Remote声明、codec、Peer和资源所有权导出有限方法；它不是所有插件函数自动可调用的HTTP门面。需要某一服务时先核实已导出的方法及权限，未导出时需新的受审包装，不虚构通用桥接协议。

若走SDK试点，明确 EAP conversation/operation/execution 与 DSH session/message/event 的映射、排队/运行/结束边界、历史读取与恢复策略。DSH resume保留原存储身份，不把历史当新通知重新播放。请求超时不代表回滚，不自动重复提交；进程崩溃/断连不能伪报成功。无细粒度取消时只可在隔离进程范围内验证整进程停止及影响，不能把shared宿主shutdown包装成“停止当前回答”。审批与用户提问回调必须正确路由、失败关闭，插件不能获得EAP源码应用/验收权限。

### 3.3 安装、凭据与运行安全

[DSH插件管理器](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/boot/plugin-manager/README.md)说明Host插件在进程内执行，不受工作区沙箱约束。来源可信、固定版本/校验、依赖脚本授权、配置与实际激活分别验证；“安装成功、选中、启用、激活、可调用、需重启、失败”是不同观察，不能一个开关代表全部，也不凭空新增一套通用生命周期枚举。回滚配置/lock不保证撤销脚本和文件副作用。首批只选受审的固定产物，按隔离边界配置独立profile/home/process，必要时OS用户/容器/文件和网络边界，不能称Manifest自身能沙箱任意代码。

[凭据存储](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/credentials/credentials-local/README.md)是Host能力；完整secret不传到浏览器、配置导出或日志。共享同用户目录不等于租户隔离，轮换/重连、卸载后凭据保留/撤销/删除分别定义。安装、配置、启用、工具授权、授予构建脚本权限是不同动作，不因聊天选择插件而自动合并。

仓库已有[dsh-ai-team兼容失败记录](dsh-ai-team-batch.md)：npm包安装成功但缺失宿主导出导致激活失败，并涉及自动提交/合并行为。仅作为历史反例，不据此判定所有DSH插件不可用，也不重新启动已停止的旧适配任务；新的试点必须核对确切runtime/plugin版本组合与副作用。

## 4. 分步实施与证据关口

| 阶段 | 本轮规划交付/后续实施 | 通过条件 |
|---|---|---|
| G0 源码与交互评审 | 当前文档阶段；完成入口分类、DSH区域对照、插件分类矩阵、会话/执行/todo归属 | 有固定源码与明确未知项；可点击原型明确模拟，用户先接受交互；不以文档代替已实现 |
| G1 上下文与真实执行投影 | 在原A/B/C切片中接入Dialog/Drawer与当前执行摘要，删除被替代入口和误导固定步骤 | 每个受影响入口、原草稿/引用/焦点/滚动、来源恢复、真实执行事件和UNKNOWN逐项验证；同场景真实Before/After |
| G2 有界能力与计划试点 | 原生执行域计划合同；一个文本Skill、一个stdio及一个HTTP MCP服务；若需原生插件，以固定版本的headless `@deepseek-ai/dsh-tool-todo`为首个SDK隔离试点，依赖由DSH完整宿主提供 | 合同/Mock/调用方同批更新，失败/取消/撤权/超时/脱敏/资源释放通过；DSH试点另验session归属、回执去重、审批、重启及取消缺口，不宣称原生EAP持久接管完成 |
| G3 原UI插件与扩大兼容 | 仅在必要时对一个双入口插件测React/Cordis兼容宿主或完整应用嵌入，与Vue选择性移植比较 | 挂载/卸载/dispose、重连、共享模块/资源/主题、窄屏、XSS、身份/审批隔离通过后才纳入兼容清单；升级只对已验证版本元组承诺 |

本次只更新方案，不安装插件、开新服务、迁移会话、执行模型或改产品UI。后续实施需按上述合同先做最小可验证切片，不新增平行Capability注册表，不为可选DSH目标重复实现EAP已有工程写入/审批路径。用户接受、Mock交互、真实后端、供应商/DSH动态能力及构建/静态检查分别记录。

本轮证据为固定版本源码审阅、原实现与文档对照。应用测试、构建、浏览器、DSH动态插件/SDK、模型、MCP和数据库均未运行；规划中的兼容结论是附条件可行性，未证明现有EAP已支持DSH原生插件。

文档验证：`git diff --check`通过；Python 3检查六份变更Markdown的UTF-8无BOM、277个本地文件链接目标及18个固定DSH源码链接在上游树中存在，均通过。独立只读复核对照实际代码纠正了DSH todo新轮重置行为；外部链接树校验与源码审阅不是运行时兼容验证。
