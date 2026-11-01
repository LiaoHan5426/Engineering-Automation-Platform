# 后端 runtime 模块拆分

状态：五模块拆分、父任务干净全量验证及最终独立复核通过，纳入本轮后端交付。既有前端/图标调整另行提交，application.yml保持排除。IDEA实际重启及完整生产启动仍未验证。

## 证据与问题

基线HEAD `201ac69`；现有Maven只有eap-api与eap-runtime。runtime同时包含HTTP控制器/DTO、模型接入、工程执行、规则、持久化与启动装配。静态导入显示application→web.dto、ai→web.dto、persistence→controller（仅JavaDoc），以及看板交付→AI快照等反向耦合；因此不能按一级包名直接机械分模块。

## 本轮边界与顺序

保留单进程、Spring Boot、Java25、Spring AI2.0.2、既有事务/权限/执行器/API；不引入微服务、重复SPI或新调度器。

1. `eap-api`：现有稳定无Spring/模型SDK能力契约，不为拆分把实现类型塞进此包。
2. `eap-engine`：确定性工程执行、规则/专家、任务/Run及其持久化实现，现有非模型LLM业务接口/预算/缓存、RuntimeWorkspace。这里是工程业务内核，不声称纯无框架domain；现有HTTP异常映射耦合暂保留并记录，不扩大本次行为重构。
3. `eap-ai`：Spring AI/动态模型与Chat、代码生成/应用、Skill服务、SQL模型兼容桥；依赖engine。涉及AI快照的BoardApplicationEvidence/BoardCodeTaskBinding/BoardDeliveryService作为交付整合逻辑归本模块，避免engine反向依赖AI。只读Run与验证仍在engine，不归因为AI生成器。
4. `eap-web`：控制器、请求防护与WebConfiguration，包括SkillController；依赖ai/engine。跨层普通DTO迁至application.dto，AI响应迁至ai.dto，保持JSON字段和HTTP路径不变。
5. `eap-runtime`：唯一可执行启动入口、具体Bean装配、内置专家播种、application配置、Flyway资源及跨模块集成测试。规则资源随engine、聊天角色资源随ai，专家播种资源仍runtime。只此模块启用Boot repackage，其余普通jar。

依赖方向：runtime→web→ai→engine→api；直接使用某模块类型时在pom显式声明，不依赖传递关系掩盖职责。类包名原则上保留，DTO包迁移除外，不一次性更名整个命名空间。

## 资源、测试与运行约束

- 已应用V1～V19迁移位置和内容保持runtime不变，不reset/repair/clean数据库；用户application.yml不读不改不提交。
- 测试先按实际依赖分类：可独立编译的单元测试随实现迁移，依赖启动器、跨层类、运行资源或实库门控的测试留runtime，不能为减少模块数跳过测试。
- 只读独立审查发现LlmPipelineTest/AiErrorsTest依赖runtime测试夹具，已留回runtime而非反向加test依赖；SchemaAndWiringTest改为扫描四个实现模块源码。现有同包协作跨jar保留，增加DevTools restart include统一加载项目jar，避免IDEA以安装jar引用时同包不同classloader；尚不声明IDEA人工重启联调完成。
- 新增模块边界/源码归属回归，确保runtime不是再次吸收业务源码，engine不引用ai/web，Web控制器不漏扫描。
- 重跑整个reactor与实库/真实Git条件门控；构建可执行jar并检查BOOT-INF依赖和迁移资源。启动验证不得更改或复用未知生产凭据，不另启用户Java服务；IDEA需重新导入Maven以刷新模块classpath，DevTools不能自动修复IDEA运行配置。
- 以单次Maven实际汇总统计测试，搬移后旧target报告不可混算。不把编译成功当成真实供应商调用/业务交付完成。

## 剩余非目标

本轮不重写CodeChangeService等大类内部业务、不分布式化、不消除所有领域/持久实现相互依赖。后续如需进一步细分engine，须先证明清晰接口与独立测试收益，避免仅为目录整齐继续拆包。

## 父任务实际验证

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
