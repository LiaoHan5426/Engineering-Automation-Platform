# Engineering Automation Platform：前端产品原型与技术架构调整方案

> 版本：1.6（基于 v1.5 修订）· 2026-10-23（Spring AI 2.0.2 架构对齐）\
> 原始静态审查基线：GitHub `main`，提交 `1b9a556a7bc29a6e87d6554325eadfa08adf5404`（2026-10-13）；后续本地交付报告基线：`a9b14bc`（用户提供，未在本次文档编辑中重新验证）\
> 仓库：https://github.com/LiaoHan5426/Engineering-Automation-Platform\
> 适用对象：在本地仓库工作的 Codex / AI 编码代理\
> 实施原则：先审计、后建立可交互产品原型、经人确认后渐进重构；不得自行把整个项目推倒重写。

> **v1.6 架构优先级声明**：本版将 v1.2 的“固定双模式”升级为 **可安装的工作台插件平台**。下文旧章节中“两个一级入口”“固定双模式”“M0 双入口”等表述仅代表初始预装插件与迁移期验收，不再是永久性架构约束。新实现以 §2B 为最高优先级。禁止将任意第三方插件代码直接动态注入 Electron 渲染进程。

## 0A. Spring AI 统一集成决策与最新实施基线（v1.6，覆盖旧 LLM 自研建议）

> **来源区分**：本节 Spring AI 交付状态依据 2026-10-23 用户提供的本地实施与收敛报告摘要；本次仅修改上传的规划文档，未直接读取本地 `J:\Code` 仓库、运行测试或验证真实供应商连接。原文中以旧 GitHub main 为依据的“当前情况”“尚无”均应视为历史静态基线，实施时以当前工作区为准。

### 0A.1 已交付与未交付

| 事项 | 当前状态（来自已报告的本地交付） | 后续要求 |
|---|---|---|
| 运行基线 | Java 25 / Spring Boot 4.1.1 / **Spring AI 2.0.2** | 保留 Maven reactor 与官方 Spring AI BOM / Starter；版本变化须重新核验兼容性 |
| 通用模型调用 | `EngineeringChatService`、`EngineeringAiConfiguration`、Spring AI `ChatClient` 已落地 | **不再自研 ModelProvider、HTTP/JSON 模型协议层或基础 Tool Calling Loop** |
| 工具调用 | Spring AI `ToolCallingAdvisor` / `ToolCallingManager`，只读 `gitStatus`，复用 `GitInspectionHandler` 和 Capability 权限 | 模型仅提出工具请求，EAP 负责路径、授权、审计与实际执行；保持工具调用上限 |
| SQL 专家 | `OpenAiCompatibleProvider` 保留为业务兼容桥，底层已转 Spring AI；确定性规则、缓存、失败回退保留 | 不把规则输出标成模型分析；迁移旧配置与旧测试时保持业务语义 |
| 会话与证据 | 内存 `ChatMemory`；复用 executionId、Outcome、Trace、Artifact | 内存记忆不是持久会话，也不是任务审计或可恢复 Mission |
| 测试 | 最新报告：190 项、186 通过、4 条件跳过、0 失败；`git diff --check` 通过 | 该数字是**报告基线**，不是本文件修订后的重新执行结果 |
| Chat UI / 模型设置 | 尚未接入 `EngineeringChatService` 的用户可操作 Chat UI；真实模型连接未验证 | 先做模型状态显示与最小对话接线，区分 configured / verified / unavailable |
| Workspace Plugin / Builder / Mission / P1-D | 尚未完成（据本轮交付报告） | 按 §2B 与 §2A 分阶段推进，不因 Spring AI 接入而视为已完成 |
| 外部编码 Agent | 现有 CodexAdapter 保留；真实文件修改验收仍存在独立问题 | Codex/Claude Code 属于外部 Agent 后端，**不是 Spring AI ChatModel 的替身** |

### 0A.2 责任边界（规范性决定）

```text
Chat / SQL Expert / 后续 Mission / Builder AI 辅助
                   |
                   v
          EAP AI Application Service
                   |
          Spring AI 2.0.2
      ChatClient / ChatModel / Tool Calling / ChatMemory
          |                     |
   官方模型 Starter          EAP 受控 ToolCallback
   (按需扩展供应商)            -> Capability/Policy/Executor
                                 -> Trace / Artifact

外部编码 Agent：CodexAdapter / 后续官方协议适配器
    -> 独立会话、审批、执行与证据；不伪装成普通 ChatModel

Mission/Run/Approval/Verification：EAP 领域层，不能由 ChatMemory 替代
Workspace Plugin：Vue UI 扩展层，不等于 Spring AI Tool / MCP / Skill
```

**原则**：Spring AI 负责通用模型接入、消息、Advisor、工具调用编排及可选记忆/MCP 客户端集成；EAP 负责工具权限、确定性工程能力、任务状态、审批、执行证据、持久化和独立验证。Spring AI 的 MCP 支持并不意味着现有 EAP MCP 登记服务已经完成真实协议接线，必须核对当前实现与授权桥接后再宣称可用。不得同时维护第二套模型 Provider 注册与调用循环；确有业务兼容需求时允许保留薄适配桥。

### 0A.3 真实接入和前端展示合同

- **模型连接状态**：至少区分 `disabled`、`not_configured`、`configured_unverified`、`available`（只有真实验证后）、`error`；不因配置存在就显示连接成功，不自动为探测发起计费调用。
- **配置**：Spring AI 官方配置为模型连接事实源；旧 `EAP_LLM_ENABLED` 等属性不能隐式代表旧连接仍可用，迁移按 `docs/environment.md`；API Key 不得返回前端或写入 Trace/Artifact。
- **Chat Workspace**：通过受控 EAP API 调用 `EngineeringChatService`，显示真实/模拟模式、所选模型、工具调用与授权结果；首次可用最小 HTTP 接口，流式/SSE 按体验需要迭代。不得由浏览器直接持有供应商密钥。
- **多供应商**：优先使用 Spring AI 官方 Starter 和模型能力声明，按需求逐个增加；OpenAI-compatible 并非所有供应商的通用语义保证。
- **测试**：普通对话、工具调用、权限拒绝、错误码、SQL 业务回退均使用 Spring AI Fake ChatModel 与真实 EAP 受控工具验证；离线测试不等于真实供应商认证或计费验收。

### 0A.3A CLI / MCP / Agent 接入与运行边界（2026-10-24 收敛补充）

本补充约束本文全部工具接入与执行底座建议。详见 [CLI、MCP 与 Agent 工具接入边界及 Cursor 收敛计划](decisions/tool-integration-runtime-boundaries.md)。共享工作区、单一 Git 入口和后移跨重启接管已落在当前工作区。日常服务的授权根没有改。调度、审批、MCP 和 Harness 没有加入。

- 已有本地确定性能力直接复用 Capability / Handler / ProcessExecutor；MCP 用于已有外部工具服务或互操作需求，不作为本地 CLI 的必选包装。MCP 提供协议，不自动提供目录隔离、执行授权或进程恢复。
- 命令模板属于能力实现，进程生命周期属于共享执行器，Mission 只记录/关联/投影。Chat、Expert、Mission 不得为同一 Git 操作另拼命令或另建执行器；需要平台执行号时局部扩展已有入口。
- 工作区、授权根、本机身份和显示标签属于共享运行时，不能让工程执行依赖 AI 包。解析/启停、路径、参数及环境策略分别校验；本机标签不是认证。旧 AI 授权根配置迁移必须显式兼容、冲突拒绝，不能扩大授权。
- 保留参数数组、服务端目录、超时、输出限额和脱敏；不因只读工具接通而建设完整 Mission 调度、审批、跨重启进程接管。证据不足记结果未知并阻塞下一次启动。人工解除机制尚未实现，不能算可恢复 Mission。不把缺 PID 或父进程消失当作进程树已结束。
- Codex / Hermes 的可借鉴之处是内置工具复用、外部协议薄适配及策略/运行环境分离，不是复制其整套 Agent 底座。对照来源、运行步骤和下一轮 Cursor 修改清单见上述边界文件。
- Harness 也是优先评估的复用形式：已有 Agent 宿主满足需求时，EAP 通过受支持 CLI / SDK / 服务协议做配置、调用、关联和独立验证，复用其工具循环、上下文与运行能力。只针对已证明的业务缺口补实现，不另造 Harness；简单确定性操作仍直接使用本地能力。选型边界见上述文件 §6A。

旧 §2C.3 中完整取消、恢复、重连等要求是对应能力的验收目标，不要求每个最小切片一次实现；不得以旧阶段清单为由绕过用户确认扩张底座。已有保护和真实进程回归测试仍须保留。

### 0A.3B 本地配置与动态选择（2026-10-24 用户纠偏）

模型连接与外部 Agent 应允许用户在本地设置中配置、启停和切换，不由启动配置固定唯一目标。后端仅提供本地持久化、凭据保护及受控执行；不把用户配置权等同浏览器直连供应商。动态模型连接复用 Spring AI 程序化构建，不自研模型协议；外部 Agent 继续独立适配。旧“Spring AI 官方环境属性为唯一事实源”的表述仅对应 S1 历史实现，不再约束后续产品。详见 [工具接入边界 §9](decisions/tool-integration-runtime-boundaries.md)。OpenAI 兼容连接的保存、选择和确认切换已落地，并在此停止。连接管理是工程工作台的辅助设置，工程任务交付才是产品主线；默认入口不改成通用聊天。Codex/Hermes 继续走各自的运行入口和已有配置，不经过这条 Spring AI 连接，也不把 SQL 压缩和缓存套到对话或外部 Agent。没有模型连接时，本地确定性能力和手工 Builder 仍可使用。后续优先补真实工程任务的端到端交付，不再连续增加模型管理功能。
### 0A.3C 产品主流程与专家语义纠偏（2026-10-24）

用户主路径为输入需求、引用文件、选择协作专家及模型/Agent、推理强度与审批模式，发送后完成工程任务并审阅结果。专家目标为配置驱动的专业角色与资源依赖，现有静态 DAG/SQL 管线是可复用实现事实，不是永久产品定义。原型到代码为可优先验证的独立场景，不是普通仓库需求的前置；不要求先经过 Handoff/Mission 或继续建设完整底座。下文旧阶段列表中将完整 Mission、Builder 或固定 SQL 工作台当作通用交付前置的内容，以本补充为准。详见 [扩展边界的主路径纠偏](decisions/extension-boundaries.md)。先交互验收，再跑一个真实需求的纵向闭环；不将配置和记录完成当作需求交付完成。
### 0A.4 更新后的最近阶段优先级

1. **S0 已完成（据本地报告）**：Spring AI 集成、旧 LLM 兼容桥与测试迁移；`docs/audits` 历史测试产物清理需按实际工作区继续核对，不可把删除报告当作清理全部完成。
2. **S1 当前最小闭环**：核对现有 Chat/模型设置入口；实现最小模型状态与对话 API/UI 接线，复用 Spring AI 与 EAP 权限/审计；Mock 与真实状态明确分离。保持可在模型关闭时操作工作台原型。
3. **S2 v1.5 产品主线**：遵循 §2B，完成可信 Workspace Plugin 注册、预装 Chat/Builder 与可交互原型（原 §2A M0）；先用户验收再推进完整 Mission Runtime。
4. **S3 后续**：Builder Handoff、可恢复 Mission、独立验证 P1-D、外部 Agent 协议适配按各自验收关口推进。

**覆盖关系**：本文旧章节出现的“新建通用模型 Provider / 手写 LLM HTTP / 自研 Agent 工具调用循环 / 重新接入模型”的建议均由本节替代。旧阶段列表中涉及 AI 的工作应理解为**复用已落地 Spring AI 并补业务接线**，不应重复建设底层框架。原有插件化、Builder、Mission、Electron、安全与原型验收约束仍有效。

---

## 0. 核心结论与更正

项目**已经采用 Vue 3 + TypeScript + Vite+ + pnpm workspace + Tailwind CSS 4**，存在 `@eap/ui` 组件包和设计 Token；**不是“没有走 Vue/Vite 技术路线”**。问题是尚无真正可交付的 Electron 应用、共享 UI 原语不足、页面级职责集中、产品体验偏“规则/配置管理后台”而非“面向任务的开发 Agent 工作台”，以及原型与产品视觉/任务模型未经过用户验收。应保留已有技术资产，通过渐进式重构解决。此前建议的 shadcn-vue/Pinia/Vue Router/Monaco/xterm 是候选技术，不应因“此前推荐”而无条件全量安装。

产品必须同时提供 **Agent 工作台（对话 + 自主任务看板）** 与 **构建工作台（手动可视化原型 + 指定仓库开发）** 两个一级入口；二者共用任务执行、仓库、审批和产物基础设施。详见 §2A。\n\n项目核心定位必须保持：**本地确定性工具优先，必要时升级调用 LLM 或外部 Codex 等编码 Agent，结果独立验证**。这不同于纯聊天工具，也不能退化成只输出固定规则的 SQL 检测控制台。UI 的首要对象应是 `Workspace → Session → Task/Run → Steps/ToolCalls/Artifacts/Approval`；专家、规则、能力等是次要管理面。

## 1. 已验证的仓库事实

| 检查项目 | 证据路径 | 结论 |
|---|---|---|
| 技术栈 | `frontend/package.json`、`frontend/pnpm-workspace.yaml`、`frontend/apps/web/package.json` | Vue 3、TS、Vite+、pnpm 12、Tailwind 4 已存在 |
| Web 前端 | `frontend/apps/web/src/main.ts` | 直接 `createApp(App).use(i18n).mount`；尚未看到 Vue Router/Pinia 初始化 |
| 前端结构 | `frontend/apps/web/src/App.vue` | 页面数组、hash 导航、大量任务/工作区/API/SQL 状态置于根组件；重构优先对象 |
| UI 复用 | `frontend/packages/ui/src/index.ts` | 只有 Button、Badge、Feedback、Panel、MetricCard、EmptyState、StatusCard、ConfirmBox 等基础组件 |
| 业务页面 | `frontend/apps/web/src/features/*` | capability / database / expert / knowledge / rule 管理器已经拆分，保留领域逻辑 |
| 工作流编辑 | `frontend/apps/web/src/components/WorkflowCanvas.vue` | 手写 SVG 连线、拖拽、缩放；**这是 Agent DAG 编辑器，不是页面原型设计器** |
| 原型 | `docs/prototype/console.html`、`docs/frontend-prototype.md` | 有 HTML 交互原型；已实现验证大量原型行为，但不代表产品任务路径正确 |
| 桌面方案 | `docs/desktop-spec.md` | 已明确 Electron、preload 桥、安全约束，是**设计决定** |
| 桌面实现 | 仓库递归文件树及 `frontend/apps` | 截至基线仅 `apps/web`，尚无 `apps/desktop`；不要把设计写成已实现 |
| 后端约束 | `README.md`、`docs/architecture.md`、`AGENTS.md` | Java 25 / Spring Boot，deterministic-first / LLM-last；已有 API 和执行模型，不应为换 UI 改写核心规则 |
| 测试 | `frontend/apps/web/src/tests` 等 | 已有行为测试和边界检查，应保持并增添端到端任务流测试 |

**审查限制**：本次对 GitHub 代码和文档做静态审查，没有本地安装依赖、运行 Electron、执行浏览器截图测试或检查尚未推送的本地变更。后文的产品和框架建议属于改造设计，不应被标记为代码已实现。

## 2. 产品定义：从管理控制台转为 Agent 工作台

### 2.1 典型任务闭环

用户选择本地代码仓库 → 新建会话/输入自然语言任务 → 明确执行模式与授权范围 → 系统选用本地工具获取证据 → 系统判断本地能力能否完成 → 若不足，展示升级执行计划与成本/权限 → 可调用编码 Agent → 逐步展示工具调用、输出和差异 → 独立校验（测试/构建/静态检查） → 用户审阅并接受/撤销结果 → 沉淀任务与证据。

**体验重点**：用户随时知道“当前在对哪个仓库、做什么、是否真的调用了模型/外部 Agent、改变了哪些文件、是否有待批准操作、最终验证是否通过”。

### 2.2 产品导航 / 信息架构（建议）

- **工作台（默认入口）**：工作空间选择、会话列表、主任务对话、执行过程与结果检查；用户打开应用首先进入这里，而不是指标卡总览。
- **任务记录**：历史 Run、步骤、日志、Diff、失败重试、验收状态；能从聊天直接跳入对应运行。
- **专家与编排**：自定义专家、DAG 编辑、工具授权；作为高级能力入口，非每天的默认工作流。
- **知识与规则**：知识库、规则包、数据库资料；作为辅助资源放入二级导航或设置面板。
- **连接与设置**：LLM 提供方、外部 Codex 等 Agent、Git/SVN、MCP、权限、环境诊断与桌面更新。

禁止将所有领域对象都作为左侧永久一级菜单；优先按使用频率与用户任务组织导航。SQL 专家是一个可插拔任务类型，不应主导整套产品的信息架构。

### 2.3 关键界面合同（原型必须先做）

**P0：Agent 主工作台**

```text
┌──────────────────────────────────────────── Title/Workspace ──────────────────────────────┐
│ [仓库 ▾] [分支]                  Agent Workspace                  [连接] [布局] [设置]      │
├─────────────┬─────────────────────────────────────────────┬──────────────────────────────┤
│ 会话        │ 会话标题 / 执行模式 / 上下文               │ Inspector（可收起）          │
│ + 新建      │                                             │ 文件 Diff / 工具详情 / 日志 │
│ 最近会话    │ 用户指令                                    │ 批准请求 / 校验结果          │
│ 按工作区分类│ Agent 分析与计划                             │                              │
│             │ 步骤时间线（工具名、状态、耗时）             │                              │
│             │ 可折叠执行输出和失败原因                     │                              │
│             │                                             │                              │
│             │ [附件] [输入任务……………………] [模式] [发送]  │                              │
├─────────────┴─────────────────────────────────────────────┴──────────────────────────────┤
│ Backend ● / Agent ● / branch / workspace / 当前任务状态                                  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

交互必须包括：选择仓库、新建会话、发送消息、任务开始/中断、选择执行模式（仅分析/建议修改/允许执行）、折叠步骤、查看文件差异、批准或拒绝高风险操作、结果验收、离线/失败/空状态、重启恢复。原型可使用模拟数据，但**每个入口必须能产生可见状态变化**，不可只是静态卡片。

**P1：任务详情**：时间线、阶段状态（queued/running/waiting_approval/succeeded/failed/cancelled）、工具调用输入/摘要、输出/错误、产物链接、校验结果、可重试动作。**P1：外部 Agent 接入设置**：发现 CLI、探测版本、鉴权状态、工作目录、授权与隔离、执行适配器能力矩阵。**P2：可视化 Expert DAG**：节点连线、输入检查、草稿、执行预览；明确它不等同于“页面拖拽原型工具”。

## 2A. 产品核心升级：两种工作模式、一个执行底座（v1.2 新增，优先级高）

### 2A.1 产品定位

EAP 是**个人工程自动化 Agent 平台**，不是仅提供“输入问题 → 调用模型 → 返回答案”的聊天机器人，也不是独立的低代码网站搭建工具。平台应同时提供两种面向用户的一级工作模式：

1. **Agent 工作台（Agent Workspace）**：对话发起任务，同时提供类似 Hermes 的**自主任务看板**。用户给定目标、工作目录、完成条件和授权边界后，系统可以在允许范围内自行规划、调用确定性工具、必要时委派外部 Agent、执行测试、复核结果、持续更新状态；需要审批时暂停，不依赖用户一直在线对话。
2. **构建工作台（Builder Workspace，建议名称）**：用户自己通过可视化组件搭建可交互原型，AI 仅是可选的局部辅助。原型与具体 Git 仓库绑定，经用户批准后生成开发任务，在对应仓库的隔离分支/工作树中落地 Vue 代码、测试和预览，形成设计—实现—审阅闭环。

这两个模式共用 Workspace/Repository、Task、Run、Artifact、Approval、Tool Capability、Audit Log，不应各造一套任务引擎。**会话是交互入口，不是执行生命周期的容器；任务必须独立于聊天窗口存续。**

### 2A.2 一级导航与使用体验

建议导航如下（最终名称可在原型阶段验证）：

```text
EAP
├─ Agent 工作台
│  ├─ 会话（Chat）            # 快速问答、需求讨论、手动执行
│  ├─ 任务看板（Mission Board）# 目标驱动、可后台持续推进的任务
│  ├─ 执行记录（Runs）        # 步骤、工具、日志、证据、产物
│  └─ 审批中心（Approvals）   # 高风险操作、Diff、合并确认
├─ 构建工作台（Builder）
│  ├─ 项目与仓库（Projects）
│  ├─ 原型设计器（Designer）  # GrapesJS + EAP 组件协议
│  ├─ 交互预览（Preview）     # 不依赖模型、可点击
│  ├─ 开发交付（Handoffs）    # 原型版本 -> 实施任务
│  └─ 实现审阅（Review）      # 代码 Diff / 预览 / 验收
└─ 平台管理
   ├─ Agent/模型/工具与能力
   ├─ 专家/规则/知识库
   └─ 环境与安全设置
```

原有专家、规则、知识、数据库和能力目录保留，不应被删除；它们由当前一级主导航降为支持 Agent 的管理功能。允许从任意原型版本创建任务，允许从任务打开其来源原型与目标仓库。

### 2A.3 Agent 工作台：会话与自主任务看板是不同交互模型

| 维度 | 会话（Chat） | 自主任务（Mission） |
|---|---|---|
| 入口 | 用户输入问题或指令 | 用户提交目标、仓库、约束、验收标准 |
| 生命周期 | 以交互轮次为主 | 独立持久化、可跨会话、跨重启恢复 |
| 执行 | 用户可逐步引导 | 在授权边界内自主分解、执行、验证、重试 |
| 展示 | 消息流、工具调用卡片、附件 | Kanban、进度、阻塞、计划、执行时间线 |
| 结束 | 回复/总结 | 达到验收条件、用户取消或明确失败 |
| 权限 | 当前操作逐次确认 | 预授权策略 + 高风险操作审批 |
| 交付 | 文字/文件/建议 | 分支、Commit、Diff、测试证据、产物、总结 |

任务看板至少支持 `收件箱/待规划 → 待执行 → 运行中 → 等待审批/阻塞 → 待验收 → 已完成/失败/取消`；状态名应由后端枚举统一定义，前端不能以字符串推断真实执行状态。`等待审批` 与 `阻塞` 在数据模型中是不同原因，视觉上可以合并泳道但不能混为一谈。

**任务卡片最小信息**：标题、目标、绑定仓库及分支、执行者（内置/外部 Codex 等）、状态、最近活动、风险级别、下次动作、验收结果。点击卡片进入任务详情，显示计划 DAG、步骤与工具调用、实时/回放日志、产物、Diff、测试、人工审批与继续执行按钮。

**关键交互**：从会话“一键转自主任务”；从任务看板“补充指令/暂停/继续/取消/重新规划”；任务结束后自动生成可追溯总结并回链会话；从原型交付单生成任务；用户离开页面后任务仍由后端执行器负责，而不是依赖浏览器计时器或前端组件存活。

### 2A.4 自主任务执行架构（不等于无约束自动执行）

```text
User Goal / Chat / Prototype Handoff
                  |
                  v
Task API -> Task Store -> Scheduler/Queue -> Worker/Orchestrator
                                             |
                     Plan -> Step -> Capability Router
                                             |
                         deterministic tools / Spring AI ChatClient + EAP Tools / external Codex adapter
                                             |
                          Observe -> Verify -> Decide next step
                                             |
                      Approval Gate / Retry / Pause / Complete
                                             |
                  Event Store -> SSE/WebSocket -> Board / Run Detail
```

**后端建议接口（契约草案，必须与现有 API 盘点后确定）**：

- `POST /api/missions` 创建任务（目标、repoId、workspaceId、acceptanceCriteria、executionPolicy、sourcePrototypeVersionId?）。
- `GET /api/missions?status=...`、`GET /api/missions/{id}` 查询列表与详情。
- `POST /api/missions/{id}/actions` 执行 `pause/resume/cancel/replan` 等受控动作；应做幂等键与状态校验。
- `GET /api/missions/{id}/events` 以 SSE 推送有序事件，断线使用事件游标重连；也可复用现有事件机制。
- `POST /api/approvals/{id}/decision` 审批操作并记录操作者、范围和证据。
- `GET /api/missions/{id}/artifacts` 查询 Diff、日志、测试报告、生成文件、提交信息。

**必须有的后端机制**：持久化任务与步骤状态、幂等执行、租约/心跳防止重复 worker、可恢复检查点、超时/重试上限、取消传播、审计记录、事件序号、资源并发限额。定时任务/周期性任务属于后续扩展，不得假设现有代码已具备后台自主执行能力。

**安全原则**：个人使用不等于无限权限。仓库写入、进程启动、网络访问、外部 Agent 委派、提交与推送分别设策略；删除文件、危险命令、跨仓库写入、推送远端、合并主分支必须按策略触发人工确认。默认在临时 Git worktree/独立分支中实施，禁止直接覆盖用户未提交改动。模型只提出动作，执行器负责验证授权、路径范围和结果。

### 2A.5 构建工作台：人主导的原型 → 指定仓库开发

构建工作台不是“聊天生成网页”。它是独立一级入口，推荐交互顺序：

```text
选择/绑定本地仓库或克隆仓库
    ↓
识别项目技术栈、路由、组件库、现有页面（只读扫描）
    ↓
选择页面/模板，拖拽 GrapesJS 组件，配置布局/属性
    ↓
配置交互：导航、打开弹窗、切换状态、提交表单、Mock API
    ↓
浏览器/Electron 内真实交互预览，用户自行反复调整
    ↓
保存不可变原型版本 + 验收清单 + 组件映射
    ↓
用户点击「交付开发」并确认目标仓库/分支/范围
    ↓
创建 Mission + Handoff Manifest，交给内置工具或 Codex
    ↓
在独立 worktree 实施 Vue 组件/路由/API/测试
    ↓
查看构建预览、代码 Diff、自动测试结果；人工验收
    ↓
批准合并/继续修改；记录 prototypeVersion ↔ commit
```

**界面必须支持无 AI 完成最小闭环**：新建项目、绑定仓库、拖拽组件、修改文本与布局、设置按钮导航/弹窗、保存版本、重新打开、预览。AI 是“生成初稿、修改选中组件、补充交互、解释设计、辅助映射”的可选功能，不能是编辑器的唯一入口。

**GrapesJS 的真实边界**：编辑器自身的组件模型并非 Vue SFC。禁止直接把 `editor.getHtml()` 作为产品源码交付。应维护独立的 `PrototypeSchema`（组件语义树、交互动作、状态、路由、数据绑定、设计 Token）和版本化的组件注册表；`@eap/ui` 与项目组件需要显式注册适配器。对不支持的组件、交互或布局应阻止“自动交付”或提示人工实现，不允许静默降级。

**目标仓库绑定**：一个 Builder Project 可关联多个仓库，但每份 Handoff 必须唯一指定目标 repoId、基线 commit、目标分支/工作树、允许修改路径、框架/依赖版本、目标页面/路由、组件映射版本、原型版本、交互验收、Mock 与真实 API 映射。对非 Vue 仓库不可强制输出 Vue；先进行技术栈探测，再决定生成器/Agent 实现策略。初期明确仅支持 Vue 3 + Vite 仓库，其他栈提示不支持。

### 2A.6 数据对象与关联关系

```text
Workspace
  └─ Repository (root, remote, baseCommit, techStack, accessPolicy)
      ├─ Session
      ├─ Mission
      │   ├─ Plan / Step / Run / ToolCall / Event
      │   ├─ Approval / Artifact / Verification
      │   └─ Handoff? -> PrototypeVersion
      └─ BuilderProject
          ├─ PrototypePage
          ├─ PrototypeDraft (可变)
          ├─ PrototypeVersion (不可变)
          └─ Handoff -> Mission -> Implementation (branch, commit, diff)
```

避免把原型 JSON、任务消息、执行日志混成同一条“聊天记录”。Schema/Manifest 与执行事件应分别版本化；原型版本一经交付不可变，更改产生新版本及增量任务。持久化方案优先复用现有 PostgreSQL/Flyway；具体表结构应先审查已有 `task`、`execution`、`artifact` 数据模型，避免重复建表。

### 2A.7 两种模式之间的跨入口操作

| 起点 | 用户动作 | 结果 |
|---|---|---|
| 会话 | “把这项需求作为后台任务完成” | 创建 Mission，继承上下文摘要与仓库范围，展示看板 |
| 任务 | “打开关联原型” | 跳转 Builder 指定版本，显示实现状态 |
| Builder | “交付开发” | 生成不可变 Handoff，创建待执行 Mission |
| Builder | “让 AI 修改选中组件” | 只生成可审查的设计补丁，用户确认后应用 |
| 实现审阅 | “原型与实现对比” | 展示设计版本、运行预览、Diff 与验收结果 |
| 任务执行 | “需要我批准” | 进入审批中心；批准后从检查点继续 |
| 任务完成 | “查看总结/提交” | 显示验证证据与分支/commit，允许创建后续任务 |

### 2A.8 优先级、阶段和强制验收门槛

- **M0 产品双入口原型（首先执行）**：在现有 Vue Web App 中实现 `Agent 工作台` 与 `构建工作台` 两个入口；Agent 看板用 Mock 任务演示“创建→运行→审批→完成”；Builder 用 GrapesJS 演示“拖拽→按钮交互→保存→重开→预览→交付”。只需 Mock，不接真实自动执行；用户亲自体验并批准 IA。
- **M1 前端结构调整**：引入路由、Shell、领域状态，复用现有 `@eap/ui` 与管理页面；统一 Repository/Workspace 选择；对原型及看板增加交互测试。
- **M2 Builder 可持久化与仓库关联**：Schema/Version/Repository/Handoff 契约落地；实现仓库只读扫描与目标路径安全验证；Vue 映射 PoC，验证生成页面可构建。
- **M3 Mission 执行器**：复用既有 Task/Expert/Capability 能力，补齐任务持久化、调度、状态机、事件推送、审批、恢复；先支持单任务单 worker 和受控本地工具。
- **M4 原型驱动自动开发**：Handoff 创建 Mission，在隔离 worktree 中调用 Codex/工具，产出 Diff、测试、预览，用户审批合并；不得默认自动推送。
- **M5 Electron 跨平台交付**：复用同一 Vue UI；本地仓库选择和进程管理通过受限 IPC；Windows 优先，macOS/Linux 在实际环境验证。

**M0 验收用例**：不调用 LLM，用户能在看板创建一个模拟自主任务、观察其状态与执行详情并完成一次模拟审批；能在 Builder 手动添加按钮并设置“打开对话框”，保存后重新打开仍有效；能选择模拟目标仓库，生成可查看的 Handoff 预览；可从 Handoff 跳转到关联任务。任何一项缺失均不得宣称“双模式原型已完成”。

### 2A.9 与既有章节的关系及实施指令优先级

本节是产品架构的上位约束。旧 §2 中“工作空间→会话→任务”的路径是 Agent 模式的一种入口，**不能覆盖 Builder 独立入口**；旧 §3A 的 GrapesJS 方案应作为 Builder 的子系统；旧 Phase 0–4 是基础技术阶段，须按本节 M0–M5 的双模式交付顺序组织。对本地 AI 而言，**先实现 M0 双入口可交互原型并等待人工确认，禁止直接投入完整后台调度器或大规模 UI 重写**。

---

## 2B. 可配置工作台插件平台（v1.3 新增，优先级最高）

### 2B.1 核心决策：模式是插件实例，而非硬编码路由

EAP 的“会话”“构建工作台”只是 **预装 Workspace Plugin**。未来 SQL、Git、任务看板、知识库、数据库管理甚至自定义工作台，都可以作为独立插件注册；用户可以安装、启用、禁用、排序、配置、升级。**任务看板可作为独立工作台插件，也可以作为会话插件的子页面**，但其后端 Mission 生命周期不依赖 UI 插件存活。支持多个实例，例如 `builder:project-a` 与 `builder:project-b` 使用不同仓库、主题或默认组件集。

推荐概念模型：

```text
EAP Core Shell (固定、可信)
 ├─ Extension Registry / Plugin Manager / Permission Center
 ├─ Navigation Registry / Command Registry / Slot Registry
 ├─ Workspace Instance Registry / User Preferences
 ├─ Mission + Run + Approval + Artifact + Repository services
 └─ Plugin Host / Extension SDK
       ├─ @eap/plugin-chat       -> Chat / Session / Mission Board
       ├─ @eap/plugin-builder    -> GrapesJS / Prototype / Handoff
       ├─ @eap/plugin-sql        -> SQL editor / expert integration
       └─ community/custom      -> isolated, permissioned extension

Agent Skill / MCP / Capability: separate registries, linked by plugin dependency declarations.
```

**不要把工作台插件、Skill、MCP 合并为一个概念。** 插件描述 UI/交互/配置，Skill 描述 Agent 指令或流程，MCP 描述外部工具协议，Capability 是受控操作接口。一个插件包可声明所需 Skill/MCP/Capability，但不能因安装插件自动获得敏感工具授权。

### 2B.2 分层插件模型

| 层级 | 可扩展内容 | 运行边界 | 初期策略 |
|---|---|---|---|
| Workspace Plugin | 一级导航、页面、工具栏、面板、命令、配置项 | 可信 Vue Renderer / 受限插件容器 | 预装插件静态打包、注册表动态装配 |
| UI Component Extension | GrapesJS blocks、traits、Vue 组件映射、设计 tokens | 可信设计器扩展 | 显式组件注册与版本校验 |
| Agent Skill | Prompt、操作规范、工具使用指导 | Agent 编排层 | 版本化安装、显式启用 |
| MCP Provider | 外部工具服务及资源 | 独立进程/连接，作用域隔离 | 默认禁用、授权后可调用 |
| Capability Provider | 本地 CLI/HTTP/Java handler | 后端执行器/受控进程 | 复用现有能力目录 |
| Automation/Workflow | 任务模板、触发器、执行图 | Mission Worker | 版本化定义，执行权限另行授权 |

### 2B.3 安装、配置与使用体验

新增固定的 **插件中心**（平台级，不由插件自身实现），至少包含：已安装、可用插件、启停、升级、权限、依赖、配置、实例管理、健康状态。初期“安装”仅支持仓库内的预装插件及本地可信包；插件市场、远程 URL 安装与社区包执行推迟到签名/隔离/兼容机制完善之后。

用户典型操作：

1. 在插件中心选择 `Builder`，点击启用；平台校验版本、依赖与权限，注册导航和命令。
2. 在工作台管理中新增 `Builder` 实例，选择目标 Git 仓库、原型保存位置、组件库配置。
3. 左侧导航自动出现该实例；进入后使用 GrapesJS 手动设计，或按需调用 AI。
4. 从原型版本交付任务，使用核心 Mission 服务执行，插件被禁用也不能删除既有任务和产物。
5. 禁用插件仅隐藏入口并停止其新增操作；保留配置、版本、审计、原型数据；卸载与数据删除必须分离并二次确认。

同理，Chat 插件可以配置默认模型、工具可见范围、是否展示看板入口、默认仓库；Mission Board 可以独立配置列、筛选器与视图。**“可配置添加”应当是安装插件 + 创建实例 + 注册贡献点，而不是 AI 修改导航源码。**

### 2B.4 插件清单 Manifest（示意，不是已实现 API）

```json
{
  "schemaVersion": "eap.plugin/v1",
  "id": "eap.builder",
  "version": "0.1.0",
  "name": "构建工作台",
  "engine": { "eap": ">=0.1 <0.2" },
  "entry": { "type": "bundled", "module": "@eap/plugin-builder" },
  "contributes": {
    "workspaces": [{ "type": "builder", "title": "构建工作台", "multiInstance": true }],
    "navigation": [{ "id": "builder", "workspaceType": "builder", "order": 20 }],
    "commands": [{ "id": "builder.newPrototype", "title": "新建原型" }],
    "settings": [{ "key": "defaultRepositoryId", "type": "repository", "required": false }]
  },
  "requires": {
    "capabilities": ["repository.read"],
    "optionalCapabilities": ["repository.write", "mission.create"],
    "skills": [],
    "mcpServers": []
  },
  "permissions": ["workspace.read", "prototype.write"]
}
```

注意：`entry.module` 只允许**构建期可信模块映射**，不能从 Manifest 字符串直接 `import()` 任意路径/URL。`permissions` 是申请清单，不是授予结果。插件应通过稳定 `@eap/plugin-sdk` 使用导航、命令、事件、任务与仓库服务，不直接访问其他插件内部 Store。

### 2B.5 插件 SDK 与注册点（建议）

```ts
export interface EapPluginContext {
  registerWorkspaceType(def: WorkspaceTypeDefinition): Disposable;
  registerNavigation(item: NavigationContribution): Disposable;
  registerCommand(command: CommandContribution): Disposable;
  registerPanel(slot: string, panel: PanelContribution): Disposable;
  getService<T>(token: ServiceToken<T>): T;
}

export interface EapPlugin {
  manifest: EapPluginManifest;
  activate(ctx: EapPluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}
```

SDK 还需定义：生命周期状态 `installed/disabled/enabling/active/error`、冲突检测、贡献撤销、版本兼容、配置迁移、实例配置 Schema、错误隔离、日志和权限审计。导航/路由由注册表生成，Vue Router 可用固定动态容器路由承载插件工作区；**不要让插件直接任意修改全局路由或主应用依赖注入容器**。

### 2B.6 Electron 与第三方插件安全边界

预装、源码审计通过的 Vue 插件可构建期静态集成，运行时启停与配置。对用户安装的**不可信 UI 插件**，不得直接将 JS 动态导入具有 IPC 桥接能力的主 Renderer。可选方案是独立受限 WebContents/iframe（严格 CSP、origin 隔离、postMessage 白名单协议）或远程声明式 UI Schema；首版可以明确不支持第三方可执行 UI 插件。禁止 `nodeIntegration: true`、禁止暴露通用 `ipcRenderer`、禁止插件绕过仓库路径授权。后台扩展尽量以独立进程或受限 Capability Adapter 实现。插件停用不应杀死由核心 Mission Worker 执行的合法长任务，除非相关能力权限已被撤销，此时任务须进入阻塞/待审批状态。

### 2B.7 插件数据、版本与依赖

核心存储至少有：`plugin_definition`、`plugin_installation`、`plugin_instance`、`plugin_config_revision`、`plugin_permission_grant`、`plugin_dependency`、`plugin_event`；可按现有数据库设计合并，避免过度拆表。`plugin_instance` 以 `pluginId + instanceId` 唯一，配置以 Schema 校验并支持迁移。插件贡献 ID 必须带命名空间，避免覆盖平台内置命令。升级前检查 EAP API、SDK、Schema、依赖、原型组件映射版本，失败回滚到原版本与配置快照。卸载不级联删除 Mission/PrototypeVersion/Artifact。

### 2B.8 推荐目录结构（渐进式迁移）

```text
frontend/
  apps/web/                 # EAP Shell, router, plugin center
  apps/desktop/             # 后续 Electron shell
  packages/plugin-sdk/      # manifest types, contribution interfaces
  packages/plugin-runtime/  # trusted registry, lifecycle, slots
  packages/ui/              # shared Vue components
  packages/prototype-schema/# GrapesJS <-> Vue semantic mapping
  plugins/chat/             # preinstalled Chat workspace
  plugins/builder/          # preinstalled GrapesJS Builder workspace
  plugins/mission-board/    # 可独立预装，也可组合到 Chat
  plugins/sql/              # 迁移原 SQL 页面
backend/
  ...                       # 复用现有 Java Capability/Expert/Task
```

修改 pnpm-workspace.yaml 将 `plugins/*` 纳入 workspace；禁止为了目录美观而一次性移动所有现有页面。先提供 `PluginHost` 包装旧页面，逐个迁移。

### 2B.9 新实施顺序与验收（取代 v1.2 固定双入口顺序）

- **P0 插件契约和可信注册表**：审计现有能力目录、专家/任务模型、路由与 UI；定义 Manifest/SDK；预装 Chat 与 Builder 注册到插件中心。保留现有页面可访问。
- **P1 可配置工作台原型**：可启停插件、动态显示导航、创建多个 Builder 实例并分别绑定仓库；插件设置持久化；按钮交互和原型保存重开可用；不调用 AI 也能操作。
- **P2 核心任务/原型互通**：Builder Handoff -> Mission，Chat -> Mission；看板读取同一任务源，任务独立于插件页面。
- **P3 安全和升级**：权限申请与授予分离、贡献冲突、错误隔离、版本兼容与回滚、禁用后的数据保留。
- **P4 外部插件生态**：仅在隔离容器、签名/来源验证、稳定 SDK、自动化安全测试完成后开放第三方可执行插件。

**最小验收场景**：安装列表显示 Chat/Builder；停用 Builder 后导航消失而原型仍存在；再次启用恢复配置；创建两个 Builder 实例分别绑定不同仓库；Chat 与 Builder 均能创建 Mission；任务在切换/关闭工作台后仍可由后端推进；未授予仓库写权限时 Builder 可以设计但不能交付写入操作；已有专家/规则/知识库页面不回归。

### 2B.10 给本地 Codex 的本轮任务边界

> 以 §2B 为最高优先级，将现有固定的“会话/构建”入口改造成**可信、可配置的工作台插件体系**。第一轮只做代码现状审计、Manifest/SDK/Registry 设计、Chat 与 Builder 预装插件的动态注册、插件中心与多实例配置 Mock、交互验收测试。不得一次性迁移所有管理页面；不得直接支持任意第三方 JS 插件；不得将 Skill/MCP 当成 UI 插件；不得删除既有数据与后台能力；不得在用户确认插件化导航原型前重写后端任务调度。提交设计 ADR、迁移清单、运行截图或录屏、测试结果与未实现功能列表。

---

## 3. 原型治理：解决“AI 生成原型不合预期”

### 3.1 变更开发流程

产品规格（用户任务、屏幕结构、状态、按钮行为、参考截图）→ AI 输出低成本原型（优先复用真实 Vue 组件和 fixture）→ 用户审阅并提出差异 → 形成**冻结的验收规范** → 才允许接 API / 做持久化 / 实现 Electron → Playwright 快照与交互回归。

原型必须与业务隔离：**视觉设计未经确认，禁止以其为根据大规模实现功能页面**。每个页面提供 `normal/loading/empty/error/permission-denied/offline` 状态。建立 `docs/product/interaction-spec.md`、`docs/product/screen-inventory.md`、`docs/product/acceptance.md`、`docs/product/references/`（截图/注释，不是复制其他产品商标）。

### 3.2 原型交付三件套

1. **可运行的 Vue 交互式 Playground**：建议 `apps/prototype` 或 web 的 `/prototype` 开发专用入口；全部使用组件库；使用 MSW 或内存模拟服务，不直连生产数据。
2. **状态与事件表**：每个按钮/菜单说明触发事件、状态变更、异常反馈、键盘行为和是否需要后端/桌面权限。
3. **截图验收集**：主要屏幕至少覆盖默认、运行中、完成、失败、等待批准、窄窗口；按桌面典型尺寸（例如 1440×900、1280×800、1024×768）比对，不允许溢出遮挡。

**修订决策：内置基于 GrapesJS 的原型设计入口。** 不从零开发画布编辑内核，而是在 GrapesJS 上实现可视化编辑、受控组件注册、AI 辅助改稿、版本确认与 Vue 开发交付。它是产品长期能力，而非临时开发脚手架。与 Agent DAG 编辑器分离：页面设计使用 GrapesJS；执行流程 DAG 继续使用现有 WorkflowCanvas，后续按实际需要评估 Vue Flow。

## 3A. 内置 GrapesJS 原型设计平台（新增，P0）

### 3A.1 目标与边界

在 EAP 前端增加常驻入口 **「原型设计」**，允许用户不依赖 AI 直接拖拽布局、修改文案/属性、复用业务组件、预览交互、保存版本并提交开发；AI 是协作者而不是唯一原型作者。用户可以在 AI 初稿上手动调整，也可以从空白画布开始。设计成果属于产品资产，不只是 `docs/prototype/*.html` 临时文件。

GrapesJS 负责编辑画布、组件树、样式管理、区块拖拽、页面与项目数据的编辑体验；EAP 负责组件语义、设计系统、交互状态、版本/审批、Vue 代码生成及与开发任务的追踪。**GrapesJS 不直接生成可投入生产的 Vue SFC**；其 HTML/CSS 导出只作为预览或受限静态交付物，不能充当业务源码的权威来源。

### 3A.2 导航与三种使用场景

- 一级入口「原型设计」：项目/页面列表、新建原型、导入现有原型、版本、交付记录。页面设计器采用左侧组件/页面树、中间画布、右侧属性/交互/AI 建议的布局，提供桌面/平板/移动端视口切换。
- **手动优先**：用户选组件拖拽、调整布局、设置属性与状态；无需模型连接也可完成原型。
- **AI 辅助**：输入“把右侧检查器改为抽屉”等局部意图，AI 返回**结构化变更提案**，先显示变更预览和差异，再由用户确认应用；支持撤销。禁止 AI 绕过组件白名单直接写任意脚本。
- **开发交付**：用户将某个已批准的原型版本关联至开发任务，生成 Vue 组件/路由/交互待办和可追溯差异；由本地 Codex 等 Agent 按任务实施并执行测试，不能因为“设计已保存”就宣称功能已完成。

### 3A.3 技术分层与模块规划

```text
apps/web (或后续共享 renderer)
  /prototype-projects                原型项目列表
  /prototype-projects/:id/editor     GrapesJS 编辑器
  /prototype-projects/:id/preview    运行时预览
  /prototype-projects/:id/handoff    版本批准、交付开发、差异
packages/prototype-core              设计文档 Schema / 校验 / 迁移 / diff
packages/prototype-grapesjs          GrapesJS 插件、组件类型、Block/Traits、序列化适配
packages/prototype-renderer          基于受控组件注册表的 Vue 预览渲染器
packages/prototype-codegen           设计 Schema → Vue SFC/路由/样式/交互骨架
packages/ui                          可复用真实组件、design tokens
packages/runtime-client              原型项目/版本/交付任务 API 契约
backend                              原型存储、版本、权限、交付任务、审计
```

上述是**建议目标结构，非仓库当前已有实现**。优先在现有 pnpm workspace 中新增 package，保留 `apps/web` 和已有 `@eap/ui`。原型编辑器可按路由懒加载，不应让 GrapesJS 进入所有业务页面的主 bundle。后端先定义契约，MVP 可用 IndexedDB/本地文件适配器验证；正式交付须迁移到可审计的服务端存储，不能把浏览器本地缓存当作唯一数据源。

### 3A.4 核心设计 Schema：不能只存 HTML

必须同时保存 **GrapesJS Project Data**（用于无损回到编辑器）和 **EAP 语义设计文档**（用于 Vue 渲染/代码生成）；二者通过版本化转换器关联。禁止仅存 `getHtml()/getCss()`，也禁止把 GrapesJS 内部节点 ID 作为业务稳定 ID。

建议的最小语义模型：

```ts
type PrototypeDocument = {
  schemaVersion: 1;
  projectId: string;
  pages: Array<{
    id: string;
    path: string;
    title: string;
    root: PrototypeNode;
  }>;
  tokensVersion: string;
  componentRegistryVersion: string;
};
type PrototypeNode = {
  id: string;                  // EAP 稳定 ID
  component: string;           // 如 eap.button / eap.task-composer
  props: Record<string, unknown>;
  children?: PrototypeNode[];
  bindings?: Record<string, string>;  // 受控 mock 数据引用，非任意 JS
  events?: Array<{ event: string; actionId: string }>;
  variants?: Record<string, Record<string, unknown>>; // loading/error 等状态
};
```

持久化记录建议包括：`prototype_project`、`prototype_version`（不可变快照、父版本、作者、审批状态、hash）、`prototype_handoff`（目标仓库/分支/任务/版本/状态）、`prototype_asset`。实际数据库设计由后端审计既有迁移策略后确定。为 Schema 提供版本迁移、完整性校验、节点稳定 ID、导入导出和恢复机制。

### 3A.5 GrapesJS 与 Vue 组件映射策略

1. 建立 **ComponentRegistry**：每个可拖拽组件声明 `type`、可编辑 props、插槽、事件、状态、响应式规则、设计时占位、Vue 实现路径和 codegen 模板版本。
2. 在 GrapesJS 注册受控 Component Type、Block、Trait；GrapesJS 画布使用适配后的设计态外观，**不假定 Vue 组件可以直接作为 GrapesJS iframe DOM 原生运行**。
3. 预览采用 `prototype-renderer` 使用真实 Vue 组件与 Mock 数据渲染，明确区分“设计器近似呈现”和“真实 Vue 运行预览”；两者须做视觉回归对比。
4. 代码生成仅支持已注册组件：输出 Vue 3 `<script setup lang="ts">`、template、受控样式/Token、路由及事件处理 TODO；保留手写逻辑的边界，**不覆盖已人工修改的文件**。未知节点阻断交付并报告具体节点，而非降级为任意 HTML。
5. 不将 AI 生成的任意 HTML、`<script>`、内联事件或远程资源直接注入编辑器/预览。所有 AI 输出经过 JSON Schema 校验、组件/属性白名单、URL 策略与用户批准。

优先完成以下映射：`layout/container`、`text`、`button`、`input`、`select`、`card`、`dialog`、`tabs`、`table`，随后增加 EAP 专用的 `workspace-picker`、`session-list`、`task-composer`、`execution-timeline`、`diff-panel`、`approval-card`。其中表格、对话框和业务组件必须有设计态 Mock 与运行态状态定义。

### 3A.6 原型交互不等于真实业务执行

提供可声明的交互动作：`navigate`、`open-dialog`、`close-dialog`、`set-local-state`、`switch-variant`、`show-feedback`、`submit-mock`。原型预览在沙箱环境使用 Mock 数据模拟任务启动、等待批准、失败、成功等状态；**不得执行真实 Git/SVN、文件写入、命令或外部 Agent**。正式业务执行只能在交付后的 Vue 应用中经现有后端授权 API 实现。

每个页面定义 normal/loading/empty/error/offline/waiting-approval 等必要状态及触发方式。设计编辑、运行预览和生产执行的权限必须隔离；对用户展示清晰的“原型模拟”标识。

### 3A.7 原型 → 开发：明确的交付协议

```text
原型草稿（可手动/AI 编辑）
  → 校验（组件、属性、交互、响应式、可访问性）
  → Vue 真实预览 + 截图对照
  → 用户批准不可变版本
  → Handoff Manifest（版本 hash、页面、组件、状态、验收项）
  → 生成代码变更计划 / Diff（不直接覆盖现有源码）
  → 本地 Codex/Agent 实施
  → typecheck + unit + Playwright + visual regression
  → 用户验收 / 关联提交 / 回写交付状态
```

交付清单至少包含：`prototypeVersionId`、`schemaHash`、目标代码仓库和分支、页面/路由映射、组件注册表版本、交互事件合同、Mock fixtures、截图基线、待人工实现的业务逻辑、允许修改的文件范围、验收命令。变更代码时先识别文件归属；生成文件与人工维护文件分开，增量变更必须展示 Diff，冲突时停止并请求确认。保存设计版本不触发代码自动覆盖；**只有明确“交付开发”才创建开发任务**。

### 3A.8 原型与已开发代码的双向关系（谨慎定义）

MVP 仅支持**设计 → 代码单向生成 + 代码状态回写**，不要承诺任意 Vue SFC 可以无损反向导入 GrapesJS。后续可以为带 EAP 元数据标记的受控生成组件提供有限的反向同步；手写 Vue 逻辑、复杂插槽和第三方组件不保证可逆。发现代码与设计分叉时显示版本差异，用户决定以哪个版本为基线，绝不静默覆盖。

### 3A.9 分阶段落地与验收门槛

| 阶段 | 交付 | 验收标准 |
|---|---|---|
| G0 技术验证 | 单独实验路由、GrapesJS 编辑、受控按钮/容器映射、保存重载 | 手工拖拽/编辑/保存/恢复成功；编辑器产物可被 Vue renderer 渲染 |
| G1 原型入口 | 项目列表、页面树、组件面板、属性编辑、视口切换、撤销重做 | 无 AI 也能制作完整工作台页面；重新打开结构/样式不丢失 |
| G2 交互与版本 | Mock 事件、状态切换、不可变版本、审批、截图 | 可演示完整任务流程；旧版本可恢复；未审批不可交付 |
| G3 代码交付 | Schema → Vue SFC/路由/Token + Handoff Manifest + Diff | 生成代码 typecheck/build 通过；已修改的人工代码不被覆盖 |
| G4 Agent 集成 | AI 结构化局部编辑、Codex 开发任务、执行结果回写 | AI 提案需人工确认；测试结果/提交与原型版本可追踪 |

**首个端到端验收案例**：用户打开「原型设计」→ 手动拖入会话列表、任务输入、执行时间线 → 调整布局 → 用 AI 修改一个局部区域 → 预览“等待审批”状态 → 保存并批准 v1 → 点击「交付开发」→ 生成可运行 Vue 页面及交付清单 → Codex 完成后端接线 → 测试/截图通过 → 回到原型工作台查看关联提交。整个流程不依赖 AI 生成第一版页面。

### 3A.10 对本地 AI 的强制实施约束

- 先做 G0 spike，验证 GrapesJS 编辑数据与 Vue 语义组件映射可行，再扩展 UI；不要先造完整页面再补导出。
- **不要**把 GrapesJS 的 HTML 导出伪装成 Vue 代码生成；不要以静态截图代替可编辑设计文档。
- **不要**把 DAG 画布迁移到 GrapesJS；它是页面设计器，不是执行流程图引擎。
- **不要**把所有 Vue 组件塞进 GrapesJS iframe 直接运行；编辑态和真实预览分层。
- **不要**允许 AI 无审核地写入设计版本、修改生产源码或执行本地命令。
- 若第三方 GrapesJS 插件的许可证、维护状态、兼容性或安全性未核验，先报告并使用官方核心 API 的最小实现，不凭空宣称支持 Vue 原生双向同步。

## 4. 目标技术架构与决策

| 领域 | 当前情况 | 目标/决策 | 优先级 |
|---|---|---|---|
| Vue/Vite+ | 已采用 | **保留** Vue 3 + TS + Vite+；确保当前 Vite+ 版本与 Electron 构建兼容 | 保留 |
| pnpm workspace | 已采用 pnpm 12 | **保留当前锁定版本**；不要无理由降级 pnpm 11 或重建 monorepo | 保留 |
| 组件与主题 | `@eap/ui` + `@eap/style`，原语不足 | 扩展组件 API 和 Token；按需引入 **Reka UI** 无样式可访问性原语 / shadcn-vue **参考实现**，不要全量替换 | P0 |
| 图标 | 页面里存在字符图标 | 统一 Lucide Vue 图标与大小/语义 | P0 |
| 导航 | 根组件 hash 切页 | 使用 **Vue Router** 管理可深链、多层路由与导航守卫；迁移期间兼容旧 hash 链接 | P0 |
| 服务器状态 | 根组件集中请求 | 拆 composable + 领域 services；如存在缓存/并发复杂度再评估 `@tanstack/vue-query` | P0 |
| UI 状态 | 根组件大量 `ref` | 页面本地 state + composable；跨页面会话/工作区状态引入 **Pinia**；服务器数据不机械复制到 Pinia | P0 |
| API 契约 | `@eap/runtime-client` 存在 | 复用；新增 task/session/event 接口时从 OpenAPI/共享 schema 生成类型，谨防前后端漂移 | P0 |
| 原型设计平台 | 现有静态 HTML 原型 | **GrapesJS + 受控组件注册表 + 语义 Schema + Vue 预览/代码生成 + 版本交付** | P0 |
| 原型模拟 | 静态 HTML 原型 | Vue Playground/真实 Vue 预览 + Mock fixtures + 截图/交互验收，作为设计器的预览层 | P0 |
| 桌面 | `docs/desktop-spec.md` 已定 Electron，尚无 app | 新增 `apps/desktop` + `main/preload/renderer`，共享 Vue app；用 Electron IPC 适配平台服务 | P1 |
| 终端 | 未确认现成终端组件 | 执行日志先用可虚拟滚动的日志视图；明确需要终端交互后再上 xterm.js | P1 |
| 代码差异 | 原型主要结构化结果 | Diff Viewer；需完整源码编辑时才引入 Monaco Editor | P1 |
| DAG | 自写 `WorkflowCanvas.vue` | 保留至达到真实瓶颈；以后评估 Vue Flow（非必选） | P2 |
| 国际化 | vue-i18n 已存在 | 保留；新增文案全部走 i18n key | P0 |

**避免技术堆叠**：不要同时安装多个组件套件、路由替代品、状态管理器；不要将设计器生成的 HTML 直接作为生产组件。若评估 shadcn-vue，首先检查其版本兼容、Tailwind 4、生成文件许可证和现有 `@eap/ui` 组件命名冲突；只迁移所需原语。

### 4.1 目标目录（渐进演进，不需要立即移动所有文件）

```text
frontend/
  apps/
    web/                         # 保留：Web 入口、路由、产品页面
    prototype/                   # P0：隔离的交互原型/fixtures（可先用 web 路由）
    desktop/                     # P1：Electron main/preload/renderer
  packages/
    ui/                          # 组件原语及可访问性
    style/                       # 已有 design tokens / themes
    runtime-client/              # 已有 HTTP DTO / client
    expert-sdk/                  # 已有 Expert DSL
    domain/                      # 新增时才抽取纯领域类型/状态机
    platform/                    # Web/Electron Platform API 契约
  ...
```

Web 层建议 `app/{router,providers,layouts}`、`features/{workspace,session,task,execution,expert,...}`、`shared/{composables,utils}`。目前 `App.vue` 应逐步瘦身为 Shell + `<RouterView/>`，不要一次迁移全部业务。

### 4.2 组件 API / 状态边界

`ShellLayout`（顶部仓库栏、侧边会话列表、中央 `RouterView`、右侧 Inspector、底部状态栏）仅控制布局。`SessionList` 管理展示，`TaskComposer` 发起动作，`RunTimeline` 消费事件流，`ToolCallCard` 呈现工具执行，`DiffInspector` 只读展示差异，`ApprovalDialog` 返回用户决定。后端事实状态以服务端 Run/Event 为准；前端暂存草稿和折叠状态不能“伪造已执行”。

推荐实体最小模型（实际以现有 API 核查为准）：`Workspace{id,path,branch}`、`Session{id,workspaceId,title}`、`Task{id,sessionId,goal}`、`Run{id,taskId,status,mode}`、`RunEvent{id,runId,seq,type,time,payload}`、`Approval{id,runId,scope,status}`、`Artifact{id,runId,kind,path,digest}`。每个事件必须有 `seq` 以确保恢复顺序和幂等去重。可以先对现有 Task API 做兼容适配，不要立即创建破坏性数据库迁移。

### 4.3 后端交互 / 可恢复执行

先核对当前 `/api/tasks`、SQL 专家与现有运行模型，再决定接口差距；**不要凭前端原型猜 API 已存在**。目标支持：任务提交、Run ID 返回、取消/重试、增量事件流（优先 SSE 或适合的流协议）、断线恢复（`Last-Event-ID` 或序号补拉）、审批与 Diff/Artifact 获取。不同层级区分：UI 已提交 ≠ 后端已执行 ≠ 外部 Agent 声称完成 ≠ 本地验收成功。

若现阶段缺少完整 Agent 会话接口，P0 原型只用模拟服务；P1 再按合同增量扩展后端，不要为做页面先改掉现有 deterministic-first / evidence 模型。SQL 专家应显示“规则发现”和“模型分析”分区，不能将固定规则建议包装成模型结论。

### 4.4 Electron 安全边界

延续 `docs/desktop-spec.md`：`nodeIntegration:false`、`contextIsolation:true`、`sandbox:true`、启用 webSecurity；preload `contextBridge` 只暴露具名方法，不暴露通用 `ipcRenderer`、任意执行命令或任意文件访问。Main 进程负责目录选择、受控本地进程、日志、外部链接和后端 sidecar 管理；所有路径范围、可执行文件/参数白名单、操作授权在主进程验证。Web adapter 对桌面能力返回明确的 `unsupported` 结果，UI 显示解释而非假装成功。各系统打包测试须在目标 OS 验证，不假定一次构建可自动覆盖三个 OS 的签名与发布。

## 5. 实施阶段（必须设置验收关口）

**新增前置约束**：在原型确认前完成 §3A 的 G0 技术验证；优先实现 G1/G2 使用户能够亲手编辑和批准原型。G3 代码生成和 G4 Agent 集成须通过前阶段验收，原有“先制作 Vue Playground”要求调整为“先完成内置设计入口与真实 Vue 预览的最小闭环”。

### Phase 0：现状冻结与基线（先执行，不改业务）

- 新建工作分支 `refactor/agent-workbench-prototype`；记录 HEAD、包版本、构建/test 结果。
- 检测 `App.vue` 行数与复杂度、重复交互、原型入口、实际用户界面截图、CSS Token 使用、Web/desktop 是否存在。
- 建立现状技术清单：**Confirmed / Planned / Missing / Unknown**；核对文档与源码差异。
- 执行现有 `vp check`、`vp test`、`vp build`、边界检查，记录失败而不擅自覆盖。
- 输出 `docs/product/current-state-audit.md`；附可验证代码路径、技术债列表和按风险划分的保留/改造/替换判断。

**退出标准**：能准确回答项目已经有哪些 Vue/Electron 能力、现有功能哪些必须保留；有可回退分支和当前构建基线。

### Phase 1：先做真实交互原型（不接新真实接口）

- 先做 Shell、会话/工作空间、聊天输入、任务步骤时间线、Inspector、Diff、审批弹窗六个关键区域。
- 提供能切换场景的 Fixture：空工作区、已有会话、分析中、等待确认、改动文件、校验失败、离线。
- 原型界面必须显式标识 Mock。一个“运行分析”按钮应产生可观察的阶段变化，而非只写“已提交”。
- 建立 UI Token（密度、栅格、字体、间距、深浅主题），统一图标、抽屉、Modal、Toast、键盘可访问性。
- 将截图和互动脚本交给用户审阅；**此阶段禁止为了模拟效果重写后端服务**。

**退出标准**：用户确认布局和主要按钮/交互流；至少 8 个典型交互 Playwright 用例通过；截图在 3 种窗口尺寸下无关键遮挡。

### Phase 2：根组件瘦身与路由/状态规范

- 引入 Vue Router 并设置旧 hash 兼容；将页面移为 route components；对 unsaved expert 草稿保留导航守卫。
- 以 workspace/session/task 为领域拆分 `App.vue`；逐步迁出 API 调用到 composables/services，并减少跨区域刷新耦合。
- 保留 `@eap/runtime-client`、现有专家/规则/知识业务组件和既有测试；按用户认可的新 Shell 收编。
- 引入 Pinia 只保存跨页面、需要持久化/共享的客户端状态；异步请求明确 loading/error/stale/abort。

**退出标准**：旧页面能力可继续访问，深链、刷新、前进后退工作，原有测试不退步，新工作台独立运行。

### Phase 3：Agent 工作流接入真实运行时

- 对比现有 Task/Expert/Capability 数据合同，新增最小 Session/Run/Event 适配及能力授权。
- UI 明确拆分 `local`, `model`, `external-agent`, `verification` 阶段，显示模型是否实际调用、CLI 运行日志与 diff。
- 支持取消、审批、重试、断开恢复及独立验证；任何高风险文件写入/命令执行先明确批准。
- 为 SQL 专家、代码分析、git/grep 各建立端到端示例，避免新 UI 只支持一种任务。

**退出标准**：可从自然语言任务到证据/执行/结果确认形成完整闭环；没有伪造 Agent 调用。

### Phase 4：Electron 桌面交付

- 新增 `apps/desktop`，共享同一 Vue Renderer 与 Platform API，先跑通 Windows，再做 macOS/Linux 打包与行为测试。
- 实现目录选择、平台权限、sidecar 运行时管理、进程退出清理、日志及安全 IPC；不得把任意命令执行暴露给 renderer。
- 增加 Web/Electron 双端 E2E、IPC 安全测试、断线/启动失败/安装路径包含中文与空格测试。

**退出标准**：桌面上打开仓库、提交模拟或真实任务、展示运行过程、查看差异、退出并清理进程；Web 版无桌面 API 也能正常运行。

## 6. 拒绝的做法 / 关键约束

- 禁止先全量改 UI 再找原型验收；禁止把现有每个管理页照搬为 Agent 产品的一级菜单。
- 禁止将 `docs/prototype/console.html` 视为不可更改的产品视觉真理；它是旧阶段交互/需求资产，可按新产品定义更新。
- 禁止为了 Electron 引入第二套 React UI 或重建另一个前端应用；除桌面 Shell 外应共享 Renderer。
- 禁止因推荐工具而一次性安装 shadcn-vue、Reka UI、Pinia、TanStack Query、Vue Flow、Monaco、xterm.js 全家桶；按切实需求验收后选择。
- 禁止把只在浏览器 localStorage 的“工作空间标签”当成真实进程工作目录；真实本地路径必须由运行时与桌面桥确认。
- 禁止 UI 将模型未调用说成模型已分析，或将外部 Agent 的文本输出当作验证成功。
- 禁止无授权执行任意 shell、信任前端传入本地路径、将凭据/敏感日志写入持久化浏览器状态。
- 禁止修改数据库结构、后端 SPI 或重写专家系统，除非经接口差异分析和回归验证确认必要。

## 7. 验收清单（给本地 AI 的工作 Done Definition）

**GrapesJS 专项必验**：无 AI 手动设计；设计数据保存/重载；Vue 真实预览；受控组件映射；Mock 交互；版本冻结/审批；交付 Manifest；生成代码不覆盖手写代码；未知组件阻断交付；AI 变更先预览后批准；可追踪原型版本与代码提交。

- [ ] 当前架构审查文件包括代码路径、版本、事实/计划区分、问题优先级与可回滚策略。
- [ ] Vue 3、TS、Vite+、pnpm workspace、现有 `@eap/*` 包保持可用；现有规则、知识、数据库、能力、专家管理未丢失。
- [ ] 首页改成 Agent Workspace；可以查看会话、提交任务、审阅执行与校验；不是仅显示指标卡的后台。
- [ ] 关键按钮可见可测：新建、发送、停止、批准/拒绝、查看 Diff、折叠日志、切工作区、重试。
- [ ] Mock 与真实执行清晰标识；服务未连接时界面能降级。
- [ ] 浏览器路径可直达会话/任务，刷新和回退不丢目标；未保存草稿有保护。
- [ ] 无跨域静态伪数据显示成真实状态；没有空白错误页、死按钮、不可见弹窗。
- [ ] 原型截图+行为验收通过，再开发真实 API；变更有迁移记录。
- [ ] Electron 真正有 `apps/desktop` 及安全 IPC 后才能在 README 中标记为“已交付”。
- [ ] Web 测试、现有项目检查和新端到端测试通过；CI/OS 无法验证的项目明确列为未验证。

## 8. 可直接复制给本地 Codex / AI 的执行任务

**v1.2 优先执行指令**：先落实 §2A 的 M0 双入口交互原型。Agent 工作台必须有会话和可后台执行任务的模拟看板；构建工作台必须有独立 GrapesJS 编辑入口、手工拖拽/按钮交互、保存重开、指定仓库和交付预览；两者必须可通过 Handoff/Mission 相互跳转。用户验收前禁止直接重构后端执行器。\n\n**补充执行指令（优先级高于本节旧的原型 Playground 指令）**：请先阅读 §3A，增加 EAP 内置「原型设计」入口，以 GrapesJS 为编辑内核，实施 G0 最小可行验证：手动拖拽受控 EAP 组件 → 保存 GrapesJS Project Data 与语义 Schema → 重新打开 → 用真实 Vue 组件预览。交付一份技术可行性报告和可操作页面。未经我确认，不进入 G1-G4，不修改现有业务页面，不把 HTML/CSS 导出当成 Vue 代码生成。后续实现必须覆盖版本批准、Handoff Manifest、Diff、代码生成安全边界和 AI 人工确认。

> 你正在仓库 `Engineering-Automation-Platform` 中工作。首先阅读 `AGENTS.md`、`README.md`、`docs/architecture.md`、`docs/frontend-prototype.md`、`docs/desktop-spec.md`、`docs/navigation-structure-refactor.md` 和本文件。\
> **第一阶段只做审计与可运行的交互式原型，不要直接开始全量重构或后端大改。**\
> 1. 审计当前仓库真实代码，不要照搬文档的“已完成”声明；输出已实现、计划中、缺失三个清单，并注明确切路径及验证命令。特别核查 `frontend/apps/web/src/App.vue`、`frontend/packages/ui`、`frontend/apps/web/src/features`、`frontend/apps/desktop` 是否存在。\
> 2. 基于“工作空间→会话→任务/Run→步骤/工具→Diff/审批/验收”的闭环，新增可运行 Vue Agent 工作台交互原型，使用 fixtures/mock；用户尚未认可的旧控制台结构不能当作最终产品 IA。\
> 3. 优先复用现有 Vue 3、Vite+、pnpm、Tailwind 4、`@eap/ui`、`@eap/style`、`@eap/runtime-client`；只选择并安装必要依赖。\
> 4. 输出页面清单、按钮状态/事件表、UI Token、3 种窗口尺寸截图和关键交互 Playwright 测试。明确 mock/真实服务的边界。\
> 5. 提交 Phase 0 审计文档和 Phase 1 原型；列出下一阶段 Vue Router/状态拆分/Electron 的逐步修改方案，但**等待用户确认原型后**再继续大规模功能开发。\
> 6. 不可破坏 deterministic-first / LLM-last 核心规则；执行权限必须遵循最小授权；保持现有专家/规则/知识系统可用。\
> 7. 报告新增/修改文件、测试结果、未验证事项、潜在兼容性风险以及回退方式。\
> 第一轮工作完成标志是**用户可以亲自点击原型体验一个完整的 Agent 任务流程**，而不是“一口气升级所有技术框架”。

## 9. 参考链接

- 仓库：https://github.com/LiaoHan5426/Engineering-Automation-Platform
- Vue Router：https://router.vuejs.org/
- Pinia：https://pinia.vuejs.org/
- Reka UI：https://reka-ui.com/
- shadcn-vue：https://www.shadcn-vue.com/
- MSW：https://mswjs.io/
- Playwright：https://playwright.dev/
- Electron 安全：https://www.electronjs.org/docs/latest/tutorial/security
- Vue Flow：https://vueflow.dev/
- Spring AI 官方参考文档：https://docs.spring.io/spring-ai/reference/
- Spring AI 入门与兼容性：https://docs.spring.io/spring-ai/reference/getting-started.html
- 本地交付报告（需在实际仓库核验）：`docs/audits/spring-ai-integration-report.md`、`docs/audits/spring-ai-consolidation-report.md`

> 本文既是一份技术决策与重构方案，也是一份本地 AI 工作合同。**如果当前本地代码相对 GitHub main 有后续改动，以审计本地实际代码为准，并更新基线，不覆盖未知工作。**

---

## 2C. 现有 CLI / Skill / 知识库 / MCP / Expert / Capability 架构审计（v1.4）

> 审计性质：GitHub 主分支静态代码与文档检查，不是本机集成测试、真实 MCP 握手或完整端到端运行。审计时发现的“缺少”是指在检查范围内未确认，不能替代全仓库与运行时验证。实施前本地 AI 必须重新读取当前 HEAD 并记录 SHA。**禁止以本节直接认定功能已通过运行验收。**

### 2C.1 审计结论与证据

| 体系 | 代码/文档证据 | 现状判断 | 对个人 Agent 平台的适配结论 |
|---|---|---|---|
| CLI | `CliProgramService`、`CliChannels`、`CliOperationHandler`、`CliProgramMapper`、`V12__cli_programs_and_operations.sql`、CLI 集成测试 | 已有程序/操作登记、渠道、执行接入基础 | **有可复用底座**；需确认任意程序参数模板、cwd、环境变量、输出结构化、超时/取消、授权与跨平台路径 |
| Capability | `CapabilityHandlerRegistry`、`CapabilityCatalog`、`CapabilitySettings`、`CapabilityDescriptor`、`CapabilityKind` | 已有能力分类、发现、启停及 Handler 注册 | **应保留为统一执行契约**；插件/Skill/MCP 不应各建一套执行通道 |
| Expert / Rule | `ExpertGraph`、`ExpertExecutionService`、`ExpertManifest`、`RuleEngine`、`expert-sdk` | 有声明式专家 DAG、规则包、事实生产者校验 | **适合确定性专家任务**；不等同于可自主规划、反思、恢复的 Agent Runtime |
| Knowledge | `KnowledgeManagementService`、`KnowledgeRepository`、`KnowledgeSearchHandler`、`V1/V3/V5` | 有文档存储、切块与 PostgreSQL 全文检索基础；静态代码显示按约 1500 字符切块 | **可用于知识检索 MVP**；仍需评估导入、更新、去重、增量索引、引用溯源、访问范围、质量评测与混合检索 |
| MCP | `McpServerService`、`McpServerRegistry`、`McpSessionRegistry`、`McpCallScope`、`V8__mcp_servers_and_expert_grants.sql` | 已有服务器登记、授权、隔离模型；服务类明确注明**尚无 MCP 协议客户端**、工具为人工声明 | **管理框架可复用，真实调用闭环未完成**；优先补真实握手/发现/调用，再扩展管理 UI |
| Skill | 检查到专家清单、规则包、知识库，但未发现独立的 Skill 生命周期/注册/加载契约 | **尚未确认独立 Skill 系统** | 不能把 Expert、规则包或知识库直接改名为 Skill；应定义轻量 Skill 标准和导入机制 |
| Workspace Plugin | 既有 v1.3 设计方案，当前代码仍主要是固定 Vue 功能页面 | 规划方向，非已实现插件运行时 | 建议分阶段先做内置贡献点与插件注册，不急于第三方代码热加载 |

**关键发现 1：MCP 的“能登记、能授权、能探测目标”不等于“能连接并调用 MCP 工具”。** `McpServerService` 的注释明确写明无 MCP 协议客户端、工具清单未通过协议发现。必须提供 `initialize`、`tools/list`、`tools/call` 的真实验证以及错误/取消/超时处理，之后才能将 MCP 标记为“可用”。具体协议实现应按所选 SDK 当前支持的传输与版本协商设计，不要把 SSE 与 Streamable HTTP 混为一谈。

**关键发现 2（原静态审计结论，Spring AI 集成后仍需区分）：Expert 更接近“配置驱动的确定性工作流”，并不自动等价于 Hermes/Codex 的自主任务 Agent。** 保留 DAG/规则/事实层，在其上增加 Mission 调度、规划/执行/观察/验证循环、暂停/恢复、审批、检查点与外部 Agent 委派适配器。禁止将规则引擎硬改成自由规划器。

**关键发现 3：Skill 与 MCP、知识库不是互相替代关系。** Skill 是版本化的任务指导和资源包，MCP/CLI 提供可调用工具，Knowledge 提供检索内容，Expert/Workflow 提供约束编排，Workspace Plugin 提供 UI。应在一个扩展目录中展示依赖与状态，但保留各自生命周期。

### 2C.2 建议的统一扩展对象模型

```text
Extension Catalog (发现、依赖、版本、安装、启停、配置、审计)
├─ Workspace Plugin  -> routes / panels / commands / settings
├─ Skill             -> instructions / examples / resources / tool requirements
├─ Tool Provider     -> CLI / MCP / built-in / HTTP
├─ Knowledge Source  -> documents / index / retrieval scope
└─ Expert/Workflow   -> DAG / rules / policies / task templates
                         |
                         v
Capability Registry -> Policy / Grants -> Executor -> Evidence / Events
                         |
                         v
Mission Runtime / Chat / Builder Handoff
```

**不要设计一个包罗万象的万能插件接口。** 统一的是 Extension Manifest 外壳（id、type、version、dependencies、permissions、configSchema、status、health），不同扩展类型使用各自的加载器与执行协议。不要让 Skill 获得直接进程执行权限；Skill 只能引用获准 Capability。MCP 工具 ID 必须保留服务器命名空间与实际发现的工具名映射，不能因字符限制导致重名或不可逆转换。

### 2C.3 逐项改造要求与可运行验收

**CLI**：审查进程启动是否使用参数数组而非 shell 拼接；cwd 限制到已授权仓库；参数 schema 与环境变量白名单；二进制发现/路径覆盖；Windows/WSL/Linux 差异；stdout/stderr 上限、敏感信息脱敏、退出码、超时、取消、重试与审计。验收：登记一个自定义 CLI，配置两个操作，绑定工作区，执行成功与失败两条路径；恶意参数不能逃逸授权目录；取消能结束子进程树。

**Skill**：设计 `SkillManifest`（id/version/description/entry/instructions/resources/requiredCapabilities/compatibleAgents/trust）；支持本地目录/仓库导入、校验、预览、启停、版本升级与依赖诊断；技能正文按需加载，避免全部塞进上下文。验收：新增一个“SQL 优化”Skill 不改 Java 源码即可被 Agent 发现并按需使用；没有数据库授权时只给建议不执行数据库调用；升级可回退。

**Knowledge**：核对知识库级、文档级、chunk 级的来源/更新时间/哈希；建立增量更新、删除索引一致性、检索过滤、引用溯源、召回率评测；是否需要向量/混合检索由测试集决定，不能预设 PostgreSQL FTS 不足。验收：导入→检索→引用原文→更新→删除后不可再检索；无权限的知识库不可泄漏到提示词或结果。

**MCP**：优先评估复用 Spring AI MCP Client 官方集成，并与 EAP 现有 McpServerRegistry/授权/审计打通；避免重复实现协议栈。必须完成标准 SDK 的协议握手、真实工具发现、工具 schema 缓存/失效、工具调用、超时、取消、重连与错误传播；保留专家/任务级授权隔离与会话生命周期；为本地 stdio 和远端 HTTP 设置独立安全策略。验收：连接一个真实 MCP 测试服务器，自动发现工具，授权单个工具，调用成功；未授权调用拒绝；断线、超时、跨任务隔离有集成测试。测试中的 Fake Handler 不算真实协议验收。

**Expert / Agent**：复用已落地 Spring AI ChatClient/Tool Calling，审查规则判断与模型决策是否清晰分层；禁止另造模型调用循环；验证模型不可用时是否准确降级；将自主 Mission 作为独立生命周期引入。验收：同一任务可确定性执行、可在必要时委派 Codex、可因审批暂停、重启后恢复并输出证据，而不是只返回静态总结。

**Workspace Plugin**：第一阶段使用编译期受信插件注册，动态显示导航、设置和页面；所有后端动作走现有 API/Capability；第三方插件包的隔离、签名、热更新作为后续独立决策。验收：不修改核心 Shell，通过新增一个受信插件包添加工作台入口并完成启停；停用不破坏已有任务和历史记录。

### 2C.4 实施顺序：先补真实能力，再做统一扩展体验

- **A0 审计证据与基线**：逐文件列出类、接口、DB 表、API、测试、真实运行结果；每项标为 `implemented / partial / planned / broken / unverified`。重点识别重复抽象与未实现链路。
- **A1 CLI 与 Capability 契约**：先固化参数、权限、事件、执行证据和错误模型，避免未来 Skill/MCP/插件重复实现。
- **A2 MCP 真实协议 PoC**：优先打通真实 `initialize → tools/list → tools/call`，补授权、超时与隔离测试。
- **A3 Skill MVP**：独立 SkillManifest、导入、按需加载、依赖 Capability 校验；不做复杂市场。
- **A4 Knowledge 质量闭环**：先补文档版本/来源/引用和检索评测，再根据证据决定是否加入向量检索。
- **A5 Mission + Workspace Plugin 集成**：让 Chat、Builder、SQL 等工作台统一通过 Task/Capability/Skill/Knowledge 使用能力，并具备完整日志和审批。

### 2C.5 交给本地 AI 的强制审计任务

> 请先对当前仓库 HEAD 执行一次 CLI、Skill、Knowledge、MCP、Capability、Expert、Rule 的实现审计，不要立即修改架构。逐一列出实现文件、入口 API、数据表、执行链路、测试覆盖和缺口；区分“可配置”“可发现”“可执行”“可恢复”“可审计”，不能把 UI 可操作当作后端可用。必须运行现有测试，并为 MCP 使用真实协议服务器进行端到端验证。输出 `docs/audits/extension-capability-audit.md`（证据矩阵）、`docs/decisions/extension-boundaries.md`（职责边界）、按风险和收益排序的迁移计划。先提交审计结果等待确认，禁止一次性重写全部能力模块。以本节审计结论为假设，不可把静态阅读推断当作运行验证。



---

## 2D. AGENTS.md 治理与编码 Agent 效率提升（v1.5 新增）

### 2D.1 审计结论

已核对仓库根 `AGENTS.md`：它正确规定了 deterministic-first、LLM-last、多语言目录布局、外部 Agent 结果独立验证以及副作用约束，**应保留**。但目前只是原则声明，缺少任务路由、模块专属指导、文档优先级、验收命令、审批边界与交付格式。因而不足以指导 Codex 在 EAP 当前阶段高效、准确地完成工作。

**目标不是把整个技术方案复制进 AGENTS.md**，而是让根文件短小、稳定、可执行；将频繁变化的产品需求放在 `docs/`，将模块细则放到局部 `AGENTS.md`，避免上下文膨胀和相互矛盾。局部文件的实际生效范围必须按所用 Agent 的官方加载规则验证，不能假设所有工具都支持同一套继承语义。

### 2D.2 建议文件布局

```text
AGENTS.md                         # 全局原则、任务分流、验证、交付标准
backend/AGENTS.md                 # Java/Maven/数据库迁移/后端验证
frontend/AGENTS.md                # Vue/TS/Vite+/pnpm/UI/原型优先
frontend/apps/web/AGENTS.md       # 现有 Web App 特定约束（按需）
docs/agent-development-guide.md   # 长篇流程、实例、测试矩阵
docs/architecture.md              # 架构事实源
docs/roadmap.md                   # 计划事实源
```

优先只创建根、`backend/`、`frontend/` 三份；局部规则确实有差异再增加更深层文件。不同文件禁止复制相同段落，避免规则漂移。

### 2D.3 根 AGENTS.md 必须包含的执行契约

1. **先调查后修改**：先 `git status`、查找相关代码/测试/文档、识别真实入口与调用链；不要凭类名猜测实现。保留用户未提交修改。
2. **任务分流**：界面/交互诉求先交付可点击原型；架构诉求先写 ADR/变更计划；已批准的功能需求才进入生产实现；缺陷修复先复现。
3. **单一事实源**：依次核对用户当前指令、现有代码与测试、项目架构文档；旧规划与当前实现冲突时显式报告，不擅自选择。
4. **小步变更**：先最小可验证切片；跨前后端 API/Schema 先定义契约；未经批准不大规模重写、不引入重量级依赖、不更换技术栈。
5. **真实闭环**：CLI 要验证实际进程退出码/超时/日志；MCP 要验证协议握手、工具发现与真实调用；Skill 要验证加载、激活、作用域和执行；知识库要验证检索命中与引用；Agent 要验证后台任务、审批和恢复；Builder 要验证保存重开与目标仓库代码交付。仅有 UI、配置或 Mock 不算功能完成。
6. **权限与仓库安全**：修改前检查仓库范围；外部 Agent 输出仅作为候选结果；敏感命令、推送、合并、删除和跨仓库写入需要明确授权；优先隔离分支/worktree。
7. **测试与报告**：按改动范围运行最小相关测试，再运行适当的模块级构建；明确写出已运行/未运行/失败项，不得伪造测试结果。
8. **交付格式**：每次交付固定说明变更文件、用户可见行为、验证命令与结果、风险/限制、需要用户决定的事项。

### 2D.4 前后端专属约束

**frontend/AGENTS.md**
- 保留 Vue 3 + TypeScript + Vite+ + pnpm monorepo、既有 `@eap/ui` / runtime-client；新增依赖须说明替代方案与代价。
- 不把所有逻辑继续堆到 `App.vue`；新页面采用路由、领域组件和可测试状态。
- 新增工作台必须通过 Plugin Manifest/Registry 接入，而不是硬编码一级导航。
- Builder 的 GrapesJS 数据是原型模型，HTML 导出不是可维护 Vue 业务代码；交付需明确组件映射和目标仓库。
- 原型任务必须有可点击交互与 Mock 数据；用户批准前不得直接当作正式功能实施。
- 测试命令先检查实际 `frontend/package.json`、Vite+ 配置和锁文件，再选择命令，不能假设脚本存在。

**backend/AGENTS.md**
- Spring AI 2.0.2 是通用模型调用基线；优先复用 ChatClient/ChatModel/ToolCallingAdvisor/ChatMemory 和官方 Starter；不得新建重复的 ModelProvider 或手写 HTTP 模型调用层。
- 复用现有 Maven reactor、Spring Boot 和 Flyway 结构；禁止在仓库根创建新的 Maven 构建。
- 新能力优先检查 Capability/Expert/Rule/CLI/MCP/Knowledge 既有模型，禁止重复建第二套注册中心。
- `Expert` 声明式 DAG 与自主 Agent 的计划执行不是同一个抽象；新功能必须标清属于哪个层。
- MCP 现阶段“登记/声明/授权”不等于协议客户端；禁止将探测目标可达写成工具已调用成功。
- 数据库 Schema 变更必须使用增量迁移并验证兼容性；涉及外部进程必须控制超时、输出、工作目录和权限。
- 后端测试命令以项目 Maven 配置和实际环境为准；集成测试依赖缺失必须如实说明。

### 2D.5 让 AGENTS.md 真正提升效率的机制

- **指令预算**：根文件建议控制在约 100–150 行内；把长示例、操作手册和功能规划移到链接文档。不是硬限制，目的是减少无关上下文。
- **按需读取**：只读取当前任务涉及的目录级指导和相关文档，不要求每次通读所有 `docs/`。
- **验证矩阵**：建立 `docs/agent-development-guide.md`，按 UI、CLI、MCP、Knowledge、Builder、Mission 分类维护最小验收命令和真实运行用例。
- **失败经验回写**：仅把反复出现、具有普遍性的错误写入 AGENTS.md；具体故障复盘写入专门文档，避免规则无限增长。
- **规则一致性检查**：为 AGENTS.md 中的路径、脚本和测试命令编写轻量检查，防止文件改名后指令失效。
- **评估指标**：以首次通过测试比例、返工次数、越权修改次数、未验证完成声明次数、任务平均交付时长评估调整效果，而非以 AGENTS.md 字数衡量。

### 2D.6 本地 Codex 执行指令（直接使用）

> 审计并改造本仓库的 `AGENTS.md` 治理。首先读取根 `AGENTS.md`、`docs/architecture.md`、`docs/roadmap.md`，检查 backend/frontend 的真实构建配置和现有测试。保留 deterministic-first、LLM-last 及外部结果独立验证原则。提交一份简洁的根 `AGENTS.md`，按必要性新增 `backend/AGENTS.md` 和 `frontend/AGENTS.md`，并在 `docs/agent-development-guide.md` 写出各类任务的验收矩阵。要求涵盖：原型先行与用户审批、插件化工作台、真实 CLI/MCP/Skill/知识库闭环、隔离仓库修改、按范围测试和标准交付报告。不得改业务代码、不得假定未存在的命令、不得以 Mock 宣称真实功能完成。输出变更 Diff、指令冲突检查、路径/命令核验结果，等待用户审阅后再扩展。

### 2D.7 验收标准

- 任一编码 Agent 进入仓库能识别任务类型与相关模块，无须读取整个长篇架构方案。
- 对“做一个 Builder 页面”会先制作交互原型并等待批准，而非直接重构后端。
- 对“接入 MCP 服务器”会要求真实协议连接与工具调用，而非只保存配置。
- 对“自动修改目标仓库”会先验证 repo/worktree 范围，不覆盖未提交修改。
- 每次输出都区分已实现、Mock、待实现、已验证和未验证。
- 根/局部 AGENTS.md 没有互相冲突的技术栈、测试命令和权限规则。

**实施顺序**：先改造 AGENTS.md 及验证指南，再让 Codex 执行 v1.4 的 A0 审计与 v1.3 的插件化 M0 原型；否则容易把尚未验证的旧实现继续当作新平台的基础。
