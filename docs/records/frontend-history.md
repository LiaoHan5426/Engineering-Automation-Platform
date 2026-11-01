# 前端工作台、共享UI与验收总览

## 当前结论与阅读方式

固定五入口与同一Chat骨架、场景/设计/交付分面、公共组件/主题和图标首片已落地。82aa504包含Comments 1–10及统一图标；前一阶段574项通过。真实终端、规划/Agent/Work执行、全视口/真实缩放/错误焦点矩阵与用户体验接受仍未完成。共享模块落点仅以[边界规范](../decisions/frontend-ui-shared-module-boundaries.md)为准，当前进度看[台账](../planning-status.md)。

以下按主题合并完整阶段记录，日期保留在记录中而不再作为文件名。记录中的“本轮/未提交/下一步”和测试数字仅代表当时快照；不得覆盖上面的当前结论、有效产品合同或用户授权。原文完整保留（只调整标题层级、锚点及链接），后续更新本总览，不另建日期报告。

## 记录索引

| 原记录 | 完整章节 |
|---|---|
| `docs/decisions/frontend-adjustment-acceptance-2026-10-28.md` | [前端调整任务与验收清单](#frontend-adjustment-acceptance) |
| `docs/decisions/frontend-ui-consolidation-2026-10-31.md` | [前端组件收敛审计与实施记录（2026-10-31）](#frontend-ui-consolidation) |
| `docs/decisions/reference-ui-review-2026-11-01.md` | [截图/录屏与当前前端交互复核](#reference-ui-review) |
| `docs/decisions/frontend-icons-2026-11-01.md` | [统一图标模块：@eap/icons](#frontend-icons) |

---

<a id="frontend-adjustment-acceptance"></a>

## 前端调整任务与验收清单

来源：`docs/decisions/frontend-adjustment-acceptance-2026-10-28.md`；合并基线 `82aa504`。

<!-- record:start docs/decisions/frontend-adjustment-acceptance-2026-10-28.md -->
<a id="frontend-adjustment-acceptance--前端调整任务与验收清单"></a>
### 前端调整任务与验收清单

依据：`EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md` §0B.3–0B.11。
范围按用户补充调整：每项能力同步核对前端、真实后端和 mock；mock 不替代真实后端。DeepSeek 仅可做只读连通性验证，不得通过模型调用修改仓库。真实仓库写入、完整执行器、供应商授权及桌面打包不能由 mock 结果证明。

当前同步基线：`main / 2b0fe26`。以下主表和剩余清单更新到该提交；后文带日期记录保留当时证据。状态中的“前端验收通过/部分验收通过”仅指代理已执行的限定测试和浏览器脚本，不是用户最终接受。本次只同步文档，不重跑测试或浏览器。完整跨阶段进度见[接续台账](../planning-status.md)。

| ID | 必须交付的界面与交互 | 状态 | 验收证据/缺口 |
|---|---|---|---|
| UI-01 | 五入口、设置贴底、独立滚动、右面板、窄窗抽屉与发送可达 | 前端验收通过 | 35 项视口检查、窄窗遮罩关闭、发送可达；修复步骤遮挡 |
| UI-02 | 项目分组、会话、任务、文件来源与 SQL 工作面职责清楚 | 部分验收通过 | 真实目录浏览与看板任务持久化已验证；SQL 业务跑数待验收 |
| UI-03 | 本地服务进程路径与 UI 标签分离，授权状态可读 | 部分验收通过 | colocated/绑定根/dirty已有实测；Electron/preload已有壳，真实目录选择联调及安装器产品化另验 |
| UI-04 | Code/Work 共用会话骨架，切换与返回保留草稿及选择 | 前端验收通过 | 草稿/专家返回保持；修复 #chat 模式恢复 |
| SC-01 | 原型场景目标、版本、范围、候选准备条件与返回 | 部分验收通过 | 1f38cd8分离配置/任务工作面，设计复用Builder、准备按需加载，往返保留选择；真实自身改页仍待 |
| SC-02 | 场景详情、依赖状态、禁用、复制及管理跳转 | 部分验收通过 | 列表/详情/复制/依赖定位已测；Skill独立文本引用已接，不等于场景资源自动安装授权；MCP协议与副本持久化仍待 |
| CP-01 | 目标与执行模式分离；未接通模式禁用且可解释 | 待核验 | mock 运行不冒充真实 Agent |
| CP-02 | 实际审批策略、拒绝和只读行为 | 待核验 | 不称未实现的风险审核为 AI 审核 |
| CP-03 | 多行输入、引用、弹层、搜索、Esc、焦点、短窗可达 | 部分验收通过 | 媒体对照修正知识/Skill长说明堆叠；＋专家打开知识弹窗，引用使用紧凑Tag；四视口含摘要下发送可达。新增生命周期/返回回归，全量555项通过，最终审查见[记录](#reference-ui-review) |
| MD-01 | 连接→目录→允许模型→默认→会话→强度 | 部分验收通过 | 真实/mock共用UI；历史DeepSeek目录/只读连通性已测并停用连接；当前供应商状态与强度能力未因此验收 |
| EX-01 | 专家选择、版本、指引、资源及移除可追溯 | 部分验收通过 | c9d23a7接通单持久专家授权知识，实库隔离/旧记忆清理及浏览器拒绝分支已测；完整角色/其他资源和供应商效果待验收 |
| PB-01 | 手动设计、真实编辑画布、Vue 语义映射、保存与重开 | 部分验收通过 | 8 类映射（含 heading/list）、真实编辑与 Vue 交互、本机历史与服务端版本通过 |
| PB-02 | 版本、目标文件、源码和生成前基线组成交付输入 | 部分验收通过 | f6aed04/69892f3单目标完整有界源码和Task/revision/原型生成前快照；实库/Fake模型通过，实际供应商生成待验收 |
| PB-03 | 候选 Diff、范围、冲突、确认和拒绝 | 部分验收通过 | f614272持久候选/APPLYING意图/写后读回/APPLIED重放与互锁；真实隔离文件回归通过，真实模型自身改页及多文件事务未交付 |
| PB-04 | 检查结果、页面预览、人工验收分开呈现 | 部分验收通过 | 04edef5真实三项检查与持久验证；a63d27e/ca3b0a2真实样例采集/接受/过期拒绝/刷新回放；测试决定不是用户产品接受 |
| CT-01 | 缓存、请求进行中、Run 持久恢复不混淆 | 部分验收通过 | 持久Run/验证/交付/应用记录与重启未知阻塞已有；ChatMemory仍内存，取消/未知人工核对和进程接管未交付 |
| RV-01 | 摘要、文件、Diff、验证和来源随会话/任务更新 | 部分验收通过 | 会话面板/看板按Run选择/独立交付工作面与决定回放已测；SQL实际任务证据、全场景切换与用户接受另验 |
| RK | 五列看板、任务详情、允许状态转换与审阅证据 | 部分验收通过 | 持久任务→只读Run→审阅→验证→交付/决定，POST_HOC/PREBOUND关联已接；不把Git Run当源码作者，不开放任意拖done；整链用户验收仍待 |
| SKILL | 文本导入、来源确认、版本/启停、全文预览及Chat引用 | 部分验收通过 | 2b0fe26；实库、真实服务/内置预览、安全与恢复缺陷独立复核通过；仅单Skill无工具Chat，目录导入与真实供应商效果待定 |
| MOCK | mock 与真实使用同一 UI/DTO，未实现端点明确失败 | 待核验 | 用户不选择数据来源 |
| QA | 自动检查、浏览器矩阵、修复新发现问题 | 部分验收通过 | 基线失败与编译错误已修，35 项视口/目录/编辑器/看板通过；完整真实改页待验收 |
| DOC | 每项记录实际证据与剩余边界，回写主文档 | 已同步 | 主文档新增本轮证据矩阵，本文件保留全部未完成项 |

<a id="frontend-adjustment-acceptance--当前接续状态2026-11-01同步"></a>
#### 当前接续状态（2026-11-01同步）

上表已同步当前实现，不再保留“Run尚未接入”等过期结论。任务准备、受控Run、原型快照和仓库审阅证据见[任务准备](delivery-history.md#board-task-preparation)、[受控执行](delivery-history.md#board-controlled-run)、[原型关联](delivery-history.md#board-prototype-link)、[仓库审阅](delivery-history.md#board-run-review)。场景/Builder/看板分面见[审查纠偏](architecture-history.md#implementation-review)。

继续开发按以下关口推进，不把单个切片完成计为全规划完成：

| 对应项 | 当前事实 / 下一关口 |
|---|---|
| RK-1～4、RK-6 | 已有持久任务、并发/幂等、原型冻结、一次后台只读 Git Run 和失败/未知/重读边界；不是通用工程执行器 |
| RK-5 / PB-04 | Run 独立类型/测试/构建证据已实现，真实三项检查退出 0、持久回放、V10 互锁及最终独立审查通过。见 [当前切片合同与证据](delivery-history.md#board-run-verification)。不等于源码归因或人工验收 |
| PB-02 / PB-03 | 单目标生成前持久基线、实际受控文件应用、POST_HOC/PREBOUND已交付；多文件组件约束、真实供应商自身改页仍待，见[生成前任务绑定](delivery-history.md#code-task-prebinding) |
| PB-04 人工验收 | 源码交付证据、同源独立验证与人工决定关联已实现并通过样例实测，见[源码交付](delivery-history.md#board-source-delivery)；用户产品接受未取得，不能从只读Run直接done |
| SC-01 / PB-01 | 场景配置、原型设计、版本和准备已分面；更多交互映射和 EAP 自身改页验收仍待后续 |
| SC-02 / EX-01 / CP-01 | 单专家授权知识与Skill文本首片已交付；场景资源整合、其他专家资源、MCP协议、规划/Agent与办公执行仍待，见[专家知识](resource-history.md#expert-knowledge-chat)、[Skill文本](resource-history.md#skill-text-import) |
| CT-01 | Run 记录持久重读已存在；跨重启进程接管、取消、未知人工解除仍不承诺 |
| 桌面与安装器 | Electron/引导已有脚手架；打包、签名、sidecar、一体启动与迁移仍需独立实施及授权验收 |
| 整体验收 | 用户最终交互接受、完整原型到代码闭环、真实模型/Agent 验收不能由离线测试代替 |

<a id="frontend-adjustment-acceptance--2026-10-28-历史发现与证据"></a>
#### 2026-10-28 历史发现与证据

下列问题与测试结果记录当时修复过程，不表示今天重新发现或重跑。

- GrapesJS 模块被当作函数调用，实际需使用 `init()`；即使已安装也会落入离线模式。
- Schema 保存只按固定类型造节点，不能保留画布中的实际内容和层级。
- 基线测试包含 mock/live 配置假设失配及测试期间外部网络访问，需隔离并修复。

<a id="frontend-adjustment-acceptance--已执行的验收证据"></a>
#### 已执行的验收证据

| 项目 | 结果 | 结论范围 |
|---|---|---|
| 7 页面 × 5 CSS 视口 | 1280×800、1440×900、708×800、1024×640、1152×720，共 35 次未发现页面横向溢出 | 后两组为 125% 等效可用 CSS 面积，不冒充操作系统真实缩放 |
| 场景编辑器遮挡 | 浏览器发现三列步骤挤压编辑器，已改为纵向步骤；添加文本按钮可点击 | 无横溢不等于控件可操作，已增加真实点击验收 |
| GrapesJS | 实际挂载；新建、添加文本/按钮、文字编辑、保存、版本重开通过 | 不是标题计数夹具；尚不支持任意组件无损转换 |
| Vue 语义预览 | 显示手动输入文本，Action 按钮点击显示 1，重开版本内容一致 | 注册类型 page/section/text/button/input，未知类型阻塞映射 |
| 设计交付版本 | 保存到已有真实 `/prototype-versions` 服务成功；场景版本列表刷新并选中 | 只保存工程+Schema，不生成或应用代码 |
| 授权目录 | Java `/ai/workspace/files` 返回真实目录；UI 逐层打开 frontend/apps/web/src/App.vue 并看到 SHA-256 与源码摘录 | 只读；拒绝越界、隐藏目录、依赖/构建目录与符号链接，最多 200 项 |
| 窄窗输入与返回 | 708 宽下抽屉开合、遮罩、草稿保留、专家加入后返回、发送位置可达；Esc 关闭执行菜单并回焦 | 没有发送草稿 |
| Code/Work 路由 | 发现 `#work → #chat` 保留 Work，已修正并复验 Code 标题 | 不重建两套聊天状态机 |
| DeepSeek 真实只读调用 | 使用配置键，目录取得 deepseek-flash，收到 EAP_READ_ONLY_OK；无 proposal、无工具事件，仓库代码摘要未变，测试连接随后停用 | 密钥与模型原始响应未输出；未调用候选应用 |
| 自动检查 | 前端 56 文件/184 测试通过；typecheck/build/boundaries 通过；Java 28 项定向测试通过，无失败/跳过 | 构建提示 GrapesJS 独立懒加载包约 1.07MB，不与主包合并；后续新增检查以最新记录为准 |

<a id="frontend-adjustment-acceptance--仍需实施或独立验收不得遗漏"></a>
#### 仍需实施或独立验收（不得遗漏）

- UI-02：侧栏已复用真实目录浏览入口；剩余SQL业务结果与完整导航体验验收。
- SC-02 / EX-01：单专家知识、单Skill文本引用已接；剩余场景资源整合、更多专家资源及MCP真实协议/授权调用，Skill目录导入延期。
- CP-01 / CT-01：真实规划/Agent执行、取消、未知人工核对与按需进程恢复；不再把已有持久Run记录列为缺失。
- PB-02–04：多文件组件约束、真实供应商自身改页→现有应用/验证/交付→用户接受；既有单文件应用与真实三项检查不重复开发，历史DeepSeek只读测试不构成源码写入授权。
- RK：Run/验证/交付及决定关联已接；剩余实际实现执行器的完整交付与用户接受，不通过拖拽伪造完成，Git检查Run不能宣称创作了代码。
- MOCK：模型/聊天/目录/原型版本已有对应 mock；其他管理接口需逐个与已有真实后端契约对齐，不以通用成功响应填空。
- PB-01/R4：更多组件、交互与约束映射仍需逐项注册；当前已注册八类 Vue 预览（含 heading/list），仍缺真实改页验收。
- 桌面产品化：Electron 打包签名、sidecar 与安装器一体启停/迁移仍待实施，脚手架不等于完成。
- 整体验收：以上通过项是代理验证，用户最终交互接受仍未取得。文档的“所有调整完成”状态暂不能成立。

<a id="frontend-adjustment-acceptance--历史推进记录2026-10-28以下仍未完成不作为当前待办"></a>
#### 历史推进记录（2026-10-28；以下“仍未完成”不作为当前待办）

<a id="frontend-adjustment-acceptance--看板后续推进"></a>
##### 看板后续推进

新增增量迁移 `V2__board_task_drafts.sql`（不改已应用 V1），真实 `/api/board/tasks` 支持按组读取、新建、备注保存和带 revision 的状态修改；同步提供 mock 响应。前端复用本机分组清单，不再维护 EAP/Office 两个独立示例分组。`planned↔ready` 可编辑；开始执行、验收和完成仍需真实证据，服务端会拒绝无证据跳转。浏览器已验证创建、备注保存、待处理流转、刷新保持及禁止无证据完成；真实 HTTP 对陈旧 revision 返回 409。


<a id="frontend-adjustment-acceptance--2026-10-28-继续实施统一场景流程与管理表单"></a>
#### 2026-10-28 继续实施：统一场景流程与管理表单

本轮继续沿用以上完整清单，不重置未完成项。新增可核验任务如下：

| 任务 | 完成情况 | 证据与边界 |
|---|---|---|
| SC-03 移除原型场景按 mock/live 展示不同流程 | 已实现并核验 | 两种来源共用设计画布、Vue 预览、版本 API 与交付门禁；mock 不再跳过版本/基线读取，不自动进入另一种数据来源 |
| UI-02 侧栏文件观察与源文件入口统一 | 已实现并核验 | 侧栏新增源文件入口；真实浏览器点击后打开已有授权目录浏览器，不新建第二个文件树 |
| MG-01 管理表单提交按钮 | 已修复 | 8 处缺少 submit：知识库创建/改名/录入/检索、数据库保存、CLI 登记/操作保存、规则包创建；保留公共 Button 安全默认 button |
| MG-02 知识库真实服务与 mock 对齐 | 部分验收通过 | 原有 Java CRUD 保留；新增可选 baseId 检索范围与不存在时拒绝，mock 对应增删改/文档/检索。真实浏览器创建、录入、当前库检索命中并显示来源；切换异常统一反馈，取消空草稿不请求空 UUID |
| MG-03 数据库资料 mock | 已实现并核验 | 对齐既有 Java 元数据 CRUD，不连接业务数据库、不执行 SQL；mock 浏览器保存按钮实际提交并更新列表。凭据检测沿用 Java 管理输入规则，限制元数据大小 |
| DOC-02 恢复本地图片关系 | 已完成 | 主文档 0B.2 恢复 3 张关键图、10 个时间点索引和 EAP 历史截图；保留相对链接，忽略未脱敏媒体，远程缺图可以接受 |

验证：前端 typecheck、build、check:boundaries 通过；59 个文件/190 项测试全部通过。Java 定向回归 30 项通过，0 失败/跳过。构建仍提示 GrapesJS 约 1.07 MB，主包约 582 KB 超过 500 KB，未隐藏警告。真实浏览器知识库在 708px 下无页面横向溢出，检索按钮和结果可达；独立 5174 mock 服务核验知识库创建、数据库资料保存和统一原型场景。5173 用户服务未重启。

本轮没有调用 DeepSeek 或其他真实模型，没有通过模型生成/应用代码；application.yml 未作为本轮编辑目标。真实库留有明确命名的本地知识检索验收样本，不包含业务数据。mock 存储仍是进程内存，重启重置；其检索仅为关键字包含模拟，不能证明 PostgreSQL 检索质量、专家引用拒绝或 Agent 资源授权通过。

仍未整体完成：真实 Run/规划执行、Skill/MCP 执行、完整原型多文件交付与独立验收、其他管理接口 mock、桌面打包等沿用上方未完成清单。禁止将本轮切片标记为全部规划完成。

<a id="frontend-adjustment-acceptance--2026-10-28-关键帧结构对齐已有开发面"></a>
#### 2026-10-28 关键帧结构对齐（已有开发面）

对照 `docs/assets/ui-reference-20261026` frame-064/080/112 与内置浏览器 `#work` / `#scenes` / `#board`：

| 调整 | 结果 | 边界 |
|---|---|---|
| 侧栏首屏 | 路径/脏文件/桥/目标目录收入「边界说明」；分组树与「新对话」先可见 | 不冒充仓库文件树；Electron 桥仍未接通 |
| 欢迎区 / 输入条 | 标题直出；「管理场景/专家」；场景芯片进工具条「＋」旁；办公占位「描述你想让 AI 完成的工作…」 | 场景目录仍诚实禁用未接通项；非录屏同款政策/竞品卡 |
| 摘要 / 看板 | 摘要卡片字重与状态 pill；五列圆角、色点、卡片阴影 | 不伪造 Run/完成列证据 |
| 自动检查 | DesktopNavigation / Welcome / TaskComposer / PreviewBoard / ScenarioWorkspace：29 通过 | 不等于录屏整体验收或用户交互接受 |

未宣称录屏像素级一致；Skill/MCP、无人值守、签名安装包仍开放。

<a id="frontend-adjustment-acceptance--2026-10-28-关键帧交互对齐非像素"></a>
#### 2026-10-28 关键帧交互对齐（非像素）

对照 frame-064/024，以内置浏览器点验交互而不是视觉像素：

| 交互 | 结果 | 诚实边界 |
|---|---|---|
| 分组旁「新建」+「新建自由对话」 | 选中/清空分组后进入草稿；摘要显示本机分组绑定 | 分组仍是 UI 标签，不是写权限 |
| 输入条分组上下文条 | 可切换自由对话/本机分组，与会话 extras 同步 | 不伪造目录授权 |
| 选场景→芯片；缺依赖⚠ | 欢迎区选择同步到「＋」旁芯片；缺依赖高亮 | 依赖状态来自场景声明 |
| 选专家→协作芯片 | 欢迎区切换同步 | 资源只作记录 |
| ＋分层菜单 | 文件/指令/动作/专家/技能/MCP + 禁用「无人值守」 | 工作区选文件与无人值守仍未接通 |

自动检查：DesktopNavigation / TaskComposer / SessionPanel / Welcome 定向测试通过。仍不宣称录屏整体验收。

<a id="frontend-adjustment-acceptance--2026-10-28-关键帧交互续对齐frame-040064"></a>
#### 2026-10-28 关键帧交互续对齐（frame-040/064）

| 交互 | 结果 | 诚实边界 |
|---|---|---|
| 执行模式弹层第四项「插件创造」 | 始终禁用并说明未接通 | 不伪装可自然语言建插件 |
| 规划/智能体文案 | 「仅思考」「例行任务」+ 未接通原因 | 非 mock 仍不可选 |
| 再点已选场景取消 | 芯片同步消失 | 不清空正文 |
| Code/Work 切换 | 不适用当前模式的场景自动清除 | 共用会话骨架 |
| 欢迎区搜索专家 | 与场景搜索同级 | 只过滤展示，不接目录 API |

定向测试 TaskComposer + WorkspaceWelcome 通过。仍不宣称录屏整体验收。

<a id="frontend-adjustment-acceptance--2026-10-28-关键帧交互续对齐frame-044088112"></a>
#### 2026-10-28 关键帧交互续对齐（frame-044/088/112）

| 交互 | 结果 | 诚实边界 |
|---|---|---|
| 审批弹层五项 | 询问可选；AI审核/完全放行/工具权限禁用；AI审核说明「低风险自动…未接通」 | 不启用未接通的风险审核 |
| 场景卡片点击进详情 | 卡片本体可点；详细信息仍保留 | — |
| 场景详情预设控件 | 「上传·未接通」「预设不可保存」、Code/Work 只读勾选、工具范围/对话模式禁用下拉 | 不伪装可保存预设或接通 Agent |
| 缺依赖黄条 | 补齐依赖 / 手动安装·去设置 | 定位说明，不安装技能 |
| 专家目录标题 | 「专家市场」+ 分类芯片 + 搜索 | 工具未接入 |

ScenarioWorkspace + TaskComposer 定向测试通过。仍不宣称录屏整体验收。

<a id="frontend-adjustment-acceptance--2026-10-28-关键帧交互续对齐frame-048192"></a>
#### 2026-10-28 关键帧交互续对齐（frame-048/192）

| 交互 | 结果 | 诚实边界 |
|---|---|---|
| 输入条「上下文」 | 可点，打开＋附件菜单（文件类）并显示文件上限、无 token | 不伪造 token 用量 |
| 模型钮文案 | `模型id · 强度`；强度 `high`→「最大」 | 未配置档位时显示「模型默认」 |
| 模型弹层头 | 当前强度 + 模型副标题 + 推理强度行 | 不做像素滑条 |
| 刷新失败提示 | 「刷新失败，当前展示缓存」醒目失败色块 | 仍展示缓存目录 |
| 顶栏「重试」 | 常显；仅发送失败且有草稿时可点 | 与 feed 内重试同条件 |
| 专家市场卡 | 右上「＋」加入当前任务 | 工具仍未接入 |

TaskComposer 11 + SessionPanel 相关定向测试通过。仍不宣称录屏整体验收。

<a id="frontend-adjustment-acceptance--2026-10-28-关键帧交互续对齐frame-040064080"></a>
#### 2026-10-28 关键帧交互续对齐（frame-040/064/080）

| 交互 | 结果 | 诚实边界 |
|---|---|---|
| 执行模式文案 | 「聊天·无工具」「规划·只谈思考」「智能体·常规任务」「插件创造·…」；未接通项禁用并标注 | 规划/智能体/插件仍不可选 |
| 办公欢迎场景 | 文档编写可选并标缺技能；政策分析/竞品分析/对内办公禁用「敬请期待」 | 不安装技能、不开放插件 |
| 专家「公司政策知识专家」 | 展示但禁用敬请期待 | 不能加入任务 |
| 场景目录 | 「＋新建场景」进自定义详情；卡片标签 预设/插件/敬请期待 | 自定义刷新不保留 |
| 选文档编写 | 输入条出现「场景：文档编写」芯片（缺依赖可标⚠） | — |

WorkspaceWelcome + TaskComposer + ScenarioWorkspace **21** 项通过。仍不宣称录屏整体验收。

<a id="frontend-adjustment-acceptance--2026-10-28-关键帧交互续对齐frame-024088112168"></a>
#### 2026-10-28 关键帧交互续对齐（frame-024/088/112/168）

| 交互 | 结果 | 诚实边界 |
|---|---|---|
| 场景详情页签 | 基础信息 / 工具 / 技能 / MCP；预设名称简介指引只读表单；黄条「补齐依赖」「手动安装」 | 技能/MCP 不接通 |
| ＋菜单搜索 | 随分类占位「搜索添加文件」等 | — |
| 专家市场 | 搜索「名称、简介或标签」；还在路上专家禁用 | 工具未接入 |
| 看板 | 搜索「任务、描述或标签」；待处理列 AI 自动工作禁用开关；列内「添加任务」 | 无人值守未接通 |

定向测试 **22** 通过。仍不宣称录屏整体验收。

<a id="frontend-adjustment-acceptance--2026-10-28-关键帧交互续对齐frame-048192-侧栏与顶栏"></a>
#### 2026-10-28 关键帧交互续对齐（frame-048/192 侧栏与顶栏）

| 交互 | 结果 | 诚实边界 |
|---|---|---|
| 侧栏「记录今天的 AI 工作」 | 清空分组绑定、打开自由对话草稿，预填只读总结文案；不自动发送、不扫仓 | 总结靠用户审阅后发送；无模型时发送仍禁用 |
| 侧栏「筛选分组或会话」 | 按分组名/路径/会话标题过滤；命中时自动展开分组 | 本机标签树，不是仓库文件树 |
| 顶栏「⋯」 | 展开「导出会话」「分享」，均禁用并说明未接通 | 不下载、不生成外链 |
| 摘要「后台运行」 | 空态「暂无」+「当前没有后台任务」 | 不伪造 Run/恢复 |

定向测试 DesktopNavigation + SessionPanel **19** 通过；内置浏览器 `#chat` 点验通过。仍不宣称录屏整体验收。

<a id="frontend-adjustment-acceptance--2026-10-28-关键帧交互续对齐frame-080112-场景与专家"></a>
#### 2026-10-28 关键帧交互续对齐（frame-080/112 场景与专家）

| 交互 | 结果 | 诚实边界 |
|---|---|---|
| 场景卡「复制」 | 各卡常显，含敬请期待项；复制为页内自定义 | 刷新不保留；不装插件 |
| 场景卡「删除」 | 预设/插件禁用并说明；自定义可删 | 不删服务端资源 |
| 专家市场「我的专家」 | 标题旁可切换；分类芯片保留 | 工具仍未接入 |

ScenarioWorkspace + ExpertCatalog + 导航/摘要定向 **27** 通过；`#scenes`/`#expert-catalog` 浏览器点验。仍不宣称录屏整体验收。

<a id="frontend-adjustment-acceptance--2026-10-28-关键帧交互续对齐frame-064088168"></a>
#### 2026-10-28 关键帧交互续对齐（frame-064/088/168）

| 交互 | 结果 | 诚实边界 |
|---|---|---|
| 看板「全部优先级」 | 可切换；P0/P1/P2 列表为空并提示字段未接通 | 不伪造优先级标签 |
| 看板搜索 | 匹配标题与备注 | 无独立标签字段 |
| 看板头「无人值守未接通」 | 常显徽章 | 不启无人值守 |
| 场景详情页签计数 | `工具/技能/MCP` 显示 `已接通/声明`（当前 0/N） | 技能未安装 |
| 欢迎区场景卡 | `aria-pressed` + 缺依赖 title | — |

PreviewBoard + ScenarioWorkspace + Welcome 定向 **13** 通过；`#board`/`#scenes` 点验。仍不宣称录屏整体验收。

<a id="frontend-adjustment-acceptance--2026-10-28-按-0b-推进场景样式--pb-01-link"></a>
#### 2026-10-28 按 §0B 推进：场景样式 + PB-01 link

| 调整 | 结果 | 边界 |
|---|---|---|
| 场景返回文案分层 | 侧栏「返回来源会话」；页头「返回对话」 | 消除同文案双钮干扰 |
| 场景卡操作 | 「详细信息 › / 复制 / 删除」文字链；本地/市场深色选中 pill；白底卡片 | 非像素级 |
| 看板工具条 | 搜索/优先级控件统一高度与底色 | — |
| PB-01 `link` | Grapes 块 + Schema 映射 + Vue 预览可点计数 | 仍仅六类：page/section/text/button/link/input |

定向测试 **29** 通过；`#scenes` 浏览器点验。仍不宣称录屏整体验收；Skill/MCP/真实改页仍开放。

<a id="frontend-adjustment-acceptance--2026-10-30-真实后端源文件布局--pb-01-heading"></a>
#### 2026-10-30 真实后端：源文件布局 + PB-01 heading

| 调整 | 结果 | 边界 |
|---|---|---|
| UI-01 / UI-02 源文件面板 | （已被下一节纠偏）曾误做成全屏进入式目录 | 已废弃该交互 |
| 拒绝码可读 | `SOURCE_FILES_ONLY` 等映射为人话；目录仍可继续选其他文件 | 仍只读；package.json/pom.xml 不可预览 |
| 侧栏诚实文案 | 明示「源文件」走真实 list-dir；脏文件仅为 basename 观察 | 侧栏不嵌第二套可展开写树 |
| 代码审阅依赖 | 「授权仓库读取」标已提供；「仓库 diff 审阅」仍缺 | 不冒充 diff 审阅器 |
| PB-01 `heading` | Grapes 块 + Schema level + Vue h1/h2/h3 预览 | 现七类：page/section/text/heading/button/link/input |

<a id="frontend-adjustment-acceptance--2026-10-30-顶栏四面板布局纠偏对照用户参考帧"></a>
#### 2026-10-30 顶栏四面板布局纠偏（对照用户参考帧）

| 面板 | 预期载体 | 实现 |
|---|---|---|
| 摘要 | 右侧锚定栏，收缩会话宽度 | `session-rail` + `has-rail` |
| 变更 | 右侧锚定栏 | 同上 |
| 源文件 | 右侧浮层 + **树展开**（非 ⌂/↑ 进入式） | `files-overlay` + `RepositoryBrowser` 可展开树 |
| 终端 | **底部停靠栏**，收缩会话高度；**不是右侧栏** | `terminal-dock`；可打开诚实空态，无伪日志 |

主文档 §0B.3 / §0B.6 已同步更正。未宣称录屏整体验收；真实 shell 执行仍未接通。

<a id="frontend-adjustment-acceptance--2026-10-30-面板样式交互--pb-01-list--看板-utf-8-点验"></a>
#### 2026-10-30 面板样式/交互 + PB-01 list + 看板 UTF-8 点验

| 调整 | 结果 | 边界 |
|---|---|---|
| 顶栏选中态 | `shell-tool[aria-pressed=true]` 可见底色 `#e7f3ee`（浏览器测得 `rgb(231,243,238)`） | 不宣称录屏像素级复刻 |
| 摘要右栏 | 增加 `close-summary`；与变更/源文件/终端一致可关 | Esc 仍关闭 |
| 终端底栏 | 诚实禁用「停止」；无伪日志；UTF-8 标记 | 真实 Run/停止仍未接通 |
| 源文件浮层 | 去掉重复会话条；树区可伸展；宽约 380px | 仍只读 list-dir |
| PB-01 `list` | Grapes `ul/ol` → Schema `items`/`ordered` → Vue `ul/ol` 预览 | 现八类：page/section/text/heading/button/link/list/input |
| 看板中文 | 真实 `#board` 可见「EAP 2026-10-28 看板持久化验收」；`curl` UTF-8 列表正常 | 早先 PowerShell 控制台乱码属客户端显示，非库内损坏 |

定向：`prototypeSchema`/`SessionPanel`/`RepositoryBrowser` **17** 通过；内置浏览器 `#chat`/`#board`/`#builder-alpha` 点验。仍不宣称整体验收；Skill/MCP/真实改页/真实 shell 仍开放。

<a id="frontend-adjustment-acceptance--2026-10-30-rk-看板会话关联--优先级徽章"></a>
#### 2026-10-30 RK 看板会话关联 + 优先级徽章

| 调整 | 结果 | 边界 |
|---|---|---|
| 创建可写 `sessionId` | runtime-client / Java / mock 同契约；UI 有当前对话时可勾选关联 | 仅记录 id，不切换权限、不自动发送 |
| 无当前对话 | 创建表诚实提示「无可关联对话」 | 仍可保存草稿 |
| 卡片/详情 | 会话短徽章；P0/P1/P2 色点区分；空目录显示 `—` | 不冒充 Run |
| 准备草稿 | 不再用任务 id 冒充会话 id | 仅预填标题草稿 |
| 忙态文案 | 看板用「正在加载任务…」，不再误用文件读取文案 | — |

真实 API 创建 `sessionId=browser-link-demo` → 刷新见「会话 · browser-」→ 保存 P0 见红底徽章。FE PreviewBoard **4**、Java BoardTaskServiceTest 通过。仍无真实执行器。

<a id="frontend-adjustment-acceptance--2026-10-28-交互一致性回归"></a>
#### 2026-10-28 交互一致性回归

- CP-03 / UI-02：从输入框直接浏览已有授权目录，打开源码后显式引用摘录与 hash，引用进入同一附件列表且可移除。复用 RepositoryBrowser 和现有 Java/mock API，不新增另一套目录服务。源码拒绝后保留目录选项，可继续选其他文件。
- PB-02：输入框不再按 mock 来源引用本机 workbench.drafts；统一读取 prototype-versions API，统一消费 eap.chat.prototype。加载期间按钮禁用，失败反馈保留已有目录。
- EX-01：目录卡片与欢迎页共享当前协作选择；卡片显示选中，支持再次移除；移除后清除过期的已加入提示。没有新增资源权限。
- SC-01：欢迎页与输入框不再把已配置的进程根错误显示为缺失；未执行基线检查时显示待检查依赖，不能把预设 state 当成实时失败。
- UI-01：移除旧全局 composer-categories 横排样式，恢复两列纵向分类和内容；内容列 minmax(0,1fr)，避免输入控件撑宽。真实 708px 引用弹层 clientWidth=scrollWidth=423，页面内控件可达。

浏览器证据：真实 Java 服务下选择 frontend/vite.config.ts，预览后引用，附件 1/6；草稿没有发送；Esc 关闭回焦。专家目录增加/移除前端实现后返回，原草稿、引用及既有文档专家保留。输入框可读到先前服务端保存的设计版本。测试用草稿和文件引用已移除，原选择保留。此轮没有模型调用或候选应用。

检查结果：前端 60 文件/203 测试通过；typecheck/build/check:boundaries/diff --check 通过。构建仍有主包约611KB及 GrapesJS约1.07MB警告。此轮仅前端和文档改动；使用既有真实和 mock 服务契约，未改后端依赖、未重启用户服务。真实 Run、Skill/MCP、多文件交付与最终人工验收继续保留未完成状态。


<a id="frontend-adjustment-acceptance--2026-10-28-短窗口场景与刷新交互纠偏"></a>
#### 2026-10-28 短窗口、场景与刷新交互纠偏

| 清单关联 | 本轮实际调整 | 验证 |
|---|---|---|
| UI-01 / CP-03 | 弹层从整个composer的上边界改为触发按钮视口坐标；上/下放置、限高、右侧钳制和resize关闭 | 四类弹层×三种窗口共12次均在视口内，scrollWidth不大于clientWidth |
| CP-03 | 短窗口取消强制三行操作条；将发送内容展开区最高18vh并独立滚动；发送箭头真实标记与辅助标签；去除输入框重复焦点边框 | 708×640、30行草稿与预览展开时，正文约160px仍可滚动，发送底部606px在窗口内 |
| MD-01 | 目录刷新忙态、重复请求保护，连接切换后不覆盖为旧连接的刷新反馈 | 忙态按钮点击回归；不以真实模型调用验证样式 |
| SC-01 / UI-04 | App记录Work实际来源，场景顶部返回保持Work；依赖定位不再统一跳模型设置 | 真实Work→场景→Work回归；源文件依赖定位组件回归 |
| SC-02 | 复制后直接进入可编辑详情；自定义适用模式可增减，至少保留一种；预设只读 | 组件回归及真实复制/取消Code后Work不能取消；临时副本已通过刷新清理 |

前端完整测试61文件/209项通过；typecheck、build、check:boundaries、diff --check通过。原有按popup-down/popup-end样式类断言的测试更新为实际视口定位合同，保留朝下打开与右边界保护验证。构建警告：主包约614KB、GrapesJS约1.07MB。本轮没有后端改动或真实模型调用，无候选应用，无提交。现有真实和mock共用这些组件；未新增第二套界面或服务契约。

仍需继续：真实原型多文件交付与人工验收、Run/Agent/Skill/MCP完整执行、其余管理接口mock和桌面打包等。此次可达性回归不代表全部产品规划已完成。


<a id="frontend-adjustment-acceptance--2026-10-28-rk-看板编辑与确认交互"></a>
#### 2026-10-28 RK 看板编辑与确认交互

本轮按文档继续闭合已有看板交互，未扩展任务执行器。

| 任务 | 实际完成 | 验收边界 |
|---|---|---|
| RK-02 优先级编辑与筛选 | none/P0/P1/P2贯通Java、V3增量迁移、DTO、mock和UI；与备注同次保存，revision校验，独立变更事件 | 实际Java/DB保存P0并刷新后筛选命中；测试后恢复样本none，原备注不变 |
| RK-03 按所在列新增 | planned/ready初始列写入，未提供时默认planned；其他初始列拒绝 | 前端+mock回归及Java insert列参数回归；没有假执行 |
| RK-04 未提交修改保护 | 关闭/任务切换/分组切换/准备草稿触发确认；全局导航或刷新按任务恢复本机修改；保存/明确放弃后清除缓存，真实与mock隔离 | 真实浏览器恢复提示明确尚未写入服务端；服务端revision变化时提示核对；本机存储受浏览器可用性限制，不代替服务器任务保存 |
| UI-01/RK-05 样式整理 | 优先编辑字段、证据折叠、选中态、短ID、自动定位详情、保存按钮只在变更后可用；修复复选框宽度继承 | 三视口无页面/详情横向溢出，五列保留看板内部滚动 |
| UI-04 确认框键盘 | 共用ConfirmBox默认焦点取消、Tab约束、Esc取消、关闭后回焦；请求中不取消 | 组件回归与真实浏览器确认focus=取消、Esc关闭后保留编辑 |

自动验证：前端63文件/213测试通过，typecheck/build/check:boundaries通过。Java32项定向回归通过（0失败/跳过），未启用需建删库的集成测试；diff --check通过。构建主包约482KB，GrapesJS约1.07MB警告保留。V3为增量迁移，未改已应用V1/V2，未重置数据库。复用IDEA/devtools运行后端，无新依赖、无服务手动重启。

本轮没有真实模型调用、Run启动、候选应用或提交；此前的验收任务仅修改优先级做回归后恢复原值，记录中保留两次优先级更新事件。尚未完成的Run/Agent/Skill/MCP、完整原型交付和最终人工验收继续保留在上方清单，不由优先级持久化推导执行能力。
<!-- record:end docs/decisions/frontend-adjustment-acceptance-2026-10-28.md -->

---

<a id="frontend-ui-consolidation"></a>

## 前端组件收敛审计与实施记录（2026-10-31）

来源：`docs/decisions/frontend-ui-consolidation-2026-10-31.md`；合并基线 `82aa504`。

<!-- record:start docs/decisions/frontend-ui-consolidation-2026-10-31.md -->
<a id="frontend-ui-consolidation--前端组件收敛审计与实施记录2026-10-31"></a>
### 前端组件收敛审计与实施记录（2026-10-31）

用户本轮授权：按现有规划审查并完善组件定义、页面接入、主题/layout 与可复制复用。本文记录本轮证据与实施次序；长期落点规则仍以 [共享模块边界](../decisions/frontend-ui-shared-module-boundaries.md) 为唯一规范。

<a id="frontend-ui-consolidation--首轮审计事实实施前"></a>
#### 首轮审计事实（实施前）

- `@eap/ui` 已有 21 个展示组件，但 App、导航、会话、管理与原型页面仍直接实现按钮、折叠区域。`check:boundaries` 原来仅检查包依赖，未检查 Vue 模板，因此规则无法阻止复发。
- `@eap/style` 有 light/dark，但 `work-pages.css` 在 body 固定覆盖浅色皮肤；短 Token 别名只在根解析，子树换肤不可靠；布局尺寸散落在页面 CSS。
- 未安装 shadcn-vue/Reka UI，也无 components.json。旧 v1.6 将它们列作候选参考，不是已接入承诺。
- Tailwind 4 官方明确不以 Sass/Less/Stylus 预处理工作流为目标；当前无直接 Sass 依赖，lockfile 中 Vite 的可选 peer 不等于已使用 Sass。
- 原“出现真实调用之前不要建”与用户明确的跨仓库复制需求冲突：已规划的通用基础能力可以先提供完整、可验证定义，不能只留空壳；不要求先出现第二个本仓库消费者。

<a id="frontend-ui-consolidation--本轮实施次序与边界"></a>
#### 本轮实施次序与边界

1. 更新 v1.6、边界与模块文档：通用复合 UI 也归 `@eap/ui`；领域组合仍在应用，布局暂存也必须登记。
2. 保留现有 API；Button 提供受控的自定义外观入口，页面统一调用共享 Button；Collapse 收敛原生 details/summary；Pagination 从 Table 中提取。为复制用途补 Radio、Divider、Progress、Skeleton、Descriptions，并登记公开契约。所有定义可运行，不建无实现占位组件。
3. 统一 Token、浅/深色控制台皮肤、密度和布局尺寸，提供无 Tailwind 的 CSS 入口与可选 Tailwind 4 映射。布局结构组件落在 `@eap/ui/layout`，不引入领域或新插件 SDK。
4. 模板静态检查禁止应用直接使用基础原生控件、第三方 UI 与私有源导入。Grapes 编辑器 HTML 字符串是设计数据，不能当 Vue 模板误替换；实际 Vue 预览必须使用 `@eap/ui`。
5. 执行类型、边界、相关行为回归、构建与运行页面检查；不重启用户的前后端，不调用付费模型。

<a id="frontend-ui-consolidation--shadcn-vue-决策"></a>
#### shadcn-vue 决策

采用“源码纳入 `@eap/ui` 后适配并对外导出”的接入方式，按具体缺口引入；页面保持唯一 EAP 入口。首轮没有复制第三方实现；同日续作已纳入固定提交的 TooltipContent 源码并适配，来源和 MIT 许可在 `packages/ui/src/tooltip`，运行依赖固定为 `reka-ui@2.11.0`。不执行 CLI init 覆盖已有 Token/API。无需为 shadcn 引入 Sass。

官方依据：[Tailwind 兼容性](https://tailwindcss.com/docs/compatibility)、[shadcn-vue 源码分发模式](https://www.shadcn-vue.com/docs/introduction)、[安装配置](https://www.shadcn-vue.com/docs/components-json)。

<a id="frontend-ui-consolidation--验证基线"></a>
#### 验证基线

- 开始时仅 `backend/eap-runtime/src/main/resources/application.yml` 有用户本地改动，保持原样。
- `rtk proxy pnpm --dir frontend test run`：220 项，217 通过、3 失败。`console.test.ts` 两项依赖过时 rail/class 字符串；`builderView.test.ts` 一项期待已移除的“浏览器本地原型存储”文案。后续结果另行记录，不冒充基线全绿。

<a id="frontend-ui-consolidation--首轮完成与验证证据"></a>
#### 首轮完成与验证证据

- [x] 搜索原语与现有实现 → 按领域依赖判层 → 写入 `@eap/ui` / `@eap/style` → 更新规范、暂存登记和复制指南 → 运行边界与行为回归。
- 19 个 Vue 文件的 127 个原生按钮、18 个 details 区域已迁为公共组件；Grapes 的 HTML 字符串保持设计数据，Vue 预览按钮使用公共组件。应用模板检查为零违规。
- 新增 Collapse、Pagination、Radio、Divider、Progress、Skeleton、Descriptions、WorkbenchFrame，共 8 个可运行定义；UI 共 29 个组件导出。Pagination 已用于 Table，Frame 已用于 Chat；其余基础定义允许外部仓库复用。
- Button 增加 custom 外观并保留原生事件/禁用/提交契约；默认按钮继续使用现有样式变体。移除页面直接控件；业务 API/会话状态仍保留在原 feature。
- style 增加可选 console 皮肤、layout/density、Tailwind 4 映射、`applyAppearance`/`applyTokens`。共享组件直接读取 canonical Token；局部别名重新绑定；Dialog/ConfirmBox/Popover 增加 portal 目标配置。收敛主工作台、侧栏、摘要、弹层与差异展示的硬编码表面色；终端和原型内容等独立颜色不冒充全部主题化。
- 原 3 个失败断言按现有产品契约修正：class 按 token 匹配；插件说明取当前 i18n 文案，不恢复过时产品说明。

| 命令 / 检查 | 最终结果 |
|---|---|
| `rtk proxy pnpm --dir frontend typecheck` | 通过 |
| `rtk proxy pnpm --dir frontend test run` | 68 文件、228 项全部通过 |
| `rtk proxy pnpm --dir frontend check:boundaries` | 通过，包含实际 Vue 模板解析，忽略脚本内设计 HTML |
| `rtk proxy pnpm --dir frontend exec stylelint "packages/ui/src/**/*.{css,vue}" "packages/style/src/**/*.css"` | 通过；不是整个旧应用 CSS 的全量 lint 声明 |
| `rtk proxy pnpm --dir frontend build` | 通过；仍有 >500 kB chunk 提醒 |
| `git diff --check` | 通过 |
| `node frontend/node_modules/.cache/eap-ui-browser/check.cjs` | 使用临时 Playwright + 已安装 Chromium，访问用户现有 5173 服务；无 pageerror |

浏览器验证：1440px 下浅/深色工作台与侧栏均随 Token 改变；railWidth=420 后实测网格 `702px 420px`；子树主色覆盖实测 `rgb(102, 51, 153)`；390px 窄屏及场景/专家/设置导航无页面横向溢出。检查了 light/dark/narrow 截图，修正了侧栏/摘要固定浅底及自定义 rail 变窄时 composer 不换行。临时浏览器依赖仅放在 node_modules 缓存，不写入工程依赖/lockfile；浏览器关闭后不保留主题测试状态。

首轮遗留：主题偏好持久化/设置页、DatePicker/Tree 等基础定义、shadcn 实际源码接入，已由下述续作推进。WorkbenchFrame 仍只负责结构，调整行为独立为 Splitter。Computer Use helper 管道不可用，使用独立无头浏览器；未伪造用户桌面点击验收或 Vue MCP 证据。未跑后端测试、未调用真实模型。用户原有 backend application.yml 改动未修改；没有重启服务或提交/push。

<a id="frontend-ui-consolidation--同日续作完成内容与当前证据"></a>
#### 同日续作：完成内容与当前证据

继续关闭上一轮明确留下的使用闭环：增加外观设置与版本化本地偏好，补 DatePicker、Tree、Tooltip、Splitter、Segmented、Drawer 定义；保留公共 API 与应用领域编排，不新增平行 UI 包。shadcn-vue 首个真实源码接入为 TooltipContent，来源固定到 `4d6963aa8a482be7609cb05d3f8b7fe42082b634`，详见组件目录 SOURCE.md / LICENSE。其余交互通过 UI 内部 `reka-ui@2.11.0` 实现。

- [x] 搜索原语 → 判层 → 公共定义写入 UI → 消费者迁移 → 暂存/清单/复制文档更新 → 边界与行为验证。
- 新增 6 个公开组件，累计 35 个；DatePicker 使用浏览器单日期控件，值为无时区 YYYY-MM-DD；Tree 为支持键盘/选择/展开的非虚拟树，懒加载与请求留宿主；Segmented 保持必选项；Splitter 提供水平/垂直、百分比约束、鼠标/键盘调整；Drawer 复用 Dialog 的焦点、Escape、busy 和 portal。
- RepositoryBrowser 改用共享 Tree，移除重复节点交互；刷新/引用按钮使用标准 Button 变体，源码块改读主题 Token。Chat 源文件浮层改为 Drawer，删除私有遮罩壳。
- `#appearance` 提供主题（浅/深/跟随系统）、配色、密度、导航宽度、会话面板宽度、内容最大宽度与恢复默认；设置预览中的 Splitter 调整 rail Token。应用层 `appearance.ts` 校验版本/枚举/尺寸，启动恢复、保存失败提示、系统监听和跨标签页同步；不让 style 包依赖存储或 Vue。
- 修复真实浏览器发现的 Splitter 初始布局尚未注册时 resize 异常，并增加初始化/受控更新回归。截图发现窄屏隐藏侧栏仍占 204px，移除旧高优先级网格规则；390px 设置内容宽度恢复到至少 290px，并以尺寸断言验证。
- 架构 v1.6、共享边界、模块说明和 UI README 同步当前实现与依赖闭包；其余候选没有伪装成已实现。

| 当前检查 | 结果 |
|---|---|
| `rtk proxy pnpm --dir frontend typecheck` | 通过 |
| `rtk proxy pnpm --dir frontend test run` | 70 文件、238 项通过；新增 10 项覆盖偏好、日期、树、单选、抽屉、分栏初始化 |
| `rtk proxy pnpm --dir frontend check:boundaries` | 通过；应用模板基础控件与第三方 UI 入口零违规 |
| `rtk proxy pnpm --dir frontend exec stylelint "packages/ui/src/**/*.{css,vue}" "packages/style/src/**/*.css"` | 通过，仅声明公共 UI/style 范围 |
| `rtk proxy pnpm --dir frontend build` | 通过；保留 >500 kB chunk 提醒 |
| `git diff --check` | 通过；pnpm-lock 的 LF/CRLF 提醒不影响结果 |
| `node frontend/node_modules/.cache/eap-ui-browser/continuation.cjs` | 通过：深色/密度/配色/宽度保存与刷新、恢复默认、系统主题、跨标签页、Tooltip focus/Escape、Splitter 键盘/鼠标、390px 布局、Drawer/Tree/Escape；零 pageerror |

浏览器使用隔离上下文与现有 5173/8080 服务，检查了桌面深色设置、窄屏和源文件 Drawer 截图；不改用户浏览器偏好，不重启前后端。未运行后端测试或真实模型调用，未声明人工桌面验收。当前仍未实现 Cascader/Transfer/TreeSelect/VirtualizedTree 等未定契约候选；日期区间、自绘日历、主工作台任意拖拽布局也不在本次完成声明内。残留原型/终端独立配色仍按既有范围处理。

<a id="frontend-ui-consolidation--收敛遗漏的调整计划用户再次授权"></a>
#### 收敛遗漏的调整计划（用户再次授权）

复核发现：具名原生控件虽已清零，但仍有 article/path 模拟按钮、私有菜单与 122 处 custom Button；模板检查未覆盖 ARIA 模拟控件，页面视觉仍有硬编码。该事实不等于此前组件入口迁移失败，也不能据此声称全部抽取完成。

本切片依次完成：公共按钮变体和 ActionCard/DropdownMenu/SvgActionPath 定义；菜单定位/关闭归共享 Popover 与 DropdownMenu；迁移页面使用，删除重复控件视觉；固定配色集中到 style Token（设计器模型中的用户内容不属于宿主主题）；扩大模板/样式边界检查及行为测试。保留领域状态/API 和后端当前行为，验证后更新完成证据，作为后续规划开发的约束。

<a id="frontend-ui-consolidation--调整结果与最终验证"></a>
##### 调整结果与最终验证

- [x] 搜索现有原语 → 判层 → UI/style 实现 → 应用接入 → 暂存/复制指南/规范同步 → 边界、单测、构建和浏览器验证。
- 122 处 custom Button 已归零，改为公共 primary/secondary/ghost/danger/link/navigation/activity/chip/icon/card/backdrop 变体。删除相应页面按钮颜色、圆角、边框、禁用/hover/focus 和重复尺寸规则；页面保留定位、宽高、内容网格及领域展示。custom 仅保留为旧源码消费者兼容入口，应用检查拒绝它。
- 新增 ActionCard、DropdownMenu、SvgActionPath，累计 38 个组件。场景卡主操作是原生按钮，次操作是兄弟节点；工作流连线的 Enter/Space/Delete、disabled 归 SvgActionPath。原来的终端单一标题不再伪装成 tablist/tab。
- 分组/会话/聊天更多菜单改用 DropdownMenu，删除私有定位和外部监听。混合内容 Popover 增加 anchor/side/align/returnFocusTo：工作空间选择与 composer 复用碰撞定位、外部关闭和焦点恢复。删除旧 `features/chat/popupPlacement.ts` 与绑定旧坐标算法的测试；浏览器验证实际上下空间和窄屏边界。composer 分类使用垂直 Segmented。
- 应用 CSS/SFC 样式中的固定 hex/rgb/white/black 已归零；终端和代码表面使用 `--eap-code-*`，图表、警告边框和主色前景均用语义 Token。修复深色选中 Tabs 对比度与活动导航文字布局。设计 HTML/Schema/草案的颜色选项是内容数据，保持原值。
- 边界检查除原生具名控件与第三方入口外，新增交互角色、原生 click 操作、custom 变体、字面量动态控件和宿主固定颜色检查。它是静态防回归门禁，不能代替对所有动态表达式、领域状态和可访问性的人工/运行时检查。

| 最终命令 / 检查 | 结果 |
|---|---|
| `rtk proxy pnpm --dir frontend typecheck` | 通过 |
| `rtk proxy pnpm --dir frontend test run` | 70 文件、241 项通过；包括卡片主/次操作隔离、SVG 键盘/禁用、菜单选择/禁用、扩展边界规则 |
| `rtk proxy pnpm --dir frontend check:boundaries` | 通过，应用原生基础控件、模拟交互角色、custom 变体、宿主固定色零违规 |
| `rtk proxy pnpm --dir frontend exec stylelint "packages/ui/src/**/*.{css,vue}" "packages/style/src/**/*.css"` | 通过；仅声明公共 UI/style 范围 |
| `rtk proxy pnpm --dir frontend build` | 通过；仍有 >500 kB chunk 提醒 |
| `git diff --check` | 通过 |
| `node frontend/node_modules/.cache/eap-ui-browser/consolidation.cjs` | 通过：菜单键盘/禁用/外部关闭/焦点、卡片 Space 激活、composer/SQL 浮层位置、终端文本、5 个深色页面、4 个 390px 页面；零 pageerror |

浏览器沿用用户的 5173/8080 服务，独立上下文；抽检浅色工作台、深色场景/专家/SQL/设置与窄屏菜单截图。没有执行付费模型调用，没有运行后端测试，没有改动已有 backend application.yml，没有重启服务或提交/push。后续前后端业务按规划和真实验收矩阵推进；本次完成范围是上述 UI 收敛，候选组件、Plugin SDK、Electron 与后端功能不能据此标为完成。
<!-- record:end docs/decisions/frontend-ui-consolidation-2026-10-31.md -->

---

<a id="reference-ui-review"></a>

## 截图/录屏与当前前端交互复核

来源：`docs/decisions/reference-ui-review-2026-11-01.md`；合并基线 `82aa504`。

<!-- record:start docs/decisions/reference-ui-review-2026-11-01.md -->
<a id="reference-ui-review--截图录屏与当前前端交互复核"></a>
### 截图/录屏与当前前端交互复核

状态：三项最小修复、父任务全量前端、限定浏览器复验及最终独立复核通过。不作为用户接受或整体规划完成。

<a id="reference-ui-review--基线与材料"></a>
#### 基线与材料

- 实现基线：`5de54ca`；媒体提交：`032af1d0eeebe36a42d38498f7ee9272e1cfadd6`。
- 直接查看 `docs/assets/ui-reference-20261026/frame-{024,040,044,048,064,080,088,112,168,192}.jpg`；对仓库实际MP4按每16秒抽帧概览，补核设置分类侧栏及目录往返。未转写音轨、未逐帧穷举，不能从画面推断后台能力。
- 参考应用业务文案/示例不是EAP数据，AI审核/无人值守等标签不代表EAP应伪装可用。以现行§0B交互合同为准，不追求像素复制。
- 沿用用户5173/IDEA服务，不读写application.yml、不调用模型、不启动执行或改数据库记录。审查期间只有浏览器UI选择与只读目录请求。
- 内置预览已打开并实际点击摘要；drive_preview桥不响应后使用computer_use，独立Browser Use仅补DOM和视口量测，两种证据不混同。

<a id="reference-ui-review--确证差异与处理"></a>
#### 确证差异与处理

| ID | 参考/合同 | 实际复现与根因 | 当前处理 |
|---|---|---|---|
| REF-01 | frame-024/064/192：引用由＋菜单进入，输入区以文本及简短引用为主 | 新增知识选择器在无选中时也常驻；Skill整段边界和知识限制叠到输入上方。1024×640摘要开启、已有引用时输入卡底部679px、发送底部666px，超出视口 | 已修：知识入口回到＋专家，引用用公共Tag保留精确身份，完整说明保留选择弹窗；权限/错误反馈未删除。选择器独立于Popover挂载，context切换关闭并失效旧请求 |
| REF-02 | frame-064/192：摘要收缩会话宽度，内容不得穿入旁栏 | Work欢迎页打开摘要，1024×640时chat-feed的clientWidth=392、scrollWidth=597；场景卡文本穿出列。根因宿主`.work-page .eap-button`强制nowrap覆盖共享card语义，内部1fr最小内容宽度和固定两列放大问题 | 已限制nowrap不覆盖card，欢迎网格按实际容器宽度适配，文本/专家chip可折行；真实浏览器RED→GREEN、全量与独立复核通过 |
| REF-03 | §0B.3返回合同：专家/设置操作后能回来源工作面，不新建/发送 | Work→专家目录后缺少显式返回入口；设置只有分类列表，容易误用“新对话”代替返回。场景已有明确返回，不应再重复添加 | 已修：专家/设置侧栏唯一返回按钮，复用已有origin白名单和navigate；保留会话/草稿/分组/模式和设置最后子页，场景不新增重复入口；不声称跨刷新来源恢复 |

<a id="reference-ui-review--保留的正确边界"></a>
#### 保留的正确边界

- 活动栏五入口和设置贴底保留；场景/专家保留项目会话侧栏，设置切换分类侧栏。
- 摘要为右侧栏；源文件为浮层树、终端为底栏的合同不合并。未接通终端/规划/Agent/风险审核保持诚实禁用或空态。
- 场景列表→配置详情→任务工作面与Builder设计/版本分面已存在，不再将编辑器、版本、执行和验收全部铺进场景配置。
- 看板五列和按Run审阅保留；参考中AI自动工作开关不构成开启无人值守的授权。

<a id="reference-ui-review--当前实测记录"></a>
#### 当前实测记录

REF-02紧反馈断言：打开`#work`摘要，在1024×640断言`.chat-feed.scrollWidth <= clientWidth + 1`。修复前597/392，断言失败；修复并显式刷新载入新CSS后，在1440×900、1280×800、1024×640、708×640分别为774/774、614/614、392/392、626/626，断言通过。这是CSS视口，不冒充操作系统真实125%缩放。首次HMR未加载新样式时仍失败，刷新确认样式到达后再判GREEN，未通过隐藏横向滚动掩盖。

定向命令：`rtk proxy pnpm --dir frontend test run apps/web/src/features/shell/WorkspaceWelcome.test.ts`：1文件/4项通过。它不测试真实CSS尺寸，尺寸由上述实际浏览器断言证明。`git diff --check`（两处父任务样式文件）通过。

本机证据：内置预览初始图`E:/ai/Hermes/profiles/eap/cache/images/computer_use_fe26e1f123fb4f539b794c22e2c4a861.png`、摘要打开图`E:/ai/Hermes/profiles/eap/cache/images/computer_use_5ce4d643e818449eb7d97d18a1b71aaf.png`；录屏抽帧概览`E:/ai/Hermes/profiles/eap/cache/scratch/eap-reference-contact.jpg`。截图仅本机，不新增用户业务媒体到仓库。

<a id="reference-ui-review--剩余范围"></a>
#### 剩余范围

**Comments 1–10本轮交付状态**：下文逐项“未提交”是修复当时的历史快照；现已连同统一图标进入前端交付范围。父任务与最终独立复核均重跑97文件/574项、类型/边界/构建通过。独立审查未重跑浏览器，页面证据仍限下列实际记录；真实终端/规划执行及用户全量接受未完成。

<a id="reference-ui-review--内置浏览器-comments-710三组输入控件"></a>
##### 内置浏览器 Comments 7–10：三组输入控件

按用户三组处理，但代码实际均落TaskComposer，故顺序实施避免同文件竞争：①模式/审批增加选择指示、菜单标题/当前项标记、换行和不可用原因；真实仅Chat可用，未解禁规划/Agent，实际review↔read_only已点验。②上下文改公共Button内的圆形信息图标，标题/无障碍与菜单保留文件限额；没有token统计，不画虚假百分比/进度。③模型空态只显示配置引导，不显示无模型的默认强度/刷新；有选择时才按支持档位显示强度，已有模型切换确认不变。

每组新增测试均实际RED→GREEN。全量94文件/561项、类型/边界/构建通过；1052×700及708×640四类弹层共8次边界断言通过，无横溢/越界。真实浏览器只读↔询问切换后恢复原策略，模型空态引导及上下文菜单可用；未配置/调用模型、未发送。此前仅传reasoningEfforts而未传modelLabel的单测夹具已补完整所选模型，仍覆盖只列high并提交high。三组均只调整现有UI，不把规划/Agent或token计量写为已实现。修改未提交。

<a id="reference-ui-review--内置浏览器-comment-6终端未连接"></a>
##### 内置浏览器 Comment 6：终端未连接

确认当前Chat终端没有PTY/真实终端连接；本次不扩建执行能力，仅移除模拟标签页＋、UTF-8和不可用停止按钮，改为“终端尚未开放”空态，提示用户从任务看板的执行与审阅查看已有结果。保留底部停靠和关闭，不把看板Run等同交互式shell，不展示伪日志。

新增空态/无假控件/关闭测试先RED后GREEN；全量94文件/558项及类型/边界/构建通过，真实浏览器打开/文案/关闭断言通过，未执行命令。本项是可用性表达修正，不是终端接通；真实终端开发仍待独立范围与权限合同。修改未提交。

<a id="reference-ui-review--内置浏览器-comment-5侧栏顺序"></a>
##### 内置浏览器 Comment 5：侧栏顺序

仅重组现有侧栏：新对话→独立搜索→项目分组（标题旁新建）→自由对话（标题旁新建）→底部辅助入口（归档/工作记录/分析）。移除常驻操作长说明，保留在标题提示；不删功能、不改创建/筛选/会话归属或导航行为，不触及设置分类页逻辑。底部区留在正常滚动流，短窗口不绝对定位覆盖内容。

新增结构回归先RED再GREEN；全量94文件/557项及类型/边界/构建通过。真实浏览器验证190px侧栏排列、新分组打开后取消、归档切换恢复；708px冷加载抽屉279px宽无横溢并可开合。动态模拟视口切换一次出现抽屉未显示，重新冷加载后通过，未据此宣称动态缩放全量验收。未创建分组或发送消息。Comments 1–5继续保留为未提交修改，供用户逐处复核。

<a id="reference-ui-review--内置浏览器-comments-24摘要文案与项目树"></a>
##### 内置浏览器 Comments 2–4：摘要文案与项目树

仅修改标注范围：摘要“本机项目分组…UI偏好/写权限”改为“项目分组：名称”（无分组为“未选择项目分组”）；“只反映当前会话，不是设置页证据”改为“当前会话”，英文同步。实际服务路径与授权卡仍分开显示，权限逻辑不变。项目树删除重复任务标题/草稿副标题，仅有会话时显示会话小标题；去整块展开底色、细化缩进线与留白，保留计数、空态、展开/收起、菜单及原导航行为。无全局样式修改。

两项定向断言先RED后GREEN；父任务全量94文件/556项、类型/边界/构建通过。真实页面核对摘要两处文案及实际服务路径，项目树折叠/重开断言通过；165px宽项目节点高度约127px，原标注约198px。项目树截图已取得，后续摘要截图工具超时，未将该截图计为成功。没有创建/删除分组或发送消息；与Comment 1一起仍为本地未提交修改。

<a id="reference-ui-review--内置浏览器-comment-1输入操作条201ac69之后"></a>
##### 内置浏览器 Comment 1：输入操作条（201ac69之后）

用户标注356px宽的task-context：模型控件、未配置提示与发送混在同一flex流，发送落到提示一侧且未靠右。本次仅把模型与发送放入同一靠右控件组，将原有未配置提示/设置链接移到独立status槽；无模型时仍禁用，不改发送/审批/选择逻辑，不改其他页面或全局样式。无提示时不渲染status槽。

新增布局回归先1失败/19通过，再GREEN；父任务全量94文件/556项及typecheck/boundaries/build通过。真实浏览器在1440×900、1052×700（操作条356px）、1024×640、708×640验证模型与发送垂直中心相同、发送贴右、提示位于控件下方、无横溢且按钮在视口内；模型弹层仍可打开并Esc关闭。没有发送消息或更改模型配置。本次只是标注区域调整，不扩大为整页重设计。

三项确定问题已关闭，主方案§0B.9、完整台账和前端验收清单已同步。本轮不宣称完整录屏一致、模型效果或用户最终接受；真实系统缩放、全页面错误/焦点矩阵仍待继续复核。

<a id="reference-ui-review--修复后父任务验证"></a>
#### 修复后父任务验证

- `rtk proxy pnpm --dir frontend test run`：94文件/555项通过；`typecheck`、`check:boundaries`、`build`通过。Node localStorage实验警告与大chunk告警保留。本次无后端变更，未重跑后端，不借用以前647项作为本次结果。
- REF-01真实服务浏览器：1440×900、1280×800、1024×640、708×640摘要打开且带Skill/协作专家引用，发送按钮底部分别859/759/599/607px，均在视口内；无欢迎区横溢。1024输入卡由底部679px修复为612px。不是只判断整页scrollWidth。
- 实际内置预览已打开修复后Work页面，点击＋→专家→知识入口，显示同一选择弹窗/原有完整说明；选中知识时呈简短身份Tag，无自动发送。快照：`computer_use_d190680c990d409591fa075de9d8ff4d.png`、`computer_use_1070a6f693104064879d80f4c0e703d2.png`、`computer_use_5462798573e64679bbe6b5a6b3b35e5c.png`，位于本机images缓存。后续预览进入标注模式，停止桌面点击，未将标注点击冒充页面交互结果。
- REF-03独立Browser Use真实5173：填写明确“不发送”草稿，Work→专家→返回、Work→模型设置→技能→返回，均恢复`#work`、同一草稿与Skill/专家引用；随后恢复原草稿。不创建/发送服务端会话。导航单测11项使用App+DesktopNavigation实际装配，Chat/领域页替身不冒充完整端到端。
- UI落点：已搜索共享Button/Tag/Popover/Dialog，领域编排保留L4，欢迎布局保留应用组合；宿主CSS不再覆盖card换行语义。无新基础组件、包或依赖；不改共享能力/安全策略。

最终独立只读复核通过，未发现限定改动范围的确证回归：Composer/Knowledge 3文件37项、SkillSelector 4项、导航/Welcome 3文件28项，边界与diff检查通过。独立审查未重跑浏览器，实际页面证据采用上述父任务记录，不合并成用户最终验收。
<!-- record:end docs/decisions/reference-ui-review-2026-11-01.md -->

---

<a id="frontend-icons"></a>

## 统一图标模块：@eap/icons

来源：`docs/decisions/frontend-icons-2026-11-01.md`；合并基线 `82aa504`。

<!-- record:start docs/decisions/frontend-icons-2026-11-01.md -->
<a id="frontend-icons--统一图标模块eapicons"></a>
### 统一图标模块：@eap/icons

状态：首片实现、父任务全量、真实浏览器主题检查及最终独立复核通过，纳入本轮前端交付；不宣称全仓图标替换完成。Comments 1–10一并纳入同一前端提交，不读取/提交application.yml。两个子任务服务中断后由父任务重新检查实际文件并接手完成，不以子任务失败/部分输出作为验收。

<a id="frontend-icons--依据与取舍"></a>
#### 依据与取舍

用户要求参考[Vben packages/icons](https://github.com/vbenjs/vue-vben-admin/tree/main/packages/icons)。实际读取其package.json/src/index.ts及core icons入口、lucide.ts/create-icon.ts：Vben通过独立公共包再导出core，core使用`@lucide/vue`和`@iconify/vue`，createIconifyIcon将名称交给Iconify。这里借鉴统一入口/静态命名导出，不复制Vben实现，不安装其workspace依赖或整个组件栈。

本次npm查询`@lucide/vue`版本1.66.0、ISC许可；选择固定版本的本地SVG模块。暂不引入Iconify运行时按名获取资源、图标字体、远程SVG、任意HTML或全图标动态注册表。依赖锁定与许可证以包实际安装产物为准。

<a id="frontend-icons--分层合同"></a>
#### 分层合同

- 新增`frontend/packages/icons`，纯视觉叶子包；Vue与Lucide为内部依赖，无UI/runtime-client/路由/存储依赖。UI组件及多个feature可共同消费，符合明确跨仓库复用需求。
- 用户补充后，应用统一从`@eap/ui`使用`Icon`/类型化`IconName`，如`<Icon name="plus" />`；可选静态命名组件也从UI导入。资源包仅UI内部使用，应用manifest不增加图标包依赖。静态命名导出可摇树，统一Icon会包含有界本地目录，不承诺按name逐项摇树。
- `currentColor`继承按钮/文字颜色和主题，统一尺寸/线宽；公共CSS变量支持应用局部覆盖，不额外维护浅深色图标资产。
- 默认装饰图标从无障碍树隐藏且不可聚焦；单独语义图标需明确label，图标按钮的名称由Button提供。保持键盘/焦点/点击原语归`@eap/ui`，不让图标变成交互控件。
- 图标来源只能由`@eap/icons`接入；边界检查阻止应用直接引资源包/第三方图标库，允许`@eap/ui`依赖这个叶子包。

<a id="frontend-icons--首片迁移范围"></a>
#### 首片迁移范围

导航五入口、新建/更多/展开/返回；聊天添加/附件/原型/警告/模式审批下拉与选中/模型/上下文/发送；欢迎页、专家/场景、看板、模型设置的常用装饰图标；共享UI的Tag关闭、Tree展开等实际存在的字符控件。

管理页面其他字符、历史演示、数据库/流程领域图形逐项审计后迁移，不做全仓字符串替换。数学符号、Diff增删符号、正常标点与设计器生成数据不应误转图标。WorkflowCanvas连线是领域SVG，不应替换成静态图标。

<a id="frontend-icons--验证关口"></a>
#### 验证关口

包行为/可访问性/尺寸线宽/属性传递；公共依赖与TS引用；UI关闭/树键盘与应用导航/弹层回归；生产构建摇树与无图标网络请求；真实浏览器浅/深主题、颜色继承与窄栏排版。实际通过范围见下节，不等同用户最终接受。

<a id="frontend-icons--实际结果"></a>
#### 实际结果

- 新增统一UI入口及默认尺寸测试实际RED（Icon缺失、默认24px而非1em）后修复；补齐23个静态资源导出。未知运行时name不渲染、不发请求。
- 父任务`rtk proxy pnpm --dir frontend install`通过；全量测试97文件/574项、typecheck、check:boundaries、build通过。UI的Tag/Tree保留原点击/关闭/键盘/受控展开测试；Dialog/Drawer/ConfirmBox原为文字操作，不冒充字符迁移。
- 本机真实浏览器`#work`加载34个共享SVG，五入口全部使用共享图标；切浅/深主题后选中图标stroke分别随父按钮变为`rgb(52,127,112)`与`rgb(105,197,172)`，均22×22、aria-hidden=true。主题已恢复，未写偏好存储；资源列表无Iconify/CDN图标请求。
- 生产构建主包1099.19kB、GrapesJS1070.45kB仍有大包警告，不调高阈值掩盖；不把统一图标称为包体积优化验收。该有限目录由Icon引用，不含整个图标全集。
- 当前迁移页面及共享Tag/Tree有真实实现；其他管理页、历史演示及部分正文箭头未迁，不宣称全仓清零。应用无直接`@eap/icons`导入，由边界检查持续保护。图标切片未改后端、未调用模型。
- 最终独立只读审查覆盖31个已跟踪前端文件和9个未跟踪文件：574项、类型/边界/构建重跑通过，无确证安全或逻辑问题；额外五个内存依赖边界探针通过。建议后续持久化这些探针；本轮补文档明确attrs只供可信宿主，不允许整体绑定不可信对象。审查未重跑浏览器，不冒充额外视觉验收。
<!-- record:end docs/decisions/frontend-icons-2026-11-01.md -->
