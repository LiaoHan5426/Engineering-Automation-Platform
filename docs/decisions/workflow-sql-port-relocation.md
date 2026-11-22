# 编排层输入端口归位：解除 workflow 对 SQL 实现模块的编译依赖（2026-11-22）

## 状态与范围

有效合同，关闭台账 `BM-01～07 后端模块组合` 中"workflow 编排层仍编译依赖 SQL 实现模块"这一条依赖边。

**用户取向依据**：当前工作性质是重构；旧结构可保留但不必为兼容旧架构而缩手。因此本片是**刻意的破坏性归位**——删除旧包、不做别名、同步改全部引用点，而不是叠加兼容层。

**只做一件事**：把纯领域输入端口 `DatabaseEvidenceInput` 从 `eap-engine-sql`（实现模块）归位到 `eap-engine-core`（领域层），使 `eap-engine-workflow` 不再因一个接口而编译依赖整个 SQL 实现模块。

**明确不做**（仍为独立关口，不能因本片宣称完成）：

- 不拆 workflow 对 `eap-engine-local`、`eap-engine-delivery`、JDBC（`JdbcTemplate`）的依赖。JDBC 侧 30 个类直接用 `JdbcTemplate`——这是端口抽取 + 装配改造的更大范围，单独评审。**MCP 例外**：其依赖已于同日经 `McpCatalogQuery` 端口拆除，见[MCP 目录端口化](workflow-mcp-catalog-port.md)。**local 纯契约例外**：`WorkspaceSearchInput`/`CliChannelStore`/`LocalProcessIdentityInspector` 已归位 core（local 行为类依赖仍在，不宣称 local 全拆），见[local 契约归位](workflow-local-contract-relocation.md)。
- 不把旧 DAG 变为后台可续跑任务、不引入检查点/重放/跨重启接管；`legacy-dag-transaction-boundary.md` 的三段事务边界不变。
- 不改变任何运行时行为、HTTP 请求/响应字段、JSON 形状、错误码或校验语义。
- 不修改日常数据库、常驻服务或任何持久数据；本片是编译期结构变更。

## 问题

`DatabaseEvidenceInput` 定义为：

```java
public interface DatabaseEvidenceInput extends CapabilityRequest {
    UUID databaseId();
    Map<String, Object> explainPlan();
}
```

它只依赖 core 的 `CapabilityRequest`（空标记接口）和 `java.util`，没有任何 SQL 实现细节，是一个纯领域输入端口。但它物理上位于 `eap-engine-sql`，而编排层 `ExpertExecutionService.Request` 实现它以向 `DatabaseExplainHandler`/`DatabaseMetadataHandler` 传递证据输入。结果是：`eap-engine-workflow` 的 pom 为**一个空接口**编译依赖整个 SQL 实现模块（含 `jsqlparser`、全部 Handler/Service）。这使"编排层不依赖 SQL 实现"的架构意图无法在编译期成立，也让 `BackendModuleBoundaryTest` 只能靠字符串黑名单做弱约束。

这是静态架构耦合，不是已复现故障；本片以编译与测试证明依赖边移除，不声称带来运行时收益。

## 决定

### 端口归位

1. 在 `eap-engine-core` 新增 `com.lh.eap.domain.model.DatabaseEvidenceInput`，内容与原接口一致（仍 `extends CapabilityRequest`）。
2. 删除 `eap-engine-sql` 中的 `com.lh.eap.sql.DatabaseEvidenceInput`，**不保留旧包别名**。
3. 全部引用点改 import 到 core 新包：
   - `eap-engine-sql`：`DatabaseExplainHandler`、`DatabaseMetadataHandler`、`DatabaseEvidenceInputTest`
   - `eap-ai-sql`：`SqlExpertAgentService`（经 `eap-engine-sql → core` 传递依赖可见 core）
   - `eap-full-application`：`ExpertInputCompatibilityTest`（直接依赖 core）
   - `eap-engine-workflow`：`ExpertExecutionService`

### 依赖边移除

4. 从 `eap-engine-workflow/pom.xml` 删除 `eap-engine-sql` 依赖；workflow 的 main/test 源码不得再 import `com.lh.eap.sql.*`。

### 守卫（防回退）

5. `BackendModuleBoundaryTest` 新增断言：
   - workflow 的 pom 不声明 `eap-engine-sql` 依赖；
   - workflow 的 main 源码不出现 `import com.lh.eap.sql.` 与 SQL 实现类型（`SqlExpertService`、`SqlFactVocabulary` 等既有黑名单保留并扩充）。

### 兼容性（刻意破坏，集中改点）

- 旧包 `com.lh.eap.sql.DatabaseEvidenceInput` 消失；任何外部调用方需改 import。项目内引用点已全量同步。
- `eap-engine-local` 的 `WorkspaceSearchInputTest` 仍断言旧包 `com.lh.eap.sql.DatabaseEvidenceInput` 不可见——新接口在 `com.lh.eap.domain.model`，local 仅依赖 core，旧包类已删除，该守卫继续成立且语义更强（local 类路径里不再有 sql 包）。
- `DatabaseEvidenceInput` 类型名不变，仅包路径变；`ExpertExecutionService.Request` 的 JSON 形状与实现列表不变。

## 测试与证据口径

- 后端全量 `mvn test`：0 失败、0 错误；跳度数与改造前一致。
- 架构守卫测试离线断言依赖边已移除且无 SQL 实现 import。
- 本片不验证运行时行为差异（本就无行为变更）、真实模型/数据库效果、用户产品接受；这些保持独立关口。

## 指针

台账 `BM-01～07` 行与 `next-work-register / P1 BM 旧DAG执行` 行的"workflow 仍依赖 SQL"措辞按本片更新为"SQL 输入端口已归位 core、编译依赖边已移除；MCP/local/delivery/JDBC 依赖仍独立评审"。`docs/decisions/legacy-dag-transaction-boundary.md` 的"不拆 SQL/MCP/JDBC"表述同步更新为"SQL 已拆、MCP/JDBC 仍保留"。
