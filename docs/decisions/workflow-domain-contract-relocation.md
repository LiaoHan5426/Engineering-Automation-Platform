# 编排层领域契约归位 core（Mission/Handoff/ToolExecution/PrototypeDelivery）

- 日期：2026-11-22
- 范围：`eap-engine-workflow` 中位于 `com.lh.eap.application.service` 包、但不含任何行为/框架依赖的领域契约归位 `eap-engine-core`
- 关联：[BM-01～07 后端模块组合](../planning-status.md#pb-01-design-delivery)、[delivery 契约归位](workflow-delivery-contract-relocation.md)、[local 契约归位](workflow-local-contract-relocation.md)

## 背景与判断

BM 剩余架构债中的 delivery/JDBC 一项，根因之一是领域模型与存储端口定义放在编排层实现模块 `eap-engine-workflow` 的 `com.lh.eap.application.service` 包里。消耗这些契约的 JDBC 适配器（`JdbcMissionStore`/`JdbcHandoffStore`/`JdbcToolExecutionStore`/`JdbcPrototypeDeliveryStore` 等）与编排服务同包，导致契约的实现归属不清、跨模块复用需反向依赖 workflow。

排查该包全部类型后，确认下面 13 个是**零行为耦合的纯契约**（record / enum / 接口，零 spring 依赖，仅依赖 JDK + `eap-api` 的 `WireValue` + 已归位 core 的 `PrototypeVersion`），与既有 SQL/MCP/local/knowledge/delivery 契约归位同构，可干净归位 core。其余 `Board*Service`、`CapabilityCatalog`、`WorkspaceInterlock` 等含 JdbcTemplate/业务编排逻辑，属行为实现，不在本片范围。

## 归位清单与目标包

| 类型 | 性质 | 目标包 |
|---|---|---|
| `Mission` | record | `com.lh.eap.domain.model` |
| `MissionExecution` | record（含嵌套 `Resolution`、UNKNOWN 保护构造） | `com.lh.eap.domain.model` |
| `MissionExecutionStatus` | enum implements WireValue | `com.lh.eap.domain.model` |
| `Handoff` | record | `com.lh.eap.domain.model` |
| `ToolExecution` | record（含嵌套 `Step`/`Resolution`、状态机方法） | `com.lh.eap.domain.model` |
| `ToolExecutionStatus` | enum implements WireValue | `com.lh.eap.domain.model` |
| `PrototypeDelivery` | record | `com.lh.eap.domain.model` |
| `MissionStore` | 存储端口 | `com.lh.eap.core` |
| `MissionExecutionStore` | 存储端口 | `com.lh.eap.core` |
| `HandoffStore` | 存储端口 | `com.lh.eap.core` |
| `ToolExecutionStore` | 存储端口 | `com.lh.eap.core` |
| `PrototypeDeliveryStore` | 存储端口 | `com.lh.eap.core` |
| `PrototypeVersionStore` | 存储端口 | `com.lh.eap.core` |

行为不变：`MissionExecution.closeUnconfirmed`、`ToolExecution.closeUnknown/state/active/blocking` 及两个 enum 的 WireValue 契约整体随类型迁移，逻辑零改动。`MissionExecutionStore.resolveUnconfirmed` 的人工核对条件写回语义不变。

## 实施约定

1. `git mv` 保留 13 个文件的 rename 历史；归位后无别名、无桥接类型，旧 `com.lh.eap.application.service.X` 定义全部删除。
2. 全 backend（含 eap-ai/eap-web/eap-full-application）按精确词边界替换 import 与全限定引用，禁止前缀误伤（如 `Mission` 不得命中 `MissionExecution`/`MissionStore`）。
3. 原先与被迁移类型同包、靠包可见性裸用类名的文件，归位后必须补显式 import；以全量 `test-compile` 兜底检出。
4. workflow 对 `eap-engine-core` 的既有编译依赖保留（core 是允许的向下依赖）；本片不解 workflow 对任何实现模块的依赖，不宣称 delivery/JDBC 已拆。

## 守卫口径

`BackendModuleBoundaryTest` 新增断言：
- 13 个类型定义文件位于 core 模块（`domain/model` 或 `core` 包）；
- workflow 中 13 个旧定义文件均不存在；
- 源码中无 `import com.lh.eap.application.service.<上述类型>;`（逐行精确匹配 import 语句，避免守卫自身字符串字面量自匹配）。

## 验证口径

- `mvn -o -q -DskipTests test-compile` 全量编译通过（检出裸引用遗漏）；
- 边界守卫定向 `test` 通过；
- `git diff --check` 通过；
- 全量 `mvn -o test` 到里程碑统一执行（本片为切片提交，不重复 14 分钟全量）。

## 分诊：刻意保留在 workflow 的相关类型

- `BoardMissionService`/`BoardRuntimeService`/`WorkspaceInterlock`/`CapabilityCatalog` 等：含 JdbcTemplate 与业务编排，属行为实现；
- `CapabilitySettings`（`implements CapabilitySwitches`，7 处 spring 依赖）：配置行为类，保留；
- `Jdbc*`/`*Mapper`/`TaskRepository`：JDBC 持久化适配器，属实现层，归独立端口/装配改造的后续范围。
