# 实现审查与后端架构演进总览

## 当前结论与阅读方式

当前模块为api → engine → ai → web → runtime的被依赖方向，运行依赖方向相反；仅runtime为Boot宿主。8e020d5拆分通过干净652项回归（6条件跳过），19份迁移未变；不代表IDEA实际重启或完整产品验收。当前结构以[架构](../architecture.md)和[模块布局](../module-layout.md)为准。

以下按主题合并完整阶段记录，日期保留在记录中而不再作为文件名。记录中的“本轮/未提交/下一步”和测试数字仅代表当时快照；不得覆盖上面的当前结论、有效产品合同或用户授权。原文完整保留（只调整标题层级、锚点及链接），后续更新本总览，不另建日期报告。

## 记录索引

| 原记录 | 完整章节 |
|---|---|
| `docs/decisions/implementation-review-2026-10-31.md` | [已开发内容审查与纠偏（2026-10-31）](#implementation-review) |
| `docs/decisions/backend-runtime-modules-2026-11-01.md` | [后端 runtime 模块拆分](#backend-runtime-modules) |

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
