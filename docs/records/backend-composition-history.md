# 后端模块组合与 SQL Agent 实施记录

本记录完整迁入原模块组合决定的逐轮实施、失败、跳过与真实供应商证据。原文中的“本轮”“未推送”和待验项按各轮时间理解，不覆盖后续结果。当前边界看[模块组合决定](../decisions/backend-module-composition.md)，当前基线和验收看[台账](../planning-status.md#validation-baseline)。

2026-11-09：阶段提交 `c76cded` 与工作台/SQL证据提交 `2c7e87b` 已按用户授权推送；整理开始时本地HEAD与origin/main一致。前轮实库验证与本轮环境门控不同，不合并成一次执行。

### 首轮迁移验证证据（2026-11-08，保留历史快照）

- 从backend执行`rtk proxy mvn -f pom.xml clean verify`：32个reactor项目全部SUCCESS，日志为BUILD SUCCESS；771项，697通过、74条件跳过、0失败/错误。等价仓库根命令为`rtk proxy mvn -f backend/pom.xml clean verify`。统计仅取本次clean后的报告。启动目录配置补齐后再次执行 `rtk proxy mvn -f pom.xml verify`，32项目全部SUCCESS，退出码0，测试总数与上述一致。
- `rtk proxy mvn -f pom.xml dependency:tree -Dscope=runtime -DoutputFile=target/runtime-dependencies.txt`：检查core/local无Spring/JDBC/模型/Servlet；chat无OpenAI/workflow/delivery；starter-local无AI/SQL/JDBC/Web服务器；web-local无AI/SQL/知识/JDBC。
- Boot包检查：24个EAP库，无重复EAP类，22份迁移，应用配置/专家资源与迁移前字节一致；旧runtime不在reactor，无库反向依赖宿主。原有Java文件名全部可追溯到新位置。
- 最小Java本地读取/拒绝、Spring缺类/禁用/覆盖、Headless Fake模型、HTTP防护、完整显式Bean图及双执行器注入均通过。完整Bean图使用Mock JdbcTemplate/事务管理器且不执行ApplicationRunner，不等于生产数据库启动。
- 过程中失败已定位修复：Windows clean目录占用、启动测试相对路径、runner包扫描、registry产品装配位置、构造器注解检查、遗漏reactor声明；新增递归POM归属测试防止漏验模块。最终结果覆盖这些修复。
- 附加静态检查：`git diff --check` 与 `git diff --cached --check` 均通过；2份Python脚本AST解析、3份PowerShell脚本Parser检查通过；新增文本文件无UTF-8 BOM或行末空白。脚本未执行真实服务/数据库调用。
- IDEA重导入未完成：computer-use Node helper两次初始化失败（Windows sandbox setup refresh），未发送界面操作；真实生产启动、实库/官方MCP/真实供应商和用户接受仍未验证。未提交、推送或重启服务。

### IDEA启动故障跟进（2026-11-08）

用户18:26日志报告默认/产品 `capabilityHandlerRegistry` 重复；当前代码未修改该Bean声明前，用原IDEA配置及DevTools重新调试已越过此故障。调试事件只命中产品工厂，类加载器为RestartClassLoader、settings为CapabilitySettings，默认工厂未命中；原配置成功启动Tomcat 8080，Flyway确认schema版本22无需迁移，内置资源Seeder正常执行。旧失败进程已退出，无法据此确定当时是否使用了不一致/陈旧编译产物；此为待证推断，不宣称已复现该重复Bean根因。不启用Bean覆盖，也不删除产品权限设置。

新增 `FullApplicationCompositionTest.applicationEntryPointDiscoversAutoConfigurationsAndKeepsProductRegistry`：直接使用EapApplication发现全部自动配置，禁止Bean覆盖，断言产品注册表唯一及双执行器保持；隔离JdbcTemplate/事务，禁用Flyway/模型，不执行Runner。弥补原手工列举自动配置的测试覆盖缺口。

用户的RTK日志终止于非UTF-8输出错误，不能作为clean verify成功证据。新增backend/.mvn/jvm.config，统一Maven JVM的file/stdout/stderr编码为UTF-8；不改变用户全局JDK/IDE设置。运行clean构建时先停止DevTools应用，完成后再启动，避免逐模块编译触发中间状态热重启。

本次最终验证：仓库根执行 `rtk proxy mvn -f backend/pom.xml clean verify`，32项目SUCCESS、退出码0；772项，698通过、74条件跳过、0失败/错误。`rtk proxy mvn -f backend/pom.xml help:evaluate -Dexpression=stdout.encoding -q -DforceStdout` 返回UTF-8。`git diff --check`通过。干净构建完成后18:33再次从IDEA原配置启动，DevTools开启、22份迁移校验成功且无需执行新迁移，`GET http://127.0.0.1:8080/api/health` 返回200及status=ok；服务保持运行，临时诊断覆盖未写入运行配置，三个本次新增断点已清除。此证据仅确认当前启动和健康路由，不替代实库业务、MCP或模型效果验收；之前771项及IDE不可用说明保留为历史。

### 第二轮：知识上下文授权端口与管理事务（2026-11-08，保留阶段快照）

本轮沿用既有Handler、授权表和服务；没有新建能力注册表或更改HTTP URL/JSON。`ExpertKnowledgeAccess`放在knowledge领域，`WorkflowExpertKnowledgeAccess`适配原ExpertDefinitionMapper/Service并强制参与已有事务（MANDATORY）。ai-context移除workflow Maven依赖，仍在10秒事务内锁定专家定义、检查revision/enabled/声明与持久授权交集，检索后再次验证版本/授权/开关；锁不会在进入模型调用后延续。其他消费者必须提供遵守同等锁与实时读取合同的实现，缺少适配不能启动该服务。

CapabilitySettings.save、CliChannels.configure、McpServerService.save/delete/activate现在拥有服务事务。MCP激活的省略字段保留、校验和写入在同一事务中；删除服务器与清理授权一并提交或回滚。Controller只保留HTTP映射；CLI能力对应程序的查询移入既有CliProgramService；Settings的引用检查依赖既有CapabilityUsageQuery端口。没有增强为跨事务串行化，也不以代理测试代替真实数据库并发验收。

新增最小classpath知识引用测试（没有workflow/SQL/MCP类）、非HTTP服务调用事务/失败回滚测试、授权适配缺事务拒绝测试，以及Web层禁止事务/直接持久访问的架构回归。原Chat撤权/旧revision/越权/引用限额回归保持。后续仍需拆解ExpertExecution的SQL判断/模型增强/MCP生命周期、产品CapabilityCatalog/CLI持久管理，以及AiChatApplication的可选生成/工具贡献；本轮不将这些标记为已完成。

第二轮验证结果：

- 定向reactor测试：`rtk proxy mvn -f pom.xml -pl :eap-full-application -am test '-Dtest=KnowledgeContextCompositionTest,ManagementTransactionBoundaryTest,ExpertKnowledge*Test,FullApplicationCompositionTest,CapabilityManagementTest,CapabilitySettingsTest,CliChannelsTest' '-Dsurefire.failIfNoSpecifiedTests=false'`（backend目录），通过；实库门控保持跳过。
- 仓库根 `rtk proxy mvn -f backend/pom.xml clean verify`：32项目全部SUCCESS，退出码0；778项，704通过、74条件跳过、0失败/错误。相对上一轮新增6项有效回归。
- 仓库根 `rtk proxy mvn -f backend/pom.xml -pl :eap-ai-context -am dependency:tree '-Dscope=runtime' '-DoutputFile=target/runtime-dependencies.txt' -q`：确认context实际依赖树不含workflow/SQL/MCP；classpath回归独立证明这些类不存在时仍可按授权检索并返回引用。
- IDEA原配置重启成功（DevTools启用），现有22份迁移校验通过，无新迁移；健康接口200/status=ok，服务保持运行。未启用实库写入测试或真实模型/MCP调用；模拟事务回滚仅验证代理边界，不冒充数据库持久回滚/并发验收。
- `git diff --check`通过；规划当前行、台账与本记录已同步。未提交或推送。

### 第三轮：专家分析策略与执行资源生命周期（2026-11-08，保留阶段快照）

ExpertExecutionService现在只依赖core中的ExpertAnalysisPolicy和ExecutionResource接口，不再直接引用DeterministicSqlAnalyzer、RulePackService、SqlFactVocabulary、PromptPreprocessor、SqlExpertService或McpSessionRegistry。完整产品显式Import sql模块的SqlExpertAnalysisPolicy，沿用既有规则解析/缺失判定、事实词表、规则摘要、模型路由/压缩和状态映射。没有默认放行的空分析策略：创建调度器必须提供策略；模型输出仍标为unverified-observation，失败/无效SQL不调用模型，响应和持久化使用同一个增强状态。

McpSessionRegistry实现ExecutionResource，仍用原executionId/expertId隔离和授权流程。core的ExecutionResourceScope按组合顺序打开、逆序关闭；部分打开失败清理已打开资源；任务持久化失败也关闭会话；关闭幂等，多个清理失败均尝试释放并附加suppressed异常，不覆盖原始执行异常。MCP自身原有单会话close失败处理保持。资源打开不会触发MCP协议/工具调用，仍由授权Handler在节点执行时创建会话。

本轮没有新增Maven模块或删除workflow的SQL/MCP依赖：ExpertDefinition、CapabilityCatalog、产品HTTP请求/响应仍带产品语义；不能把类级替换能力描述为完整workflow在无SQL/MCP classpath下可用。定向测试用自定义local.checked事实策略和空资源集合验证调度器可替换，既有SQL/MCP回归保留。后续重点为专家定义/产品目录的模块依赖、CLI持久管理和Chat生成/工具可选贡献。

第三轮验证：

- backend目录定向reactor测试：`rtk proxy mvn -f pom.xml -pl :eap-full-application -am test '-Dtest=ExecutionResourceScopeTest,SqlExpertAnalysisPolicyTest,ExpertExecutionTest,FullApplicationCompositionTest,BackendModuleBoundaryTest' '-Dsurefire.failIfNoSpecifiedTests=false'`通过；初次新增测试遗漏CapabilityHandler import导致编译失败，已修正并重跑通过。
- 仓库根 `rtk proxy mvn -f backend/pom.xml clean verify`：32项目SUCCESS，退出码0；788项，714通过、74条件跳过、0失败/错误，比第二轮新增10项回归。涵盖部分打开失败清理、逆序/幂等关闭、异常保留、无Spring资源组合、SQL增强状态、存储失败关闭MCP会话、非SQL事实策略及架构依赖边界。
- IDEA原配置/DevTools恢复启动，现有schema22校验通过且无需迁移，健康接口200/status=ok；服务保持运行。未启用门控实库业务测试或真实供应商/MCP调用；启动/健康不等于这些业务验收。
- `git diff --check`通过，新增文本UTF-8无BOM/行末空白；主方案、台账、模块布局及本决策当前行已同步。未提交或推送。

### 第四轮：CLI通道独立复用与存储失败拒绝（2026-11-08，保留历史快照）

CliChannels保持原Java包名并从workflow迁入engine-local，不再引用Spring/JDBC；CliChannelStore端口归local，JdbcCliChannelStore归workflow并复用原eap.cli_channel表/字段/SQL。二进制校验、动态读取、程序级共享覆盖与旧能力键兼容、显式版本探测/参数数组/输出脱敏限额保留。写入事务从通道迁入JDBC适配器，非HTTP调用仍通过适配器代理提交；HTTP URL/响应字段保持。

Java消费者可构造CliChannels(store, executor)，执行器由消费者管理，单参数构造不再隐式创建DefaultProcessExecutor。starter-local自动装配只读默认store及CliChannels，可由用户Bean覆盖；缺少持久适配不能修改配置。完整产品显式选择JdbcCliChannelStore，CapabilityCatalog的容器构造改为注入配置好的通道/设置/MCP服务，不再自行绕开产品Bean装配。CLI配置并非执行授权，既有Capability开关、工作区、命令和审批边界未放宽。

安全修正：原overrides捕获数据库异常后返回空Map，可能让执行改用默认PATH二进制；现在存储异常/null结果/不完整绑定均拒绝，JDBC适配返回503 CLI_CHANNEL_STORE_UNAVAILABLE且不泄露底层错误；只有成功空查询或显式只读默认store才允许使用shipped二进制。此为有意行为变化：配置存储不可用时相关能力/目录可能返回不可用，不能把它显示为正常默认配置。

本轮只独立CLI通道能力；CliProgramService/Mapper、审批/任务执行、产品目录仍留workflow，未新建空模块或宣称完整CLI管理脱离数据库。Chat生成/工具可选编排及专家定义/目录依赖仍为后续项。

第四轮验证过程与边界证据：

- 定向reactor测试覆盖CliChannelsTest、JdbcCliChannelStoreTest、CapabilityManagementTest、ManagementTransactionBoundaryTest、FullApplicationCompositionTest、ModuleCompositionTest、SchemaAndWiringTest；构造器检查不识别全限定@Autowired的问题已用标准import修正，重跑通过。
- 源码移动后执行 `rtk proxy mvn -f backend/pom.xml clean verify`，各模块重新编译成功；完整回归发现CapabilityCatalogTest旧夹具缺少注入服务，并把专家行无差别返回给CLI配置查询；已补齐服务Bean并按SQL区分返回，相关7项测试重跑通过。该次clean verify为失败记录，不记为成功。
- `rtk proxy mvn -f backend/pom.xml -pl :eap-spring-boot-starter-local -am dependency:tree '-Dscope=runtime' '-DoutputFile=target/cli-runtime-dependencies.txt' -q`（仓库根）通过；local实际依赖无Spring/JDBC/workflow，starter-local不带SQL/workflow/模型/Servlet容器。独立local测试也验证缺少Spring/JDBC/workflow类时可读取/覆盖/拒绝/显式探测。
- 原有通道与程序映射测试、写事务代理测试、产品主类自动配置测试保留；没有开启实库写入测试、真实模型或MCP调用。

第四轮最终结果：修正测试夹具后，仓库根 `rtk proxy mvn -f backend/pom.xml verify` 全量重跑/打包成功，32项目SUCCESS、退出码0；798项（724通过、74条件跳过）、0失败/错误，比第三轮新增10项。源移动后的clean已清除旧产物，最终verify未再改动生产代码。IDEA原配置/DevTools恢复运行，schema22无需迁移；GET /api/health与GET /api/capabilities均200，目录返回8项。只读目录验证不执行CLI探测/模型/MCP；未执行实库写入门控测试。`git diff --check`通过，无重复迁移源文件，新增文本UTF-8无BOM；规划/台账已同步，未提交推送。

### 第五轮：Chat生成移除workflow依赖（2026-11-08，保留历史快照）

ai-codegen仅因原型产品查询、执行证据存储及连接响应DTO而携带整个workflow。现将只读PrototypeVersionQuery归engine-delivery；原PrototypeVersionService直接实现该接口，复用原存储与不存在时的拒绝语义；AiChatApplication不再引用产品服务类。未建立第二份原型存储，不提供草稿回退，任务绑定代码生成继续使用CodeGenerationStore的任务/原型快照和UNKNOWN互锁。

ExecutionArtifactStore及FileExecutionArtifactStore由workflow迁入engine-local，本地文件回归同时迁入local；AiConnectionAssignment由workflow迁入ai-chat。三者保留Java包名和行为，证据类型白名单、可信根、junction越界拒绝、CREATE_NEW及哈希保持。codegen POM删除workflow依赖；完整产品无需改变Import列表，PrototypeVersionService按接口注入，主类装配回归检查同一服务实例。

独立CodegenCompositionTest在实际无workflow/SQL/MCP/Web控制器classpath下验证保存原型进入离线模型上下文与本地证据产出；另覆盖缺查询适配器、查询失败及非法UUID在调用模型前拒绝。既有完整工程生成/确认后写入/目标路径/原型哈希回归保留。本轮未将产品Chat所有用例拆成可选贡献，knowledge/skill/model-openai/delivery仍为codegen依赖；CLI登记审批、Expert定义/产品目录与JDBC事务整合仍见BM-02/04/05/06剩余项。

定向验证：仓库根 `rtk proxy mvn -f backend/pom.xml -pl :eap-full-application -am test '-Dtest=CodegenCompositionTest,FileExecutionArtifactStoreTest,EngineeringTaskFlowTest,FullApplicationCompositionTest,BackendModuleBoundaryTest' '-Dsurefire.failIfNoSpecifiedTests=false'` 通过。首次新增模型夹具只实现call而Chat实际调用stream，测试失败；已补齐stream并检查拒绝路径不调用call/stream后重跑通过，未改变生产流式合同。最终验证：

- 仓库根 `rtk proxy mvn -f backend/pom.xml clean verify`：32项目全部SUCCESS、退出码0；137份测试报告，802项（728通过、74条件跳过）、0失败/错误，比第四轮新增4项。文件存储2项回归从宿主迁到local，不重复计数。
- 仓库根 `rtk proxy mvn -f backend/pom.xml -pl :eap-ai-codegen -am dependency:tree '-Dscope=runtime' '-DoutputFile=target/codegen-runtime-dependencies.txt' -q` 通过；codegen实际依赖树无workflow/SQL/MCP/web/host，local无Spring/JDBC/模型。Boot包无重复EAP库类，迁移类唯一归属local/chat/delivery；22份Flyway迁移保留。
- IDEA原配置/DevTools成功恢复运行（19:10），既有schema22校验通过、无需迁移；GET /api/health为200/status=ok，GET /api/capabilities为200/8项。仅启动及只读路由验证；未启用门控实库业务测试，也未调用真实模型或MCP，不提升为业务接受。
- `git diff --check`、`git diff --cached --check`通过；迁移源码/测试唯一归属，新文本UTF-8无BOM。主方案当前进度/边界、完成台账、模块布局和本决定已同步。未提交或推送。


### 第六轮：专家定义与领域查询分离（2026-11-08，保留历史快照）

core新增只读RulePackQuery和ExpertScopedCapabilityQuery，复用原RulePackService与McpServerRegistry实现；不创建平行规则库或能力注册中心。ExpertDefinitionService不再引用SQL规则服务/MCP注册器具体类型，ExpertManagementService从规则查询取得事实目录。SQL事实适配保留key/type/group/description/producedBy字段，JSON等价回归覆盖原目录合同。规则解析与数据库失败策略、MCP enabled/trusted/白名单与授权校验继续由原实现承担。

ExpertDefinitionService改为唯一四参数构造，必须注入宿主的CapabilitySettings；移除原三参数构造自行new配置服务的隐式分支。已有显式构造测试同步提供settings，完整应用回归确认同一容器Bean。规则/专家范围能力查询为必需接口，消费者可以显式提供空领域实现，缺配置不自动放开授权。启用前校验、停用撤权、事务注解与SQL保持。

定向回归通过：仓库根 `rtk proxy mvn -f backend/pom.xml -pl :eap-full-application -am test '-Dtest=ExpertDefinitionCompositionTest,RulePackQueryTest,ExpertScopedCapabilityTest,ExpertWorkflowTest,FullApplicationCompositionTest,ManagementTransactionBoundaryTest,SchemaAndWiringTest' '-Dsurefire.failIfNoSpecifiedTests=false'`。新增用例覆盖过滤SQL/MCP实现后的定义服务装配、自定义规则需求与缺失拒绝、实时工具撤权、停用配置生效、校验失败无授权写入/停用撤权、目录事实JSON兼容。首次测试误把Spring初始化JdbcTemplate的回调当作业务查询，已限定断言到服务调用阶段后重跑通过。

边界：过滤类装配只证明ExpertDefinitionService可替换领域查询，不证明完整workflow无SQL/MCP依赖；产品目录、固定能力/规则词表、JDBC授权表仍是产品整合。用户进一步提出专家更像专业Agent，本轮已形成[专家/行为/固定流程职责与分阶段提案](../decisions/agent-runtime-evolution.md#expert-agent-boundary)，不把本轮查询接口改造描述成Agent运行时，不扩展现有90秒事务内的工具/模型循环。最终验证：

- 仓库根 `rtk proxy mvn -f backend/pom.xml clean verify`：32项目SUCCESS、退出码0；139份报告、808项（734通过、74条件跳过），0失败/错误；本轮新增6项。没有启用实库业务/真实模型/MCP门控。
- IDEA原配置/DevTools恢复启动（19:20），schema22校验通过且无需迁移；GET /api/health与GET /api/experts/catalog均200，专家目录返回48项事实及2项规则包，事实字段仍为key/type/group/description/producedBy。只读目录成功不等于专家业务或Agent效果验收。
- `git diff --check`、`git diff --cached --check`通过，新增文件UTF-8无BOM；主方案、台账、模块布局和专家行为提案同步。没有新增模块、改写迁移或内置专家清单；未提交/推送。


### 第七轮：固定流程从专家执行中提取（2026-11-08，保留历史快照）

core新增WorkflowDefinition、WorkflowGraph、FixedWorkflowRunner；保持一个图校验/排序/执行实现。产品ExpertGraph移除重复的拓扑与结构逻辑，通过v1适配继续承担能力词表、规则和专家授权校验；ExpertExecutionService移除内嵌节点循环，回调复用原Handler、即时观察和授权路径，领域分析与Task保存留产品服务。未新增Maven模块、自动执行器或能力注册中心。

消费方可只依赖core，以WorkflowDefinition和显式回调运行一个确定性本地流程；不要求Spring/JDBC/SQL/MCP/产品workflow类。运行器不发现或授予能力，不执行I/O；Callback是宿主受信执行边界。原SQL检查通过同一运行器，专业Agent尚未接线。复杂条件分支、并发、重试、自主规划与持久恢复不在本片；结构单入口/无环和100节点/500连线上限保留。

验证覆盖非SQL独立流程、拓扑顺序、必需失败跨层阻断与独立分支、可选失败及不完整证据、恰好耗尽预算/零预算无调用、非法图无副作用、异常脱敏、观察保存失败立即向调用方抛出和流程集合不可变。定向命令（仓库根）`rtk proxy mvn -f backend/pom.xml -pl :eap-full-application -am test '-Dtest=FixedWorkflowRunnerTest,ExpertWorkflowTest,ExpertExecutionTest,ExpertScopedCapabilityTest,ExpertDefinitionCompositionTest,RuleRequirementsTest,FullApplicationCompositionTest,BackendModuleBoundaryTest' '-Dsurefire.failIfNoSpecifiedTests=false'`通过；随后补充原授权查询消耗计入45秒调度预算及零预算回归，纳入完整构建。

边界与有意调整：新执行器在预算恰好用尽时即拒绝新节点；预算文本不硬编码45秒。该预算不会强制终止运行中的回调，原进程/网络超时取消边界仍由执行能力承担。SQL专用Request、90秒整轮事务、产品资源词表和workflow的SQL/MCP依赖继续保留；EA-02仅完成流程提取，角色/行为合同与EA-03/04尚待。详见[专家分阶段记录](../decisions/agent-runtime-evolution.md#expert-agent-boundary)。最终验证：仓库根 `rtk proxy mvn -f backend/pom.xml clean verify`，32项目全部SUCCESS、退出码0；140份报告、818项（744通过、74条件跳过）、0失败/错误，本轮新增10项。IDEA原配置/DevTools恢复运行（19:29），schema22校验通过且无需迁移；GET /api/health与GET /api/experts/catalog均200，事实目录48项。未启用实库业务、真实模型或MCP门控；启动/目录成功不等于Agent业务验收。`git diff --check`、`git diff --cached --check`通过，新文件UTF-8无BOM；主方案当前行、完成台账、模块布局和EA-02进度已同步。未提交/推送。

### 第八轮：能力输入去除SQL通用接口耦合（2026-11-08，保留历史快照）

core的CapabilityRequest改为领域输入标识，CapabilityContext.sql重命名为input，并提供显式领域接口读取requestAs；engine-sql的DatabaseEvidenceInput承接databaseId/explainPlan，engine-local的WorkspaceSearchInput承接pattern。原ExpertExecutionService.Request仍保留六字段HTTP合同并组合这两个接口。SqlParse/DatabaseMetadata/DatabaseExplain/WorkspaceSearch处理器改为读取各自需要的输入，不再要求本地、知识或MCP调用方具备全部SQL字段。

缺少/错误输入时保持缺证据语义且不进行数据库/进程操作，修复原null请求可导致空指针的问题。数据库资料ID只表示请求目标，原databaseGranted复查保留；检索文本无法选择执行工作区，原500字符上限、脱敏及argv执行继续复用。SQL解析仍只读取服务端准备/脱敏后的领域文本，未重新读取原始HTTP SQL。

本轮Java接口发生有意变化：自定义请求应实现对应领域接口，CapabilityContext.sql()改为input()；JSON/API和数据库保持。WorkspaceSearchHandler的产品装配仍在workflow，SQL专用应用请求、分析输出、专业行为绑定和长事务尚未拆完；此片是EA-02输入边界的一部分，不是Agent实现或全workflow可裁剪的证明。

定向命令（仓库根）`rtk proxy mvn -f backend/pom.xml -pl :eap-full-application -am test '-Dtest=WorkspaceSearchInputTest,DatabaseEvidenceInputTest,WorkspaceSearchInputBoundaryTest,ExpertInputCompatibilityTest,ExpertExecutionTest,FullApplicationCompositionTest,BackendModuleBoundaryTest' '-Dsurefire.failIfNoSpecifiedTests=false'`通过。新增10项回归覆盖无SQL/Spring/产品类的本地输入、同名字段不冒充契约、缺输入无外部操作、持久资料授权、计划缺失/畸形、SQL解析、检索限额/工作区、两个原HTTP入口全部字段兼容。最终验证：仓库根 `rtk proxy mvn -f backend/pom.xml clean verify`：32项目全部SUCCESS、退出码0；144份报告、828项（754通过、74条件跳过），0失败/错误。IDEA原配置/DevTools恢复运行（19:39），schema22校验通过且无需迁移，健康及专家目录GET均200。未启用实库业务/真实模型/MCP门控，HTTP兼容回归使用Mock服务，不视为真实专家业务接受。`git diff --check`及`git diff --cached --check`通过；新增文件UTF-8无BOM、归属唯一。主方案当前行、台账、模块布局及EA-02进度同步。未提交推送。

### 第九轮：专家分析策略选择与执行隔离（2026-11-08，保留当时快照；持久绑定见第十轮）

ExpertAnalysisPolicyResolver归core；ExpertExecutionService生产构造消费解析器，基于已加载专家选定策略，单次Run持有策略引用及不可变allowedFacts快照。规则解析/节点事实/判定/汇总/模型增强均使用同一个策略，不在共享Service字段里切换。原直接传ExpertAnalysisPolicy的构造保留为显式固定策略适配。

空/未配置策略在资源和工具打开前返回503；解析器异常不触发回退。完整宿主显式装配SqlExpertAnalysisPolicy的固定兼容解析器，用户自定义Resolver Bean可覆盖且无需开启Bean覆盖；生产入口测试核对默认策略，完整Bean图测试核对自定义解析器确实注入执行服务。未新增Maven模块、持久策略表或并行能力注册中心，HTTP、清单与数据库均不变。

定向命令（仓库根）`rtk proxy mvn -f backend/pom.xml -pl :eap-full-application -am test '-Dtest=ExpertPolicySelectionTest,ExpertExecutionTest,FullApplicationCompositionTest,SchemaAndWiringTest,BackendModuleBoundaryTest' '-Dsurefire.failIfNoSpecifiedTests=false'`通过。新增5项回归验证同一服务多专家策略、并发不串用、选择器/事实集合变化不影响在途Run、缺策略/解析失败前置拒绝；现有SQL与MCP回归保留。

这只提供专业分析策略选择的宿主扩展点，不等同专业Agent自主行为，也不是专家角色/行为持久绑定完成。完整产品默认仍统一采用SQL兼容策略；应用层SQL请求、目录事实词表、90秒事务及workflow跨域依赖仍待后续拆分。最终验证：仓库根 `rtk proxy mvn -f backend/pom.xml clean verify`，32项目SUCCESS、退出码0；145份报告、833项（759通过、74条件跳过），0失败/错误。IDEA原配置/DevTools恢复运行（19:48），schema22校验通过且无需迁移；健康及专家目录GET均200。未启用实库业务、真实模型/MCP门控，不提升为专业Agent业务接受。`git diff --check`、`git diff --cached --check`通过，新增/修改Java文本UTF-8无BOM；主方案当前行、台账、布局和EA-02进度同步。未提交推送。


### 第十轮：专业行为版本持久绑定（2026-11-08，历史快照；自主模式见第十一轮）

当前已贯通后端专业分析行为的目录、保存、重新加载、启用及执行选择。`ExpertManifest.behavior`采用严格的`{"id":"sql-analysis","version":1}`合同，存入既有`eap.expert_definition.manifest` JSONB；没有新表、新迁移或历史资源批量改写。core的不可变`ExpertBehaviorCatalog`仅把宿主显式安装的行为版本映射到已有`ExpertAnalysisPolicy`，不是能力注册中心或第二个执行器。full宿主当前只发布SQL分析v1，执行模式为`fixed-workflow`；测试中的其他行为不是已交付的专业Agent。

- 兼容：旧清单省略behavior时按宿主明确的SQL v1运行；首次通过管理服务保存即写入显式版本。更新时省略字段保留已存绑定，显式提交已安装版本才能切换；显式null、错误类型/附加字段、非法id/版本及未安装版本拒绝。保存保留编辑器坐标等未知扩展字段。
- 原子性：UPSERT在数据库行上保留旧编辑器省略的绑定，并返回实际存储清单；事务内再次校验该绑定，避免陈旧预读覆盖新版或绕过可用性检查。失败回滚整次草稿更新与授权删除；内置专家的不可覆盖约束同时在UPSERT条件中检查。
- 授权：保存依然停用专家、递增revision并删除知识/数据库/MCP grants；变更行为后必须重新启用并校验资源。行为实现被移除时启用/执行拒绝，但仍允许停用撤权。不会从清单加载Java类、启动新工具或暗中升级行为版本。
- 执行：绑定只从已加载的专家清单解析一次；未知版本返回503且不打开资源/工具。响应behavior与每个节点持久观察metadata中的behavior记录实际id/version，后续修改专家不会改写旧任务证据；这不是跨重启执行恢复。
- 接口：现有`POST /api/experts`继续接收manifest字符串，保存结果新增behavior；`GET /api/experts`保留原始清单，`GET /api/experts/catalog`新增behaviors与legacyBehavior。`/validate`和启用复用相同可用性校验。没有增加自主Agent执行入口。
- Java组合：ExpertDefinitionService需要显式注入与执行服务一致的ExpertAnalysisPolicyResolver；自定义宿主可发布ExpertBehaviorCatalog。旧fixed(policy)仅接受无绑定清单，不再忽略显式版本；可持久编辑的自定义Resolver必须提供目录/兼容绑定并按精确版本解析。

验证：仓库根 `rtk proxy mvn -f backend/pom.xml clean verify`，进程仅额外设置`EAP_RUN_EXPERT_BEHAVIOR_PERSISTENCE=true`，数据库密码在子进程环境中复用既有IDEA本地配置（不打印/提交）；未开启其他数据库或真实模型门禁。32项目全部SUCCESS、退出码0；148份报告、848项（774通过、74条件跳过）、0失败/错误，完成于20:07:53。新增15项中4项真实PostgreSQL回归全部通过，使用随机专家/任务记录并清理；无DDL/reset/repair，未修改既有业务记录。回归证明提交后独立连接/新服务重载、绑定切换/撤权/重新启用、未知版本拒绝、确定性复现陈旧预读后的事务回滚，以及执行后再改专家仍保留原任务行为版本。Handler/专业策略使用测试替身，不计作真实SQL性能或模型效果验收。初次实库验证缺少命令行数据库密码，未写数据；补充既有配置后通过。补充历史验证时的测试方法名编译错误已修正并经最终clean verify通过。

IDEA原配置/DevTools于20:08恢复运行；22份迁移校验通过，无迁移。GET `/api/health`为ok；GET `/api/experts/catalog`返回sql-analysis v1/fixed-workflow；POST `/api/experts/validate`对已安装v1返回valid=true，对未安装v999返回false（仅校验，无保存）。`git diff --check`及`git diff --cached --check`通过；新增Java UTF-8无BOM，保留用户既有修改，未提交/推送。主方案进度及EX-01、完成台账、EA-02阶段表和模块布局已同步。

剩余：专业目标/领域输入输出、各行为独立规则目录及规则需求校验、前端选择器、Agent有限工具决策、90秒整轮事务拆分与持久运行机制；当前SQL产品规则词表和应用请求仍保留，完整workflow未成为所有领域独立可选。前九轮验收数字与当时“尚未持久绑定”的描述保留为历史，不作为当前进度。


### 第十一轮：SQL只读自主Agent（2026-11-08，历史快照；恢复与审批见第十二轮）

用户授权后，新增专业行为sql-readonly-agent v1并在现有目录明确标为agent。保留sql-analysis v1固定流程；新的eap/v2定义把专业goal/允许tools与steps/edges分离，拒绝旧清单隐式升级。core新增Agent定义与ExpertAgentAccess端口，ai-sql承接Spring AI自主工具交互，workflow实现既有表上的短事务授权/Task记录，web-ai只转发启动/取消；没有新Maven模块、数据库迁移、能力注册表、模型协议或手写工具循环。web-ai新增ai-sql依赖；engine不依赖ai/web，完整宿主显式装配。

执行先确定性解析SQL，随后模型依据实际观察自主选择允许工具、追问或结束。只读SQL/快照/知识Handler继续复用原能力开关、声明和持久授权。模型不能改变请求目标或授予权限；终结工具的文本是unverified，证据缺失/规则阻断覆盖完成状态。所有模型调用都在事务外，本地资料/知识读取在短事务内重验定义/revision/授权并持锁；现有固定DAG的90秒事务暂不改动。开始/结束使用现有Task/Observation持久化，执行UUID一次性占用，行为版本/revision、取证和终态可从既有任务历史读取。执行过程中尚未逐步落盘，不宣称后台持续或恢复能力。

边界与限制见[EA-03合同](../decisions/agent-runtime-evolution.md#expert-agent-boundary)：4个并发槽、45秒等待截止、最多6轮模型/6次工具、单轮禁止多工具批次、重复证据源拒绝；上下文/响应/证据限额、取消、版本/开关变更重验。仅当前chat-completions工具协议可用，纯文本Responses/ChatGPT连接前置拒绝。异常只返回受控代码，不保存SDK异常信息；迟到结果不能覆盖已取消/超时终态，未响应中断的Provider继续占槽至真正退出。

后端使用方法（不是已执行的真实模型演示）：

1. `GET /api/experts/catalog`读取behaviors，选择`sql-readonly-agent`版本1。
2. 通过原`POST /api/experts`保存以下清单的JSON字符串（外层仍是`{id,name,manifest}`），再调用原activation接口启用；真实数据库资料/知识库须自行填入目录UUID并授权。

```json
{
  "apiVersion": "eap/v2", "kind": "Expert", "id": "sql-readonly-reviewer", "name": "SQL 只读取证专家",
  "behavior": {"id": "sql-readonly-agent", "version": 1},
  "agent": {"goal": "根据已有证据分析 SQL；缺证据时追问，不宣称性能已提升", "tools": ["sql.parse", "database.explain"]},
  "knowledgeBases": [], "databaseProfiles": [], "steps": [], "edges": [],
  "rules": ["database.credentials.never-expose"], "rulePacks": [], "mcpTools": []
}
```

3. 选择已配置、支持工具的默认模型连接。`POST /api/experts/sql-readonly-reviewer/agent-runs/{新UUID}`，JSON为`{"sql":"select 1","question":"分析现有证据","databaseId":null,"explainPlan":null}`。此接口同步等待有限执行；启动即代表本次模型调用意图，不需额外enhanceWithModel字段。结果可能为completed/partial/needs-input/failed/cancelled/timed-out；verification总为unverified。
4. 并行`DELETE`同一路径请求取消，仅对匹配专家/UUID的在途任务有效；已完成UUID不可重放。既有`GET /api/tasks/{id}`任务历史保留行为、专家revision、模型调用数和观察。下一次补充输入使用新UUID；本片不提供跨轮自动记忆或恢复。

最终验证：仓库根`rtk proxy mvn -f backend/pom.xml clean verify`，仅显式开启`EAP_RUN_EXPERT_AGENT_PERSISTENCE=true`及`EAP_RUN_EXPERT_BEHAVIOR_PERSISTENCE=true`，复用既有IDEA本地数据库凭据（不输出/提交）。32项目全部SUCCESS，退出码0；152份报告、874项（800通过、74条件跳过）、0失败/错误，20:31:28完成。本轮新增26项：16项Agent执行/Fake模型、5项定义/旧入口边界、2项HTTP路由、3项真实PostgreSQL；原4项绑定实库回归也通过。真实库仅使用随机专家/资料/Task记录且清理，无数据库DDL或重置；新增Agent实库测试验证本地证据读取持短事务、模型不持事务、重构服务后读取绑定/历史、重放拒绝、执行中撤权及单独资料grant撤销。早期编译发现Spring AI 2.0.2的options接口差异，依据本地源码调整后定向及最终构建均通过。

IDEA原配置/DevTools于20:31恢复运行，22份迁移校验通过且无迁移；GET health=ok，behaviors目录同时列出旧fixed-workflow和新agent，真实HTTP校验v2合法/v1拒绝，取消不存在的执行返回false；测试专家已清理，未发起真实模型请求。`git diff --check`、`git diff --cached --check`及UTF-8无BOM检查通过。主方案当前进度与EX-01、完成台账、EA-02/03/04阶段表和模块布局同步。未提交/推送，保留已有本地改动。本轮Fake模型覆盖Spring AI工具循环与安全边界，PostgreSQL回归覆盖持久绑定、授权撤销/资料grant拒绝、模型不持事务及历史重新读取；不作为真实供应商效果或用户接受。剩余：UI/行为轨迹、通用领域请求/结果、多专业行为共同抽象、旧DAG长事务、逐动作日志/审批/重启恢复/UNKNOWN。第十轮的“尚未自主Agent”与测试数字保留为当时历史。


### 第十二轮：SQL Agent检查点恢复与候选写入审批（2026-11-08，历史快照；自动调度与UI见第十三轮）

本轮复用原Task作为执行身份，新增V23的`expert_agent_run`一对一续跑记录，不建立第二个任务调度器。core只定义ExpertAgentJournal/ExpertAgentWrites端口；workflow负责JDBC租约、检查点与人工审批，ai-sql继续复用Spring AI工具循环，web-ai提供独立查询/恢复/审批入口，full负责装配和迁移。原DAG、sql-analysis、CodeChangeService及候选/工作区互锁均保留。自定义ExpertAgentAccess适配须实现checkEvidence以核验已取证资源的当前授权；默认实现对非空资源集合拒绝，不静默跳过撤权检查。V23已在开发库应用后，全量结构检查发现缺少列注释，另增V24补齐，未修改已应用的V1～V23、未clean/repair/baseline。

**恢复合同**：创建时固定脱敏输入、目标路径、专家manifest/revision及24小时期限；本地取证后提交检查点，调用模型之前持久扣减预算。恢复从已提交事实/观察/引用继续规划，不重放已完成取证，不假装恢复供应商内部会话；中断时未收到的模型调用仍计费计次。每次领取使用新owner，60秒租约围住原45秒执行等待预算；全生命周期最多3次领取、合计6次模型调用。过期租约转interrupted，GET/显式resume也会整理过期状态。强制退出后须等待租约到期，不能并发接管仍有效的owner。旧线程失去提交权限；取消、终态、预算耗尽或过期不能重放。恢复及每次模型/工具边界重验专家版本、能力开关和已保存证据的知识/数据库grant；旧证据不绕过撤权。

**审批合同**：请求可显式指定一个`.sql`工作区相对目标，生成前由原CodeChangeService保存不可变文件基线；模型的`propose_sql`只创建候选并结束为awaiting-approval，无apply或execute_sql工具。候选ID、内容/基线/专家revision摘要与15分钟审批有效期持久绑定。独立人工请求需提交准确proposalId/digest，批准/拒绝及local operator身份落库；拒绝后不能改为批准。批准前再验专家及证据授权、有效期，复用原单文件应用的路径/授权根/基线校验、工作区互锁、APPLYING预提交与读回证据。重复审批已完成候选只读取持久结果，不再次覆盖文件。写入结果不明保持UNKNOWN，不自动重放；若已有APPLIED/FAILED证据可核对投影状态，无证据的过期审批意图转UNKNOWN。SQL文件写入不代表SQL已执行、性能提升或语义等价。

HTTP使用（后端合同，尚无对应前端交互验收）：

1. 沿用第十一轮显式v2专家的保存/启用；`POST /api/experts/{expertId}/agent-runs/{新UUID}`可传`{"sql":"select 1","question":"提出候选","targetPath":"queries/candidate.sql"}`。目标目录须已存在且位于配置的授权工作区。省略targetPath保持只读行为。
2. `GET`同一路径读取run、approval及candidate。`run.state`是当前权威状态，`run.result`是模型阶段的历史结果，不能把其中awaiting-approval当作当前文件状态。候选diff/基线及verification可供独立审阅。
3. 对queued/interrupted运行，`POST .../resume`（无请求体）显式继续原输入；它不接受换SQL、换目标或替换专家版本。终态补充新输入须使用新UUID。
4. 从GET返回的`approval.proposal_id`和`approval.approval_digest`取得绑定值，人工确认后`POST .../approval`，JSON为`{"proposalId":"<UUID>","digest":"<摘要>","approve":true}`；拒绝用false。模型文本不构成批准。
5. `DELETE`原路径可取消queued/running/interrupted/awaiting-approval；已进入文件应用的操作不承诺可撤销，由持久应用结果/UNKNOWN核对。GET/resume/approval继续受公共Host/Origin/JSON防护，本片沿用本地单操作员模型，未增加多用户身份系统。

本轮验证使用本地PostgreSQL、随机测试记录和临时工作区；不执行业务SQL、不调用真实模型、不操作生产仓库文件。新增独立JVM在模型入口前强制halt，另一JVM/服务从数据库检查点恢复；测试用过期租约夹具避免等待一分钟。审批测试使用真实持久候选、真实临时文件与基线冲突，另覆盖拒绝、过期、错误摘要、撤权、重复请求、并发领取、尝试/模型预算、数据库不可变约束、旧owner拒绝及写中断UNKNOWN。重建服务测试不替代进程测试，Fake模型不替代供应商效果验收。

验证命令（仓库根）：`rtk proxy mvn -f backend/pom.xml clean verify`；只额外启用`EAP_RUN_EXPERT_CONTINUATION_PERSISTENCE=true`、`EAP_RUN_EXPERT_AGENT_PERSISTENCE=true`、`EAP_RUN_EXPERT_BEHAVIOR_PERSISTENCE=true`，凭据仅从既有IDEA本地配置传入子进程环境。其他实库/真实模型/建删库门禁保持关闭。最终clean verify于21:00:27通过：32个reactor项目全部SUCCESS、退出码0，153份报告共891项（817通过、74门控跳过、0失败/错误）。新增17项包括15项真实PostgreSQL续跑/审批、1项已捕获证据撤权、1项HTTP恢复/审批路由；原4项行为绑定和新增后共4项Agent授权实库测试全部执行。首轮全量因列注释检查失败，V24修复后完整构建通过；随后统一取消终态响应与持久审计结果，再次clean verify通过，不掩盖中间失败。

剩余边界：本片为显式续跑，启动恢复钩子仅整理状态，不自动调用模型；没有后台队列/定时重试、通用代码或数据库写执行器、外部进程接管、UNKNOWN人工解决接口、多用户审批、UI轨迹或真实供应商效果验收。旧固定DAG长事务和领域输入输出解耦继续保留为独立后续项。所有模型结论及SQL候选仍为unverified。第十一轮“无恢复/审批”的描述与874项统计保留为当时快照。


最终IDEA核对：21:00恢复原EapApplication配置/DevTools，24份迁移校验通过，V24成功增量应用，启动成功且服务保持运行。真实HTTP health=200/ok、专家目录200并含两种行为；不存在执行的GET、resume和approval均404，非信任Origin的approval为403，未调用真实模型或写入工作区候选。V23此前已由同一宿主应用；原迁移校验和未改变。git diff --check与cached检查通过（仅已有LF/CRLF提示），相关源码/迁移/规划文档UTF-8无BOM。主方案当前进度/EX-01、台账BM/EX、EA-04阶段表与模块布局已同步，保留既有用户改动，未提交或推送。


### 第十三轮：SQL Agent自动后台调度与审批UI（2026-11-08）

用户授权继续自动后台调度和审批UI。保留原Task、Journal、租约、检查点、Spring AI循环及CodeChangeService；未建立平行任务注册表或写入器。后台调度仅覆盖显式提交的SQL Agent，不自动升级旧DAG/Chat/Mission或已有手动任务。

| 归属 | 实际变化与边界 |
|---|---|
| engine-core / workflow | Journal增加入队、待执行扫描、列表与带尝试数CAS的失败记录。Jdbc实现用短事务/advisory lock限制100项queued/running/interrupted任务；相同UUID和输入幂等，不允许替换输入。自动许可创建后不可改变，旧记录默认false |
| ai-sql | SqlExpertAgentScheduler在ApplicationReady后轮询并调用原resume，默认2000ms，每宿主最多4个调度槽；共享Journal的CAS租约阻止多实例重复领取同一任务。优雅退出及独立JVM崩溃后可自动续跑，保留最多3次尝试、累计6次模型调用、24小时期限。撤权/无效专家使待执行任务持久失败；数据库暂时不可用后继续扫描 |
| web-ai / full | 新增POST /api/experts/{expertId}/agent-runs/{id}/queue（202）及GET /api/expert-agent-runs（最多100项，含调度可用性）；旧同步/resume/取消/审批接口保留。宿主显式装配；V25增加automatic列、注释、不可变触发器与待执行索引 |
| frontend | runtime-client集中类型/API；features/expert提供提交、列表、状态/观察与候选Diff、批准/拒绝、取消。无可用v2专家时，经确认可创建并启用仅含解析/用户EXPLAIN的基础SQL Agent，不附加资料grant。提交前明确模型费用；离页仅停轮询，不取消后台任务，返回后重新查询持久状态 |
| 审批边界 | 显示工作区、目标、原文/候选及摘要，确认后发送当前proposalId/digest。过期、UNKNOWN、终态或读取失败禁用审批；迟到响应不能覆盖新选择/审批结果。自动调度不领取awaiting-approval、不批准、不重放APPLYING/UNKNOWN。仍只写指定单个.sql文件，不执行SQL或开放通用写工具 |

配置：eap.agent.scheduler.enabled默认true；poll-millis默认2000并限制500～60000ms。关闭时新queue返回503，但仍可查询、取消或审批已有任务。并发4是单宿主限制，不是集群总限额。仍沿用本地工作台操作员/Origin边界，未宣称多租户隔离。预览模式禁用真实后台提交；旧DAG编辑器拒绝载入v2 Agent，避免保存降级覆盖；通用行为编辑器仍待。

后端验证：仓库根rtk proxy mvn -f backend/pom.xml clean verify，32项目SUCCESS、155份报告、902项（828通过、74环境门控跳过、0失败/错误）。仅额外开启EAP_RUN_EXPERT_CONTINUATION_PERSISTENCE、EAP_RUN_EXPERT_AGENT_PERSISTENCE、EAP_RUN_EXPERT_BEHAVIOR_PERSISTENCE三个既有localhost门控；23项续跑/审批、4项Agent授权及4项行为绑定实库回归均执行。新增覆盖异步返回、双调度器竞争、优雅/硬退出自动恢复、许可不可变/手动任务隔离、重复入队、撤权、100项限额、审批等待零写入/不耗尝试，以及禁用/扫描失败恢复。仅使用随机命名本地测试数据与Fake模型，不调用真实供应商，不建删数据库。

前端复用检查：已搜共享组件并按层放置；Button/ConfirmBox/Input等来自@eap/ui，Diff复用components/ProposalDiffView，业务轮询留expert feature，类型/API归runtime-client，无新共享包或平行弹层。已登记UI边界文档。仓库根执行rtk proxy pnpm --dir frontend typecheck、check:boundaries、check:architecture、build均退出0；最终test run --maxWorkers=1 --reporter=verbose为131文件/762测试全部通过。首轮旧管理页SSR测试缺少i18n插件而失败，补齐测试装配后通过；新增10项Agent UI回归。构建保留既有500kB块体积提示。串行定位确认全量测试的网络拦截日志来自原有BoardRunDelivery/ChatWorkspace.knowledge与networkGuard.browser测试，防护保持启用；本次ExpertAgentPanel及管理页定向测试无未模拟请求。真实浏览器自动化不可用，未将组件回归当作视觉/用户验收。

IDEA原配置于21:23恢复运行，Flyway校验25份迁移且schema25已最新；V25已由本轮21:12启动增量应用。HTTP health=200/ok，任务列表200且automaticScheduling=true；不存在/不可用专家queue返回409，非信任Origin返回403，无真实模型调用。真实供应商效果、真实浏览器布局/焦点/人工交互未验：当前浏览器自动化连接不可用。通用写工具、UNKNOWN人工处置、旧DAG长事务及产品目录/CLI/Chat剩余解耦保持后续项。

真实HTTP额外校验：前端基础SQL Agent清单提交POST /api/experts/validate，200且valid=true/errors=[]；只校验，不保存、不激活、不调用模型。git diff --check及cached检查通过，相关源码/迁移/文档UTF-8无BOM；当前主方案进度/EX-01、台账、EA-04与模块/UI边界已同步。保留全部既有本地改动，未提交/推送。


### 第十三轮接续：浏览器视觉验收及修复（2026-11-08）

用户明确要求继续视觉验收。内置Browser/Windows控制通道仍报host/native pipe unavailable；按computer-use技能检查后使用本机已有Playwright Core及Chromium 1234，不安装浏览器或替换技术栈。打开127.0.0.1:5173真实应用，真实后端仅GET；随后浏览器拦截Agent状态/动作作为明确“模拟”夹具，未知修改请求全部拒绝，无模型费用或真实候选写入。此前本节“浏览器未验”是上一交付时快照，本次关闭下述视觉关口，不提升为真实业务/用户接受。

发现并修复：①列表有专家仍显示空态，改为依据visibleItems/loadError；②首次加载误报调度不可用，增加初始读取状态；③900px含侧栏时详情仍挤成双列，改为实际容器宽度断点；④任务卡片时间/UUID挤同行，改纵排与本地时间；⑤390px长文件路径/摘要撑破详情及确认框，业务详情允许折行，公共ConfirmBox统一minmax/min-width/overflow-wrap/max-height滚动；⑥返回审批页出现TextModel got disposed before DiffEditorWidget model got reset，monacoDiff先setModel(null)/dispose编辑器再销毁模型，同内容轮询不重设文本。保留原服务/API、授权和审批合同，无后端变化。

测试脚本及截图：[浏览器回归说明](../../frontend/apps/web/__tests__/browser/README.md)；在frontend目录设置EAP_PLAYWRIGHT_MODULE为已有E:/ai/Hermes/hermes-agent/node_modules/playwright-core，EAP_CHROMIUM为已有C:/Users/admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe，然后node apps/web/__tests__/browser/expert-agent-visual.mjs。最终退出0、8组检查、5次受控模拟修改、0个pageerror。截图目录apps/web/__tests__/browser/artifacts/agent，已查看宽屏、侧栏窄容器、390px审批/失败提示、390×360确认框、提交费用确认及深色画面。Tab/Escape/默认取消焦点/返回焦点、批准/拒绝/过期/UNKNOWN/错误/取消/离页返回均通过。前两次脚本分别因导航保留子页的测试假设、真实Monaco销毁错误失败，修正后通过，不掩盖中间失败。

仓库根验证：rtk proxy pnpm --dir frontend test run为131文件/763测试全部通过；typecheck、check:architecture（含边界）及build退出0。构建仅保留既有500kB块提示，测试仍有既有网络防护日志。新增首次加载组件回归与独立真实浏览器回归，不用happy-dom证明排版。UI检查链已完成：搜索现有原语→共享ConfirmBox修复/业务布局归feature→Diff复用→边界登记→架构与测试。未改后端，未重跑Maven；原32模块/902项后端证据仍是上一轮结果。真实供应商生成到文件写入整链、原生Windows系统缩放、多浏览器与用户接受仍待。

最终定向stylelint：rtk proxy pnpm --dir frontend exec stylelint packages/ui/src/confirm-box/confirm-box.css apps/web/src/features/expert/ExpertAgentPanel.vue，初次发现属性排序/空行与选择器顺序，按规则修正后退出0；最终浏览器复测通过。Git差异空白检查与UTF-8无BOM检查通过，未提交/推送。


### 第十三轮接续：真实供应商与原生系统缩放检查（2026-11-08，历史阻塞快照；工具已由第十四轮补齐）

用户要求继续真实供应商整链和原生系统缩放。未安装工具或改变默认连接：现有唯一GPT API/gpt-6.1-sol配置为Responses；使用现有接口新建验收会话7397f946-314a-4de6-8f41-56c71d01b271，以toolMode=none发送最小文本标记，真实执行5e7e7a60-4fd8-42d3-bd32-893c1234e82d为SUCCEEDED，5.45秒返回EAP_PROVIDER_ACCEPTANCE_OK。这证明本次真实鉴权/文本响应，不证明工具或写入整链。

真实浏览器创建最小sql.parse/database.explain专家并提交SELECT 1 AS acceptance_value;，目标仅为frontend/apps/web/__tests__/browser/artifacts/agent-provider/provider-candidate.sql。持久运行bb290185-d953-4625-8242-d45d608d9158状态failed，错误AGENT_MODEL_TOOLS_UNSUPPORTED，模型调用0、无候选、目标不存在。根因：SqlExpertAgentService.selectedClient仅接受chat-completions；OpenAiResponsesChatModel拒绝工具回调/工具历史。完整生成→审批→写入→独立读回未完成，不能用文本成功充数。已询问用户是否补齐Responses工具协议或选择兼容连接；新增协议能力尚未获答复，未实施。验收专家sql-agent-0c1a7b33-f6da-4417-a422-d6e4124f4250已停用，任务/会话审计保留。

系统只读GetDpiForSystem=96（100%）、主屏1920×1080。Computer Use/browser host仍不可用；使用本机已有Chromium有界面启动/最大化、viewport:null，不设置DPR或页面zoom。浏览器实测DPR=1、inner1920×945、outer1920×1032、visualScale=1。EAP_VISUAL_NATIVE=true、EAP_VISUAL_OUTPUT=apps/web/__tests__/browser/artifacts/agent-native-100后运行原visual脚本，5组断言/5次模拟审批修改/0pageerror，退出0，已查看真实截图。原生100%已验；125%/150%等档位仍需恢复桌面通道或用户手动切换，未以模拟DPR/浏览器缩放替代。

脚本仅新增原生模式，生产代码/配置未变，无需重跑Maven或前端完整构建；上轮763项为历史验证数。命令、截图、脱敏真实执行结果见frontend/apps/web/__tests__/browser/README.md及artifacts/agent-provider、agent-native-100；当前方案/台账/EA-04同步真实阻塞范围。未提交/推送。

<a id="responses-tools-acceptance"></a>
### 第十四轮：Responses函数工具与真实审批整链（2026-11-08）

用户授权“补齐Responses工具支持后继续验证整链”。保留Java25/Boot/Spring AI/官方OpenAI SDK、原连接与既有审批交付，不新增工具循环或注册表。model-openai将ToolCallingChatOptions回调映射为function schema（strict=false、parallel_tool_calls=false），maxTokens映射max_output_tokens；store=false并请求加密reasoning，在同一次Spring AI循环内携带原输出项和匹配call_id的function_call_output。完成前不交出工具调用；失败/不完整流、未知工具、重复调用ID、非法JSON/超长参数及输出限额均拒绝。适配器不执行回调，执行和授权/预算仍归既有Spring AI Advisor/SQL服务。加密reasoning不写入业务检查点。

SQL Agent允许普通openai-compatible的chat-completions和responses；ChatGPT账户计划SQL Agent及Chat产品Responses Git仍保留独立门禁。此次只支持函数工具，不声明内置Web/Computer等工具、任意写工具或所有供应商兼容。协议参考[OpenAI函数工具](https://developers.openai.com/api/docs/guides/function-calling)与[Responses迁移](https://developers.openai.com/api/docs/guides/migrate-to-responses)。

验证命令均在backend目录执行：

- `rtk proxy mvn -f pom.xml -pl :eap-full-application -am test '-Dtest=OpenAiResponsesProtocolTest,SqlExpertAgentServiceTest' '-Dsurefire.failIfNoSpecifiedTests=false'`通过；本地HTTP协议用例覆盖两轮真实SDK序列化、加密reasoning/工具结果回传、流完成/截断和恶意工具响应。
- `rtk proxy mvn -f pom.xml clean verify`首次发现旧ChatGptPlanChatModelTest完成事件Mock缺少Response对象（1错误）。补齐协议夹具后`rtk proxy mvn -f pom.xml verify`32项目SUCCESS，155份报告907项：833通过、74跳过、0失败/错误。仅开启既有3个Expert门控，23续跑/审批、4Agent授权、4行为绑定PostgreSQL回归执行；未建删数据库。最初定向命令的PowerShell参数拆分及测试编译问题已修正，未将失败算通过。
- `rtk proxy pnpm --dir ../frontend test run apps/web/__tests__/features/expert/ExpertAgentPanel.test.ts`11项通过；typecheck、check:architecture、build通过（仅既有大块提示）。实际页面发现applied仍展示awaiting-approval分析摘要，feature现在只显示与当前状态一致的摘要；runtime-client补齐既有result.status字段，复用原Feedback/Diff，无新增基础组件或共享暂存。新增断言覆盖审批前显示、审批后移除。首次typecheck指出DTO缺status后已修复并重验。前端763项全量为上轮证据，本轮不冒充重跑。

真实业务证据：沿用GPT API / gpt-6.1-sol / responses，连接ID8b523f6e-d59a-4201-8440-c4a0b9beda22、revision和配置前后完全一致。重新启用既有验收专家，通过原生100%有界面Chromium真实页面提交新任务791dedff-f3c3-4002-afed-8d798c9750c4。模型两轮选择database.explain取证与propose_sql，候选2317b1a8-d1f7-489e-8408-0d90938414f5进入awaiting-approval；审批前文件不存在。候选仅为frontend/apps/web/__tests__/browser/artifacts/agent-provider/provider-candidate.sql，内容SELECT 1 AS acceptance_value;。查看Monaco Diff和绑定摘要后，代理按用户授权在页面确认审批，HTTP200、任务applied、候选APPLIED，独立文件读回完全一致，SHA256=85e0c913bd9600ce1276fd0722769a506e2a9851bb9becd1a9701a6b277bbac4。重复相同审批返回200且mtime不变；IDEA完整停启后仍applied、attempts1、modelCalls2、mtime不变，页面无过期等待摘要、0pageerror。没有执行SQL或声称查询性能/语义已验证。

证据在frontend/apps/web/__tests__/browser/artifacts/agent-provider/responses-{awaiting-approval,applied,result}.json及responses-*-native-100.png；保留上一轮协议门禁失败历史。验收专家已停用，任务/候选/目标文件保留，IDEA原配置已恢复运行。测试审批由代理执行，不是用户最终产品接受。Windows125%/150%、复杂SQL质量、账号计划/Chat Git工具、UNKNOWN人工处置、旧DAG长事务及产品目录/CLI/Chat解耦仍待。无新数据库迁移，未提交/推送，保留用户原有改动。

<a id="stage-checkpoint"></a>
### 阶段收束与本地提交（2026-11-08）

用户明确要求更新仓库文档并进行一次阶段性提交。本阶段从1aecc1a接续，纳入评审安全加固及十四轮后端模块/专业Agent演进，合并原已暂存的旧路径删除与新模块源码，避免提交只有删除或不可构建的半次迁移。未授权推送。

提交内容：32项目Maven组合、唯一full宿主、稳定契约与领域能力边界、条件装配/starter及回归；专业行为版本绑定、SQL Agent有限取证、持久检查点/租约/预算、显式后台许可及单SQL文件审批；普通Responses函数工具；专家页面及共享确认框/Diff修复；原生/模拟/真实供应商证据和开发启动脚本路径。保留旧固定DAG、现有Capability/Task/CodeChange/Spring AI执行机制；不新增平行注册或工具循环。V1–V22历史不改，新增V23–V25；application.yml经与HEAD旧宿主版本的换行归一比较确认内容不变，仅纳入路径迁移，未写入新的本地配置或凭据。构建目录、运行数据与IDE配置不纳入提交。

文档同时更新README、文档索引、架构、模块布局、HTTP参考、专家/运行指南、路线图、主方案进度/MD-01/EX-01行、完成台账及相关决定；历史失败/数字保留为当时快照。新增42份约2.0MiB浏览器证据，JSON及图像属于限定验收，不是正式产品接受；候选文件只是SELECT常量且未执行。

验证：后端沿用紧邻实现轮已完成的clean后修复夹具再verify（32项目SUCCESS；907项，833通过、74环境门控跳过、0失败/错误；31项已批准PostgreSQL回归实际执行）。本次提交准备重新执行仓库根`rtk proxy pnpm --dir frontend test run`，131文件/763项通过；类型、架构、构建在紧邻实现轮通过且生产代码此后未变。真实Responses工具链、页面审批与独立读回、重复审批/完整服务重启不重放、Windows原生100%结果见上节。未为文档提交重启服务、调用供应商或扩大数据库门控。提交前检查暂存diff、移动归属、UTF-8无BOM、相对链接与敏感内容；不纳入编译产物或凭据文件。

阶段未关闭项：workflow产品目录/CLI管理和Chat产品贡献解耦、旧DAG长事务、通用输入及更多专业行为、通用写工具/UNKNOWN人工处置、独立schema组合和跨环境发行、官方MCP独立实网业务验收、复杂SQL效果、原生125%/150%及用户最终产品接受。下一步按这些边界选择最小可验证切片；本次提交不宣布整个平台已完成。

<a id="complex-sql-acceptance"></a>
### 第十四轮接续：复杂SQL、知识边界与人工验收准备（2026-11-08）

基线c76cded，用户要求继续复杂SQL、其他系统缩放及用户验收，同时解释知识库与本地执行关系。本轮变更纳入后续独立编辑工作台阶段提交。复杂样例均为合成customers/orders数据，不连接业务数据库。

发现并修复：原CTE只提取外层ranked却给出0.9确定性；NOT IN误触发普通IN/半连接建议。SqlFactExtractor/Vocabulary新增parse.partial与predicate.notInSubquery：尚未完整分析的CTE/子查询/派生表/聚合/窗口标记部分证据，SqlParseHandler传播incomplete，sql-analyzer/5限制确定性至0.5并明确不完整结构；NOT IN单独提示NULL/UNKNOWN及反连接业务语义，不保证NOT EXISTS与原SQL等价。没有宣称实现了完整CTE递归作用域分析。新增ComplexSqlEvidenceTest六项覆盖及规则事实合同。实际页面还发现多任务列表拉长后详情行被纵向分散，feature沿用现有组件仅align-content:start，原生复查段间12px、无横向溢出；无新共享原语/暂存。

真实模型4次任务共6轮调用（同一现有Responses默认连接）：

| 场景 | 运行ID | 结果 |
|---|---|---|
| CTE/LEFT JOIN/聚合/ROW_NUMBER+知识 | 9b6b2a71-5ebe-4c1b-bb2b-ffeacae6dd12 | 2轮，已读取knowledge.search且持久1条引用，45秒AGENT_TIME_LIMIT；不计成功 |
| 缺少计划却要求证明30秒到100毫秒 | 0596cfa1-93ff-4900-9189-000c1da812ee | 1轮needs-input，明确不能证明，请求计划/分布/约束/测量；无候选 |
| NOT IN/NULL反连接 | 3b20fd34-5f2c-479c-acc0-7f168c699b30 | 1轮生成NOT EXISTS单文件候选，代理按授权页面审批后applied；读回一致 |
| CTE同样例限制180字结论复测 | 04f9110b-3777-4776-a52d-b473bfa6f3da | 2轮，真实knowledge.search并引用合成资料，partial，准确保留覆盖/性能未知 |

独立oracle脚本frontend/apps/web/__tests__/browser/sql_semantic_fixture.py只创建内存SQLite合成表，在装载fixture后开启只读authorizer；生成SQL仅允许SELECT相关操作，不访问EAP/业务数据库。CTE排序/零订单/NULL金额样例结果与预期一致；原NOT IN在paid子集含NULL时空集，目标反连接应得客户2/5/6。生成候选在NULL/重复订单/NULL金额、无NULL客户、空订单、仅NULL客户四组数据上符合业务目标。此为选定SQL语义样例，不证明PostgreSQL性能或任意输入等价。候选仅写入artifacts/agent-complex/null-safe-candidate.sql；EAP未执行SQL，独立验收脚本才在合成内存库运行。

本地知识验收：创建单份合成说明，导入1块；全文/关键词搜索命中1条并返回来源；授权专家预览200，另一个无知识grant专家预览403；临时测试文档删除前命中1/删除后0。这些接口调用链不调用模型；SQL Agent取证的选择与结论仍由模型调用完成。知识正文版本更新尚无合同；未冒充已完成更新一致性。完整解释见[知识库、本地规则与模型边界](../decisions/knowledge-local-execution.md)。测试专家均停用，合成知识和历史运行保留供用户阅读。

验证（backend目录）：`rtk proxy mvn -f pom.xml -pl :eap-full-application -am test '-Dtest=ComplexSqlEvidenceTest,DeterministicSqlAnalyzerRulesTest,RulePackTest,SqlExpertAgentServiceTest' '-Dsurefire.failIfNoSpecifiedTests=false'`成功；`rtk proxy mvn -f pom.xml verify`32项目成功，156报告913项（839通过/74门控跳过/0失败或错误），只开启既有3个Expert门控，31项实库回归执行。IDEA构建前停止，完成后恢复。仓库根`python frontend/apps/web/__tests__/browser/sql_semantic_fixture.py`成功；`rtk proxy pnpm --dir frontend test run`131文件763项成功，typecheck、check:architecture、build及目标stylelint成功。Python oracle初次authorizer拒绝fixture提交，修正为装载并commit后才启用只读限制；没有放宽候选写权限。

原生缩放：重新检查computer-use技能的sky及CUA入口，均为native pipe unavailable，浏览器host也不可用；已有本地Playwright可操作应用，当前DPR1/1920×945/visualScale1，仍是100%。已向用户请求手动切换Windows125%，待回复后验收并继续150%；没有以deviceScaleFactor/浏览器zoom替代。用户验收页面和下方清单已提供，尚无用户接受结论。证据为frontend/apps/web/__tests__/browser/artifacts/agent-complex，含首次超时、修复前后本地结果、真实运行/引用、oracle与截图。原生125%/150%、完整SQL作用域、真实生产分布/性能与用户接受继续保持未验。

用户验收清单（入口http://127.0.0.1:5173 → 专家 → 专家定义）：

- 查看“复杂SQL验收Agent”的证据不完整、等待补充输入、已写入、已超时四种记录，确认含义清楚且不会混为成功。
- 查看NULL候选Diff中的目标路径/注释/NULL风险，核对已写入提示与仅保存未执行边界。
- 展开CTE取证记录，确认能追溯合成知识来源，不把知识引用视为查询正确性证明。
- 在实际125%/150%系统缩放查看文字、滚动、Diff和确认框可达性；反馈遮挡、拥挤、焦点或操作障碍。只读已有记录不会再收费调用模型。

### 原生125%缩放接续（2026-11-08）

用户明确回复已切换Windows125%。运行既有expert-agent-visual.mjs原生模式（EAP_VISUAL_NATIVE=true，输出artifacts/agent-native-125），不设置deviceScaleFactor或页面zoom。有界面最大化Chromium实测DPR1.25、screen1536×864、inner1536×730、outer1536×816、visualScale1。5组检查通过、5次仅fixture修改、0pageerror；检查确认框焦点/Tab/Escape、批准/拒绝/过期/UNKNOWN/失败、提交费用确认、离页与浅深主题；截图已查看，无遮挡或横向溢出。

另开无mock浏览器，只读真实CTE partial、缺资料needs-input、NULL候选applied三条历史记录；详情均宽836且scrollWidth836，真实Monaco加载，0pageerror。证据live-result.json及live-{partial,needs-input,applied}.png。没有调用模型或批准真实写入，没有修改生产代码，故不重跑构建。本轮125%技术检查通过；150%仍待用户实际切换，用户主观体验接受尚未收到。先前“125%未验”保留为历史快照。

<a id="expert-workspace-navigation"></a>
### 专家界面分层与截图反馈（2026-11-08）

已按用户授权将专家定义与单次执行分开，增加SQL Agent行为编辑及分类配置；终态停止轮询、活动任务静默更新，移除已完成任务的失效审批按钮。后端模块/任务状态机/数据库不变；本轮前端132文件773项通过，类型/架构/构建通过。真实125%读取历史终态无重复请求或布局抖动；模拟浏览器审批保持绑定/费用/拒绝/异常检查。用户接受和150%仍待，完整范围与保留实现见[界面决策](../decisions/expert-workspace-navigation.md)。此前复杂SQL修复的913项后端结果保留，本轮未重跑后端或真实模型。

### 独立编辑工作台提交前复核（2026-11-09）

用户已授权在浏览器技术验收后提交并推送。本阶段将此前未提交的复杂SQL证据修复、知识边界说明、专家导航/详情调整与本次独立编辑工作台一并收口。`rtk proxy mvn -f backend/pom.xml test`重跑32模块SUCCESS，912项（808通过/104门控跳过/0失败错误）；本轮未启用额外实库/供应商门控，前述913项/74跳过是前轮环境快照。前端134文件786项、类型/架构/构建与定向样式通过；新编辑工作台7组、原审批UI9组浏览器技术检查通过，所有专家保存/审批写请求均为隔离fixture。当前原生DPR1及Chromium1.25/1.5覆盖通过，不冒充Windows原生150%。细节与剩余用户验收见[工作台记录](../decisions/expert-workspace-navigation.md)。

<a id="tool-operation-executions"></a>
## Git 程序统一与 status 持久取消（2026-11-09）

起点为干净工作树 ec2914c。用户确认范围为“统一模型＋status取消”、跨重启保留记录、UNKNOWN保留并阻止重复启动；实施阶段未授权提交/推送，交付后用户已明确授权本次提交并推送。相关合同见[技术决定](../decisions/agent-runtime-evolution.md#git-operation-executions)。

| 子系统 | 实际修改与复用 |
|---|---|
| Git管理 | 复用CliProgram/CliOperation和CliChannels；可信目录增加程序分组，Git下保留status/diff两个能力ID；版本探测与缓存归程序，旧入口响应ID兼容。历史操作路径一致时共享、冲突时拒绝执行，程序覆盖优先，不改写用户配置 |
| 执行与存储 | 新增ToolExecution、存储端口/JDBC适配、受限status服务/HTTP入口；先持久化再后台运行。requestId去重与工作区互锁由数据库唯一索引兜底；只接收requestId，不接受路径/参数/批准 |
| 进程 | ProcessExecutor增兼容的取消信号/启动回调；现有DefaultProcessExecutor与GitCapability继续生成安全命令、限制环境/输出、执行与清理。一个调用记录root/filter/status步骤与身份，不让预检逃离取消边界 |
| 前端 | 移除页面内旧同步invoke编排，L4 TrustedGitExecutionPanel负责持久记录观测；DTO/HTTP仍在runtime-client；复用公共UI与i18n。KeepAlive停用/销毁暂停观测，返回重读，观测代次防止旧响应覆盖 |
| 兼容 | 同步invoke转为同一持久服务的适配层；停止HTTP等待不变成进程取消。旧Mission/Board/Chat Git链路保留；底层进程查询接口不冒充调用记录 |
| 迁移 | V26新增工具调用表，V27补列注释。实库测试只创建/删除UUID命名临时schema，不创建/删除数据库，不重置应用schema或Flyway历史 |

状态与失败边界：CANCELLING仅表示取消意图；未启动或退出且树清理完成才确认CANCELLED，完成后取消不覆盖原结果。写回失败/缺清理证据或重启遗留在途转UNKNOWN，继续互锁，不自动重放、按PID销毁或提供人工解除。stdout/stderr脱敏后各保留最多8000字符，携带截断标记。

验证证据分开记录：

- 前端全量最终为136文件797项通过，typecheck、check:architecture、check:boundaries、build、改动范围stylelint与lint通过。保留既有网络保护诊断、Node localStorage提示及构建大chunk提醒；未放宽网络保护或检查规则。
- 后端定向命令覆盖ToolExecutionServiceTest、ToolExecutionJsonTest、TrustedToolCatalogServiceTest、DefaultProcessExecutorTest、ToolExecutionControllerTest、ToolExecutionPersistenceTest、SchemaAndWiringTest：36项通过。新取消信号的真实父子进程清理、启动前取消，与三个Git阶段的调度/取消模拟分开验证。
- 既有BoardRunPersistenceTest在实库门控开启时36项通过（330秒）；未删断言。首轮暴露事务代理按接口生成、测试却按具体CapabilitySettings注入的问题，测试配置显式使用类代理，保留与宿主相同的注入方式。
- 新增实库用例以现有本机测试连接为入口，在UUID临时schema执行迁移与仓储SQL：真实Git三个步骤、快照重构读回、requestId去重、唯一互锁、重启UNKNOWN与阻塞均验证；finally只清理自己的schema。没有把合成进程当作真实Git。
- 本机真实HTTP调用也成功：202启动后，执行3deabe6e-986b-4a09-b49e-2212c17c53a9读回SUCCEEDED/exit0及root、filters、status；核对工作区为当前仓库，迟到取消仍SUCCEEDED。留有独立调用历史，JSON读回证据在full宿主target/tool-execution-live.json。此项是本轮限定实测，不保证服务一直在线。
- 真实Chromium配mock服务7组通过、0pageerror，1440/900/390px无横溢，截图已查看；覆盖程序分组/共享探测、缓存导航返回、取消请求到确认、刷新及UNKNOWN阻塞。脚本、截图与result.json见[浏览器目录](../../frontend/apps/web/__tests__/browser/README.md)。没有调用真实模型。
- 后端最终离线reactor的通过/跳过数字统一在[当前台账](../planning-status.md#tool-execution-validation)维护，与上述实库证据分列，不拼接覆盖率。

精确主要命令（仓库根，浏览器脚本在frontend目录）：

    rtk proxy mvn -B -ntp -f backend/pom.xml test
    rtk proxy mvn -B -ntp -f backend/pom.xml -pl :eap-full-application -am '-Dtest=ToolExecutionPersistenceTest,ToolExecutionControllerTest,ToolExecutionJsonTest,ToolExecutionServiceTest,DefaultProcessExecutorTest,TrustedToolCatalogServiceTest,SchemaAndWiringTest' '-Dsurefire.failIfNoSpecifiedTests=false' test
    rtk proxy pnpm --dir frontend test run
    rtk proxy pnpm --dir frontend typecheck
    rtk proxy pnpm --dir frontend check:architecture
    rtk proxy pnpm --dir frontend check:boundaries
    rtk proxy pnpm --dir frontend build

离线reactor仅在其子进程中将EAP_RUN_BOARD_PERSISTENCE设为false；上述实库用例与看板36项使用原环境已有true门控及口令，凭据未写入代码/命令。改动Vue文件单独执行stylelint，改动TS/Vue/浏览器脚本执行vp lint。

失败与恢复保留：首轮全量有36项旧测试代理错误及1项新增表列注释失败；分别修正代理配置与追加V27。新增临时schema测试最初未重定位普通Statement，导致重启原因断言失败，已补全Statement/PreparedStatement重定位并实测通过；分组测试嵌套Mockito stubbing已修正。浏览器脚本第二次在已有mock UNKNOWN上重跑被互锁阻止，符合合同；使用新mock服务进程后7组再次通过，未增加清空后门。一轮最终全量重跑会话失效、日志无完成状态，未算通过，后续离线全量重新执行。

迁移历史保护：编译期间只读核查发现本机已有服务已应用首版V26，数据库校验和为-716806117。恢复并复核V26源文件同值，把后续列注释放V27；未运行repair、clean或baseline。临时schema验证与应用库迁移状态分别报告，不能互相替代。

本片随本次用户授权的提交交付，推送结果以Git远端回读为准；用户交互接受、diff新人工执行、UNKNOWN人工处置、跨重启进程接管及其他工具合同仍未关闭。KISS/YAGNI体现在只支持status固定入口；DRY复用程序/操作、命令构造和执行器；SOLID通过存储端口、运行控制、HTTP与领域呈现分责落实。

本轮最终补核：离线reactor 32模块通过，930项中829通过、101门控跳过、0失败/错误；V26/V27独立schema迁移与实库用例、SchemaAndWiringTest最后重跑5项通过。只读回读确认本机V27已应用，校验和1802106427；V26仍为-716806117，两份源文件与数据库一致。

前端最终补核：程序管理探测后立即通知父目录刷新，共享版本成功/失败两种结果回归通过。一次与构建并行的全量复跑出现SkillManager级联22失败；该文件单独25项通过，随后不并行构建的全量136文件796项通过。保留中间失败，不推断其为生产缺陷或放宽测试。

最终交付补核：历史Git绑定冲突时，handler可用性读取改走安全通道快照，目录可继续显示冲突，且回归确认不执行进程/不改写绑定。启动阶段明确的400/403/409/429拒绝与网络结果未知分别呈现，相关DOM回归通过。最后前端136文件797项通过；后端完整离线reactor930项（829通过、101门控跳过、0失败/错误）通过，最终日志为tool-execution-offline-reactor-final.log。此后typecheck/build/check:architecture及改动范围lint/stylelint均通过。

<a id="git-diff-operation-executions"></a>
## Git diff持久人工执行接续（2026-11-09）

基线e2c53c7，开始时工作树干净。用户批准status链路复用到diff，后续明确授权提交并推送；随本次提交交付。

实现：服务/HTTP/仓储按操作隔离，工作区requestId全局去重且跨操作409，详情/取消越操作404，两个操作各自UNKNOWN互锁并共用容量；diff复用安全构造器及三阶段取消/证据。V28增量扩展约束，V26/V27未改。面板参数化并挂载两个独立实例；runtime-client有限操作类型与通用方法、旧status包装并存；mock相同隔离合同，目录diff演示改为启用，输出仍显式模拟。UI落点已查现有原语→L4业务面板→复用Button/Badge/Collapse/Feedback；未新增共享类别或暂存。

验证与修复：
- 首次后端定向31模块闭包BUILD SUCCESS，50项通过，其中实库1项在UUID自有schema中验证V26/V27→保留status历史→V28、真实Git未暂存diff及不含仅暂存/未跟踪文件、8000字符截断、索引/文件未改、持久重读、UNKNOWN隔离与唯一约束；SchemaAndWiringTest 4项、真实进程与服务/HTTP回归分列。之后增加在途并发、插入竞争与独立Handler验证，最终定向60项全部通过、0跳过；实库用例在其中单独计为1项，不与全量跳过数拼接。
- 前端最初参数化回归仍有固定status选择器，修正后25项通过。首次全量137文件811项中SkillManager首项5000ms加载超时，后续22项级联失败；单文件25项通过。将lazy组件导入移到30秒beforeAll准备阶段，避免测试已超时后仍挂载组件；业务断言未删，生产Skill代码未改。修复后全量137文件812项通过。
- 架构检查首次指出runtime-client新增运行时测试未声明vite-plus/test依赖；补本包catalog开发依赖并离线同步锁文件，无版本升级。
- 浏览器首次diff按钮被旧mock停用快照禁用；将已交付diff的模拟目录设为启用，并让mock启动核验对应开关，独立停用拒绝回归保留。最终真实Chromium＋mock服务10组通过、0pageerror，1440/900/390px无横溢，查看390/1440截图；涵盖diff内容、范围、取消、刷新恢复、status UNKNOWN下diff独立执行。不是实际进程或用户产品接受。
- 后端完整离线reactor32模块SUCCESS、退出0，按本次起始时间筛选160份XML：939项，834通过、105门控跳过、0失败/错误，日志为backend/target/git-diff-reactor.log，逐报告汇总为git-diff-reactor-summary.json。只在子进程关闭全部已设置EAP_RUN_*门控，因此与前阶段101跳过的环境不同。全量之后保留status原GIT_STATUS_HANDLER_MISSING/GIT_STATUS_CAPABILITY_MISSING错误码，新增diff对应错误码并补两个Handler用例；最终审查还补齐可信目录的diff持久执行地址，保留status旧地址与兼容断言。最终定向加入TrustedToolCatalogServiceTest，31模块闭包60项全部通过，含实库1项/装配4项，日志backend/target/git-diff-final-targeted.log；作为最终小改动回归，不冒充第二次全量。
- 前端typecheck、build、check:architecture（含boundaries/circular）、改动范围vp lint/stylelint和11文件vp fmt --check均退出0。构建保留既有大chunk提示；改动范围lint保留capabilityBackend.test.ts既有optional chaining警告。UTF-8无BOM、本地链接、git diff --check与有限敏感模式扫描通过。
- 最初独立文档链接扫描把尖括号内带空格的媒体链接错误截断，修正解析器后再核对。若命令封装/检查失败，仅以修正后的退出0结果作为验证证据。

复现命令（仓库根；浏览器命令在frontend目录）：
```text
rtk proxy mvn -B -ntp -f backend/pom.xml -pl :eap-full-application -am '-Dtest=ToolExecutionServiceTest,ToolExecutionJsonTest,ToolExecutionControllerTest,ToolExecutionPersistenceTest,TrustedToolCatalogServiceTest,GitCapabilityTest,DefaultProcessExecutorTest,SchemaAndWiringTest' '-Dsurefire.failIfNoSpecifiedTests=false' test
rtk proxy mvn -B -ntp -f backend/pom.xml test
rtk proxy pnpm --dir frontend test run
rtk proxy pnpm --dir frontend typecheck
rtk proxy pnpm --dir frontend check:architecture
rtk proxy pnpm --dir frontend build
rtk proxy pnpm --dir frontend dev:mock --port 5186 --strictPort
rtk proxy node apps/web/__tests__/browser/tool-execution-visual.mjs --playwright H:/developerTools/ai/hermes/hermes-agent/node_modules/playwright-core --chromium C:/Users/LH/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe --url http://127.0.0.1:5186
```

全量后端只在子进程关闭EAP_RUN_*门控；定向实库使用既有EAP_RUN_BOARD_PERSISTENCE和已有本机连接，凭据未输出/写入代码，只清理测试自有schema。没有修改应用表或Flyway历史，没有启动真实模型/MCP。真实diff HTTP执行整链与用户接受仍未验，不以MockMvc、临时schema或浏览器mock替代。应用schema V28升级由后续用户启动完成，证据如下。

提交准备接续：用户报告已启动full-application并完成V28。使用现有本机数据源只读事务回读Flyway历史，V28于2026-11-09 14:30:06安装，success=true、checksum=-329790285；按Flyway逐行UTF-8 CRC32计算与源码一致。V26=-716806117、V27=1802106427同样一致，tool_execution_capability_id_check已允许git-status/git-diff。查询结束回滚只读事务，未写应用表或repair/clean/baseline；GET http://127.0.0.1:8080/api/health为200/ok。证据在backend/target/git-diff-commit-db-check.json，凭据不进入文件或输出。

本次提交阶段只同步迁移/授权记录并复核完整差异、UTF-8/链接/空白和敏感模式；沿用紧邻实施阶段已经完成的812项前端全量、939项后端离线及最终60项定向结果，没有为提交再次构建/重启应用或重跑模型、浏览器与实库业务。提交前fetch确认远端状态，提交后push并回读远端SHA；具体提交号以Git记录为准。

<a id="tool-unknown-manual-review"></a>
## 真实diff HTTP与工具UNKNOWN人工处置（2026-11-09）

基线8abbd21，开始时main工作树干净且与本地origin/main一致。用户授权先验真实diff HTTP，再推进UNKNOWN前后端；后续明确授权提交并推送，随本次提交交付。

### 真实diff HTTP与独立持久读回

在用户运行的full-application :8080读取目录，status/diff均enabled/ready；diff无阻塞。临时向本记录文件尾部加入唯一标记EAP_REAL_DIFF_HTTP_70330824da92437fb59af995f0637270，POST /api/cli-programs/git/operations/git-diff/executions（requestId=5d9cb471-b825-479f-850d-4ae5059b7d65）返回202，执行4e6f4bc7-ab7d-462c-b4fa-df3586c93122经GET返回SUCCEEDED/exit0，stdout含该标记，工作区为当前仓库，root/filters/diff均有processExited/processTreeCleanup和终态。相同requestId返回同一快照，迟到cancel仍SUCCEEDED；status路径读取/取消该ID均404，status复用该requestId409；列表包含记录，附带argv400、非信任Origin403。

finally核对临时文件未被并发修改后恢复原始字节，Git index字节未变。独立JDBC只读事务回读snapshot与HTTP JSON完全一致；Java默认stdout编码首次导致Python解码失败，显式-Dstdout.encoding=UTF-8/-Dstderr.encoding=UTF-8后核验成功。持久执行记录保留，完整证据backend/target/git-diff-real-http-acceptance.json。该验收不证明耗时Git取消、父子进程跨重启接管或用户产品接受。

### UNKNOWN实现与验证

ToolExecution追加可空resolution兼容历史JSON，CLOSED_UNKNOWN仅表示人工关闭阻塞。服务沿用工作区/操作隔离、短行锁和active owner检查，规范UUID/核对说明/进程树人工确认、服务端local-operator/时间及幂等摘要；响应丢失可重提同一请求，竞争或改说明409。原输出/步骤/未知原因/退出字段/取消意图不变。V29保留既有迁移、增状态/审计CHECK；不新增执行器、状态源、PID接管或重放。面板复用Textarea/Checkbox/ConfirmBox/Collapse/Feedback，人工证据线索/说明/勾选→确认→审计回显；离页/刷新读回及网络未知锁定已覆盖。UI落点：已搜索公共原语→L4 capability→复用@eap/ui；无新共享包、类别或暂存登记。

首轮后端定向失败为JSON测试直接比较Map中的Long/Integer导致的不等；改为验证resolution/时间/状态及Number.longValue，保留原进程证据断言。随后31模块定向65项通过，含自有PostgreSQL schema迁移/行锁竞争/缺审计约束拒绝后事务回滚/历史读回、真实Git与真实进程回归；之后V29加强processTreeStopped为JSON boolean的约束，最终31模块定向复验65项通过、0跳过；日志backend/target/git-unknown-final-targeted.log。

前端定向3文件38项通过，完整137文件824项通过。真实Chromium+mock服务12组通过、0pageerror，1440/900/390px无横溢；已查看390px确认框及diff关闭记录截图。核对内容明确mock未启动进程，不能将模拟UNKNOWN当真实孤儿进程验证。类型、架构（含boundaries/circular）、build及改动范围lint/stylelint通过，保留既有大chunk/网络防护/Node localStorage提示。

为避免DevTools构建期间应用新迁移，先读取当前两个操作的历史确认无在途，再按jps校验精确EapApplication PID9024并停止；原启动参数仅保存于backend/target本地清单，构建后恢复。完整离线reactor32模块BUILD SUCCESS、退出0；按本轮时间窗汇总160份XML，946项：841通过、105门控跳过、0失败/错误。仅该子进程关闭EAP_RUN_*门控，与定向实库分列；日志backend/target/git-unknown-offline-reactor.log，逐报告统计git-unknown-offline-summary.json。

15:08按原Java参数恢复full-application（PID7632），启动日志确认29份迁移校验与V29成功应用；health为200/ok。只读事务回读V29于2026-11-09 15:08:09安装、success=true、checksum=-508415836，与逐行UTF-8 CRC32一致，V26=-716806117/V27=1802106427/V28=-329790285也保持一致；status/人工核对CHECK存在。旧真实diff执行4e6f4bc7-ab7d-462c-b4fa-df3586c93122保持SUCCEEDED，resolution为空；对它POST resolve-unknown返回409、status路径404、非信任Origin403，随后读回未被修改。证据backend/target/git-unknown-live-check.json，启动日志git-unknown-app-restart.log。没有制造真实孤儿进程，也未对用户未知执行做人工确认；成功人工关闭的实库/组件/mock浏览器证据不能替代真实孤儿进程人工核对或用户接受。

最终typecheck、build、check:architecture、改动范围lint/stylelint与7文件vp fmt --check通过；UTF-8无BOM、Markdown本地链接、git diff --check和有限敏感模式扫描通过。浏览器临时mock服务已停止，恢复的full-application保持运行。本轮代码、迁移、测试、截图及规划文档按用户后续授权随本次提交交付。

复现命令（仓库根；浏览器命令在frontend目录）：
```text
rtk proxy mvn -B -ntp -f backend/pom.xml -pl :eap-full-application -am '-Dtest=ToolExecutionServiceTest,ToolExecutionJsonTest,ToolExecutionControllerTest,ToolExecutionPersistenceTest,TrustedToolCatalogServiceTest,GitCapabilityTest,DefaultProcessExecutorTest,SchemaAndWiringTest' '-Dsurefire.failIfNoSpecifiedTests=false' test
rtk proxy mvn -B -ntp -f backend/pom.xml test
rtk proxy pnpm --dir frontend test run
rtk proxy pnpm --dir frontend typecheck
rtk proxy pnpm --dir frontend check:architecture
rtk proxy pnpm --dir frontend build
rtk proxy pnpm --dir frontend dev:mock --port 5186 --strictPort
rtk proxy node apps/web/__tests__/browser/tool-execution-visual.mjs --playwright H:/developerTools/ai/hermes/hermes-agent/node_modules/playwright-core --chromium C:/Users/LH/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe --url http://127.0.0.1:5186
```

UNKNOWN人工处置仅覆盖两个内置只读操作；SQL/源码写入UNKNOWN、真实孤儿进程人工核对、跨重启接管与用户接受仍待。不调用真实模型/MCP，不进行repair/clean/baseline，不终止未知PID。


提交准备：完整核查本轮42文件差异、UTF-8/本地链接/空白及敏感模式，V26～V28原稿不变。沿用紧邻实施阶段前端824项、后端946项离线（841通过/105跳过）及最终65项定向证据，提交阶段只更新授权/交付说明，不重跑应用或模型。fetch确认分支状态，提交推送后回读本地/远端SHA；具体提交号见Git记录。

<a id="tool-process-review"></a>
## 当前进程身份线索与隔离父子演练（2026-11-09）

用户授权先提交推送UNKNOWN处置，再继续开发。已提交bb83f31be8ab4545b46dc7efc253fd0e39f4ebd1（42文件，feat: 增加工具 UNKNOWN 人工核对与持久关闭），push origin main成功；git rev-parse HEAD origin/main及git ls-remote --exit-code origin refs/heads/main三者一致，随后工作树干净。提交前完整差异/敏感/编码/链接/暂存空白检查通过，未重跑前阶段模型/测试。以下为该提交之后的接续，用户后续明确授权提交并推送，随本次提交交付。

新增ProcessIdentityInspection API类型、LocalProcessIdentityInspector本地只读观察器、ToolProcessReview产品投影和GET process-review。仅查询当前工作区/操作记录内已捕获身份，最多8步；比对PID/启动时间/绝对可执行路径，返回有时间的即时线索，不读argv/环境、不扫描/枚举、不杀进程、不重放、不修改状态或审计。任何结果均completeProcessTreeEvidence=false；未找到父PID也不能证明子进程结束。旧人工核对/再次启动门禁保留，前端明确点击才检查，错误不清UNKNOWN、离页清除并丢弃迟到响应。DTO/HTTP在runtime-client，业务留L4 capability，复用@eap/ui Button/Feedback，无新包/依赖/迁移。

首轮31模块定向BUILD SUCCESS，47项/0跳过：local 4项含真实自有JVM检查及真实父退出/子存活（最后精确清理测试进程），其余覆盖身份不符/权限不足/身份缺失、有界/不变状态/操作隔离、JSON/HTTP、模块边界与PostgreSQL自有schema。之后补持久化用例检查process-review前后记录不变，最终定向另记。前端定向3文件46项与全量137文件832项通过；typecheck、build、check:architecture及改动范围lint/stylelint通过，既有大chunk/网络防护/Node localStorage提示保留。

真实Chromium+mock服务14组通过、0pageerror，1440/900/390px无横溢；显式检查后UNKNOWN仍阻塞/核对按钮仍要求人工输入，mock仅示例NOT_CAPTURED，不能代替真实OS进程。浏览器脚本补存线索区域三档截图，最终脚本仍14组通过，已查看status线索390px与diff线索1440px截图；页面明确显示模拟、即时观测及非完整退出证明。

构建前读取历史确认无在途工具调用，按jps精确校验后暂停full-application PID7632，并保留原Java启动参数；构建后恢复。无新迁移，V26～V29原稿保留；未扫描/终止用户未知进程，未调用模型/MCP。最终完整离线reactor32模块BUILD SUCCESS/退出0，按本次起始时间汇总161份XML：951项，846通过、105门控跳过、0失败/错误。只在子进程关闭EAP_RUN_*门控，原始日志backend/target/git-process-review-offline-reactor.log，逐报告汇总git-process-review-offline-summary.json。最终定向47项通过、0跳过，包含补充的持久不变断言；日志git-process-review-final-targeted.log。

15:38按原参数恢复full-application，PID34672；启动日志校验29份迁移，schema已最新，无迁移执行，health为200/ok。新GET process-review对原真实diff成功记录返回409、status跨操作404、非信任Origin403；前后GET快照一致。只读回读V26=-716806117、V27=1802106427、V28=-329790285、V29=-508415836均与源码一致。证据backend/target/git-process-review-live-check.json和git-process-review-app-restart.log。成功身份检查由本地真实进程/隔离服务回归验证，不把真实HTTP拒绝路径当完整UNKNOWN人工接受。

最终7文件vp fmt --check及git diff --check通过，全部改动UTF-8无BOM、本地Markdown链接和有限敏感模式扫描通过；前端类型/架构/构建及目标lint/stylelint均退出0。临时mock服务已停止，恢复的full-application保持运行。

复现命令（仓库根；浏览器脚本在frontend目录）：
```text
rtk proxy mvn -B -ntp -f backend/pom.xml -pl :eap-full-application -am '-Dtest=LocalProcessIdentityInspectorTest,ToolExecutionServiceTest,ToolExecutionJsonTest,ToolExecutionControllerTest,ToolExecutionPersistenceTest,SchemaAndWiringTest,BackendModuleBoundaryTest' '-Dsurefire.failIfNoSpecifiedTests=false' test
rtk proxy mvn -B -ntp -f backend/pom.xml test
rtk proxy pnpm --dir frontend test run
rtk proxy pnpm --dir frontend typecheck
rtk proxy pnpm --dir frontend check:architecture
rtk proxy pnpm --dir frontend build
rtk proxy node apps/web/__tests__/browser/tool-execution-visual.mjs --playwright H:/developerTools/ai/hermes/hermes-agent/node_modules/playwright-core --chromium C:/Users/LH/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe --url http://127.0.0.1:5186
```

本片不把隔离JVM测试等同异常Git人工接受，不实现跨重启进程接管或进程树完整证明。后续仍需实际异常执行的人工核对/用户接受以及其他工具合同。本接续按用户后续授权随本次提交交付，结果以Git回读为准。

提交准备接续：本次用户授权先提交并推送当前进程线索检查，再继续开发。复核49文件差异、敏感模式、UTF-8、Markdown链接及暂存空白；V26～V29原稿不变。沿用紧邻实现阶段832项前端、951项后端离线（846通过/105跳过）及最终47项定向证据，未为提交重跑服务/模型。提交前fetch，推送后回读本地及远端SHA；具体提交号以Git记录为准。
