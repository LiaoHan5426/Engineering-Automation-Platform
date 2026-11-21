# 编排层 MCP 目录端口化：解除 workflow 对 MCP 实现模块的编译依赖（2026-11-22）

## 状态与范围

有效合同，关闭台账 `BM-01～07 后端模块组合` 中"workflow 编排层仍编译依赖 MCP 实现模块"这一条依赖边。接续[SQL 输入端口归位](workflow-sql-port-relocation.md)之后，把同一依赖倒置原则应用到 MCP 侧。

**用户取向依据**：重构可保留旧结构，但不必为兼容旧架构缩手。本片是刻意的破坏性归位——移除 workflow 对 eap-engine-mcp 的 main 与 test-jar 编译依赖、收敛构造器、迁移错位测试，不叠加兼容别名。

**只做一件事**：把 `CapabilityCatalog` 需要的 MCP 只读目录能力抽象为 core 端口 `McpCatalogQuery`，由 mcp 模块提供适配器实现；`CapabilityCatalog` 只依赖该端口，从而 `eap-engine-workflow` 不再编译依赖 `eap-engine-mcp`。

**明确不做**（仍为独立关口，不能因本片宣称完成）：

- 不改 MCP 注册表/服务的任何持久化、事务、授权或协议行为；`McpServerRegistry`/`McpServerService`/`OfficialReadonlyMcpMatrix` 原样留在 mcp 模块，仅由适配器委托。
- 不拆 workflow 对 local/delivery/JDBC/`JdbcTemplate` 的依赖（30 类直接用 JDBC，端口抽取 + 装配改造属更大范围，单独评审）。
- 不改变任何 HTTP 字段、JSON 形状、错误码或校验语义；目录响应内容与改造前逐字段一致。
- 不修改日常数据库、常驻服务或持久数据；本片是编译期结构变更。

## 问题

`CapabilityCatalog`（编排层的能力目录）因展示 MCP 服务器而直接 import 三个 mcp 实现类型：`McpServerRegistry`（带 JDBC 的注册表）、`McpServerService`（带 JDBC 的管理服务）和 `OfficialReadonlyMcpMatrix`（静态生产白名单）。它实际只用到五项只读查询：

- `grantsByCapability()` — 能力到授权专家的映射
- `capabilityIds()` — 专家级能力词表
- `serverViews()`（`McpServerService.list()`）— 服务器视图列表
- `productionMatrix()`（`OfficialReadonlyMcpMatrix.views()`）— 生产白名单矩阵
- `capabilityId(serverId, tool)` — 纯命名规则

此外 `McpHandlerIntegrationTest`（测试 mcp 的 `McpClientService`/`McpReadonlyHandler`/`StdioMcpTransport`）错位放在 workflow 模块，靠 mcp test-jar 中的 `FakeStdioMcpServerMain` 运行——这是 workflow 对 mcp 的第二条编译依赖。

结果是 workflow 的 pom 为"目录展示"而依赖整个 MCP 实现模块（含其 JDBC、协议客户端与 test-jar），且后端模块边界测试只能靠字符串黑名单弱约束。

## 决定

### core 只读端口

在 `eap-engine-core` 新增 `com.lh.eap.core.McpCatalogQuery`，暴露上述五项只读查询；提供静态 `capabilityId(serverId, tool)` 作为唯一命名规则，以及 `empty()` 空实现（供无 MCP 的组合/便捷构造器使用，返回空目录、命名规则仍生效）。

### mcp 适配器

在 `eap-engine-mcp` 新增 `com.lh.eap.application.service.McpCatalogQueryAdapter implements McpCatalogQuery`，委托给 `McpServerRegistry` + `McpServerService` + `OfficialReadonlyMcpMatrix`。保留 `McpServerRegistry.capabilityId` 的实现但委托到 core 端口的静态规则，消除命名漂移。适配器由 full 宿主装配为 bean。

### 编排层改造

`CapabilityCatalog` 字段收敛为单个 `McpCatalogQuery mcpCatalog`，`catalog()` 的五处调用改走端口；构造器收敛为以 `McpCatalogQuery` 为参数的重载（便捷构造器用 `McpCatalogQuery.empty()`），生产 `@Autowired` 构造器不再接收 `McpServerService`。删除对 mcp 的三个 import。

### 错位测试归位与依赖移除

- `McpHandlerIntegrationTest` 从 `eap-engine-workflow` 迁到 `eap-engine-mcp` 的对应 test 包（与被测类同模块，`FakeStdioMcpServerMain` 不再需要 test-jar 即可访问）。
- 从 `eap-engine-workflow/pom.xml` 移除 eap-engine-mcp 的 main 与 test-jar 两条依赖。
- 装配点（full 宿主 `@Import`、相关测试的构造器/bean 装配）改为构造或注入端口/适配器。

### 守卫（防回退）

`BackendModuleBoundaryTest` 新增断言：workflow 的 pom 不声明 `eap-engine-mcp` 依赖，workflow main/test 源码不 import `com.lh.eap.runtime.mcp`/`com.lh.eap.persistence.mapper.McpServerRegistry`/`com.lh.eap.application.service.McpServerService`/`OfficialReadonlyMcpMatrix`。既有黑名单保留。

### 兼容性（刻意破坏，集中改点）

- `CapabilityCatalog` 构造器参数类型变更；项目内装配点全量同步，外部调用方需改传入端口。
- 目录 JSON 响应逐字段不变（端口返回值与直接调用一致）；`capabilityId` 命名规则不变。
- `mcp.<server>.<tool>` 词表、授权映射、生产白名单内容均不变。

## 测试与证据口径

- 后端全量 `mvn test`：0 失败、0 错误；按 mtime 过滤本次报告，跳度数与改造前一致（79）。
- 架构守卫测试离线断言两条 mcp 依赖边已移除且无 mcp 实现 import。
- `McpHandlerIntegrationTest` 迁模块后原断言（授权门、stdio 真实协议、失败关闭传输）原样保留并通过。
- 本片不验证运行时行为差异（无行为变更）、真实 MCP 服务器、用户产品接受；保持独立关口。

## 指针

台账 `BM-01～07` 行与 `next-work-register / P1 BM 旧DAG执行` 行同步为"SQL 编译依赖已移除、MCP 目录查询已端口化并移除编译依赖；local/delivery/JDBC 仍独立评审"。`docs/decisions/workflow-sql-port-relocation.md` 与本决定互相引用；`legacy-dag-transaction-boundary.md` 的例外说明补注 MCP 亦已拆。
