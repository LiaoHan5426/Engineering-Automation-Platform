# 规划状态与验收台账

依据：v1.6当前产品/技术合同及有效决策。实现基线为 `2c7e87b`（2026-11-09）；阶段提交 `c76cded` 与该提交已按用户授权推送。本次统一整理只调整文档，不新增功能、运行验收或执行授权。

本表跟踪完整范围，不因局部阶段完成把其他项关闭。`实现通过`仅限列明能力，用户人工接受、供应商与平台验收不能由代理或 Mock 替代。

## 当前基线与完成口径

当前实现基线：`2c7e87b`；整理开始时本地HEAD与origin/main一致。当前状态只维护一次；逐轮数字、失败与当时授权见[主题记录](records/README.md)，整理前台账全文见[历史快照](records/roadmap-history.md#planning-before-workbench-consolidation)。

<a id="validation-baseline"></a>
### 最近一次实现阶段验证（2026-11-09，非本次文档整理重跑）

| 检查 | 已记录结果 | 证据边界 |
|---|---|---|
| 前端全量 | 134文件、786项通过；typecheck、check:architecture、build及改动范围stylelint通过 | 保留大chunk、Node localStorage及既有夹具网络保护诊断；非全仓样式检查 |
| 后端reactor | 32模块SUCCESS，912项：808通过、104环境门控跳过、0失败/错误 | 本轮未启用额外实库/供应商门控；前轮913项（839通过/74跳过）单独保留，不合并覆盖率 |
| 浏览器交互 | 新工作台7组、原任务/审批UI9组通过，0pageerror | 专家保存/审批写请求由隔离fixture接管；实际GrapesJS编辑、Vue交互预览与本地工程重开通过 |
| 显示比例 | 新工作台当前原生DPR1；Chromium比例覆盖1.25/1.5无横向溢出 | 覆盖比例不等于切换Windows系统缩放；旧布局原生125%记录不能替代新布局125%/150%验收 |
| SQL语义 | 合成CTE与4组反连接候选语义检查通过 | 不证明生产数据、完整作用域或性能等价；真实供应商限定样例见后端记录 |
| 提交与推送 | `c76cded`、`2c7e87b`已推送，整理前工作树干净 | 推送完成不关闭用户产品接受 |

命令、截图与限制见[工作台实施记录](records/frontend-history.md#expert-workspace-evolution)和[后端实施记录](records/backend-composition-history.md)。实网证据分别见[Responses审批整链](records/backend-composition-history.md#responses-tools-acceptance)、[复杂SQL与知识](records/backend-composition-history.md#complex-sql-acceptance)，均为前轮限定验收，不是本次重新调用。

各工作项引用的较早测试数字仅为该切片历史证据，不代表当前全量结果。下一关口只列剩余范围，用户接受、真实效果与平台验收独立记录。

| 工作项 | 当前状态与证据 | 下一验收关口 |
|---|---|---|
| UI-01/02 桌面外壳与工作面 | 已有五入口、分组/会话、文件树和分面；媒体对照追加欢迎卡容器适配、专家/设置显式返回，四视口及Work草稿返回实测通过，最终审查见[记录](records/frontend-history.md#reference-ui-review) | 全页面×尺寸/焦点/错误状态复核；真实系统缩放与用户接受 |
| UI-03 本地服务身份 | 本机绑定和只读能力已有验证 | Electron目录选择与打包环境复核；不把分组标签当权限 |
| 统一图标 | `@eap/ui` Icon/name入口与内部本地Lucide资源包已实现，首批工作台/Tag/Tree迁移；全量574项、类型/边界/构建、真实浅深主题及最终独立审查通过，见[记录](records/frontend-history.md#frontend-icons) | 其余管理页面/历史演示字符按语义迁移，不将领域SVG/正文标点机械替换；不是全仓清零 |
| UI-04 Code/Work | 共用会话和选择保存 | 实际办公任务执行，不只角色指引 |
| SC-01/02 场景 | 配置、设计、版本、准备已分面；CAS 保存/删除；save 失败后远端核对；**该切片**：mock「模拟保存断连」落盘+502→`unknown`（`:5174` 已验） | 用户产品接受仍待；真实交付及依赖授权闭环；不把可变配置revision当不可变设计版本 |
| CP-01/02/03 输入与策略 | 目标/模式/审批分别建模，未接通模式禁用；媒体对照修正知识/Skill常驻堆叠，＋入口/紧凑引用/弹窗说明，四视口发送可达，见[记录](records/frontend-history.md#reference-ui-review) | 规划/Agent真实执行；禁止用标签替代策略；不以局部布局通过代替全体验接受 |
| MD-01 模型连接 | 凭据/目录/白名单/强度已有；追加普通API显式wireApi及Responses文本/代码提案，协议变更revision/重绑定、Git拒绝和前端/mock合同已实现并通过离线回归，见[决定](decisions/model-catalog-and-chat-selection.md#普通api连接的协议选择2026-11-05实现与离线回归通过实网待验) | 原连接Responses真实文本与SQL Agent两轮工具、审批写入已验；其他网关/模型/推理档位、Responses Chat Git/账户计划工具及用户最终接受仍待 |
| EX-01 专家 | 父子导航、独立三栏编辑、任务摘要/按需详情、终态停止轮询与静默更新已交付，见[工作区合同](decisions/expert-workspace-navigation.md)；专业行为版本持久绑定、SQL Agent工具循环/检查点恢复/后台调度/单SQL文件审批已接通。真实Responses两轮整链及复杂SQL三类限定样例有独立证据；单专家授权知识→Chat、撤权/旧记忆隔离已有实库回归 | 新工作台原生125%/150%与用户接受；其他行为编辑器/资源整合、完整SQL作用域/生产效果；Chat引用不执行DAG或自动获得工具权限 |
| PB-01 原型编辑 | Grapes工程+语义Schema、8类映射、保存重开/预览；已接EditorWorkbench三栏壳，浏览器编辑/本地重开/交互预览及未知映射阻止通过，数据模型仍归原型域 | 按目标页面逐项补状态/动作/组件映射；原生缩放、用户接受及真实交付 |
| PB-02 生成基线 | 单目标完整有界源码、原型及生成前Task/revision快照已落地；生成期间变化/额外目标拒绝，PREBOUND关联已交付（69892f3）；见 [阶段记录](records/delivery-history.md#code-generation-baseline)、[阶段记录](records/delivery-history.md#code-task-prebinding) | 真实供应商自身改页验收、多文件组件图约束及快照保留期仍后续 |
| PB-03 受控应用 | 持久单文件候选、意图/读回、未知保护、Task→workspace互锁及POST_HOC/PREBOUND交付归因已通过实库/回归；见 [阶段记录](records/delivery-history.md#code-proposal-application)、[阶段记录](records/delivery-history.md#code-task-prebinding) | 未知人工核对、真实模型自身改页和完整交付；不宣称OS事务CAS、Git Run创作代码或会话重启恢复 |
| PB-04/RK-5 独立验证 | **实现通过，04edef5已推送**。前端295通过，后端400通过6跳过，真实三项退出0；V9/V10 | 验证覆盖仅当前frontend；不是源码实现归因或人工验收 |
| 源码交付证据与人工决定 | **EXTERNAL_MANUAL 切片实现及联调通过**，见 [阶段记录](records/delivery-history.md#board-source-delivery) | 实际样例完成采集/同源验证/接受/过期拒绝/拒绝回待处理/刷新；不是平台自动开发或用户最终接受 |
| Chat应用→交付关联 | POST_HOC（544b8f9）与后续PREBOUND（69892f3）已通过实库协议、前后端回归及独立复核；旧无绑定记录不升级归因 | POST_HOC不证明生成时任务归因；PREBOUND仍不证明真实供应商改页/用户产品验收 |
| 生成前任务绑定 | PREBOUND单目标任务/原型快照、应用领取互锁、交付归因已通过实库协议与独立复核；前端398项、后端569项（6跳过），见 [阶段记录](records/delivery-history.md#code-task-prebinding) | 生成前绑定不等于真实供应商已改页；实际模型交付及用户验收仍待，不自动完成整体PB/RK |
| RK-1～4/6 看板准备与只读Run | 已实现持久任务、revision/幂等、只读Run、原型快照、审阅 | 接入真实实现Run后复核状态/失败/并发；不放开任意拖done |
| CT-01 生命周期 | SSE/cancel/快照/同ID重连保留；2026-11-08应用线程执行、断线继续、Spring AI/Responses流、完整行脱敏、事件预算/终态/并发修复，见评审记录 | 真实供应商及用户接受待验；日志仍进程内，持久回放/跨重启接管未实现 |
| RV-01 证据工作面 | 摘要/源文件/Diff/终端按会话，Run按次选择；源码交付与测试接受/拒绝决定已有刷新回放 | EAP自身改页完整证据、SQL实际任务证据及用户接受；不重复开发已有决定回放 |
| Skill | 文本上传/粘贴+显式文本资源、不可变版本、CAS启停/回退、按需预览与Chat精确引用首片已实现；安全/保存恢复缺陷修复后父任务前端525项、后端647项（6跳过）、实库/浏览器及独立复核通过；见 [阶段记录](records/resource-history.md#skill-text-import) | 目录/仓库导入延期；不执行脚本或授予工具权限，不支持通用mock YAML解析；真实供应商效果与用户最终验收待定 |
| MCP-01 / P0 | 保留四传输/矩阵/续传；2026-11-08增加固定read_graph Handler、持久专家grant、精确服务器匹配、环境白名单、有界IO/进程树清理；真实子进程协议夹具覆盖 | 官方memory包通过Expert入口的本机实网验收、常驻GET listen待验；运行时npx离线且拒绝自动安装 |
| Knowledge/SQL/CLI | 保留既有确定性实现与管理；本轮真实本地知识导入/搜索/授权预览/无授权403/删除一致性通过，检索无模型；复杂SQL修复parse.partial与NOT IN NULL规则，四组合成结果验证通过，见[知识与本地执行边界](decisions/knowledge-local-execution.md) | 文档正文版本更新、检索质量评测、完整SQL作用域/生产数据与性能验证、CLI生命周期回归；不扩第二套执行器 |
| PL-01 / P0 看板插件首片 | **部分交付**：board启停/回滚/sticky保留；本轮新增项目ID有界显式GET Task列表检查，未检查/检查中/可用/失败未知与来源时间分开；真机/mock已验，不改Task/Run | 仅Task列表读取通过；Run/全服务健康、在途停用完整矩阵与用户接受仍待；外部安装器延期 |
| PL-02 / P1 设计器插件 | GrapesJS/Schema/版本已有；尚未按通用贡献机制迁移 | PL-01后复用现有设计器、版本和核心API，验证停用不丢草稿/版本；外部任意JS安装延期 |
| SC-03 / P1 场景组合 | 原型到代码已有独立配置/设计/准备/交付切片，不是单个插件 | 依赖PL-01，设计器迁移与PL-02协调；声明所需插件/服务/资源、缺依赖不可用；应用不安装/授权/发送；SC-01 保存断连浏览器接受仍独立 |
| CE-01 / P0 上下文工程 | **部分交付**：预算观测/用量 UI/超限；历史未计量；派生清空；`COMPRESSION_NOT_ENABLED`；**该切片**：备注 Badge 呈现（`:5174` 已验） | 真实 token/压缩策略、ChatMemory 精确计量、用户产品接受；不记录敏感正文 |
| KR-01 / P0 检索基线 | **部分交付**：fixture + `KEYWORD_PROBE`/`POSTGRES_FTS`；延迟观测；实库对照；排序质量样本；`productionSampleCases`；**该切片**：对照测口令回退 `EAP_DB_PASSWORD`/`SPRING_DATASOURCE_PASSWORD`（不写入仓库） | 实库开启 `EAP_RUN_BOARD_PERSISTENCE`+口令跑 FTS 排序对照；不足证据前不启 KR-02 |
| MEM-01 / P1 记忆首片 | **部分交付**：分层+PUT/UI+本地持久+Task/Run；对抗失效；约束/事实；失效 Feedback/空态纠偏；**该切片**：失效下 sticky 清空仍保留诚实提示（`:5174` 已验） | sticky 清空仍不可取消；用户产品接受仍待；自动长期抽取延期 |
| FS-01 / P0 目录与临时资源 | **部分交付**：data-layout + migrationReadiness + kind/byteSize + inventory + candidateCounts；**该切片**：`inventory.byKind`（`:5174`/`:5173` 已验）；`physicalMigration=false` | 旧数据物理迁移/读回/失败恢复、限额/回收与 UNKNOWN 保留仍待批准后实施 |
| TM-01 / P1 受管工具 | CLI程序/固定操作可登记和配置路径；依赖PATH/指定文件，无安装版本管理 | 依赖FS-01，选择一个可信便携工具或venv；锁版本/校验/安装回滚、实际调用/在途保护；保留系统引用，不静默或全局安装 |
| TD-01 / P0 自动发现与绑定 | **部分交付**：可信定义汇总 + 绑定快照 + 显式探测 + 持久化 + 清除缓存 + probeCache/`newestProbedAt`；**该切片**：绑定状态计数摘要（`:5174`/`:5173` 已验） | 真实本机 git 重启验收与用户接受仍待；更多依赖绑定仍待；不整盘扫描 |
| TC-01 / P0 工具调用与呈现 | **部分交付**：git-status、失败摘要和长 stdout；本轮 Abort/客户端超时判 UNKNOWN，停止等待不报进程取消；mock/真机已验，服务端499独立 | 真实拒绝/超时/进程终止与用户接受仍待；无服务端取消确认协议，不开放任意 Capability 执行口 |
| TC-02 / P1 前端实例能力 | **部分交付**：GrapesJS 当前实例草稿/选中状态人工读取；实例/文档/revision与24,000字符上限、过期/离页清空；真机浏览器已验，多实例/冲突/关闭/超限离线回归 | 用户产品接受；远程断线/反向Agent调用另评审，不依赖隐藏组件后台存活，不把本地草稿当Java保存版本 |
| KR-02 / FW-01 条件后续 | 当前保留Spring AI，未采用向量增强或LangChain4j迁移 | KR-01证明检索不足再评估增强；明确协作需求/可复现框架阻碍后独立批准同条件对照，记录兼容/正确性/成本/取消与迁移回归；不长期双循环 |
| 桌面与安装器 | Electron45 preload壳、bootstrap检测脚手架 | Windows sidecar、一体启动/停止、迁移失败/恢复、包验证；签名需要用户凭据及发行决定 |
| Mock契约与总体质量 | 网络保护持续启用；前轮34项回归已修；本轮SSE CRLF/分块/多行data、畸形拒绝、每帧1Mi UTF-16上限与final及时释放；当前全量结果见上方验证表 | 真实模型/后台恢复/全页面视口与用户接受不随之关闭；单帧限额不是总内存/总流上限 |
| 最终验收 | **未完成** | EAP自身实际改页、完整证据链、用户交互接受；已验证/跳过/外部阻塞分别列明 |
| 后端runtime拆分 | 已由applications/full接替；唯一Boot主类与配置/迁移资源保留；旧五模块记录为历史 | 当前IDEA原配置/full宿主启动已验证；跨环境部署与实库业务接受独立，不由离线Bean图替代 |
| BM-01～07 后端模块组合 | 十四轮边界调整及SQL证据修复已交付：唯一full宿主、core/local/Chat最小组合、显式完整装配、领域/存储/分析/授权端口、CLI通道下沉、codegen/context去workflow依赖、固定流程及版本化专业行为、SQL Agent持久恢复/后台调度/单文件审批；IDEA原配置启动已验。详见[实施与复用入口](decisions/backend-module-composition.md#implementation)及上方验证表 | 产品目录/CLI程序登记审批、Chat产品用例/工具贡献继续解耦；workflow仍依赖SQL/MCP，旧DAG长事务、领域schema及跨环境组合未收口；通用写工具、UNKNOWN人工处置、生产SQL效果及用户接受独立 |

## 已完成切片与后续顺序

CP-03用户标注Comment 1已做限定调整：模型/发送成组靠右，缺模型提示独立下置，356px控件区及四视口验证通过；前端全量556项，详见[记录](records/frontend-history.md#reference-ui-review)。不关闭规划/Agent执行或总体体验关口。

| 已交付切片 | 提交 | 保留边界 |
|---|---|---|
| 工作面分离与执行安全纠偏 | `1f38cd8` | 不等于全部视口和用户体验接受 |
| Run独立验证 | `04edef5` | 当前验证覆盖frontend，检查成功不自动完成任务 |
| 源码交付与测试人工决定 | `a63d27e` / `ca3b0a2` | EXTERNAL_MANUAL样例接受不是用户产品接受 |
| 生成前基线与持久单文件应用 | `f6aed04` / `f614272` | 非多文件事务；未知结果仍阻塞 |
| POST_HOC与PREBOUND关联 | `544b8f9` / `69892f3` | 只读Git Run不是实现执行器；真实供应商闭环仍待 |
| 单专家授权知识到Chat | `c9d23a7` | 不执行DAG，不开放其他资源与工具 |
| Skill文本导入/版本/Chat引用 | `2b0fe26` | 不支持目录导入、脚本执行或任意资源组合 |
| 后端模块与持久SQL Agent | `c76cded`（已推送） | 通用写工具、UNKNOWN人工处置与剩余产品耦合未收口 |
| 独立编辑工作台与SQL证据修复 | `2c7e87b`（已推送） | 浏览器技术验证不替代新布局原生缩放或用户接受 |

后续只安排剩余关口，不从头重复上述切片；技术细节与退出矩阵见[技术路线决定](decisions/agent-runtime-evolution.md#7-分阶段切片与退出门禁)：

1. **工程交付验收线**：用户确认目标页面、设计、允许范围和真实供应商/Agent调用后，复用PREBOUND与现有应用/验证/决定链走一次EAP自身改页；授权未具备时保持待验收，不伪造模型结果。
2. **上下文与资源能力线**：CE-01（含 mock 预算展示/超限）/KR-01(含 FTS+延迟观测+本机实库对照+排序质量样本)/MCP-01(stdio+官方矩阵含 memory/`read_graph`+http+legacy SSE+Streamable-HTTP+生产白名单+GET 续传)/MEM-01（含对抗失效与约束/事实 UI）离线首片已落地；下一步生产检索样本或继续追加已验证官方包（含门禁实跑 memory）。规划/Agent、Work仍各设最小合同；A2A、MCP Server、自动长期记忆及Skill目录导入不隐式启动。
3. **工具与本地环境线**：TD-01与TC-01继续现有Git；TC-01停止等待现判UNKNOWN，服务端进程终止协议/真实失败矩阵仍待。TC-02实例人工读取首片已做，下一关是用户交互接受与后续Host协议评审，非重复开发读取按钮；反向Agent调用另批。发现不等于授权，Java执行不需前端复制实现。FS-01物理迁移仍待批准，再做TM-01一个受管工具；sidecar/包验证独立，签名另需凭据。
4. **可信插件与场景线**：PL-01已追加显式Task列表只读检查，Run/整体健康、用户接受与在途停用矩阵仍独立；再做PL-02设计器与SC-03场景依赖，保留版本/候选/产物和五入口合同。外部安装器/市场/第三方隔离延期；不先建空SDK。
5. **总体质量与接受**：此前34项前端回归已收敛，不重复安排该欠账；继续全页面真实系统缩放/焦点/错误矩阵、SQL/CLI剩余业务回归、其他mock合同复核和构建包体积评估。真实供应商流式/取消与自身改页需明确授权，最终由用户逐项接受。

技术补强不是自身单页面交付的全套前置；已有UNKNOWN缺陷不得因路线调整关闭。负责人、具体工具/服务器、物理目录/保留期限与实施时间尚待切片确认。KR-02/FW-01由证据触发，不预设换栈。

获得提交/推送授权后，各阶段提交仅包含该阶段文件，提交前独立审查和实测，推送后回读远端SHA。阶段失败或外部验收未达成时保留未完成状态，不创建空提交。

## 提交前规划同步门禁

历史测试失败、网络保护修复和旧提交授权完整保留在[整理前台账](records/roadmap-history.md#planning-before-workbench-consolidation)。历史指令不重新生效，也不覆盖较新的已验证结果。

每次功能提交前同步主方案对应进度/验收条目、本台账及相关decision，不能只在主方案顶部追加阶段日志。已完成的子能力从“下一步”中移除，剩余范围具体列出；历史证据保留日期并明确非当前状态。代码实现、测试通过、浏览器验证、用户接受与已推送分别记录。审查未通过的阶段不得标完成。提交前检查暂存文档与本次代码范围一致，未同步或互相矛盾则暂停提交。
