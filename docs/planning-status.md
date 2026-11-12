# 规划状态与验收台账

> 更新日期：2026-11-12。当前本地 HEAD 为 `797c7cd`（源码写入 UNKNOWN 核对）；后续规划、工程 Agent、资源和交接改动仍在工作区。提交身份依据本地 Git，本轮文档整理未查询远端或提交/推送。

本表是工作项当前状态的唯一台账；[主方案](EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md)维护产品合同与验收要求，[路线图](roadmap.md)维护推进顺序，[阶段验证记录](records/validation-history.md)保存详细命令、失败与证据。实现、确定性模型、真实供应商、技术 ACCEPT 和用户接受分别记录。

<a id="validation-baseline"></a>

## 当前基线与完成口径

| 范围 | 截至本次整理的结论 | 证据与保留边界 |
|---|---|---|
| 工程交付 | 真实供应商双路由六文件候选→明确应用→独立验证→技术决定已验；绑定任务的有界源码 Agent 另有真实供应商验证 | [跨路由](records/validation-history.md#real-route-model-validation)、[Agent](records/validation-history.md#engineering-agent-validation)；Agent 后续预算/UI及交接修改使用 Fake 定向复验，没有重复供应商调用 |
| 规划与任务交接 | planned→只读规划→人工回写→ready→实现材料→候选应用，以及应用后精确打开原任务/刷新恢复已验 | [规划链](records/validation-history.md#board-task-planning-validation)、[交接](records/validation-history.md#application-task-continuation-validation)；交接不自动启动 Run 或验证 |
| 资源与上下文 | Skill 文本目录/场景精确引用、知识原位更新/摘录、历史字符预算/显式清空/摘要采用、任务记忆编辑及 Work Markdown 已有阶段证据 | Fake 模型与实库/浏览器证据按项分列；远端 Skill、多技能并用、自动压缩、精确 token 和办公工具执行仍待 |
| 已开发内容复核 | 修正工具失败终态、迁移弃用API、收敛聊天附件入口、保护原型任务草稿及明确失败后的修正；按用户反馈补查聊天工具栏，合并工作区/源文件重复文件树 | 见[首轮证据](records/validation-history.md#developed-content-review-validation)及[工具栏补查](records/validation-history.md#chat-toolbar-review-correction)；首轮遗漏已明确，侧边栏浏览器与定向回归分列，非全量产品接受 |
| 本轮文档核对 | 已核对相关源码、8份留存 Surefire 报告（各1项，0失败/错误/跳过）及关键证据文件存在 | 属于留存结果复核，非本轮重跑；报告可被后续运行覆盖，不拼成当前全量结果 |
| 最终接受 | 尚未完成 | 用户产品接受、更多真实页面效果、全页面系统缩放和发行分别验收；不计算整体完成百分比 |

## 工作项当前状态

各工作项引用的较早测试数字仅为该切片历史证据，不代表当前全量结果。下一关口只列剩余范围，用户接受、真实效果与平台验收独立记录。

| 工作项 | 当前状态与证据 | 下一验收关口 |
|---|---|---|
| UI-01/02 桌面外壳与工作面 | 已有五入口、分组/会话、文件树和分面；媒体对照追加欢迎卡容器适配、专家/设置显式返回，四视口及Work草稿返回实测通过，最终审查见[记录](records/frontend-history.md#reference-ui-review) | 全页面×尺寸/焦点/错误状态复核；真实系统缩放与用户接受 |
| UI-03 本地服务身份 | 本机绑定和只读能力已有验证 | Electron目录选择与打包环境复核；不把分组标签当权限 |
| 统一图标 | `@eap/ui` Icon/name入口与内部本地Lucide资源包已实现，首批工作台/Tag/Tree迁移；全量574项、类型/边界/构建、真实浅深主题及最终独立审查通过，见[记录](records/frontend-history.md#frontend-icons) | 其余管理页面/历史演示字符按语义迁移，不将领域SVG/正文标点机械替换；不是全仓清零 |
| UI-04 Code/Work | 共用会话和模型路径；Work回答可编辑为Markdown文档、显式保存本机草稿、重开及下载，390px实际整链通过。 | 首片为本机文档处理，非Word/PDF或外部办公系统工具执行；模型办公内容质量与用户接受独立。 |
| SC-01/02 场景 | 配置、设计、版本、准备已分面；CAS 保存/删除；save 失败后远端核对；**该切片**：mock「模拟保存断连」落盘+502→`unknown`（`:5174` 已验） | 用户产品接受仍待；真实交付及依赖授权闭环；不把可变配置revision当不可变设计版本 |
| CP-01/02/03 输入与策略 | 目标/模式/审批分别建模，只读规划及绑定任务的有界源码Agent已接入；按需工具读取→持久候选→明确人工应用，真实供应商与最终窄屏审批分别通过，见[当前验证](#engineering-agent-validation)；未接通路径仍禁用 | 后台与跨重启推理恢复、其他工具范围及用户接受独立；不以局部布局通过代替全体验接受 |
| MD-01 模型连接 | 凭据/目录/白名单/强度已有；追加普通API显式wireApi及Responses文本/代码提案，协议变更revision/重绑定、Git拒绝和前端/mock合同已实现并通过离线回归，见[决定](decisions/model-catalog-and-chat-selection.md#普通api连接的协议选择2026-11-05实现与离线回归通过实网待验) | 原连接Responses真实文本与SQL Agent两轮工具、审批写入已验；其他网关/模型/推理档位、Responses Chat Git/账户计划工具及用户最终接受仍待 |
| EX-01 专家 | 父子导航、独立三栏编辑、任务摘要/按需详情、终态停止轮询与静默更新已交付，见[工作区合同](decisions/expert-workspace-navigation.md)；专业行为版本持久绑定、SQL Agent工具循环/检查点恢复/后台调度/单SQL文件审批已接通。真实Responses两轮整链及复杂SQL三类限定样例有独立证据；单专家授权知识→Chat、撤权/旧记忆隔离已有实库回归 | 新工作台原生125%/150%与用户接受；其他行为编辑器/资源整合、完整SQL作用域/生产效果；Chat引用不执行DAG或自动获得工具权限 |
| PB-01 原型编辑 | Grapes工程与语义Schema含表单/选择/勾选/弹窗、三类声明式动作；字段校验、重置、开关、保存重开和不可变发布，版本详情直接创建关联任务，见[当前实现及验收](#interactive-design-validation) | 更丰富组件、设计到实际源码效果、原生缩放及用户接受独立 |
| PB-02 生成基线 | 统一入口＋最多7个关联文件、原型及Task/revision快照；显式入口依赖读取和手工选集共用授权/预算/图语法，真实 HTTP 及390px浏览器通过，见[依赖准备验证](#dependency-preparation-validation)。明确字符串懒加载、本地 CSS/JSON 的候选图及交付沿用[跨路由验收](#route-resource-delivery-validation) | 任意TS语法、计算式路由、其他资源、快照保留期及用户产品接受仍后续 |
| PB-03 受控应用 | 统一1～8文件持久候选/应用/全读回、互锁及POST_HOC/PREBOUND归因；[跨路由候选](#route-resource-delivery-validation)含按需页面、CSS 和 JSON；V36 [源码核对](#source-write-review-validation)保存原候选证据并释放互锁，可从当前基线新建候选 | 用户接受、计算式路由及其他资源、应用库V36迁移独立；不宣称跨文件OS事务/CAS |
| PB-04/RK-5 独立验证 | Run独立typecheck/test/build及hash读回已实现；当前真实双路由六文件交付沿用[供应商整链](#real-route-model-validation)，早期04edef5数字见历史 | 当前frontend范围；检查成功不自动完成任务或形成用户接受 |
| 源码交付证据与人工决定 | **EXTERNAL_MANUAL 切片实现及联调通过**，见 [阶段记录](records/delivery-history.md#board-source-delivery) | 实际样例完成采集/同源验证/接受/过期拒绝/拒绝回待处理/刷新；不是平台自动开发或用户最终接受 |
| Chat应用→交付关联 | POST_HOC（544b8f9）与PREBOUND（69892f3）原阶段保留；当前统一1～8文件应用集合，逐项核对原快照/写入/验证/交付；真实双路由六文件整链已验，见[供应商证据](#real-route-model-validation) | POST_HOC不证明生成时任务归因；用户产品接受和更广页面范围仍待，不把原切片本身当供应商效果 |
| 生成前任务绑定 | PREBOUND任务/原型快照、应用领取互锁与归因已交付；入口＋0～7关联文件在生成前固定，明确字符串懒加载及本地 CSS/JSON 纳入[真实供应商验证](#real-route-model-validation)；[原阶段数字](records/delivery-history.md#code-task-prebinding)保留 | 用户接受、其他模型/路由框架与更广页面效果及整体PB/RK独立 |
| RK-1～4/6 看板准备与只读Run | 已实现持久任务、revision/幂等、只读Run、原型快照和审阅；原任务规划→人工回写→ready→源码准备→候选确认应用已验，见[规划链](#board-task-planning-validation)；应用后可明确进入原任务执行页、精确读取及刷新恢复，见[交接验证](#application-task-continuation-validation) | 自主实现Run、后台Agent及跨重启接管独立；交接不启动Run、验证或接受，不自动放开任意拖done |
| CT-01 生命周期 | SSE/cancel/快照/同ID重连保留；2026-11-08应用线程执行、断线继续、Spring AI/Responses流、完整行脱敏、事件预算/终态/并发修复，见评审记录 | 真实供应商及用户接受待验；日志仍进程内，持久回放/跨重启接管未实现 |
| RV-01 证据工作面 | 摘要/源文件/Diff/终端按会话，Run按次选择；源码交付与测试接受/拒绝决定已有刷新回放 | EAP自身改页完整证据、SQL实际任务证据及用户接受；不重复开发已有决定回放 |
| Skill | 文本上传/粘贴及本地文本目录、嵌套路径、来源确认、不可变版本、CAS启停、Chat精确引用已接入，见[目录验证](#skill-directory-validation)；自定义场景持久ID声明、真实目录状态、会话精确选版/资源到模型材料的整链已补齐，见[场景引用](#scenario-skill-validation)；旧数字保留于[历史记录](records/resource-history.md#skill-text-import) | 多技能同时引用、远端仓库及超出文本子集的资源仍待；不执行脚本或授予工具权限，不支持通用Mock YAML解析；真实供应商效果与用户接受独立 |
| MCP-01 / P0 | 保留四传输/矩阵/续传；2026-11-08增加固定read_graph Handler、持久专家grant、精确服务器匹配、环境白名单、有界IO/进程树清理；真实子进程协议夹具覆盖 | 官方memory包通过Expert入口的本机实网验收、常驻GET listen待验；运行时npx离线且拒绝自动安装 |
| Knowledge/SQL/CLI | 保留既有确定性实现与管理；本轮真实本地知识导入/搜索/授权预览/无授权403/删除一致性通过，检索无模型；正文原位更新、哈希并发校验和命中词摘录已验，见[更新证据](#knowledge-document-update-validation)；复杂SQL修复parse.partial与NOT IN NULL规则，四组合成结果验证通过，见[知识与本地执行边界](decisions/knowledge-local-execution.md) | 不可变文档历史、检索质量评测、完整SQL作用域/生产数据与性能验证、CLI生命周期回归；不扩第二套执行器 |
| PL-01 / P0 看板插件首片 | **限定生命周期实现通过**：board启停/回滚/sticky；项目聚合Task/Run与验证/写入在途/未知只读观测、失败旧快照、在途停用确认及重新启用；实际Git后台完成和原Task/Run恢复已验 | 验证/写入/UNKNOWN投影由持久夹具证明；全服务健康与用户接受独立；PL-02/SC-03见本批记录；外部安装独立 |
| PL-02 / P1 设计器插件 | **限定实现及整链通过**：可信贡献依赖/启停/激活隔离、A/B实例恢复草稿和本地版本隔离、发布中拒绝停用、停用/刷新/重建恢复、原服务器版本保持；不读旧全局数据或合成占位保存 | 本地恢复与服务器版本分离；发布响应丢失已完成当前请求身份/核对切片；用户接受、外部安装/任意JS隔离独立 |
| SC-03 / P1 场景组合 | **依赖切片实现及整链通过**：核心固定workflow可信依赖观测；必需设计器/版本服务/已发布版本，可选看板；实际Host及失败旧快照阻断、实库修复重查、副本workflow配置保存/读回 | 应用不安装/授权/发送/执行；本轮另完成限定三文件PREBOUND→真实候选→应用→验证→技术决定；完整设计交互接受、用户产品接受及SC-01保存UNKNOWN删除关口独立 |
| CE-01 / P0 上下文工程 | **部分交付**：实际窗口字符预算、显式清空、目标/约束采用及历史摘要预览已实现；使用绑定completion，不修改原窗口，无工具调用，390px完整应用通过。 | 自动摘要替换/分段压缩及供应商token未实现；敏感派生摘要阻断，外部模型摘要质量待验，详见本轮摘要证据。 |
| KR-01 / P0 检索基线 | **部分交付**：fixture + `KEYWORD_PROBE`/`POSTGRES_FTS`；延迟观测；实库对照；排序质量样本；`productionSampleCases`；**该切片**：对照测口令回退 `EAP_DB_PASSWORD`/`SPRING_DATASOURCE_PASSWORD`（不写入仓库） | 2026-11-11 RetrievalBaselineDbContrastTest实库2项通过、0跳过；自有UUID数据清理断言通过。真实业务语料质量仍待；不触发KR-02。 |
| MEM-01 / P1 记忆首片 | **部分交付**：目标与约束完整编辑、版本冲突保护、未保存确认、显式追加草稿；事实/证据只读，持久及sticky失效保护沿用。390px完整应用实链通过。 | 自动摘要/长期抽取未实现；sticky清空仍保留，用户产品接受独立。见本轮任务记忆编辑证据。 |
| FS-01 / P0 目录与临时资源 | **部分交付**：data-layout + migrationReadiness + kind/byteSize + inventory + candidateCounts；**该切片**：`inventory.byKind`（`:5174`/`:5173` 已验）；`physicalMigration=false` | 旧数据物理迁移/读回/失败恢复、限额/回收与 UNKNOWN 保留仍待批准后实施 |
| TM-01 / P1 受管工具 | CLI程序/固定操作可登记和配置路径；依赖PATH/指定文件，无安装版本管理 | 依赖FS-01，选择一个可信便携工具或venv；锁版本/校验/安装回滚、实际调用/在途保护；保留系统引用，不静默或全局安装 |
| TD-01 / P0 自动发现与绑定 | **部分交付**：既有程序/操作模型上统一Git目录与共享路径/版本；status/diff保留能力ID与独立开关，旧探测入口兼容；历史路径冲突拒绝执行，见[Git程序与持久调用](decisions/agent-runtime-evolution.md#git-operation-executions) | 更多依赖绑定与用户接受；发现仍不等于授权，不整盘扫描 |
| TC-01 / P0 工具调用与呈现 | status/diff持久启动/查询/取消、按操作UNKNOWN互锁、人工核对审计、刷新/重启读回及授权失效恢复已验；V26～V29应用迁移已核。真实取消/超时/响应中断、Windows权限/共享IO、数据库提交前后及绑定恢复证据见[阶段记录](#tool-execution-validation)；唯一合同见[Git调用](decisions/agent-runtime-evolution.md#git-operation-executions) | 其他工具/权限/物理IO/平台异常、跨重启进程接管及用户接受独立；有界身份线索不证明完整进程树退出 |
| TC-02 / P1 前端实例能力 | **部分交付**：GrapesJS 当前实例草稿/选中状态人工读取；实例/文档/revision与24,000字符上限、过期/离页清空；真机浏览器已验，多实例/冲突/关闭/超限离线回归 | 用户产品接受；远程断线/反向Agent调用另评审，不依赖隐藏组件后台存活，不把本地草稿当Java保存版本 |
| KR-02 / FW-01 条件后续 | 当前保留Spring AI，未采用向量增强或LangChain4j迁移 | KR-01证明检索不足再评估增强；明确协作需求/可复现框架阻碍后独立批准同条件对照，记录兼容/正确性/成本/取消与迁移回归；不长期双循环 |
| 桌面与安装器 | Electron45 preload壳、bootstrap检测脚手架 | Windows sidecar、一体启动/停止、迁移失败/恢复、包验证；签名需要用户凭据及发行决定 |
| Mock契约与总体质量 | 网络保护持续启用；前轮34项回归已修；本轮SSE CRLF/分块/多行data、畸形拒绝、每帧1Mi UTF-16上限与final及时释放；各次全量与定向结果见[阶段记录](records/validation-history.md)，按日期和范围区分 | 其他供应商场景、后台恢复/全页面视口与用户接受不随之关闭；单帧限额不是总内存/总流上限 |
| 最终验收 | **未完成** | EAP自身实际改页、完整证据链、用户交互接受；已验证/跳过/外部阻塞分别列明 |
| 后端runtime拆分 | 已由applications/full接替；唯一Boot主类与配置/迁移资源保留；旧五模块记录为历史 | 当前IDEA原配置/full宿主启动已验证；跨环境部署与实库业务接受独立，不由离线Bean图替代 |
| BM-01～07 后端模块组合 | 十四轮边界调整及SQL证据修复已交付：唯一full宿主、core/local/Chat最小组合、显式完整装配、领域/存储/分析/授权端口、CLI通道下沉、codegen/context去workflow依赖、固定流程及版本化专业行为、SQL Agent持久恢复/后台调度/单文件审批；IDEA原配置启动已验。详见[实施与复用入口](decisions/backend-module-composition.md#implementation)及上方验证表 | 产品目录/CLI程序登记审批、Chat产品用例/工具贡献继续解耦；workflow仍依赖SQL/MCP，旧DAG长事务、领域schema及跨环境组合未收口；通用写工具、UNKNOWN人工处置、生产SQL效果及用户接受独立 |


## 后续顺序

统一见[路线图的推进顺序](roadmap.md#推进顺序与门禁)，本台账保留每个工作项的具体剩余关口，不再复制第二份路线或提交清单。

## 阶段证据索引

详细日志已合并至[阶段验证记录](records/validation-history.md)。以下保留原显式锚点；历史权限阻断、旧待办及早期单文件边界按当时事实阅读，不覆盖上表现状。

<a id="application-task-continuation-validation"></a>

- [源码应用到原任务验证工作面（2026-11-12）](records/validation-history.md#application-task-continuation-validation)

<a id="engineering-agent-validation"></a>

- [绑定任务的按需源码工程 Agent（2026-11-12）](records/validation-history.md#engineering-agent-validation)

<a id="board-task-planning-validation"></a>

- [待规划原任务到实现候选应用（2026-11-12）](records/validation-history.md#board-task-planning-validation)

<a id="scenario-skill-validation"></a>

- [场景声明到精确Skill会话引用（2026-11-12）](records/validation-history.md#scenario-skill-validation)

<a id="skill-directory-validation"></a>

- [Skill 本地文本目录到版本及模型材料（2026-11-12）](records/validation-history.md#skill-directory-validation)

<a id="knowledge-document-update-validation"></a>

- [知识正文原位更新（2026-11-12）](records/validation-history.md#knowledge-document-update-validation)

<a id="planning-task-handoff-validation"></a>

- [规划回答→任务准备→实现草稿（2026-11-11）](records/validation-history.md#planning-task-handoff-validation)

<a id="planning-mode-validation"></a>

- [只读规划模式（2026-11-11）](records/validation-history.md#planning-mode-validation)

<a id="dependency-preparation-validation"></a>

- [实现准备的入口依赖读取（2026-11-11）](records/validation-history.md#dependency-preparation-validation)

<a id="integration-build-source-check"></a>

- [当前完整应用包产出（2026-11-11）](records/validation-history.md#integration-build-source-check)

<a id="work-document-validation"></a>

- [Work回答到文档（2026-11-11）](records/validation-history.md#work-document-validation)

<a id="real-route-model-validation"></a>

- [当前真实跨路由交付验证（2026-11-12）](records/validation-history.md#real-route-model-validation)

<a id="chat-export-validation"></a>

- [本地会话Markdown导出（2026-11-11）](records/validation-history.md#chat-export-validation)

<a id="delivery-prototype-comparison-validation"></a>

- [交付内绑定设计对照（2026-11-11）](records/validation-history.md#delivery-prototype-comparison-validation)

<a id="delivery-preview-address-validation"></a>

- [明确登记交付预览地址（2026-11-11）](records/validation-history.md#delivery-preview-address-validation)

<a id="history-summary-validation"></a>

- [明确生成历史摘要与采用（2026-11-11）](records/validation-history.md#history-summary-validation)

<a id="task-memory-editor-validation"></a>

- [任务记忆编辑与明确采用（2026-11-11）](records/validation-history.md#task-memory-editor-validation)

<a id="model-history-validation"></a>

- [模型历史预算与显式清空（2026-11-11）](records/validation-history.md#model-history-validation)

<a id="delivery-workflow-navigation"></a>

- [连续交付导航实链（2026-11-11）](records/validation-history.md#delivery-workflow-navigation)

<a id="interactive-design-validation"></a>

- [初版交互设计与版本任务入口（2026-11-11）](records/validation-history.md#interactive-design-validation)

<a id="route-resource-delivery-validation"></a>

- [跨路由与本地文本资源交付（2026-11-11）](records/validation-history.md#route-resource-delivery-validation)

<a id="source-write-review-validation"></a>

- [源码写入 UNKNOWN 人工核对和恢复（2026-11-11）](records/validation-history.md#source-write-review-validation)

<a id="product-workspaces"></a>

- [全站工作面、独立 Mock 与通用传输（2026-11-11，用户目标4～8，已纳入本批提交）](records/validation-history.md#product-workspaces)

<a id="conversation-optimization"></a>

- [会话结构与产品展示优化（2026-11-10，已纳入本批提交）](records/validation-history.md#conversation-optimization)

<a id="state-i18n-audit"></a>

- [分域状态与后端中英文错误合同（2026-11-10，已批准集中实施，已纳入本批提交）](records/validation-history.md#state-i18n-audit)

<a id="component-page-delivery-validation"></a>

- [有界组件图与完整证据页面（2026-11-10，接续2450bf2，已纳入本批提交）](records/validation-history.md#component-page-delivery-validation)

<a id="board-code-recovery-validation"></a>

- [任务持久源码候选与正式重启恢复（2026-11-10，已随2450bf2提交；以下为原阶段证据）](records/validation-history.md#board-code-recovery-validation)

<a id="prebound-page-delivery-validation"></a>

- [PREBOUND真实单文件页面交付（2026-11-10，已随b9a9b12提交；以下为原阶段证据）](records/validation-history.md#prebound-page-delivery-validation)

<a id="publication-recovery-validation"></a>

- [正式开发库迁移与发布响应恢复（2026-11-10，已随edada58提交；以下为V31阶段快照）](records/validation-history.md#publication-recovery-validation)

<a id="single-contract-validation"></a>

- [五组非需求双轨集中收敛（2026-11-10，已提交推送1ce0c4b）](records/validation-history.md#single-contract-validation)

<a id="development-dual-path-validation"></a>

- [开发阶段演进规则与双轨排查（首次排查历史快照，五组现状见上）](records/validation-history.md#development-dual-path-validation)

<a id="designer-scenario-validation"></a>

- [PL-02 / SC-03 设计器贡献与场景依赖原阶段证据（2026-11-10，历史快照；后随1ce0c4b提交）](records/validation-history.md#designer-scenario-validation)

<a id="board-runtime-validation"></a>

- [PL-01 项目观测、在途停用与恢复（历史阶段fe08a99，2026-11-10，已提交推送）](records/validation-history.md#board-runtime-validation)

<a id="tool-execution-validation"></a>

- [数据库写入与授权失效恢复整组交付（历史阶段ed84ab9，2026-11-10，已提交推送）](records/validation-history.md#tool-execution-validation)

## 提交前规划同步门禁

功能提交前同步主方案对应进度/验收条目、本台账及相关 decision。已完成子能力移出待办，保留失败、跳过、未验收及证据日期；代码、测试、浏览器、真实供应商、用户接受和提交状态分别记录。早期台账见[历史路线](records/roadmap-history.md#planning-before-workbench-consolidation)，原阶段授权不重新生效。
