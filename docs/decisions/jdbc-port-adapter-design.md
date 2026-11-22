# JDBC 端口化方案设计（编排层持久化实现归位）

> 状态：P0–P3 已实施并提交（2026-11-22）；P4–P5 代码与依赖边界已迁移，离线全量回归 1216 项（0 失败、0 错误、153 跳过）通过；真实 PostgreSQL 等门控集成验收未纳入本轮；实现已阶段提交（d105abbf）
> 日期：2026-11-22
> 范围：`eap-engine-workflow` 编排层混入的持久化实现（30 个直用 `JdbcTemplate` 的类）

## 1. 背景与现状盘点

前面 21 个切片已完成「纯契约归位 core」：SQL 证据输入、MCP 目录、local/knowledge/delivery 端口、领域契约 13、错误码 9、状态枚举 14、跨模块契约 14。core 现在是纯领域 + 端口层（只依赖 `eap-api` 与 Jackson，零 Spring JDBC），全量 1212 项测试通过。

剩余最后一块架构债是**持久化实现仍在编排层**。本次不是机械归位，而是行为级重构，因此先做完整盘点（基于实际源码扫描，非估算）：

| 类别 | 数量 | 位置 | 说明 |
|---|---|---|---|
| `@Repository` 存储适配器 | 12 | `persistence/mapper`(10) + `delivery`(2) | 多数已实现 core/delivery 端口，可整体迁移 |
| `@Service` 业务服务直接写 SQL | 16 | `application/service`(15) + `persistence/mapper`(1) | 端口化真正难点：SQL 与业务规则混在同一类 |
| 无注解持久化类 | 2 | `application/service` / `persistence/mapper` | `BoardApplicationCatalog`、`WorkspaceInterlock`（另 `StateBindings` 为 SQL 常量，随实现迁移） |

30 个类按 `JdbcTemplate` 调用强度分布：

- **重（≥20 次 SQL 方法调用）**：`JdbcExpertAgentJournal`(48)、`BoardTaskService`(20)、`ExpertAgentApprovalService`(30)、`ExpertDefinitionService`(26)、`JdbcMissionExecutionStore`(30)、`JdbcCodeProposalStore`(18)、`CliProgramMapper`(24)、`TaskRepository`(20)
- **中（8–19 次）**：`BoardVerificationService`、`BoardRunService`、`BoardDeliveryService`、`BoardReviewService`、`ScenarioService`、`JdbcPrototypeVersionStore` 等
- **轻（<8 次）**：`BoardRuntimeService`(2，但单条 30 行 CTE)、`BoardApplicationBaseline`、`BoardApplicationCatalog`、`BoardPrototypeService` 等

**关键反模式**（必须在方案中一并消除）：

1. `BoardTaskService.fromPrototype` 直接 `new JdbcPrototypeVersionStore(jdbc)`——把存储适配器当工具类实例化，绕过端口。
2. 16 个业务服务构造器直接注入 `JdbcTemplate`（另有 2 个无注解类同样直用），测试也必须 `new XxxService(jdbc)`，导致业务测试与真实 Postgres 强绑定。
3. `BoardRuntimeService` 把 30 行 CTE 查询、wire 状态校验 record、JSON 反序列化揉在一个方法里。
4. `workflow/pom.xml` 直接依赖 `spring-boot-starter-jdbc`，编排层无法脱离持久化技术编译。

## 2. 根因与目标

**根因**：core 端口已经就位（20+ 接口），但没有独立的适配器模块承载实现；组合根 `eap-full-application` 通过显式 `@Import` 把 workflow 里的 `@Repository`/`@Service` 全部装配起来，形成「端口在上、实现仍在中层」的半吊子倒置。

**目标依赖方向**（自左向右单向）：

```
eap-api ──→ eap-engine-core ──→ eap-engine-workflow ──→ eap-web-* ──→ eap-full-application(组合根)
                │                      │                                      │
                └──→ eap-engine-persistence-jdbc ←──────────────────────────┘
                       (新建：所有 JdbcTemplate 实现，实现 core 端口)
```

- `eap-engine-core`：领域模型 + 端口接口，**零 Spring JDBC**（现状已满足）
- `eap-engine-persistence-jdbc`（新建）：所有 `JdbcTemplate` / `RowMapper` / SQL 常量 / JSON 列映射，只依赖 core + `eap-api` + Spring JDBC/TX
- `eap-engine-workflow`：业务编排 + 规则 + 事务边界，只依赖 core 端口 + `spring-tx`（**移除 `spring-boot-starter-jdbc`**）
- `eap-full-application`：组合根，显式 `@Import` 适配器与业务服务；Flyway DDL 继续留在此模块

## 3. 方案比选

| 方案 | 做法 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| A. 新建 `eap-engine-persistence-jdbc` | 所有 JDBC 实现集中到独立模块 | 边界清晰；workflow 可彻底移除 JDBC 依赖；守卫可机械断言；符合已建立的 core/实现分层惯例 | 新增模块 + 改 reactor/full-app pom + 全量 @Import 与测试构造 | **推荐** |
| B. 迁到组合根 `eap-full-application` | 与 `ChatMessageGraphStore`/`JdbcChatExecutionStore` 先例一致 | 不新增模块，改动小 | 组合根膨胀到 30+ 实现类；守卫 `runtimeOnlyOwnsBootstrapAndMigrations` 的允许清单失控；领域实现与启动配置混放 | 否决 |
| C. 仅在 workflow 内加接口、实现留在原处 | 补端口接口，实现不迁移 | 最小改动 | workflow 仍依赖 JDBC，架构债未还；与前面 21 片归位方向矛盾 | 否决 |

选 A。用户已明确「重构允许破坏旧结构」，不因新增模块或改 pom 而缩手。

## 4. 端口清单与映射

### 4.1 已有端口的实现类（实现需迁移，共 10 个）

这 10 个中 9 个是 `@Repository`，`JdbcCliChannelStore` 是 `@Service`。

**实施调整（P1，2026-11-22）**：实际迁移 8 个。`JdbcCodeGenerationStore` 与 `JdbcCodeProposalStore` 反向依赖 workflow 业务服务（`BoardTaskService`、`BoardCodeTaskBinding`、`WorkspaceInterlock`、`BoardApplicationBaseline`、`CodeChangeService`），机械迁移会让适配层依赖业务层，违背端口方向；这 2 个留到 P4 与业务服务拆分同批实施。另外 `JdbcExpertAgentJournal` 依赖 `TaskRepository`，因此 P1 与 P2 必须同批落地。

| 端口（core） | 现实现（workflow） | 目标位置 |
|---|---|---|
| `MissionStore` | `JdbcMissionStore` | `persistence/jdbc` |
| `MissionExecutionStore` | `JdbcMissionExecutionStore` | 同上 |
| `HandoffStore` | `JdbcHandoffStore` | 同上 |
| `ToolExecutionStore` | `JdbcToolExecutionStore` | 同上 |
| `PrototypeDeliveryStore` | `JdbcPrototypeDeliveryStore` | 同上 |
| `PrototypeVersionStore` | `JdbcPrototypeVersionStore` | 同上 |
| `ExpertAgentJournal` | `JdbcExpertAgentJournal` | 同上 |
| `CliChannelStore` | `JdbcCliChannelStore` | 同上 |
| `CodeGenerationStore` | `JdbcCodeGenerationStore` | JDBC 证据实现迁至 `persistence-jdbc`；workflow 保留纯映射 `CodeGenerationStoreAdapter` |
| `CodeProposalStore` | `JdbcCodeProposalStore` | JDBC 证据实现迁至 `persistence-jdbc`；workflow 保留纯映射 `CodeProposalStoreAdapter` |

前 8 个可直接物理迁移；后 2 个原实现依赖 workflow 的任务绑定/应用基线，P4 通过 core 证据端口与 workflow 纯映射适配器拆分，不能作为机械迁移处理。

### 4.2 待抽取端口（业务服务中的 SQL，建议命名）

按「一服务一端口」原则，把 SQL + `RowMapper` + JSON 列映射抽出为 `JdbcXxxStore`，服务只保留校验、规则、事务编排：

| 源服务 | 建议端口（core） | 建议适配器（persistence-jdbc） | 抽取要点 |
|---|---|---|---|
| `BoardTaskService` | `BoardTaskStore` | `JdbcBoardTaskStore` | 抽出 `SELECT`/`ROW`/6 处 query + 6 处 update；`fromPrototype` 改为注入 `PrototypeVersionQuery` |
| `BoardRuntimeService` | `BoardRuntimeQuery` | `JdbcBoardRuntimeQuery` | 整条 CTE + JSONB 聚合；`Snapshot`/`Activity` record 留 core，构造校验不绕过 |
| `BoardApplicationBaseline` | `BoardBaselineStore` | `JdbcBoardBaselineStore` | 写前证据的幂等写入 |
| `BoardApplicationCatalog` | `BoardApplicationCatalogQuery` | `JdbcBoardApplicationCatalogQuery` | 只读分页发现 |
| `BoardCodeProposalService` | `BoardCodeProposalReviewStore` | `JdbcBoardCodeProposalReviewStore` | 评审动作与持久化 |
| `BoardPrototypeService` | `BoardPrototypeSelectionStore` | `JdbcBoardPrototypeSelectionStore` | 版本选择与引用 |
| `BoardReviewService` | `BoardReviewStore` | `JdbcBoardReviewStore` | 评审收集 |
| `BoardRunService` | `BoardRunStore` | `JdbcBoardRunStore` | Run 与快照关联 |
| `BoardVerificationService` | `BoardVerificationStore` | `JdbcBoardVerificationStore` | 12 处 update 的验证状态机 |
| `BoardDeliveryService` | `BoardDeliveryStore` | `JdbcBoardDeliveryStore` | 交付申请与裁决 |
| `CapabilityCatalog` | `CapabilityCatalogQuery` | `JdbcCapabilityCatalogQuery` | 能力目录只读 |
| `CapabilitySettings` | `CapabilitySettingsStore` | `JdbcCapabilitySettingsStore` | 已实现 `CapabilitySwitches`；补写端口 |
| `ExpertAgentApprovalService` | `ExpertApprovalStore` | `JdbcExpertApprovalStore` | 已实现 `ExpertAgentWrites`；补读端口 |
| `ExpertDefinitionService` | `ExpertDefinitionStore` | `JdbcExpertDefinitionStore` | 已实现 `DatabaseGrantQuery`；定义/授权拆分 |
| `ScenarioService` | `ScenarioStore` | `JdbcScenarioStore` | 场景配置 CRUD |
| `TaskRepository` | `TaskStore` | `JdbcTaskStore` | 通用任务表读写 |
| `CliProgramMapper` | `CliProgramStore` | `JdbcCliProgramStore` | CLI 程序目录 |
| `ExpertDefinitionMapper` | `ExpertDefinitionQuery` | `JdbcExpertDefinitionQuery` | 定义查询（与 Store 分开） |
| `CapabilityUsage` | `CapabilityUsageQuery`（已有） | `JdbcCapabilityUsageQuery` | 用量只读 |
| `WorkspaceInterlock` | `WorkspaceLockStore` | `JdbcWorkspaceLockStore` | 仓库本地锁权威 |

> 注意：端口落 core 时只放 **调用签名 + 返回 record**；返回 record 若是 wire 状态载体（如 `BoardRuntimeService.Activity`），其校验逻辑随 record 留在 core。

## 5. 分期实施计划（每期可独立编译、验证、回滚）

| 期 | 内容 | 关键动作 | 验证口径 |
|---|---|---|---|
| **P0 骨架** ✅已实施 | 新建 `eap-engine-persistence-jdbc`；reactor/full-app 注册依赖；守卫先立 | 新 pom 依赖 `eap-api`/`eap-engine-core`/`spring-boot-starter-jdbc`/`spring-web`（2 个适配器用 `ResponseStatusException`）；`BackendModuleBoundaryTest` 增加模块存在性与依赖方向断言 | reactor `test-compile` EXIT=0 |
| **P1 已有端口迁移** ✅已实施（8 个） | 4.1 节中 8 个无反向依赖的实现类；2 个 Code Store 留 P4 | `git mv` 到新模块，包名改 `com.lh.eap.persistence.jdbc`；更新 `@Import`、测试 import；core 端口不动 | 全量 `test-compile` EXIT=0 |
| **P2 Mapper/辅助迁移** ✅已实施 | `TaskRepository`、`CliProgramMapper`、`ExpertDefinitionMapper`、`CapabilityUsage`、`StateBindings` | 随 P1 同批迁移；`StateBindings` 去掉无用 `application.service.*` 通配 import；`CapabilityUsage` 去掉对 `CapabilitySettings` 的 Javadoc 链接；`TaskStore`/`CliProgramStore`/`ExpertDefinitionQuery` 端口抽取推迟到 P3（当前仅物理迁移，无行为变更） | 全量 `test-compile` EXIT=0 |
| **P3 查询型服务** ✅已实施 | 6 个只读/轻写服务（Baseline/Catalog/Prototype/Review/Runtime/Scenario） | 抽 `BoardBaselineStore`/`BoardApplicationCatalogQuery`/`BoardPrototypeSelectionStore`/`BoardReviewStore`/`BoardRuntimeQuery`/`ScenarioStore` 到 core，6 个 `Jdbc*` 适配器落新模块；服务只保留输入校验、JSON 领域映射与编排；`BoardDeliveryService` 不再用 JdbcTemplate 现造 Catalog | 对应持久化测试；契约脚本 |
| **P4 混合型服务拆分** ⏳验证中 | BoardTask/Verification/Run/Delivery/CodeProposal/CapabilityCatalog/Settings/WorkspaceInterlock/ExpertApproval/Definition 与 2 个 Code Store | core 新增业务端口；SQL/RowMapper 迁至 JDBC 适配器；Code Store 的业务映射留 workflow 纯层，组合根显式注册 | 生产编译已通过；测试编译、定向/全量回归与阶段提交待验证 |
| **P5 收口** ⏳验证中 | CLI、专家定义/访问、任务存储改依赖 core 端口；workflow 移除 `persistence-jdbc` 与 `spring-boot-starter-jdbc` 依赖并显式保留 `spring-tx` | 守卫断言 workflow main 零 JDBC/适配器 import、pom 无两项依赖；JDBC 适配器测试归位新模块 | 生产编译已通过；**全量 `mvn -o test`** + 契约脚本 + `git diff --check` 待验证 |

**本轮（P0–P2）实际落地记录**：

- 13 个类 `git mv` 到新模块（原 `persistence/mapper` 12 个 + `application/service` 1 个），rename 历史保留；36 个文件 FQN 替换、18 个文件补 import
- 新增守卫 `jdbcAdaptersLiveInDedicatedModuleAfterP0P2`：13 个定义位置 + 旧文件清理 + 旧包 import 清零（只匹配真实 import 行）+ 模块依赖方向
- **过渡依赖（须在 P5 前消除）**：workflow pom 临时依赖 `eap-engine-persistence-jdbc`，因为 2 个 Code Store 与业务服务仍引用已迁走的 `StateBindings`/`TaskRepository`/`JdbcPrototypeVersionStore`；P4 完成端口抽取后移除该依赖并合入 P5 收口
- 新模块 pom 需 `spring-web`：`JdbcCliChannelStore` 与 `JdbcExpertAgentJournal` 使用 `ResponseStatusException`/`HttpStatus`（编译实测暴露后补齐）

**本轮（P3）实际落地记录**：

- 6 个 core 端口落地：`BoardBaselineStore`、`BoardApplicationCatalogQuery`、`BoardPrototypeSelectionStore`、`BoardReviewStore`、`BoardRuntimeQuery`、`ScenarioStore`；其中 `BoardRuntimeQuery.Activity` 保留 wire 状态构造校验，适配器只做 ResultSet → 领域 record 映射。
- 6 个 JDBC 适配器落新模块：`JdbcBoardBaselineStore`、`JdbcBoardApplicationCatalogQuery`、`JdbcBoardPrototypeSelectionStore`、`JdbcBoardReviewStore`、`JdbcBoardRuntimeQuery`、`JdbcScenarioStore`；原生 SQL、CTE、RowMapper 和 JSON 列读写全部迁出 workflow。
- 6 个服务不再注入 `JdbcTemplate`；对外 record（如 `BoardRuntimeService.Snapshot`、`BoardApplicationCatalog.Page`、`BoardReviewService.Page`）保持原名，由服务层做端口 record → 对外 record 映射，web 契约不变。
- `BoardDeliveryService.applications` 改为消费注入的 `BoardApplicationCatalogQuery`，删除 `new BoardApplicationCatalog(jdbc)` 反模式；其自身剩余 SQL 留待 P4。
- 测试构造全部改为显式注入适配器；组合根 `@Import` 增加 6 个新适配器；守卫 `p3QueryServicesUseDedicatedPorts` 断言端口/适配器存在且六个服务零 JDBC import。

**P4 待验证的实现事实**：BoardTask/Verification/Run/Delivery/CodeProposal、CapabilityCatalog/Settings/WorkspaceInterlock、ExpertApproval/Definition 等服务已切到 core 端口；新 JDBC 适配器落 `persistence-jdbc`。原 workflow 两个 `JdbcCode*Store` 已替换为该模块的证据存储和 workflow 的 `Code*StoreAdapter` 纯映射层（不含 JDBC）；`SourceWriteReview` 消费新映射层。组合根增加显式注册。`BackendModuleBoundaryTest.p4MixedServicesNoLongerOwnJdbc` 只约束 P4 已迁移类，避免把 P5 尚未完成的 CLI/Task/Expert 管理依赖误判为 P4 已收口。上述为代码状态，不代表回归或用户验收；P4 需测试编译、行为回归及阶段提交后才能标记完成。

**P5 定向验证后的代码状态（非终态）**：`CliProgramMapper` 实现 core `CliProgramStore`，CLI 三个调用方改依赖端口；`ExpertDefinitionMapper` 实现独立 `ExpertDefinitionManagementStore`，保留 FOR SHARE/修订号和原草稿写入 SQL；`TaskRepository` 实现 core `TaskStore`，任务服务、执行服务与 Agent 访问服务改依赖接口。workflow main 已无 Spring JDBC/`persistence.jdbc` import，workflow pom 移除 JDBC starter 和适配器模块，仅保留显式 `spring-tx`；`JdbcCliChannelStoreTest` 归位适配器模块并为其原 CliChannels 场景增加 test-scope local 依赖。全应用 reactor 的生产编译、测试编译、契约脚本及边界守卫均通过；全量后端测试先出现两类测试桩迁移遗漏（专家知识、看板验证），修正后对应定向测试分别通过，但全量进程被终止，未获得全量退出码 0。此前更大的定向组也被终止，已拆小组复验，不能将其视作通过；P4–P5 尚待其余相关回归及全量测试，不宣称终态。

每期结束一个本地提交（文档/实现/台账分笔），不跨期混提；P1–P4 任一期望逐期回滚时，只需回退该期提交。

## 6. 关键设计决策

1. **事务边界留在业务层**：`@Transactional` 与 `DagExecutionTransactions`（短事务快照 + 无事务执行 + 短写回）继续留在 workflow 服务层；`persistence-jdbc` 适配器不声明 `@Transactional`，只执行传入 SQL。例外：`JdbcExpertAgentJournal` 的 `claim/check` 需要原子 CAS 语义，可在适配器内部用 `TransactionTemplate`，但必须由端口方法名体现（如 `claim` 本身即原子操作）。
2. **wire 校验不迁移到适配器**：所有 record 构造时的 `fromWire(...)` 校验留在 core 领域模型；适配器只做 ResultSet → 领域 record 的机械映射，不得自行绕过校验构造。
3. **组合根显式装配**：继续用 `FullApplicationConfiguration.@Import` 显式列出适配器与服务，不引入组件扫描；迁移时只改 `@Import` 清单，装配语义不变。
4. **测试构造随端口改造**：`new XxxService(jdbc)` 统一改为 `new XxxService(new JdbcXxxStore(jdbc))`；持久化测试仍连真实 Postgres + Flyway V1–V5，不引入 mock DB。
5. **DDL 位置不变**：`src/main/resources/db/migration/V1–V5` 继续留 `eap-full-application`，守卫 `runtimeOnlyOwnsBootstrapAndMigrations` 的迁移文件白名单不动。

## 7. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 测试构造改动面大（约 30+ 测试文件直接 `new XxxService(jdbc)`） | P3/P4 测试编译可能集中报错 | 每期只改本期涉及的测试；用 `test-compile` 快速兜底，不全量等 16 分钟 |
| 事务语义被破坏（尤其 Agent 领取/租约） | 运行时并发错误 | P1 迁移 `JdbcExpertAgentJournal` 时先跑 `ExpertAgentContinuationPersistenceTest`/`SqlExpertAgentPersistenceTest`；CAS 方法保留 `TransactionTemplate` |
| 显式 `@Import` 漏改导致 bean 缺失 | 启动失败 | P1 后立即跑组合根上下文加载测试（守卫 `bootstrapScanFindsComponentsAcrossLibraryJars` 已覆盖部分）；每期核对 `@Import` 清单 |
| core 端口膨胀 | 端口层失去「稳定契约」意义 | 端口按「一业务能力一端口」合并，禁止一个 SQL 一个端口；P3/P4 前复审端口清单 |

## 8. 验收标准

- **结构**：workflow main 源码零 `org.springframework.jdbc` 引用；pom 零 `spring-boot-starter-jdbc`；30 个类全部落 `eap-engine-persistence-jdbc`；core 零 Spring JDBC。
- **行为**：全量 `mvn -o test` BUILD SUCCESS，测试数不低于当前基线 1212，0 失败 / 0 错误；契约脚本 EXIT=0（20 状态域 / 23 错误目录 / 530 错误码）。
- **守卫**：`BackendModuleBoundaryTest` 新增终态守卫并通过；既有 16 条守卫不回归。
- **文档**：`docs/planning-status.md` BM 行更新为「JDBC 端口化已实施」；本方案在决策索引中可检索。

## 9. 与既有决策的关系

前 21 片归位是本方案的前置：core 端口齐全（尤其 4.1 的 10 个 Store）、wire record 自带校验、组合根显式装配、边界守卫体系成熟。本方案是这些前置条件落地后的**最后一块架构债清算**，不改变已归位契约的位置与签名。
