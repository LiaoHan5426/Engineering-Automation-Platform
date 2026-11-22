# JDBC 端口化方案设计（编排层持久化实现归位）

> 状态：设计定稿，待实施
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
| `CodeGenerationStore` | `JdbcCodeGenerationStore` | 同上 |
| `CodeProposalStore` | `JdbcCodeProposalStore` | 同上 |

这 10 个是**纯机械迁移**：端口签名不动，只需 `git mv` + 改包声明 + 更新 `@Import` 与测试构造，测试行为零变更。

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
| **P0 骨架** | 新建 `eap-engine-persistence-jdbc`；reactor/full-app 注册依赖；守卫先立 | 新 pom 只依赖 `eap-api`/`eap-engine-core`/`spring-boot-starter-jdbc`/`spring-tx`；`BackendModuleBoundaryTest` 增加模块存在性与依赖方向断言 | reactor `test-compile`；守卫定向测试 |
| **P1 已有端口迁移** | 4.1 节 10 个实现类（9 个 `@Repository` + `JdbcCliChannelStore`） | `git mv` 到新模块，包名改 `com.lh.eap.persistence.jdbc`；更新 `@Import`、测试 `new` 构造；core 端口不动 | 定向 Postgres 测试（Mission/Handoff/ToolExecution/CodeProposal 等 8 类） |
| **P2 Mapper/辅助迁移** | `TaskRepository`、`CliProgramMapper`、`ExpertDefinitionMapper`、`CapabilityUsage`、`StateBindings` | 抽取 `TaskStore`/`CliProgramStore`/`ExpertDefinitionQuery` 端口；`WorkspaceInterlock` 改注入端口；SQL 常量 `StateBindings` 随实现迁移 | 编译 + 持久化/CLI/能力相关定向测试 |
| **P3 查询型服务** | 6 个只读/轻写服务（Baseline/Catalog/Prototype/Review/Runtime/Scenario） | 抽 `XxxQuery`/`XxxStore`，适配器落新模块；服务保留输入校验 | 对应持久化测试；契约脚本 |
| **P4 混合型服务拆分** | 11 个重服务（BoardTask/Verification/Run/Delivery/CapabilitySettings/ExpertApproval/ExpertDefinition 等） | SQL + RowMapper 抽到适配器；消除 `new JdbcXxxStore(jdbc)`；服务保留规则/事务 | 全量 wire/验收/持久化测试（这一期改动最大，必须与 P3 分开验证） |
| **P5 收口** | workflow 移除 `spring-boot-starter-jdbc`（显式保留 `spring-tx` 给 `@Transactional`/`TransactionTemplate`）；守卫加终态断言 | 守卫断言 workflow main 源码无 `org.springframework.jdbc`、pom 无 starter-jdbc；所有 `Jdbc*` 类必须在新模块且实现 core 端口 | **全量 `mvn -o test`** + 契约脚本 + `git diff --check` |

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
