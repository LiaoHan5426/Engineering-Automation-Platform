# 编排层 WireValue 状态枚举归位 core（Board/Verification/Scenario）

- 日期：2026-11-22
- 范围：`eap-engine-workflow` 的 `com.lh.eap.application.service` 包中 8 个 `implements WireValue` 的状态枚举归位 `eap-engine-core`
- 关联：[领域契约归位](workflow-domain-contract-relocation.md)、[错误码归位](workflow-error-codes-relocation.md)、[BM-01～07](../planning-status.md#pb-01-design-delivery)

## 背景与判断

wire 协议词表（`implements WireValue`）是与前端协议、持久化状态字符串共享的领域契约，应归属 core。此前 `MissionExecutionStatus`/`ToolExecutionStatus` 已随领域契约归位 core 的 `domain.model`。本片处理剩余的 8 个同类状态枚举——它们与那两个完全同构（枚举常量 + `code()`/`wire()` + `fromWire` + `wireValues`），零行为、零 spring、零 JDBC。归位后所有 wire 词表来源统一到 core，进一步削弱 workflow 对协议契约的所有权。

## 归位清单（全部 → `com.lh.eap.domain.model`）

`BoardDeliveryDecision`、`BoardDeliverySource`、`BoardTaskColumn`、`BoardVerificationCheckStatus`、`BoardVerificationStatus`、`PrototypeActionType`、`ScenarioDependencyStatus`、`ScenarioStatus`。

## 分诊：刻意保留在 workflow

- `application/dto` 下 9 个 `*Request`/`ScenarioConfiguration`：HTTP 应用层请求 DTO，非领域/协议契约，保留；
- `CliOperation`/`CliProgram`/`TaskStatistics`：workflow 本地 domain.model 模型，与 core 无共享消费方，暂不动；
- `ToolExecutionReadiness`/`ToolProcessReview`（依赖 `ProcessIdentityInspection`）：行为辅助，保留。

## 实施约定

1. `git mv` 保留 8 个文件 rename 历史；归位后无别名、无桥接，旧 `com.lh.eap.application.service.X` 定义全部删除。
2. 全 backend 按精确词边界替换 import 与全限定引用（负向前瞻防前缀误伤），同包裸引用补显式 import，以全量 `test-compile` 兜底。
3. 依赖链已满足：workflow、eap-web-workflow、eap-full-application 均依赖 core。
4. 行为不变：枚举常量、`wire()`/`fromWire`/`wireValues` 逻辑零改动；`scripts/verify-domain-contracts.py` 只检查 `public enum ... implements WireValue` 模式，与文件位置无关，归位不影响。

## 守卫口径

`BackendModuleBoundaryTest` 新增断言：8 个枚举定义文件位于 core `domain/model/`；workflow 的 `application/service/` 下这 8 个旧文件均不存在；源码无 `import com.lh.eap.application.service.<上述枚举>;`（逐行精确匹配 import 语句）。

## 验证口径

- `mvn -o -q -DskipTests test-compile` 全量编译通过；
- 边界守卫 + `DomainWireAndMessagesTest` + `rtk proxy python scripts/verify-domain-contracts.py` 通过；
- `git diff --check` 通过；
- 全量 `mvn -o test` 到里程碑统一执行。
