# 编排层错误码归位 core（Board/Mission 机器码）

- 日期：2026-11-22
- 范围：`eap-engine-workflow` 的 `com.lh.eap.error` 包中 4 个纯机器码枚举归位 `eap-engine-core`
- 关联：[领域契约归位](workflow-domain-contract-relocation.md)、[delivery 契约归位](workflow-delivery-contract-relocation.md)、[BM-01～07](../planning-status.md#pb-01-design-delivery)

## 背景与判断

core 的 `com.lh.eap.error` 包已有 9 个同类机器码（`AgentErrors`/`ChatErrors`/`CodeErrors`/`GitErrors`/`ToolErrors` 等），eap-api 另有 7 个。workflow 的 `com.lh.eap.error` 包里静置的 4 个枚举与它们完全同构：仅实现 `PlatformErrorCode`，`code()` 返回 `name()`，零行为、零 spring、零状态。归位 core 让所有机器码契约来源单一，进一步削弱 workflow 对契约的所有权，是 delivery/JDBC 解耦的延续骨架。

## 归位清单

| 类型 | 性质 | 目标包 |
|---|---|---|
| `BoardErrors` | enum implements PlatformErrorCode | `com.lh.eap.error`（core） |
| `BoardDeliveryErrors` | enum implements PlatformErrorCode | `com.lh.eap.error`（core） |
| `BoardVerificationErrors` | enum implements PlatformErrorCode | `com.lh.eap.error`（core） |
| `MissionErrors` | enum implements PlatformErrorCode | `com.lh.eap.error`（core） |

## 实施约定

1. 目标包与源包同名（`com.lh.eap.error`），因此**所有引用方的 import 语句零改动**；`git mv` 保留 4 个文件的 rename 历史，无别名、无桥接。
2. 包名为跨模块共享包（core / workflow / eap-api 均声明 `com.lh.eap.error`），但四类名在各模块唯一、无同名冲突；归位后 workflow 不再声明这 4 个类。
3. 依赖链已满足：workflow、eap-web-workflow、eap-full-application 均直接或间接依赖 core，controller 引用的错误码从 core 解析。
4. 行为不变：枚举常量、`code()` 实现、i18n 文案归属均零改动。

## 守卫口径

`BackendModuleBoundaryTest` 新增断言：
- 4 个错误码定义文件位于 `eap-engine-core/.../com/lh/eap/error/`；
- workflow 的 `com/lh/eap/error/` 下这 4 个旧文件均不存在。

## 验证口径

- `mvn -o -q -DskipTests test-compile` 全量编译通过（确认跨模块解析正确，无 split-package 问题）；
- 边界守卫 + 相关错误码/契约测试定向 `test` 通过；
- `git diff --check` 通过；
- 全量 `mvn -o test` 到里程碑统一执行。

## 分诊：刻意保留

- workflow 中 `BoardApplicationBaseline`/`BoardRunService` 等含 JdbcTemplate 与业务编排的行为服务；
- eap-api 中 `CommonErrors`/`SecurityErrors` 等协议/安全层机器码（属 api 契约层，非编排层错位，不动）。
