# 规划状态与验收台账

> 当前已提交并推送基线为 `b9a9b124fa518457b5da7c897a077db23da89a7b`（PREBOUND真实页面交付42文件）。提交沿用已有验证，未重复测试。接续新增任务侧持久源码候选列表、Diff审阅、明确应用/拒绝及真实重启恢复，随本次提交交付，沿用已有验证不重复测试；无Chat会话自动重建、模型重放或第二套源码写入机制。

依据：v1.6当前合同及有效决策。已提交实现基线为 `b9a9b12`（2026-11-10，PREBOUND页面交付42文件已推送）；提交沿用原结果未重复测试。当前任务持久候选重启恢复随本次提交交付，提交沿用已有结果不重复测试，旧阶段数字保留。开发阶段演进规则以根[AGENTS.md](../AGENTS.md#development-evolution)为准；已排查五组收敛及正式库迁移限制见[本批验收](#single-contract-validation)，首次排查保留为历史快照。

本表跟踪完整范围，不因局部阶段完成把其他项关闭。`实现通过`仅限列明能力，用户人工接受、供应商与平台验收不能由代理或 Mock 替代。

## 当前基线与完成口径

当前已提交实现基线：`b9a9b124fa518457b5da7c897a077db23da89a7b`；PREBOUND页面交付42文件已提交推送，HEAD/origin/main/远端已核一致。当前任务候选恢复随本次提交交付，提交不重复测试；隔离工作树的本地验证基线未推送。历史阶段数字与授权保留在主题记录，不作为新代码的全量重测结果。

<a id="validation-baseline"></a>

<a id="board-code-recovery-validation"></a>

### 任务持久源码候选与正式重启恢复（2026-11-10，接续b9a9b12，随本次提交交付）

[合同、命令和失败过程](records/delivery-history.md#board-code-recovery)；[6组正式页面结果](../frontend/apps/web/__tests__/browser/artifacts/board-code-recovery/result.json)；[JDBC独立回读](../frontend/apps/web/__tests__/browser/artifacts/board-code-recovery/database-verification.json)。

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

[合同、命令与失败过程](records/delivery-history.md#prebound-page-delivery)；[4组正式页面结果](../frontend/apps/web/__tests__/browser/artifacts/prebound-page-delivery/result.json)；[JDBC独立回读](../frontend/apps/web/__tests__/browser/artifacts/prebound-page-delivery/database-verification.json)。

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

[实现、失败过程及命令](records/architecture-history.md#publication-recovery)；[正式V30页面结果](../frontend/apps/web/__tests__/browser/artifacts/full-current-contract/result.json)；[V31恢复整链](../frontend/apps/web/__tests__/browser/artifacts/prototype-publication-recovery/result.json)；[独立数据库回读](../frontend/apps/web/__tests__/browser/artifacts/prototype-publication-recovery/database-verification.json)。

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

[实现记录与失败边界](records/architecture-history.md#single-contract-convergence)；[机器证据及截图](../frontend/apps/web/__tests__/browser/artifacts/single-contract-convergence/result.json)。该批与PL-02/SC-03已提交推送；下列旧测试结果沿用，当前正式库接续见上表。

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

详见[架构审计](records/architecture-history.md#development-dual-path-audit)。本次是规则落地及相关源码排查，不替代PL-02/SC-03原有整链证据。

| 范围 | 本次结果 | 边界与后续 |
|---|---|---|
| 仓库规则 | 根AGENTS明确兼容须有当前需求依据，允许授权范围内必要破坏性重构；同一职责一个权威状态源/契约/生产路径，替换同步清理调用方、测试、文档 | 不扩大数据操作授权，不覆盖已有未提交改动；合理分层、显式Mock、外部协议适配单独判断 |
| 已清理 | 桌面桥只读window.eap，删除eapDesktop及废弃类型别名；原型保存不再将旧当前快照补入历史或生成legacy-snapshot | 未引入替代兼容机制；正常草稿/本地历史/不可变发布版本职责保留 |
| 确认待收敛 | 工作区授权双配置键、CLI程序/旧操作绑定、专家显式行为/隐式默认、Builder语义设计/旧计数发布、Git持久操作/旧同步invoke，共5组 | 源码可达证据，未查询实际库中旧行；后续按授权配置与CLI→专家→Builder→invoke整体收敛 |
| 本次验证 | 5文件30项定向测试、typecheck、preload合同、check:architecture通过；5个受影响TS文件lint/格式检查通过 | 首轮格式检查发现3文件问题，格式化后通过；未重跑旧完整套件、Maven或真实数据库/浏览器整链 |
| 文件检查 | 变更文本UTF-8无BOM、Markdown本地链接/锚点及git diff --check核对 | 规则和审计不代表所有遗留已消除；没有提交、推送或修改数据库 |

<a id="designer-scenario-validation"></a>
### PL-02 / SC-03 设计器贡献与场景依赖原阶段证据（2026-11-10，历史快照；后随1ce0c4b提交）

以下为V30收敛之前的PL-02阶段证据；“无迁移/LIKE三表/56文件”等仅代表当时快照。当前迁移、夹具与实际结果以上述五组收敛表为准。结果与截图见[摘要](../frontend/apps/web/__tests__/browser/artifacts/designer-scenario-lifecycle/result.json)，实现/失败/命令见[主题记录](records/frontend-history.md#designer-scenario-lifecycle)。

| 检查 | 本批实际结果 | 边界 |
|---|---|---|
| 提交/推送 | PL-01共34文件提交fe08a99并推送，本地/远端一致；仅做差异/编码/敏感检查，沿用已有测试结果 | 没有重复运行PL-01测试；本批新增尚未提交 |
| PL-02生命周期 | 设计器贡献依赖/显式服务观测/缺失提示；A/B停用前保存恢复草稿并确认，发布或存储未确认阻止停用；销毁画布/观察结果，启用重建且保留独立草稿/本地历史/服务器版本；激活错误按插件隔离 | 复用Host/PluginSlot/Builder/GrapesJS，无新SDK/能力注册表；本地草稿不是已发布版本，不自动发布/取消/执行 |
| 开发阶段调整 | 停止读取/迁移旧全局草稿；ScenarioWorkspace只接受实际Host，移除独立启用布尔值；删除编辑器失败时合成占位设计保存的逻辑；关闭GrapesJS遥测 | 不保留兼容双轨；数据库结构无需改变，本批无迁移；真实设计器不可用即禁用编辑/保存/发布 |
| SC-03前后端 | GET /api/scenarios/workflows/prototype-to-code/dependencies返回固定可信插件/服务/资源合同与版本总数；必需设计器及版本服务/资源，可选看板；503为可用性未知，旧快照保留；副本保留workflow、revision保存/读回 | 声明与观测不授予权限；客户端标签installed不能绕过Host/服务检查；既有仓库、模型、验证门禁保留；核心版本API不受UI停用控制 |
| 真实整链 | 最终31模块SUCCESS、1项门控整链通过/0跳过、7组Chromium检查；真实GrapesJS编辑→HTTP/JDBC发布2版本→发布响应等待时拒绝停用→A/B未发布草稿→停用/刷新/激活失败/重建恢复→实库关系故障/修复→副本配置保存 | 3张UUID自有表LIKE INCLUDING ALL，检查/默认/索引保留、不复制FK/触发器；延迟响应和表重命名只在测试宿主/schema；本地激活失败为明确注入；非正式full启动、迁移重跑或模型改页 |
| 请求/数据 | 最终0pageerror、0外呼，仅2次版本POST+1次场景PUT；原版本ID/hash保持，JDBC确认每实例1版本、1场景、0交付单，应用3表完整数量/摘要不变 | 没有自动发布、重复请求、源码写入或后台任务；早期多出的写请求后关闭默认遥测并收口出站审计 |
| 后端配套 | 服务4、HTTP3、原版本HTTP1、模块边界8、完整组合2，共18项通过/0跳过 | 配套在第3次尝试通过；其中整链当时失败，保留该reactor失败。之后仅复验失败整链，最终第6次单项SUCCESS，不合称一次19项reactor成功 |
| 前端回归 | 受影响49文件282项通过；后续16文件66项通过；末次激活并存隔离12文件38项、文档替换保护4文件9项、观测原因/刷新保护3文件9项通过；最终typecheck/build/architecture通过 | 集合有重叠不累加；真实整链证据保留第6次，最后两项局部加固采用对应回归，没有为刷新数字重复全量/整链 |
| 静态检查 | 36个前端文件lint、35目标格式与5个设计器相关Vue stylelint通过；两个既有页面的扩展stylelint未通过 | ScenarioWorkspace既有82项，ChatWorkspace既有selector解析TypeError；HEAD相同样式已复现，两个页面CSS内容未变，不改检查白名单；未重跑旧全量，保留新定向证据 |
| 文件/VCS | 56个实际变更文件：53文本UTF-8无BOM/无替换字符、3截图；234处本地文档链接/锚点、3类有限敏感模式及差异空白通过 | HEAD/origin/main/远端保持fe08a99；本批新增尚未提交，无临时schema/宿主或5187监听 |
| 资源 | 6次尝试会话均记录自有schema删除、应用记录不变、host/browser停止；独立只读JDBC无自有schema/连接，原3条工具记录摘要保持，29份应用迁移未改 | 正式full未启停；浏览器存储配额/损坏、其他平台、完整用户接受与真实代码交付独立 |

<a id="board-runtime-validation"></a>
### PL-01 项目观测、在途停用与恢复（历史阶段fe08a99，2026-11-10，已提交推送）

集中完成前后端及真实核心生命周期，结果和截图见[摘要](../frontend/apps/web/__tests__/browser/artifacts/board-runtime-lifecycle/result.json)，命令及范围见[主题记录](records/frontend-history.md#board-runtime-lifecycle)。

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

按用户集中推进要求，终态/人工核对审计写入、工作区/程序失效及后端校验/前端交互一起交付。结果与6张截图见[摘要](../frontend/apps/web/__tests__/browser/artifacts/git-database-authorization-recovery/result.json)，完整失败与命令见[主题记录](records/backend-composition-history.md#git-database-authorization-recovery)。

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

从已推送5e0ec5b接续。结果及4张截图见[矩阵摘要](../frontend/apps/web/__tests__/browser/artifacts/git-cancel-permission-io/result.json)；完整命令、门控与复现过程见[主题记录](records/backend-composition-history.md#git-cancel-permission-io-review)。

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

从已推送067c3d8接续；先提交旧切片，再验证六组真实矩阵，不复用历史测试数字。结果与4张截图见[矩阵摘要](../frontend/apps/web/__tests__/browser/artifacts/git-interruption-unknown/result.json)，故障方式、失败和完整命令见[主题记录](records/backend-composition-history.md#git-interruption-unknown-review)。

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

从已推送47433d8接续；开始无EapApplication在运行，保留原启动状态。复用既有真实Git夹具/生产服务/面板，新增操作参数及diff门控，确认框显示操作名和稳定ID，证据见[本轮记录](records/backend-composition-history.md#real-git-diff-unknown-review)。

| 检查 | 本轮实际结果 | 边界 |
|---|---|---|
| 前端首轮定向 | 面板1文件45项通过，两个操作均校验确认框名称与ID | 公共ConfirmBox、既有i18n标题与L4业务原位，无新UI类别 |
| diff异常首轮 | 门控验收清理辅助进程时失败；尚未走到页面 | 退出竞争MATCHING_EXITED及随后PID复用IDENTITY_MISMATCH，均未据此终止未知身份；修正测试清理后重跑，失败日志保留 |
| 最终定向/整链 | 31模块闭包SUCCESS；10报告67项全部通过、0跳过；Java7组、status6组、diff6组共19组真实浏览器检查，0pageerror | 跨操作详情/关闭404、requestId复用409、不完整确认400；UNKNOWN仅阻塞自身操作，其他操作实际成功；原字段/JDBC/重启读回不变 |
| diff异常/恢复 | 最终diff执行5e0ad68d-4e7f-4e28-bcfb-a1367a118796，实际Git异常exit1后在workflow返回前中断宿主，重启UNKNOWN并完成页面核对关闭/恢复 | 原Git命令/环境/执行器不变；独立OS审计不注入产品证据，完整树证明仍false |
| 明确失败对照/范围 | 损坏索引709f26bd-c6e3-4ea8-b7c6-42da9a76606c为FAILED/exit128/“进程树已清理”、无未知原因；恢复精确原index后944493a0-6c35-43ee-a019-24f27218ac02为SUCCEEDED | diff-scope四项true：未暂存标记存在、仅暂存/未跟踪排除、索引/三个工作文件字节保持；[结果与截图](../frontend/apps/web/__tests__/browser/artifacts/real-git-diff-unknown/result.json)保留 |
| 前端最终 | 全量137文件842项、面板45项通过；typecheck/build/check:architecture、目标lint/stylelint及3文件格式检查通过 | 确认框显示本地化操作名及ID；已查看最终390px确认框及1440px历史证据展开，无横向溢出；既有大chunk/测试网络防护/Node localStorage提示保留 |
| 完整离线 | 32模块SUCCESS；163报告959项：851通过、108门控跳过，0失败/错误，5分29秒 | 仅该子进程关闭已有EAP_RUN_*及三项整链门控；与67项实测分列，日志/时间窗汇总backend/target/real-git-diff-unknown-offline-* |
| 资源/迁移 | 独立只读SQL确认最终三个自有schema已不存在；清理记录及应用工具记录摘要不变断言通过；无fixture JVM/5187监听，原full-application仍未运行 | 应用库29份已应用迁移、最新V29；V26～V29数据库和源码CRC一致，无迁移改动，不重用旧PID或擅自启动 |
| 文件收尾 | 19个变更文件，13个文本UTF-8无BOM、6张diff截图；182处本地文档目标/锚点、3类有限敏感模式与差异空白通过 | 当前改动按本次用户授权提交并推送，结果以Git回读为准，产品用户接受及其他异常矩阵独立 |

### 真实Git status异常UNKNOWN核对与关闭后原始证据（历史阶段，47433d8，2026-11-09）

先按用户授权提交并推送a641892956a845f1310c69f09cf69fa18bd0b2bd（23文件，feat: 验证受控 UNKNOWN 核对并支持历史执行详情），HEAD/origin/main/远端ref一致且工作树干净，再推进以下接续。证据见[本轮记录](records/backend-composition-history.md#real-git-unknown-review)。

| 检查 | 本轮结果 | 边界 |
|---|---|---|
| 真实Git首轮 | 单独门控1项通过，实际Git异常exit1、退出/清理证据已由测试执行器观察；持久业务尚未收到结果时宿主中断，重启UNKNOWN整链6组真实浏览器断言通过、0pageerror | 原Git程序/参数/环境/DefaultProcessExecutor不变，外部OS审计与产品捕获证据分开；关闭不补造退出字段，精确自有schema/进程/宿主清理，应用记录摘要不变 |
| 前端 | 137文件842项通过；面板定向45项通过；typecheck/build/check:architecture、目标lint/stylelint与4文件格式检查通过 | UNKNOWN及CLOSED_UNKNOWN均只读展示原命令/步骤证据；关闭后不再出现核对表单，历史RUNNING明确不代表当前存活 |
| 最终定向/对照 | 31模块闭包SUCCESS；10报告66项全部通过、0跳过；含Java演练7组和真实Git6组实际浏览器检查，0pageerror | 真实Git异常exit1后丢失持久结果经UNKNOWN完整核对；索引损坏明确FAILED/exit128/进程树已清理且无未知原因，修复后SUCCEEDED。导入编译失败已修复，未将之前47项当成功 |
| 实测留存 | 最终真实Git执行2315f97c-ee0d-4b63-b491-3b99e44de604，关闭审计/JDBC/重启不变；[结果与截图](../frontend/apps/web/__tests__/browser/artifacts/real-git-unknown/result.json) | 已查看最终1440px历史原证据展开和390px确认框；应用记录摘要不变、自有schema/宿主/进程清理通过 |
| 后端完整离线 | 32模块SUCCESS；163报告958项：851通过、107门控跳过，0失败/错误；6分21秒 | 仅该子进程关闭已有EAP_RUN_*及两项整链门控，与66项实测分列；日志/时间窗汇总backend/target/real-git-unknown-offline-* |
| 应用恢复/迁移 | 按原参数恢复full-application，PID41284，health=200/ok；29份迁移验证通过，无新迁移，V26～V29源码/数据库校验和一致 | 已有真实status记录不变，成功检查409、越操作404、恶意Origin403；无在途执行、测试fixture JVM或5187监听 |
| 文件收尾 | 20个变更文件（14文本/6截图），UTF-8无BOM；176处本地Markdown目标/锚点、3类有限敏感模式与差异空白检查通过 | 按本次授权提交；本次真实异常覆盖git-status，git-diff异常、其他故障矩阵与产品用户接受独立 |

### 受控异常UNKNOWN整链与历史执行详情（历史阶段，a641892，2026-11-09）

先按用户授权提交并推送d7c14288ec7c6fd01b6a87d5c0397968f38b8f4d（47文件，feat: 持久保存工具执行的子进程身份线索），回读HEAD/origin/main/远端ref一致。以下接续证据见[本轮记录](records/backend-composition-history.md#tool-unknown-controlled-acceptance)。

| 检查 | 本轮结果 | 边界 |
|---|---|---|
| 受控异常首轮整链 | 门控验收1项通过，含7组真实Chromium/HTTP/PostgreSQL断言，0pageerror；已查看真实父退出/子存活与390px二次确认截图 | 测试宿主替代一次CLI为自有Java父子进程，强制中断后重启UNKNOWN。精确核对/清理后走实际Vue说明/勾选/二次确认、幂等/冲突、旧请求/迟到取消、新请求执行实际Git、历史详情及再重启读回。不是产品用户接受或真实Git故障 |
| 前端 | 全量137文件840项通过；面板定向1文件43项通过；typecheck/build/check:architecture、目标lint/stylelint通过 | 历史详情复用原隔离GET，不启动/取消执行，其他UNKNOWN仍互锁；读取失败与离页迟到响应有组件覆盖。既有大chunk、网络防护及Node localStorage提示保留 |
| 后端完整离线 | 32模块SUCCESS；163报告957项：851通过、106门控跳过，0失败/错误 | 仅子进程关闭全部已有EAP_RUN_*及新整链门控；受控验收在此跳过，不能当完整链路证明。日志/时间窗汇总为backend/target/tool-unknown-review-offline-* |
| 后端最终定向 | 31模块闭包SUCCESS；10报告65项全部通过、0跳过，含受控验收再次通过 | 最终新增JDBC/HTTP关闭快照一致及应用记录摘要不变断言；真实OS/HTTP/PostgreSQL/Vue7组通过，0pageerror。会话backend/target/tool-unknown-review-a1247297-b591-496d-8864-57621b356062 |
| 应用恢复/迁移 | full-application按原参数恢复PID38636，health=200/ok；29份迁移验证通过，无新迁移；V26～V29源码/数据库校验和一致 | 已有真实status记录不变；成功记录检查409、越操作404、恶意Origin403；无在途执行，测试宿主/进程/schema及5187监听已清理 |
| 前端格式/文件 | 6文件格式检查通过；最终受控截图与结果摘要保留到[artifact](../frontend/apps/web/__tests__/browser/artifacts/tool-unknown-review/result.json) | 已查看最终历史重开1440px与二次确认390px截图；23个变更文件（16文本/7截图）UTF-8无BOM、170处本地文档目标/锚点、3类有限敏感模式及差异空白检查通过 |

### 已观察子进程身份持久与前端核对（历史阶段，d7c1428，2026-11-09）

以下为d7c1428已提交阶段的历史证据，不当作本次重新执行；该阶段从b6e9748接续。完整实现，证据见[记录](records/backend-composition-history.md#tool-descendant-evidence)。

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

以下为b6e9748已提交阶段的保留证据，未当作本次重新执行；本轮已按用户授权完成其提交和推送，HEAD/origin/main/远端refs/heads/main一致。完整证据见[记录](records/backend-composition-history.md#tool-process-review)。

| 检查 | 本轮结果 | 证据边界 |
|---|---|---|
| 后端首轮定向 | 31模块闭包SUCCESS，47项通过、0跳过 | 4项本地进程测试含真实自有JVM及父退出/子存活；25项工具服务、JSON、HTTP、8项模块边界及自有schema持久回归。补持久不变断言后最终定向47项仍通过，0跳过 |
| 前端 | 定向3文件46项通过；完整137文件832项通过；typecheck、build、check:architecture、改动范围lint/stylelint通过 | 既有大chunk、网络防护及Node localStorage提示保留；进程检查显式触发，不重提执行或核对 |
| 浏览器/mock | 14组通过、0pageerror，1440/900/390px无横溢 | 模拟NOT_CAPTURED线索，不代替真实OS检查；已查看390/1440px线索区域截图；进程状态枚举与真实父子场景由后端覆盖 |
| 后端完整离线reactor | 32模块SUCCESS；161份报告951项：846通过、105门控跳过，0失败/错误 | 仅子进程关闭EAP_RUN_*门控，与最终47项定向/实库分列；日志和时间窗汇总在backend/target/git-process-review-offline-* |
| 服务恢复/文件 | full-application按原参数恢复，PID34672，health=200/ok；新路由对已成功记录409、跨操作404、恶意Origin403，原记录未变；29份迁移校验通过、无新迁移 | V26～V29源码/应用校验和一致；UTF-8/链接/空白/敏感模式检查通过。接续代码、测试、截图及文档按用户授权随本次提交交付，推送结果以Git回读为准 |

### 真实diff HTTP与UNKNOWN人工处置（历史阶段，bb83f31，2026-11-09）

本轮从8abbd21接续，证据见[记录](records/backend-composition-history.md#tool-unknown-manual-review)。代码、测试及文档按用户授权随本次提交交付，提交号与推送结果以Git回读为准。真实diff执行与模拟UNKNOWN核对分别记录，不把人工关闭当作执行成功/取消。

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

验证结果与命令见[接续记录](records/backend-composition-history.md#git-diff-operation-executions)。代码与本轮文档按用户授权随本次提交交付，提交号及推送结果以Git回读为准。用户启动full-application后，应用库V28已只读核验。

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

首轮失败、修复、实库与浏览器命令，以及一次没有结束状态的中断重跑均保存在[阶段记录](records/backend-composition-history.md#tool-operation-executions)，中断没有记为通过。离线全量原始日志保留在仓库根tool-execution-offline-reactor-final.log，按本次报告时间窗汇总到full宿主target/tool-execution-offline-summary.json。

### 上一阶段验证（历史，2026-11-09）

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
| PB-02 生成基线 | 单目标完整有界源码、原型及生成前Task/revision快照已落地；生成期间变化/额外目标拒绝，PREBOUND关联已交付（69892f3）；见 [阶段记录](records/delivery-history.md#code-generation-baseline)、[阶段记录](records/delivery-history.md#code-task-prebinding) | 限定真实供应商单文件改页及PREBOUND整链已验；多文件组件图、快照保留期及用户产品接受仍后续 |
| PB-03 受控应用 | 持久单文件候选、意图/读回、未知保护、Task→workspace互锁及POST_HOC/PREBOUND交付归因已通过实库/回归；见 [阶段记录](records/delivery-history.md#code-proposal-application)、[阶段记录](records/delivery-history.md#code-task-prebinding) | 限定真实模型单文件改页/受控应用/交付/技术决定已验；任务侧持久候选/真实重启后读取和明确应用拒绝已验；未知人工核对及完整用户接受仍待；不宣称OS事务CAS或Git Run创作代码 |
| PB-04/RK-5 独立验证 | **实现通过，04edef5已推送**。前端295通过，后端400通过6跳过，真实三项退出0；V9/V10 | 验证覆盖仅当前frontend；不是源码实现归因或人工验收 |
| 源码交付证据与人工决定 | **EXTERNAL_MANUAL 切片实现及联调通过**，见 [阶段记录](records/delivery-history.md#board-source-delivery) | 实际样例完成采集/同源验证/接受/过期拒绝/拒绝回待处理/刷新；不是平台自动开发或用户最终接受 |
| Chat应用→交付关联 | POST_HOC（544b8f9）与后续PREBOUND（69892f3）已通过实库协议、前后端回归及独立复核；旧无绑定记录不升级归因 | POST_HOC不证明生成时任务归因；本轮另有明确真实模型单文件改页证据；原PREBOUND切片自身不证明供应商效果或用户产品验收 |
| 生成前任务绑定 | PREBOUND单目标任务/原型快照、应用领取互锁、交付归因已通过实库协议与独立复核；前端398项、后端569项（6跳过），见 [阶段记录](records/delivery-history.md#code-task-prebinding) | 限定gpt-6.1-sol真实单文件交付已另验；生成前绑定本身不等于供应商效果，用户接受/多文件与整体PB/RK不自动关闭 |
| RK-1～4/6 看板准备与只读Run | 已实现持久任务、revision/幂等、只读Run、原型快照、审阅 | 接入真实实现Run后复核状态/失败/并发；不放开任意拖done |
| CT-01 生命周期 | SSE/cancel/快照/同ID重连保留；2026-11-08应用线程执行、断线继续、Spring AI/Responses流、完整行脱敏、事件预算/终态/并发修复，见评审记录 | 真实供应商及用户接受待验；日志仍进程内，持久回放/跨重启接管未实现 |
| RV-01 证据工作面 | 摘要/源文件/Diff/终端按会话，Run按次选择；源码交付与测试接受/拒绝决定已有刷新回放 | EAP自身改页完整证据、SQL实际任务证据及用户接受；不重复开发已有决定回放 |
| Skill | 文本上传/粘贴+显式文本资源、不可变版本、CAS启停/回退、按需预览与Chat精确引用首片已实现；安全/保存恢复缺陷修复后父任务前端525项、后端647项（6跳过）、实库/浏览器及独立复核通过；见 [阶段记录](records/resource-history.md#skill-text-import) | 目录/仓库导入延期；不执行脚本或授予工具权限，不支持通用mock YAML解析；真实供应商效果与用户最终验收待定 |
| MCP-01 / P0 | 保留四传输/矩阵/续传；2026-11-08增加固定read_graph Handler、持久专家grant、精确服务器匹配、环境白名单、有界IO/进程树清理；真实子进程协议夹具覆盖 | 官方memory包通过Expert入口的本机实网验收、常驻GET listen待验；运行时npx离线且拒绝自动安装 |
| Knowledge/SQL/CLI | 保留既有确定性实现与管理；本轮真实本地知识导入/搜索/授权预览/无授权403/删除一致性通过，检索无模型；复杂SQL修复parse.partial与NOT IN NULL规则，四组合成结果验证通过，见[知识与本地执行边界](decisions/knowledge-local-execution.md) | 文档正文版本更新、检索质量评测、完整SQL作用域/生产数据与性能验证、CLI生命周期回归；不扩第二套执行器 |
| PL-01 / P0 看板插件首片 | **限定生命周期实现通过**：board启停/回滚/sticky；项目聚合Task/Run与验证/写入在途/未知只读观测、失败旧快照、在途停用确认及重新启用；实际Git后台完成和原Task/Run恢复已验 | 验证/写入/UNKNOWN投影由持久夹具证明；全服务健康与用户接受独立；PL-02/SC-03见本批记录；外部安装独立 |
| PL-02 / P1 设计器插件 | **限定实现及整链通过**：可信贡献依赖/启停/激活隔离、A/B实例恢复草稿和本地版本隔离、发布中拒绝停用、停用/刷新/重建恢复、原服务器版本保持；不读旧全局数据或合成占位保存 | 本地恢复与服务器版本分离；发布响应丢失已完成当前请求身份/核对切片；用户接受、外部安装/任意JS隔离独立 |
| SC-03 / P1 场景组合 | **依赖切片实现及整链通过**：核心固定workflow可信依赖观测；必需设计器/版本服务/已发布版本，可选看板；实际Host及失败旧快照阻断、实库修复重查、副本workflow配置保存/读回 | 应用不安装/授权/发送/执行；本轮另完成单文件PREBOUND→真实候选→应用→验证→技术决定；完整设计交互接受、用户产品接受及SC-01保存UNKNOWN删除关口独立 |
| CE-01 / P0 上下文工程 | **部分交付**：预算观测/用量 UI/超限；历史未计量；派生清空；`COMPRESSION_NOT_ENABLED`；**该切片**：备注 Badge 呈现（`:5174` 已验） | 真实 token/压缩策略、ChatMemory 精确计量、用户产品接受；不记录敏感正文 |
| KR-01 / P0 检索基线 | **部分交付**：fixture + `KEYWORD_PROBE`/`POSTGRES_FTS`；延迟观测；实库对照；排序质量样本；`productionSampleCases`；**该切片**：对照测口令回退 `EAP_DB_PASSWORD`/`SPRING_DATASOURCE_PASSWORD`（不写入仓库） | 实库开启 `EAP_RUN_BOARD_PERSISTENCE`+口令跑 FTS 排序对照；不足证据前不启 KR-02 |
| MEM-01 / P1 记忆首片 | **部分交付**：分层+PUT/UI+本地持久+Task/Run；对抗失效；约束/事实；失效 Feedback/空态纠偏；**该切片**：失效下 sticky 清空仍保留诚实提示（`:5174` 已验） | sticky 清空仍不可取消；用户产品接受仍待；自动长期抽取延期 |
| FS-01 / P0 目录与临时资源 | **部分交付**：data-layout + migrationReadiness + kind/byteSize + inventory + candidateCounts；**该切片**：`inventory.byKind`（`:5174`/`:5173` 已验）；`physicalMigration=false` | 旧数据物理迁移/读回/失败恢复、限额/回收与 UNKNOWN 保留仍待批准后实施 |
| TM-01 / P1 受管工具 | CLI程序/固定操作可登记和配置路径；依赖PATH/指定文件，无安装版本管理 | 依赖FS-01，选择一个可信便携工具或venv；锁版本/校验/安装回滚、实际调用/在途保护；保留系统引用，不静默或全局安装 |
| TD-01 / P0 自动发现与绑定 | **部分交付**：既有程序/操作模型上统一Git目录与共享路径/版本；status/diff保留能力ID与独立开关，旧探测入口兼容；历史路径冲突拒绝执行，见[Git程序与持久调用](decisions/agent-runtime-evolution.md#git-operation-executions) | 更多依赖绑定与用户接受；发现仍不等于授权，不整盘扫描 |
| TC-01 / P0 工具调用与呈现 | **status/diff切片实现**：两个固定操作分别持久启动/查询/取消、三个Git阶段取消及清理证据；跨操作requestId复用409、详情/取消404；KeepAlive离页/返回与刷新读回；重启UNKNOWN按操作保留并互锁。V26/V27原稿保留，增量V28且应用库迁移已核验；diff限定已跟踪文件未暂存差异，真实HTTP/JDBC整链已验；工具UNKNOWN核对后保存CLOSED_UNKNOWN审计并解除本操作阻塞（V29，应用库迁移已核验），保留原未知及退出证据；新增最多8步、每步32个已观察子进程身份的持久/即时检查，历史缺失/空/截断区分，证据限额不影响清理，原状态/审计不变；受控异常及真实status/diff异常终止/持久结果丢失后的HTTP/PostgreSQL/Vue核对、恢复diff范围/索引与文件不变、历史详情及关闭后原证据展示已验，确认框明确操作身份，证据见[Git程序与持久调用](decisions/agent-runtime-evolution.md#git-operation-executions)；status/diff取消、超时及成功结果返回中断的六组UNKNOWN核对与恢复、正常持久终态对照及人工关闭响应中断后显式重查已验；取消意图在UNKNOWN/CLOSED_UNKNOWN保留展示；取消请求响应丢失后不确定态禁止重复取消/启动并显式重查；status/diff的Windows index ACL与共享IO限制异常、结果保存中断UNKNOWN核对及正常FAILED对照恢复已验；集中交付逐Git阶段授权复核、只读readiness和恢复指引、应用层存储事务归一化/核对响应校验及历史外阻塞加载；数据库终态/审计提交前后断连、工作区/绑定失效12场景84组真实浏览器检查通过 | 其他权限范围/物理IO/其他平台异常、跨重启进程接管与产品用户接受独立；不提供任意命令执行口 |
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

1. **工程交付验收线**：本轮按用户授权以GenerationBaseline.vue为唯一目标，已完成PREBOUND真实模型→受控应用→独立验证→技术决定；接续已补任务持久候选在Chat失效/重启后的独立审阅和明确应用拒绝；下一片按实际页面需求推进更完整组件图和用户交互接受，不为刷新数字重复供应商调用或扩大全平台故障矩阵。
2. **上下文与资源能力线**：CE-01（含 mock 预算展示/超限）/KR-01(含 FTS+延迟观测+本机实库对照+排序质量样本)/MCP-01(stdio+官方矩阵含 memory/`read_graph`+http+legacy SSE+Streamable-HTTP+生产白名单+GET 续传)/MEM-01（含对抗失效与约束/事实 UI）离线首片已落地；下一步生产检索样本或继续追加已验证官方包（含门禁实跑 memory）。规划/Agent、Work仍各设最小合同；A2A、MCP Server、自动长期记忆及Skill目录导入不隐式启动。
3. **工具与本地环境线**：TD-01已统一Git程序及status/diff操作；TC-01已补status/diff持久调用/取消确认，UNKNOWN阻止同一操作重复启动，证据见[Git程序与持久调用](decisions/agent-runtime-evolution.md#git-operation-executions)。工具UNKNOWN已接通核对说明/进程树确认/二次确认及持久审计；本轮验证受控异常UNKNOWN整链并追加历史详情入口；当前检查仍不证明完整树退出。取消/超时/成功结果返回中断及核对响应丢失矩阵已验，取消意图保留展示；取消响应丢失和Windows index ACL/共享IO限制异常已验；本批已补数据库终态/审计提交前后及工作区/程序绑定恢复。后续将工具剩余异常列为维护回归，PL-01本轮已验证Task/Run只读观测与在途停用真实Git整链；本批已接通PL-02/SC-03及TC-02生命周期整链，后续进入实际页面交付验收；物理IO/跨平台穷举不作为其余产品开发前置，产品用户接受、其他工具和进程接管独立，不推广为SQL/源码写入UNKNOWN处置。TC-02实例读取与后续Host评审独立；反向Agent调用另批。FS-01物理迁移仍待批准，再做TM-01受管工具；sidecar/包验证与签名独立。
4. **可信插件与场景线**：PL-01已完成项目Task/Run与验证/写入只读观测及真实Git在途停用/后台完成/重新启用恢复；用户接受与全服务健康独立。本批已接通PL-02设计器贡献、SC-03必需/可选依赖及TC-02观察随销毁失效、草稿/版本恢复。下一批集中推进既有PREBOUND/候选/应用/验证/人工决定的实际页面交付验收，保留五入口合同。外部安装器/市场/第三方隔离延期；不先建空SDK。
5. **总体质量与接受**：此前34项前端回归已收敛，不重复安排该欠账；继续全页面真实系统缩放/焦点/错误矩阵、SQL/CLI剩余业务回归、其他mock合同复核和构建包体积评估。真实供应商流式/取消与自身改页需明确授权，最终由用户逐项接受。

技术补强不是自身单页面交付的全套前置；已有UNKNOWN缺陷不得因路线调整关闭。负责人、具体工具/服务器、物理目录/保留期限与实施时间尚待切片确认。KR-02/FW-01由证据触发，不预设换栈。

获得提交/推送授权后，各阶段提交仅包含该阶段文件，提交前独立审查和实测，推送后回读远端SHA。阶段失败或外部验收未达成时保留未完成状态，不创建空提交。

## 提交前规划同步门禁

历史测试失败、网络保护修复和旧提交授权完整保留在[整理前台账](records/roadmap-history.md#planning-before-workbench-consolidation)。历史指令不重新生效，也不覆盖较新的已验证结果。

每次功能提交前同步主方案对应进度/验收条目、本台账及相关decision，不能只在主方案顶部追加阶段日志。已完成的子能力从“下一步”中移除，剩余范围具体列出；历史证据保留日期并明确非当前状态。代码实现、测试通过、浏览器验证、用户接受与已推送分别记录。审查未通过的阶段不得标完成。提交前检查暂存文档与本次代码范围一致，未同步或互相矛盾则暂停提交。
