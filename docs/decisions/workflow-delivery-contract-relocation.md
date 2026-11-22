# 编排层 delivery 纯契约归位 core（2026-11-22）

## 背景

台账 BM-01～07 的模块边界剩余关口长期标注「delivery/JDBC 依赖仍按端口抽取 + 装配改造单独评审」。继 SQL 输入端口（`DatabaseEvidenceInput`）、MCP 目录端口（`McpCatalogQuery`）、local 纯契约（`WorkspaceSearchInput`/`CliChannelStore`/`LocalProcessIdentityInspector`）、知识授权端口（`ExpertKnowledgeAccess`）归位 core 后，本片继续按同一依赖倒置原则处理 delivery 侧。

彻底排查 `eap-engine-delivery` 的类型与 workflow 的引用关系后，事实如下：

| 类型 | 性质 | 依赖 | workflow 引用文件数 | 本片处理 |
| --- | --- | --- | --- | --- |
| `CodeProposalStatus` | 纯枚举（`WireValue`） | 仅 eap-api `WireValue` | 12 | 归位 core |
| `SourceDependencyKind` | 纯枚举（`WireValue`） | 仅 eap-api `WireValue` | 3 | 归位 core |
| `CodeErrors` | 错误码 | 仅 eap-api `PlatformErrorCode` | 9 | 归位 core |
| `PrototypeVersion` | 不可变值记录 | 仅 JDK | 10 | 归位 core |
| `PrototypeVersionQuery` | 只读查询端口 | 仅 `PrototypeVersion` / JDK | 3 | 归位 core |
| `ComponentGraph` | 带 Jackson 解析的值对象 | spring-web `ResponseStatusException` + Jackson + `CodeErrors` | 9 | 保留 delivery（spring-web 耦合） |
| `CodeGenerationStore` | 仓储端口 | 引用 `CodeChangeService.Generation/SourceExcerpt` 行为嵌套 record | 13 | 保留 delivery（行为嵌套 record 耦合） |
| `CodeProposalStore` | 仓储端口 | 引用 `CodeChangeService` 行为嵌套 record | 10 | 保留 delivery（同上） |
| `CodeChangeService` | 722 行写文件行为服务 | 文件系统行为 + 12 个嵌套 record（被 44 文件引用） | 7（作为行为注入） | 保留 delivery |
| `CodeVerificationService` / `CodeVerificationProperties` | 校验行为服务与配置 | 行为 | 各 1～2 | 保留 delivery |
| workflow 内 `com.lh.eap.delivery` 包 4 类（`JdbcCodeGenerationStore`/`JdbcCodeProposalStore`/`SourceWriteReview`/`CapabilityDirtyRunner`） | JDBC/文件适配器实现 | 依赖 workflow 的 `BoardXxxService` / local 行为类 | 4（装配引用） | 保留 workflow |

关键结论：

1. 五个目标类型都是**纯枚举、值记录、错误码或只读端口**，只依赖 core / eap-api / JDK，是本片可干净归位的部分。
2. `ComponentGraph` 因携带 spring-web 异常与 Jackson 解析逻辑，归位会把 spring-web 拉入 core，得不偿失；`CodeGenerationStore`/`CodeProposalStore` 直接引用 `CodeChangeService` 的行为嵌套 record，归位会把 core 拉向 delivery 行为类；`CodeChangeService` 本身是写文件行为服务。这三类（共 6 个类型）属于「行为/实现」而非「纯契约」，与 local 九类行为能力的处理原则一致，不为拆而拆。
3. workflow 内 `com.lh.eap.delivery` 包的 4 个适配器实现依赖编排层 `BoardXxxService`，物理归位会形成 delivery → workflow 反向依赖，须在 JDBC 端口抽取时统一评审，不在本片范围。

## 决定

1. 把五个纯契约从 `eap-engine-delivery` 归位到 `eap-engine-core`，**删除旧定义、不留别名**：

   - `CodeProposalStatus` → `com.lh.eap.domain.model.CodeProposalStatus`（与 `DatabaseEvidenceInput` 同包，同为 WireValue 领域枚举）
   - `SourceDependencyKind` → `com.lh.eap.domain.model.SourceDependencyKind`（同上）
   - `CodeErrors` → `com.lh.eap.error.CodeErrors`（与 `AgentErrors`/`ChatErrors` 同包；**包名不变，调用方 import 零改动**）
   - `PrototypeVersion` → `com.lh.eap.domain.model.PrototypeVersion`（值记录）
   - `PrototypeVersionQuery` → `com.lh.eap.core.PrototypeVersionQuery`（只读端口，与 `CapabilityUsageQuery` 同包）

2. 全量改引用点（main + test，跨 workflow / full-app / spring-autoconfigure / delivery 模块），包括同包共享包名的静态引用与测试里的全限定名断言。`CodeErrors` 因包路径不变无需改 import。

3. 归位后 `eap-engine-delivery` 模块不再定义这五个类型；架构守卫新增断言：五个类型确实定义于 core，且 delivery 模块内旧文件不存在，防止回退。

4. **不移除 workflow 对 `eap-engine-delivery` 的 pom 依赖**：`CodeChangeService`/`CodeGenerationStore`/`CodeProposalStore`/`ComponentGraph` 等行为与耦合契约仍由 delivery 模块提供并被编排层使用，这条编译依赖是真实的、正常的。本片是「纯契约归位」，不是「delivery/JDBC 依赖边拆除」，台账与叙述不得宣称 delivery 已拆。

## 红线

- 不改运行时行为、HTTP 契约、数据库 schema；五个类型的方法签名与语义保持完全一致。
- 纯结构迁移，测试数应与本轮基线一致，无新增/删除测试方法。
- 不为拆而拆：不抽 `CodeChangeService` 的嵌套 record 端口、不迁 4 个 JDBC/文件适配器、不动 workflow 的 pom 边界、不动 full 装配。
- 五个类型的序列化 `@JsonValue`/`WireValue` 行为与错误码常量逐字保留。

## 验证口径

- `mvn -o -q -DskipTests test-compile` 先排除编译错（跨模块改 import，编译先行降本）。
- `mvn -o -q test` 全量，按 mtime 过滤 surefire 报告统计；测试数应与基线一致（纯结构迁移）。
- `git diff --check`、文档链接检查；本决策文档零失效链接。
- 架构守卫测试通过，且新增的 delivery 契约守卫能挡住回退。
