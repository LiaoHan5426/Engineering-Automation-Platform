# 实现审查与后端架构演进总览

## 当前结论与阅读方式

当前后端由api、engine、ai、web、spring及applications组成，唯一Boot宿主为eap-applications/eap-full-application；库模块不得反向依赖宿主，engine不得依赖ai/web。当前结构以[架构](../architecture.md)和[模块布局](../module-layout.md)为准。下文8e020d5的五模块拆分、652项回归及19份迁移均为历史快照，不代表当前结构、IDEA实际重启或完整产品验收。

2026-11-10完成[开发阶段规则排查](#development-dual-path-audit)及[五组集中收敛](#single-contract-convergence)：两处小遗留与五组兼容/重复入口均已清理，V30独立Flyway/数据库/HTTP/Git及设计器真实整链通过。该179文件已提交推送1ce0c4b。日常库旧非语义原型及测试引用已按本次授权备份处置，正式full完成V30/V31与生产页面整链；新增发布响应丢失核对随本次提交交付，沿用已有验证且不重复测试，见[当前接续](#publication-recovery)。

以下按主题合并完整阶段记录，日期保留在记录中而不再作为文件名。记录中的“本轮/未提交/下一步”和测试数字仅代表当时快照；不得覆盖上面的当前结论、有效产品合同或用户授权。原文完整保留（只调整标题层级、锚点及链接），后续更新本总览，不另建日期报告。

## 记录索引

| 原记录 | 完整章节 |
|---|---|
| `docs/decisions/implementation-review-2026-10-31.md` | [已开发内容审查与纠偏（2026-10-31）](#implementation-review) |
| `docs/decisions/backend-runtime-modules-2026-11-01.md` | [后端 runtime 模块拆分](#backend-runtime-modules) |

---

<a id="publication-recovery"></a>

## 正式开发库V30/V31与发布响应丢失恢复（2026-11-10）

### 提交推送与精确数据处置

原PL-02/SC-03及五组收敛共179文件提交 `1ce0c4bfd4a68d6ff1c969839cc99f476f2df69c`，已推送origin/main；提交后核对HEAD/origin/main/远端main一致。按用户要求沿用此前已记录测试，不重复测试；提交阶段只检查差异/UTF-8/链接及有限敏感模式。以下发布恢复代码及证据随本次提交交付；按本次明确授权沿用已记录测试结果，提交前只核对差异、文档、编码、链接和敏感模式，不重复测试。

迁移前遍历eap schema内uuid/text/varchar/json/jsonb列，只命中非语义原型 `6b8dcc1f-ba23-4ef8-b9a2-236067c06f3e`（builder-alpha，24字符，hash c51b54128d34ef654ea47cdabc57e6a5682967b9c65f00cd74e0e3c4baf5401b）及两处引用：旧测试任务 `5b71f0a4-639a-4401-bbba-ddae6369ce07` 的prototype_version_id，旧Run `3350dce7-7c4e-473a-9f86-4d425d0a0a7f` 的task_snapshot。任务属board-run-test项目，Run的Mission已SUCCEEDED，无验证/交付快照、无prototype_delivery/codegen引用，也无指向该Run的FK。

原型/任务/Run全行先备份到忽略的 `backend/target/development-v30-transition/`，原始业务全行不进入Git。随后一个精确事务按ID/hash/revision及状态断言：删1行旧测试Run快照、任务清prototype_version_id且revision 2→3、删1行旧原型；保留任务和原SUCCEEDED Mission，其他表数量/摘要不变。摘要见[data-disposition](../../frontend/apps/web/__tests__/browser/artifacts/full-current-contract/data-disposition.json)及[V30回读](../../frontend/apps/web/__tests__/browser/artifacts/full-current-contract/migration-verification.json)。首轮误用不存在的task.updated_at字段导致事务完整回滚，修正后成功；未发生半清理。单独Flyway.validate在V30 pending时拒绝，未repair/baseline/ignore，最终由真正Boot正常迁移。

### 正式宿主与V30五组实链

Maven `package -DskipTests` 打包真正可执行 `eap-full-application-0.1.0-SNAPSHOT.jar`，以main `com.lh.eap.EapApplication` 启动；显式EAP_WORKSPACE/EAP_AUTHORIZED_ROOT为当前仓库，端口8080，不使用测试Host或假模型装配。V30正式checksum=-1792803472。Chromium打开生产App（Vite 5173代理8080），完成5组：GrapesJS编辑/HTTP持久发布/回读/交互预览；真实PluginCenter停用/刷新/启用恢复未发布草稿且原版本不变；场景读取真实版本依赖；真实仓库Git status/diff持久执行及同requestId回读、旧invoke404；内置SQL固定专家显式不增强模型执行并保存sql-analysis/v1。

0pageerror、0外呼。留下语义版本 `054ce698-6231-4d3d-a8cc-a3d71c629ca6` 和SQL任务 `c8cb6772-6fbb-4922-bcd0-61264a05a22b`，不伪称全库没有变化。[结果/请求](../../frontend/apps/web/__tests__/browser/artifacts/full-current-contract/result.json)、[截图](../../frontend/apps/web/__tests__/browser/artifacts/full-current-contract/designer-restored.png)。初次脚本发布成功后多按钮selector strict失败，修正首个语义按钮并复用已有版本，不再次发布；失败证据保留。

### 发布恢复唯一契约与V31

原POST每次新建版本，提交后响应丢失无法判断是否成功。当前新增：客户端UUID requestId必填；PrototypeVersion/Store/Service、HTTP、runtime-client、Mock及全部当前调用方同步。JDBC以request_id唯一约束和ON CONFLICT DO NOTHING回读权威版本；同身份同规范内容返回同版本，同身份异内容409 PUBLICATION_REQUEST_CONTENT_CONFLICT。GET /api/prototype-publications/{requestId}只读核对，不存在404，缺请求身份400。没有旧无身份入口、服务重载或运行时自动身份分配。

V31增加request_id NOT NULL UNIQUE。迁移只对已有合规语义版本一次性gen_random_uuid，随后删除DEFAULT；body/hash/created_at不改，不恢复旧数据。正式full重建时跳过测试，核对自有PID和jar command line后停止自己启动的V30进程，再启动真正main。V31 checksum=-2146259443，31份Flyway validate通过。当前PID36288，8080健康200；进程记录和日志在忽略的backend/target/full-application-live，不泄露连接凭据。

前端发布前按实例写入并读回冻结请求；丢响应保留unknown，不自动重发/清理。未知阻止新发布、替换文档和停用，刷新及离页恢复同一请求。显式查询成功清理本地意图；只有404显示原请求明确重试，重试不替换已冻结正文，不覆盖后续草稿编辑。损坏或不能可靠写入的存储保留阻塞并提示。A/B key独立，未建立另一套服务器状态机；Feedback/Button复用@eap/ui，领域恢复仍属features/shell，公共HTTP类型属runtime-client，无新共享包。

### 本批新验证与失败过程

| 检查 | 实际命令与结果 |
|---|---|
| 后端新定向 | `rtk proxy mvn -f backend/pom.xml -pl :eap-full-application -am test '-Dtest=PrototypePublicationServiceTest,PrototypeVersionControllerTest' '-Dsurefire.failIfNoSpecifiedTests=false'`：5+1=6项通过、0跳过，覆盖响应丢失查询、冲突、16线程请求同版本、缺身份/不存在只读、新身份新版本；[摘要](../../frontend/apps/web/__tests__/browser/artifacts/prototype-publication-recovery/backend-regression.json) |
| 前端新定向 | `rtk proxy pnpm --dir frontend exec vp test run apps/web/__tests__/features/shell/prototypePublication.test.ts apps/web/__tests__/features/shell/GrapesEditor.publicationRecovery.test.ts apps/web/__tests__/features/shell/GrapesEditor.publish.test.ts`：3文件9项通过；覆盖存储校验/隔离、重挂载、503继续未知、身份不匹配、原内容重试及后续编辑 |
| 工程门禁 | 当前12个受影响TS/Vue及2份浏览器脚本格式和lint通过，GrapesEditorScaffold stylelint、typecheck、check:architecture、build通过；build保留大chunk提示。旧完整集合未重跑；其余测试必填签名同步并由skipTests打包阶段编译 |
| 新正式实链 | 真实正式full/JDBC与生产App下3组：route.fetch让数据库提交后abort响应→待核对/停用阻止→刷新不自动POST→查询找回同版本；发送前abort→GET404→修改新草稿→原身份/内容明确重试；12并发真实HTTP同版本、异内容409/缺身份400/GET404不写，既有hash保持 |
| 数据库独立回读 | request_id无默认、非空、唯一，无重复身份；3个实链requestId各1行且ID/hash匹配，V30发布ID/hash保持，旧非语义原型和旧快照引用0；[证据](../../frontend/apps/web/__tests__/browser/artifacts/prototype-publication-recovery/database-verification.json) |

[3组结果](../../frontend/apps/web/__tests__/browser/artifacts/prototype-publication-recovery/result.json)及[恢复后新草稿截图](../../frontend/apps/web/__tests__/browser/artifacts/prototype-publication-recovery/recovered-draft.png)已查看。0pageerror/0外呼，数据新增3个语义发布版本（含12并发仅1行），不是Mock写入。断连由浏览器路由控制，后端事务/数据库未替身。脚本初轮遇默认启用状态未落localStorage及双实例selector strict、添加组件后自动切属性面板的定位问题；修正定位并用committed-checkpoint复用首次已提交版本，没有以再次发布掩盖丢响应。failure.json/png保留末次失败，未发送成功的旧requestId没有落库。

真实PluginCenter现有局部i18n scope产生root fallback warning，但无pageerror、中文最终可见；此项和构建大chunk不伪称已修复。没有再次运行此前260/250等旧套件，未调用外部模型/Agent/MCP，未做源码生成/写入、人工产品接受或跨平台故障穷举。下一完整批按既有PREBOUND→候选→受控应用→独立验证→人工决定推进实际页面交付，不新增兼容机制。

<a id="single-contract-convergence"></a>

## 五组非需求双轨集中收敛与V30整链（2026-11-10，阶段快照；已随1ce0c4b提交）

本轮授权集中完成此前五组排查，保留工作区PL-02/SC-03未提交改动。规则以根[AGENTS](../../AGENTS.md#development-evolution)为准。结果与截图见[机器证据](../../frontend/apps/web/__tests__/browser/artifacts/single-contract-convergence/result.json)，完整当前验收行见[台账](../planning-status.md#single-contract-validation)。原阶段结论保留；本次已随179文件提交推送，当前开发库与正式宿主接续见上。

### 单一契约与删除范围

| 组 | 实际修改 | 保留的职责 |
|---|---|---|
| 授权根 | RuntimeWorkspace只接一个配置；full/starter/YAML去掉AI旧键，删除双键冲突语义；所有Java调用方同步。额外修复显式无效目录不能回落到cwd | full空配置的进程共置绑定、独立starter缺授权拒绝、realPath与越界保护 |
| CLI | JdbcCliChannelStore/CliProgramMapper读写program_id，V30外键指向cli_program；CliChannels仅按程序读绑定，拒绝用已知操作ID配置程序；旧操作回读/BindingConflict删除 | git-status/git-diff等操作ID仍是业务能力；共享程序binary与原执行器、参数/授权/限额不变 |
| 专家 | 删除legacyBinding、fixed默认resolver、缺行为构造形状、prepareManifest和preserveBehavior SQL；编辑器不再从capabilities/顺序steps推图。内置SQL、expert-sdk、Mock和当前测试写显式behavior/steps/edges；V30增加CHECK | 版本化策略目录、不同fixed/agent执行模式、草稿停用/撤权、事务回滚和执行历史冻结 |
| 原型 | Builder删旧演示页、counter预览/本地配置及发布入口；只剩设计/版本。HTTP/DTO/表去buttonPresses/interaction。SemanticPrototype服务校验格式、节点上限500/深度24、已注册kind、无未知映射及Grapes工程；保存与交付均拒绝旧文本。前端相同拒绝，无legacy slot | 按实例恢复草稿、本地历史、不可变服务器版本、独立临时语义交互；原打开/交付迟到响应保护 |
| Git HTTP | 删除同步invoke controller/service/装配、客户端类型/方法、Mock分支和过时用例；目录改指operation executions | 同一ToolExecutionService的requestId幂等、持久状态、取消/UNKNOWN人工核对与恢复，不新增执行器 |

### 数据库与验证边界

新增[V30](../../backend/eap-applications/eap-full-application/src/main/resources/db/migration/V30__single_current_contracts.sql)，不修改V1～V29。该迁移不把旧自定义行为、CLI操作键或旧文本推断成新授权/设计，不自动删除旧行；遇不合规数据事务回滚。已知内置sql-expert按当前产品种子显式更新sql-analysis/v1，不作为其他专家默认。新原型哈希只覆盖sourceRef/title/body/acceptance；原已保存哈希作为冻结证据回读，没有运行时双算法分支。

真实SingleContractAcceptanceTest在UUID自有schema执行V1～V29，插入旧CLI键/缺行为专家后证明V30拒绝且回滚，移除自有故障行后迁到V30。生产HTTP/JDBC验证程序绑定/清除、status/diff真实Git及同requestId幂等、旧invoke404、专家缺行为拒绝/显式版本保存→启用→执行→改版本停用→再启用→历史仍保留原行为、语义版本发布/回读及交付唯一。临时仓库工作文件和Git索引字节保持。

DesignerLifecycleAcceptanceTest改为实际Flyway V1～V30创建完整独立schema，替代LIKE三表的旧夹具。7组真实Chromium/GrapesJS检查通过，2次版本POST+1次场景PUT，0pageerror/0外呼；双实例未发布草稿、本地版本和服务器版本在停用、刷新、激活失败、重建后保持；数据库关系异常503与修复重查仍验证。两个测试都清理自有schema/宿主/浏览器并核对原应用记录摘要不变。未重启正式full，未调用供应商模型，不是用户产品接受。

日常库只读CurrentContractPreflightTest确认：schema V29，旧CLI/未登记键0，非规范自定义专家0，非语义原型1；因此migrationReady=false。本轮没有修改日常库或删除那条记录。正式启用新版本前先显式决定该旧记录的处理并执行V30，不能用运行回退绕过约束。

### 回归、失败与复验

- 成功的后端定向/扩展/预检/补充/真实组按测试类去重：42报告288项，260通过、28门控跳过，0失败/错误。分组数字：主定向164全通过；扩展145中117通过/28跳过；预检与装配10通过；目录与CLI补充29通过；真实整链2通过，集合重叠不累加为一次全量。
- 前端39文件250项通过；SDK/model补充2文件4项（model重叠）；相关56个TS/Vue格式与lint、typecheck/architecture/build通过。删除旧counter纯函数测试，改为语义预览交互、旧文本/旧入口拒绝；未削减授权/UNKNOWN门禁。3个相关Vue的stylelint通过；最后Schema/SDK2文件9项通过（集合重叠）。已有大chunk构建提示保留，未跑无关页面stylelint。新增SDK测试缺vite-plus包内声明的架构失败已通过显式devDependency及离线锁更新修复，末次架构通过。
- 根clean因历史验收Git只读对象无法删除而失败，随后仅受影响模块clean成功、reactor test-compile成功，未递归删除旧验收目录。首轮编译/回归暴露旧构造/字段和Mock用例，随新契约同步后对应回归通过。
- 首次跨组真实链在版本createdAt纳秒/数据库微秒回读比较失败；新发布/交付时间统一微秒精度后复验2项通过，不引入兼容分支。初次目录回归还发现旧程序键/缺行为MCP测试夹具，修正后20项与CLI9项通过。失败日志保留于backend/target，不冒用旧PL-02结果。

可复现命令（仓库根，PowerShell参数整体加引号）：

```text
rtk proxy mvn -f backend/pom.xml -pl :eap-full-application -am test "-Dtest=RuntimeWorkspaceTest,RuntimeConfigurationTest,CliChannelsTest,JdbcCliChannelStoreTest,ExpertBehaviorCatalogTest,ExpertBehaviorManagementTest,ExpertPolicySelectionTest,ExpertExecutionTest,PrototypeCanonicalTest,PrototypeVersionControllerTest,ToolExecutionServiceTest,ToolExecutionControllerTest,CapabilityManagementTest,CliProgramsTest,ModuleCompositionTest,FullApplicationCompositionTest" "-Dsurefire.failIfNoSpecifiedTests=false"
rtk proxy mvn -f backend/pom.xml -pl :eap-full-application -am test "-Dtest=SingleContractAcceptanceTest,DesignerLifecycleAcceptanceTest" "-Dsurefire.failIfNoSpecifiedTests=false"
rtk proxy pnpm --dir frontend test run apps/web/__tests__/features/plugins apps/web/__tests__/features/expert apps/web/__tests__/mock apps/web/__tests__/features/shell/BoardPrototypePanel.test.ts packages/expert-sdk/__tests__ packages/runtime-client/__tests__
rtk proxy pnpm --dir frontend typecheck
rtk proxy pnpm --dir frontend check:architecture
rtk proxy pnpm --dir frontend build
```

真实组须显式开启EAP_RUN_SINGLE_CONTRACTS/EAP_RUN_DESIGNER_LIFECYCLE/EAP_RUN_BOARD_PERSISTENCE=true，并设置本机EAP_PLAYWRIGHT_MODULE/EAP_CHROMIUM。它们只迁自有schema；CurrentContractPreflightTest同门控但只读日常库。28项较早专家实库门控未开，不能写成通过。UI原语已搜索并继续复用@eap/ui；本轮只删应用级旧面，无新基础组件或共享包，落点及架构门禁通过。

KISS/YAGNI体现在删除旧面与回退，不新增替代机制；DRY体现统一读写与状态契约；SOLID体现配置、程序绑定、语义校验、业务执行与HTTP适配职责保持明确。下一步是日常库旧记录处置/V30正式宿主验证，再回到既有真实代码交付关口，不重复推进已完成五组。

---

<a id="development-dual-path-audit"></a>

## 开发阶段规则与非需求双轨首次排查（2026-11-10历史快照）

以下“仍待/后续”及代码形态只记录首次排查，不是当前状态；五组均按下文单一契约收敛。

### 范围与判断依据

用户明确开发阶段不默认要求旧数据、旧接口、旧逻辑兼容，允许为需求、安全、便利和效率调整数据库结构并进行必要破坏性重构。权威规则已写入根[AGENTS.md](../../AGENTS.md#development-evolution)。本次保留工作区既有PL-02/SC-03改动，没有提交推送、启停正式服务、修改数据库或重跑旧完整套件。

排查覆盖工作区授权与CLI绑定、专家定义/执行、Builder设计/版本/交接、桌面桥及相邻测试/配置/装配。以生产入口、调用方与可达回退为证据，不按legacy/compatible关键词机械认定问题；不是全仓所有语义的穷尽证明。

### 已直接清理

| 项目 | 原问题与修改 | 当前单一契约 |
|---|---|---|
| 桌面桥别名 | [desktopPlatform.ts](../../frontend/apps/web/src/features/shell/desktopPlatform.ts)在规范eap之外接受eapDesktop，并声明无调用方的DesktopWorkspaceBridge；删除旧别名、回退和测试设置/清理 | [preload.cjs](../../frontend/apps/desktop/src/preload.cjs)实际只暴露window.eap，web仅消费该入口；选择工作区和会话授权语义不变 |
| 原型旧快照补历史 | [prototypeSchema.ts](../../frontend/apps/web/src/features/shell/prototypeSchema.ts)保存时曾将旧当前快照自动加入空历史，并可能生成legacy-snapshot；删除自动补历史分支 | 历史仅包含明确保存的版本；正常当前编辑状态与版本历史仍有不同职责，不自动恢复旧数据 |

### 确认仍存在的兼容回退与重复入口

下列优先级是收敛顺序，不是已发生数据损坏或安全事故的声明。当前未发现需求要求长期保留这些兼容分支；本轮没有将审计扩大为各领域整链重构。

| 优先级 / 项目 | 当前源码证据 | 影响及目标契约 | 实施与验证关口 |
|---|---|---|---|
| P1 工作区授权双配置键 | [RuntimeWorkspace.decide](../../backend/eap-engine/eap-engine-local/src/main/java/com/lh/eap/config/RuntimeWorkspace.java)同时接收configuredRoot/legacyRoot，旧键回退与ROOT_CONFLICT；[full装配](../../backend/eap-applications/eap-full-application/src/main/java/com/lh/eap/config/RuntimeConfiguration.java)、[starter装配](../../backend/eap-spring/eap-spring-boot-autoconfigure/src/main/java/com/lh/eap/spring/EapLocalAutoConfiguration.java)及[application.yml](../../backend/eap-applications/eap-full-application/src/main/resources/application.yml)都读取eap.runtime.authorized-root/eap.ai.authorized-root | 同一授权根受两套配置影响，操作和诊断负担增加。统一eap.runtime.authorized-root及其环境键，删除legacy参数、读取和冲突兼容；正常colocated绑定模式另按需求保留 | 同步宿主/starter、构造调用方、授权拒绝与真实工作区回归；配置重载、缺配置、越界拒绝不得放宽 |
| P1 CLI新旧绑定键 | [CliChannels.override](../../backend/eap-engine/eap-engine-local/src/main/java/com/lh/eap/application/service/CliChannels.java)先读git，再读git-status/git-diff并检查BindingConflict；[JdbcCliChannelStore.configure](../../backend/eap-engine/eap-engine-workflow/src/main/java/com/lh/eap/application/service/JdbcCliChannelStore.java)删除只作用于program键 | 若库中有旧操作行，清除新git覆盖后，旧路径可能重新生效；这是可达风险，未查询实库旧行。统一程序级binary绑定，操作ID只作为能力标识 | 删除运行时旧键读取；明确开发库旧行处置及约束，采用后续迁移而不篡改已应用迁移。覆盖设置/清除、无绑定、权限失效及status/diff一致性 |
| P1 专家显式行为与隐式默认 | [ExpertBehaviorCatalog](../../backend/eap-engine/eap-engine-core/src/main/java/com/lh/eap/core/ExpertBehaviorCatalog.java)的behavior缺省→legacy；[ExpertAnalysisPolicyResolver](../../backend/eap-engine/eap-engine-core/src/main/java/com/lh/eap/core/ExpertAnalysisPolicyResolver.java)、[ExpertExecutionService](../../backend/eap-engine/eap-engine-workflow/src/main/java/com/lh/eap/application/service/ExpertExecutionService.java)仍回退；[ExpertManagementService](../../backend/eap-engine/eap-engine-workflow/src/main/java/com/lh/eap/application/service/ExpertManagementService.java)自动补behavior，[Mapper](../../backend/eap-engine/eap-engine-workflow/src/main/java/com/lh/eap/persistence/mapper/ExpertDefinitionMapper.java)用preserveBehavior保留旧编辑器字段；[ExpertEditor](../../frontend/apps/web/src/features/expert/ExpertEditor.vue)将旧capabilities/顺序steps转换 | 定义、编辑、保存及执行存在两种输入语义。统一当前显式版本化behavior及明确steps/edges合同，缺字段拒绝，不再隐式指定SQL默认 | 同步内置定义/编辑器/HTTP/存储/执行/测试；保留草稿revision、撤权、事务原子性和在途Run快照。固定DAG与动态Agent是不同业务模式，不合并执行器 |
| P1 Builder旧发布生产入口 | [BuilderWorkspace.saveVersion](../../frontend/apps/web/src/features/plugins/BuilderWorkspace.vue)的legacy页仍以draftTitle/draftBody/buttonPresses调用真实版本API；[prototypeVersionDesign](../../frontend/apps/web/src/features/shell/prototypeVersionDesign.ts)对非语义文本返回blocked:false，Builder进入Chat/交付仅检查designBlocked；[PrototypeVersionContent](../../frontend/apps/web/src/components/PrototypeVersionContent.vue)仍有legacy预览 | 标注“历史演示”不能使真实写API变成Mock；旧文本/计数版本仍能发布并进入后续路径。统一语义设计版本的发布/回读/预览/交接契约，删除旧写入口和非语义放行 | 对齐后端发布校验、客户端/Mock、任务版本选择与交付消费；验证未知格式拒绝、双实例草稿/版本保留及启停恢复。独立handoff/Mission需求先明确归属，不盲删 |
| P2 Git旧同步invoke入口 | [RuntimeDataController](../../backend/eap-web/eap-web-workflow/src/main/java/com/lh/eap/web/controller/RuntimeDataController.java)仍公开POST /api/runtime/trusted-tools/git-status/invoke；`TrustedGitStatusService`（现已删除，首次排查基线fe08a99可追溯）生成随机requestId并sleep轮询；[runtime-client](../../frontend/packages/runtime-client/src/index.ts)及[目录](../../backend/eap-engine/eap-engine-workflow/src/main/java/com/lh/eap/application/service/TrustedToolCatalogService.java)仍公开旧入口，当前CapabilityManager已使用持久操作面板 | 属于重复调用契约与等待语义，底层仍是同一个ToolExecutionService，不是第二执行引擎。统一客户端明确requestId的start/get/cancel及核对API | 删除旧controller/service装配/客户端方法/目录描述并同步测试；验证响应丢失、取消、超时、UNKNOWN核对与恢复仍使用同一执行身份 |

### 不应误判与清理候选

- 草稿恢复、本地保存历史和PostgreSQL不可变发布版本职责不同；不能因多个存储位置直接判定双状态机。显式隔离的Mock也有当前验收用途。
- MCP stdio/SSE/Streamable HTTP属于外部协议适配；OpenAI-compatible是协议名称，Skill frontmatter compatibility是格式字段，不据此另判旧业务双轨。
- [PrototypeFlow.vue](../../frontend/apps/web/src/features/shell/PrototypeFlow.vue)未发现生产组件导入，只有自身及测试引用；Chat的pendingMockHandoff消费有props.mock守卫。属于旧PoC/死源码候选，不能称当前存在第二条生产交付链。
- OfficialReadonlyMcpLock委托同一Matrix、LlmGateway.complete包装同一completeWithEvidence：可以评估删除多余外观，但未发现第二套MCP传输或模型循环。
- 模型连接的存储模式/宿主属性模式需要结合实际组合目标继续判断；本次未将其认定为已证实缺陷。固定DAG与动态Agent的不同模式应显式选定，禁止把旧定义隐式升级为另一模式。
- 已应用数据库迁移和明确标记的历史记录用于追溯，不是运行时双轨。本轮只纠正有效合同中“必须旧SQL入口兼容”的未来要求，保留既有历史证据。

### 验证与后续顺序

本次相关检查：

```text
rtk proxy pnpm --dir frontend test run apps/web/__tests__/features/shell/localBridge.test.ts apps/web/__tests__/features/shell/workspaceHost.test.ts apps/web/__tests__/features/shell/prototypeSchema.test.ts apps/web/__tests__/features/shell/prototypeDrafts.test.ts apps/web/__tests__/features/DesktopNavigation.test.ts
rtk proxy pnpm --dir frontend typecheck
rtk proxy node frontend/apps/desktop/src/check-preload.cjs
rtk proxy pnpm --dir frontend check:architecture
rtk proxy pnpm --dir frontend exec vp lint apps/web/src/features/shell/desktopPlatform.ts apps/web/src/features/shell/prototypeSchema.ts apps/web/__tests__/features/shell/localBridge.test.ts apps/web/__tests__/features/shell/workspaceHost.test.ts apps/web/__tests__/features/DesktopNavigation.test.ts
rtk proxy pnpm --dir frontend exec vp fmt apps/web/src/features/shell/desktopPlatform.ts apps/web/src/features/shell/prototypeSchema.ts apps/web/__tests__/features/shell/localBridge.test.ts apps/web/__tests__/features/shell/workspaceHost.test.ts apps/web/__tests__/features/DesktopNavigation.test.ts --check
```

结果：5文件30项定向测试、类型、preload合同、架构检查通过；lint通过；格式首轮发现3个测试文件问题，格式化后复查通过。UTF-8无BOM、Markdown本地链接/锚点、差异空白另做静态核对。未运行Maven、全量测试或本轮真实HTTP/数据库/浏览器整链；不将PL-02/SC-03历史结果当成本次兼容清理的全链验收。

后续先收敛授权配置与CLI绑定，再统一专家定义/存储/执行，接着清理Builder旧生产发布链，最后删除Git同步入口；每组同时更新调用方、测试和有效文档。没有以新增兼容层作为过渡目标。按当前需求清理既有实现体现KISS/YAGNI；移除别名及补历史回退减少重复契约，体现DRY；领域职责与外部协议分层仍保持明确，体现SOLID。

---

<a id="implementation-review"></a>

## 已开发内容审查与纠偏（2026-10-31）

来源：`docs/decisions/implementation-review-2026-10-31.md`；合并基线 `82aa504`。

<!-- record:start docs/decisions/implementation-review-2026-10-31.md -->
<a id="implementation-review--已开发内容审查与纠偏2026-10-31"></a>
### 已开发内容审查与纠偏（2026-10-31）

状态：**本轮确证问题已修，全量回归、真实页面复验及独立审查完成**。不表示完整规划已交付或用户已完成人工验收。

<a id="implementation-review--审查基线与边界"></a>
#### 审查基线与边界

- 基线：`main` / `90b971a`，以 v1.6 §0B、§0A 与文档顶部 10/31 增补为当前合同，不以旧历史表认定现状。
- 开始时仅 `backend/eap-runtime/src/main/resources/application.yml` 有用户修改；保持不动，不读取或记录凭据。沿用用户的 `vp dev` / IDEA + DevTools，不另启 Java。
- 保留 Vue/Vite+、五入口、公共 UI、Spring AI、Capability / ProcessExecutor、现有看板 Task / Mission Run / Flyway；不加调度器、不接 Hermes 服务、不引入新依赖、不提交/推送。
- 原型生成、独立构建验证关联、人工验收与任务完成闭环仍属待实现；本次修复不是这些业务能力的完成声明。

<a id="implementation-review--发现与修复矩阵"></a>
#### 发现与修复矩阵

| ID | 发现 | 处理与当前证据 |
|---|---|---|
| UI-1 | 场景配置标签之外默认展开布局夹具、GrapesJS、版本、源码/基线和验收，1280×800 下工作面内容约 3376px | 配置详情仅保留场景数据和明确入口；任务工作面分设计/版本入口与开发准备；设计器复用 Builder，不再在场景挂第二实例。准备 API 延后到准备页；内存保存返回位置、详情标签和版本选择。22 项定向、类型与边界检查通过；内置浏览器实际点击配置→工作面→准备，独立浏览器验证模型设置往返恢复；4 个视口×2 子面无页面横溢 |
| UI-2 | Builder 堆叠三套编辑器；版本 JSON 使用旧计数器预览；Builder hash 未稳定归属场景 | 分设计/版本/历史演示，旧功能保留而不混入主设计；Builder 归场景。复用 PrototypeVersionContent 语义预览，未知映射阻塞交接；发布采用真实实例 sourceRef，刷新版本并打开新版本。真实 beta 发布/回读/预览按钮及返回选中验证，内置浏览器打开同一版本点击成功；4 个视口×3 子面无横溢 |
| UI-3 | 看板任务详情同时堆任务准备、原型、全部 Run 与证据；样例弹窗内容 1312px / 可见 678px | 公共 Tabs 分任务准备/原型版本/执行与审阅，首次进入才加载子面，切换保留草稿/请求。Run 按次选择且刷新保留选项。28 项定向通过；真实 API 样例、草稿保护与 4 个视口×3 子面检查通过 |
| BE-1 | Git status 可触发 fsmonitor/clean/process 等配置 helper；授权 cwd 为子目录时可向上发现父仓库 | GitCapability 统一根/过滤器预检与固定安全命令；CapabilityDirtyRunner 复用注册能力、CLI binary 与 ProcessExecutor，受开关/输出限额/脱敏控制；删除裸 ProcessDirtyRunner。10 项真实隔离 Git、dirty 接线与全量回归通过，真实 HTTP dirty 和 Run 成功 |
| BE-2 | ProcessExecutor 清理失败仍可被 MissionRunOutcome 当终态，解除任务阻塞 | 增加进程树清理证据，缺证据保持未知；真实取消/超时、故障注入回归通过，独立审查无阻塞问题 |
| BE-3 | CapabilitySettings 查询异常被当空表，默认启用能力 | 查询失败返回 `503 CAPABILITY_SETTINGS_UNAVAILABLE`；仅成功空查询默认 on，8 项回归通过，独立审查无阻塞问题 |
| BE-4 | Windows 大小写/尾空格别名可绕过候选限制，同一物理文件可重复进入候选 | 策略名大小写无关，尾点/空格拒绝不修正，Path 与 isSameFile 去重；新增真实临时文件/硬链接回归通过 |
| BE-5 | 已应用候选重试丢失原验证 checks | 保存并重放完整 Applied，随候选过期/淘汰清理；不重写、不重验，失败检查退出码保持；新增回归通过 |
| UI-4 | 真实串联发现：原型已保存后移动任务列改变 revision，原型未改却成为 stale，在隐藏标签中阻止 Run | 未编辑且非请求中的选择随任务 revision 对齐；真正待保存选择保留显式冲突确认。新增 RED→GREEN，真实同一任务启动成功 |

<a id="implementation-review--中断恢复核对"></a>
#### 中断恢复核对

子代理失败不等于回滚，也不等于完成。网络中断后重新检查 Git diff 与真实测试：前端 270 项中 3 项失败；后端 352 项中 1 项失败、24 项条件跳过。场景恢复尚未实现、旧测试入口未调整，Git 旧命令期望未迁移，dirty 旁路与 Builder 仍缺。已将总任务拆为具体可核对项，不能因代码已写或子代理声称完成就关闭任务。

<a id="implementation-review--已运行验证"></a>
#### 已运行验证

- 初始前端基线：`rtk proxy pnpm --dir frontend test run`，73 文件 / 266 项通过。
- 看板 RED：新增分面测试在缺失 Tabs 上失败；Run 选择测试在渲染两个 Run 上失败；GREEN：四个看板测试文件 / 28 项通过。
- 候选 RED：`CodeChangeBoundaryTest` 4 项均失败，分别对应危险别名、重复物理文件、大小写别名、重试丢 checks；后续全量 Maven 中这 4 项通过。
- 场景恢复及职责测试先失败；修正后 `ScenarioWorkspace.test.ts` + `DesktopNavigation.test.ts` 22 项通过；`typecheck`、`check:boundaries` 通过。
- 浏览器：桌面预览已打开真实 localhost:5173，DOM bridge 不响应，改由 computer-use 实际点击内置预览并截图核对；独立 Browser Use Chromium 补充 DOM/尺寸量测。两类证据分别记录，不能把独立浏览器冒充内置浏览器。
- 视口检查：1440×900、1280×800、1024×640、708×640。1024 检查只是有效 CSS 尺寸覆盖，不声称真实操作系统 125% 缩放全量验收。
- 最终前端：`rtk proxy pnpm --dir frontend test run` **74 文件 / 277 项通过**；`typecheck`、`check:boundaries`、`build` 与 `git diff --check` 通过。Node localStorage 实验警告仍有；主包 976.54 kB、GrapesJS 1,070.45 kB 的 >500 kB 告警保留，不提高阈值掩盖。
- 最终后端：`EAP_RUN_BOARD_PERSISTENCE=true EAP_RUN_MISSION_GIT_ACCEPTANCE=true rtk proxy mvn -f backend/pom.xml test` **369 项、0 失败/错误、5 条件跳过**。其中 BoardRunPersistenceTest 13、BoardTaskPersistenceTest 3、MissionGitAcceptanceTest 3 实际运行；只操作自有样例，不建/删/重置数据库。跳过 CLI 建删库集成、原型交付建删库、真实 Codex、Codex 本机配置、schema probe，未当作通过。
- 真实 5173→8080 热更检查：`frontend/Package.json` baseline 返回 `SOURCE_FILES_ONLY`，`NODE_MODULES/entry.ts` source 返回 `INVALID_CODE_PATH`；dirty `requested=true`；自有任务显式确认后 Run `SUCCEEDED / exitCode=0 / 进程树已清理`，原型 ID/hash 固定，任务仍 `ready`，未宣称验收完成。
- 独立进程/配置/候选 review：无阻塞问题；提出可继续增加 interruption+descendant 组合测试及缓存淘汰回归的建议，未将建议写为已实现。
- 最终独立前端/Git review：无已证实阻塞缺陷；复核导航/返回状态、懒加载子面、交付门禁、语义预览、Git 预检与 dirty 注入路径。独立 review 是只读代码审查，不冒充重跑测试或浏览器验收。
- 后端计数按最终 Maven 日志逐类汇总：62 类、369 项，其中 364 通过、5 跳过。`target/surefire-reports` 留有旧包路径报告，不能直接累加目录内全部 XML 来报告本轮总数。

UI 落点：已搜索公共 Tabs/Select/Button/Dialog → 页面领域装配留 features → 版本内容组合放 components 并更新唯一共享边界规范 → 类型/边界/行为测试通过。没有平行 UI 原语、新包或新依赖。

<a id="implementation-review--保留与待完成边界"></a>
#### 保留与待完成边界

设置已按分类独立，专家目录/专家管理已分开，未发现需要整体重建的依据；配置专家与指导角色资源授权尚未统一是已有规划缺口。保留任务 revision、启动幂等、原型快照、审阅事务、未完成门禁，不因 git status 成功推进任务完成。没有付费模型调用或候选代码应用到当前仓库。

真实看板验证创建的自有样例保留供用户复核：任务 `727e6430-d0e4-4860-9eb6-0ece0199d480`（`local-eap`，标题“Review 验证样例（非开发任务）”），原型 `a09aaae7-7d00-4d60-a036-92cfc6afc908`（builder-beta），Run `1af31e60-5220-408d-b975-d5842e380070`。任务 ready、revision 3、无活跃执行，未标完成；未生成交付单、未应用代码。临时未保存备注已显式丢弃，独立浏览器原型缓存已按操作前快照恢复。没有清理或覆盖用户记录。
<!-- record:end docs/decisions/implementation-review-2026-10-31.md -->

---

<a id="backend-runtime-modules"></a>

## 后端 runtime 模块拆分

来源：`docs/decisions/backend-runtime-modules-2026-11-01.md`；合并基线 `82aa504`。

<!-- record:start docs/decisions/backend-runtime-modules-2026-11-01.md -->
<a id="backend-runtime-modules--后端-runtime-模块拆分"></a>
### 后端 runtime 模块拆分

状态：五模块拆分、父任务干净全量验证及最终独立复核通过，纳入本轮后端交付。既有前端/图标调整另行提交，application.yml保持排除。IDEA实际重启及完整生产启动仍未验证。

<a id="backend-runtime-modules--证据与问题"></a>
#### 证据与问题

基线HEAD `201ac69`；现有Maven只有eap-api与eap-runtime。runtime同时包含HTTP控制器/DTO、模型接入、工程执行、规则、持久化与启动装配。静态导入显示application→web.dto、ai→web.dto、persistence→controller（仅JavaDoc），以及看板交付→AI快照等反向耦合；因此不能按一级包名直接机械分模块。

<a id="backend-runtime-modules--本轮边界与顺序"></a>
#### 本轮边界与顺序

保留单进程、Spring Boot、Java25、Spring AI2.0.2、既有事务/权限/执行器/API；不引入微服务、重复SPI或新调度器。

1. `eap-api`：现有稳定无Spring/模型SDK能力契约，不为拆分把实现类型塞进此包。
2. `eap-engine`：确定性工程执行、规则/专家、任务/Run及其持久化实现，现有非模型LLM业务接口/预算/缓存、RuntimeWorkspace。这里是工程业务内核，不声称纯无框架domain；现有HTTP异常映射耦合暂保留并记录，不扩大本次行为重构。
3. `eap-ai`：Spring AI/动态模型与Chat、代码生成/应用、Skill服务、SQL模型兼容桥；依赖engine。涉及AI快照的BoardApplicationEvidence/BoardCodeTaskBinding/BoardDeliveryService作为交付整合逻辑归本模块，避免engine反向依赖AI。只读Run与验证仍在engine，不归因为AI生成器。
4. `eap-web`：控制器、请求防护与WebConfiguration，包括SkillController；依赖ai/engine。跨层普通DTO迁至application.dto，AI响应迁至ai.dto，保持JSON字段和HTTP路径不变。
5. `eap-runtime`：唯一可执行启动入口、具体Bean装配、内置专家播种、application配置、Flyway资源及跨模块集成测试。规则资源随engine、聊天角色资源随ai，专家播种资源仍runtime。只此模块启用Boot repackage，其余普通jar。

依赖方向：runtime→web→ai→engine→api；直接使用某模块类型时在pom显式声明，不依赖传递关系掩盖职责。类包名原则上保留，DTO包迁移除外，不一次性更名整个命名空间。

<a id="backend-runtime-modules--资源测试与运行约束"></a>
#### 资源、测试与运行约束

- 已应用V1～V19迁移位置和内容保持runtime不变，不reset/repair/clean数据库；用户application.yml不读不改不提交。
- 测试先按实际依赖分类：可独立编译的单元测试随实现迁移，依赖启动器、跨层类、运行资源或实库门控的测试留runtime，不能为减少模块数跳过测试。
- 只读独立审查发现LlmPipelineTest/AiErrorsTest依赖runtime测试夹具，已留回runtime而非反向加test依赖；SchemaAndWiringTest改为扫描四个实现模块源码。现有同包协作跨jar保留，增加DevTools restart include统一加载项目jar，避免IDEA以安装jar引用时同包不同classloader；尚不声明IDEA人工重启联调完成。
- 新增模块边界/源码归属回归，确保runtime不是再次吸收业务源码，engine不引用ai/web，Web控制器不漏扫描。
- 重跑整个reactor与实库/真实Git条件门控；构建可执行jar并检查BOOT-INF依赖和迁移资源。启动验证不得更改或复用未知生产凭据，不另启用户Java服务；IDEA需重新导入Maven以刷新模块classpath，DevTools不能自动修复IDEA运行配置。
- 以单次Maven实际汇总统计测试，搬移后旧target报告不可混算。不把编译成功当成真实供应商调用/业务交付完成。

<a id="backend-runtime-modules--剩余非目标"></a>
#### 剩余非目标

本轮不重写CodeChangeService等大类内部业务、不分布式化、不消除所有领域/持久实现相互依赖。后续如需进一步细分engine，须先证明清晰接口与独立测试收益，避免仅为目录整齐继续拆包。

<a id="backend-runtime-modules--父任务实际验证"></a>
#### 父任务实际验证

| 阶段 | 命令/检查 | 结果 |
|---|---|---|
| 原基线 | 双门控`mvn -f backend/pom.xml test` | 647项，0失败/错误、6条件跳过 |
| RED | `-Dtest=BackendModuleBoundaryTest -Dsurefire.failIfNoSpecifiedTests=false test` | 原结构3项全部失败，确认缺模块和runtime职责过宽 |
| 完整拆分 | `EAP_RUN_BOARD_PERSISTENCE=true EAP_RUN_MISSION_GIT_ACCEPTANCE=true rtk proxy mvn -f backend/pom.xml clean verify` | BUILD SUCCESS；engine62、ai3、web46、runtime541，合计652项，0失败/错误、6跳过；并非累加旧target报告 |
| 最终边界 | 上述定向命令，engine禁止全部web命名空间 | 5项通过 |
| 可执行包 | Zip检查runtime jar | 含api/engine/ai/web四个普通依赖jar；BOOT-INF/classes仅4个启动类；19份迁移齐全 |
| 数据迁移保护 | 对比GitHEAD迁移内容（仅规范换行比较） | 19份SQL内容未变；未reset/repair/clean数据库 |

生产Java文件总数保持207：api13、engine124、ai39、web27、runtime4；runtime原194个主源码文件缩为4个装配/启动文件。18个独立测试类按归属下移，跨模块夹具/实库/启动资源检查仍runtime。eap-api合同未改，HTTP/JSON字段和任务/权限行为未改。

最终独立只读复核通过：330个既有文件全部找到迁移对应位置，291个内容未变，其余39个仅DTO包/引用、JavaDoc去耦合及源码扫描范围修改；无确证安全/逻辑阻断。独立审查读取了测试报告和实际jar，不声称另跑全量测试。后续可加强POM拓扑自动断言；当前实际依赖方向已核对。DevTools回归仅证明配置与jar正则，不是实际RestartClassLoader重启验收。

IDEA使用者需刷新Maven项目并以eap-runtime为运行classpath；主类/端口配置不变。源码目录搬移后现有DevTools进程不代表已经加载新模块，未自行启停用户IDEA服务，未宣称IDEA重新启动已验收。现有MVC防护测试、构造器检查、组件扫描与事务装配测试已在reactor中运行；完整生产启动仍按真实本机配置由用户重启核对。
<!-- record:end docs/decisions/backend-runtime-modules-2026-11-01.md -->


<a id="backend-review-hardening"></a>
## 后端评审实施（2026-11-08）

基线`1aecc1a`，开始时Git工作区干净。用户明确授权实施评审发现；无提交/推送/服务重启/数据库迁移/真实付费模型调用。

已实施：

- Chat事件以执行日志为唯一锁；终态预留一帧，失败收敛；只淘汰已完成日志。代码响应最多256个delta，修复原有`CodeGenerationBoundaryTest`的413；不改变候选内容上限。订阅异常只断开观察，不抹去结果。
- 应用工作线程最多16个在途，无任务队列；SSE在第一条运行事件后返回，执行前错误保持HTTP语义。普通Chat走Spring AI流；Responses SDK输出转为流且取消关闭资源；完整行脱敏避免凭据跨分片泄露。代码模式保留完整候选校验。
- API全路由/方法Host与明确Origin检查；写入正文JSON约束；CORS同一来源清单。未新增远端用户体系。
- MCP复用ProcessTree清理，环境白名单、写入/半行读取纳入deadline、1MiB帧上限、stderr丢弃；初始化失败关闭未注册transport；会话创建/结束互斥。Handler固定read_graph、专家grant复核和精确矩阵授权；未知端点不再仅凭名称通过只读调用。运行时不自动联网安装。
- WorkspaceFilesService只变归属和两处引用，移至engine.application.service；方法内容不变。CodeVerificationService保留调用合同，进程执行改用DefaultProcessExecutor，继承输出上限、脱敏和取消/进程树清理。其余CodeChange/BoardDelivery实现保留。

### 验证

本轮从仓库根执行`rtk proxy mvn -f backend/pom.xml clean verify`通过：engine113、ai29、web48、runtime569，合计759项，685通过、0失败/错误、74条件跳过；Boot可执行包构建通过。`git diff --check`通过。原评审默认test为746项、1错误、74跳过，失败为合法大代码响应触发事件上限。针对性干净构建已修复此失败，真实子进程夹具覆盖半行/超大帧/stderr洪泛/后代清理，流测试覆盖模型完成前delta与跨分片脱敏。官方包与模型实网、实库、用户接受仍单列待验。

### 尚未执行的结构调整与审批边界

**状态更新（2026-11-08）：用户已明确允许继续清单，但要求按engine聚合POM和可选能力子模块优化。下述拒绝原因保留为历史；不再表示缺少用户授权。当前目标与分阶段迁移方案以[模块组合决定](../decisions/backend-module-composition.md)为准；其中Board业务整合归workflow，通用候选应用归delivery。用户后续指定applications/full接替runtime，并纳入spring装配及ai/web组合拆分；api保留JAR。后续模块组合已实施首轮，详见[当前实施](../decisions/backend-module-composition.md#implementation)；此处五模块与759项仅为迁移前历史证据。**

自动审批拒绝一次性跨模块移动/删除/改写12个交付相关类，理由为依赖/编译回归风险过大。已执行的替代仅为无AI依赖的WorkspaceFilesService叶类迁移和执行器复用，不把替代认作完成整个领域拆分。

待确认的具体迁移清单：

| 当前归属 | 拟议目标 | 必须先处理的依赖 |
|---|---|---|
| eap-ai: CodeChangeService、CodeGenerationStore、CodeProposalStore、JdbcCodeGenerationStore、JdbcCodeProposalStore | eap-engine的delivery与存储边界 | TaskContext.TaskRef提取为独立任务绑定值对象；使用RuntimeWorkspace操作者标签；模型JSON解析留薄适配或明确为确定性格式校验 |
| eap-ai: CodeVerificationService、CodeVerificationProperties、CapabilityDirtyRunner | eap-engine确定性验证/执行 | 测试构造器和包可见辅助函数；维持Bean、配置键和HTTP JSON |
| eap-ai: BoardDeliveryService、BoardApplicationEvidence、BoardCodeTaskBinding | eap-engine交付领域 | 提案/生成Store和任务绑定接口落位后迁移；保留事务传播、任务先于工作区锁、PREBOUND/POST_HOC和UNKNOWN |

放行：每个依赖闭包先编译再清理构建；保留代码提案边界/事务/持久化门禁及交付同源验证；不重写已应用迁移。存储错误/HTTP错误解耦和持久事件/重启恢复需独立小切片，不以本轮内存日志修复宣布完成。IDEA重导入/实际启动和真实模型/官方MCP验收仍需独立证据。

<a id="backend-module-composition"></a>
## 后端模块组合实施（2026-11-08）

用户批准按组合规划实施。当前结构和剩余关口见[模块组合决定](../decisions/backend-module-composition.md#implementation)，主方案、台账、模块布局和开发启动说明同步；本节保留本次证据。

runtime迁入applications/full，engine七域、AI六域、Web七域与spring条件装配落地；API新增TaskRef保持无框架依赖。交付与工作流保持单向依赖，完整产品显式Import；原有进程/权限/流式安全修复保留。Expert/目录/CLI产品整合与Chat可选贡献尚未完全解耦，不据构建通过宣布BM所有关口完成。

### 验证证据（2026-11-08，当前代码）

- 从backend执行`rtk proxy mvn -f pom.xml clean verify`：32个reactor项目全部SUCCESS，日志为BUILD SUCCESS；771项，697通过、74条件跳过、0失败/错误。等价仓库根命令为`rtk proxy mvn -f backend/pom.xml clean verify`。统计仅取本次clean后的报告。
- `rtk proxy mvn -f pom.xml dependency:tree -Dscope=runtime -DoutputFile=target/runtime-dependencies.txt`：检查core/local无Spring/JDBC/模型/Servlet；chat无OpenAI/workflow/delivery；starter-local无AI/SQL/JDBC/Web服务器；web-local无AI/SQL/知识/JDBC。
- Boot包检查：24个EAP库，22份迁移，应用配置/专家资源与迁移前字节一致；旧runtime不在reactor，无库反向依赖宿主。原有Java文件名全部可追溯到新位置。
- 最小Java本地读取/拒绝、Spring缺类/禁用/覆盖、Headless Fake模型、HTTP防护、完整显式Bean图及双执行器注入均通过。完整Bean图使用Mock JdbcTemplate/事务管理器且不执行ApplicationRunner，不等于生产数据库启动。
- 过程中失败已定位修复：Windows clean目录占用、启动测试相对路径、runner包扫描、registry产品装配位置、构造器注解检查、遗漏reactor声明；新增递归POM归属测试防止漏验模块。最终结果覆盖这些修复。
- IDEA重导入未完成：computer-use Node helper两次初始化失败（Windows sandbox setup refresh），未发送界面操作；真实生产启动、实库/官方MCP/真实供应商和用户接受仍未验证。未提交、推送或重启服务。

### 2026-11-08 IDEA启动验证补充

用户报告重复capabilityHandlerRegistry后，未更改该Bean代码即在IDEA/DevTools复测通过：只创建产品注册表，默认配置退让。旧失败进程未保留，陈旧/中间编译产物仅为推断。新增主类自动配置发现回归，Maven JVM输出统一UTF-8；clean verify为772项（698通过、74跳过）、32项目成功。IDEA原配置在完整构建后成功连接既有schema22、启动8080及健康路由200；未执行新迁移。详见[启动跟进](../decisions/backend-module-composition.md#implementation)，不能提升为业务验收。

### 2026-11-08 第二轮模块边界

知识上下文通过ExpertKnowledgeAccess端口与workflow持久授权实现分离；原行锁及前后授权复查保留。CLI/能力开关/MCP管理事务下沉服务，Web层不再声明业务事务或直接调用Mapper。完整clean verify为778项（704通过、74跳过）、32项目成功；独立context依赖树不含workflow/SQL/MCP，IDEA原配置启动及健康接口通过。ExpertExecution的SQL/MCP整合、CLI产品持久管理及Chat生成/工具编排仍保留，详见模块组合当前阶段表；这些检查不代表业务人工验收。

### 2026-11-08 第三轮专家执行边界

ExpertExecution通过ExpertAnalysisPolicy和ExecutionResource替代SQL规则/模型/MCP具体依赖；SQL策略复用原逻辑，MCP注册器实现资源接口，统一范围保证部分打开失败和执行/持久化异常时逆序清理。没有新增Maven模块；workflow因专家定义/目录仍依赖SQL/MCP，不能宣称完整模块已独立。clean verify为788项（714通过、74跳过）、32项目成功；IDEA恢复启动、schema22无需迁移、健康200。业务/模型/MCP验收仍独立，详见模块组合当前阶段表。

### 2026-11-08 第四轮CLI通道边界

CliChannels移入engine-local，新增CliChannelStore；产品JdbcCliChannelStore保留原表/写事务，starter-local默认只读且可覆盖。配置库失败不再回退默认二进制，返回脱敏503。产品目录注入配置好的服务Bean。源移动后的clean编译与完整回归发现两项旧目录夹具问题，修正后全量verify为798项（724通过、74跳过）、32项目成功。IDEA恢复运行，健康/只读能力目录均200，schema22无新迁移。CLI程序登记/审批执行及Chat编排等仍见模块组合剩余清单。

### 2026-11-08 第五轮Chat生成模块边界

ai-codegen通过delivery的PrototypeVersionQuery替代原型产品服务引用，执行证据存储/测试归local，连接响应DTO归chat；删除workflow依赖，保留原型快照、生成确认和存储实现。新增独立模块回归验证无workflow/SQL/MCP类时原型上下文与证据产出，以及缺适配器/查询失败/非法UUID在模型调用前拒绝。首次离线夹具漏stream已修正；最终clean verify为802项（728通过、74跳过）、32项目成功，启动包类归属唯一、22份迁移保留。IDEA原配置恢复运行，schema22无需迁移，健康/只读能力目录均200（8项）。codegen仍组合模型/knowledge/skill/delivery；Chat可选贡献及CLI/Expert产品管理继续保留关口，详见模块组合当前表。本轮未启用实库业务、真实模型/MCP验收，未提交推送。

### 2026-11-08 第六轮专家定义查询边界

core新增RulePackQuery与ExpertScopedCapabilityQuery，原SQL规则服务/MCP注册器实现接口；专家定义及管理目录不再引用这些具体领域实现，事实JSON兼容。专家定义服务改为显式注入CapabilitySettings，移除自行创建配置服务的三参数构造。新增6项离线回归；首次测试误计Spring初始化回调已修正，最终clean verify为808项（734通过、74跳过）、32项目成功。IDEA原配置恢复运行、schema22无需迁移，健康及专家目录200，48项事实/2项规则包。workflow整体仍带SQL/MCP产品依赖；过滤类装配只证明定义服务可替换。

用户指出SQL专家应更接近专业Agent；已基于固定DAG、SQL专用请求及整轮长事务等事实形成[专家/Agent/流程边界提案](../decisions/agent-runtime-evolution.md#expert-agent-boundary)，列出兼容及EA-01～05阶段；本轮只完成EA-01依赖收敛，后续模式/运行合同待确认与实施，不声称已有自主Agent。未启用实库业务/真实模型/MCP验收，未提交推送。

### 2026-11-08 第七轮固定流程边界

EA-02首片：core提供独立WorkflowDefinition/WorkflowGraph/FixedWorkflowRunner；ExpertGraph复用结构校验/排序并保留v1与领域授权规则，ExpertExecutionService复用同一调度器。SQL/非SQL流程回归、失败传播、可选失败、缺证据、节点间预算、异常脱敏和观察失败传播均通过；预算继续包括授权查询准备，零预算不调用节点。新执行器不含模型/SQL/JDBC、无隐藏工具调用，既有SQL输出字段和资源释放路径保留。专业角色/行为绑定、SQL输入中立化和长事务仍待拆解，不标记Agent运行时完成。

完整clean verify为818项（744通过、74跳过）、32项目成功、0失败/错误；IDEA原配置恢复运行，schema22无需迁移，健康/专家目录均200（48项事实）。未启用实库业务、真实模型或MCP验收，未提交推送。当前边界与后续步骤见模块组合及专家分阶段记录。

### 2026-11-08 第八轮能力输入边界

core的CapabilityRequest不再包含SQL/检索字段，公共上下文使用input；SQL的DatabaseEvidenceInput及local的WorkspaceSearchInput定义各自输入，原产品HTTP请求组合接口。处理器按显式接口读取，缺少/错误输入返回缺证据且不操作数据库/进程，持久资料授权和服务端工作区边界保留。Java调用方需要适配input()及领域接口，HTTP六字段和URL保持。EA-02仍未完成应用请求/角色/行为绑定及长事务解耦。

新增10项回归；定向及完整clean verify均成功，32项目、828项（754通过、74跳过）、0失败/错误。IDEA原配置恢复运行，schema22无新迁移，健康/专家目录200。未启用实库业务、真实模型/MCP验收，HTTP回归使用Mock服务；规划已同步，未提交推送。

### 2026-11-08 第九轮专家策略选择边界

ExpertAnalysisPolicyResolver允许宿主从已加载专家定义选择策略；执行服务解析一次，将策略引用与不可变事实词表绑定单次Run，规则/判定/汇总/增强共用所选策略。缺配置或解析失败在执行资源/工具前拒绝；完整产品显式保留SQL兼容默认，支持用户Resolver Bean覆盖。原固定策略Java构造保留，无新增持久绑定表或HTTP字段。新增5项回归覆盖多策略、并发、在途选择/词表隔离和缺配置拒绝；策略对象仍须自身线程安全，非深复制。

完整clean verify为833项（759通过、74跳过）、32项目成功、0失败/错误。IDEA原配置恢复运行，schema22无需迁移，健康/专家目录200；未启用实库业务、真实模型/MCP验收。专业角色/行为持久绑定、应用SQL合同、长事务仍待，未声称自主Agent完成；规划同步，未提交推送。
