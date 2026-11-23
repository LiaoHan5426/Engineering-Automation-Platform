# eap-full-application 测试说明

政策：[test-asset-convergence](../../../../../docs/decisions/test-asset-convergence.md)、[§3.6](../../../../../docs/architecture-method.md#sec-3-6-verify)、[archived-acceptance-index](../../../../../docs/records/archived-acceptance-index.md)。

## 默认 / 风险

- **默认**：模块/领域单测与常驻风险 Persistence（如 `ExecutionLogPersistenceTest`、`WorkingMemoryPersistenceTest`）。
- **门控 Persistence**（`EAP_RUN_*`）：实库并发/CAS/回滚权威；**冻结扩写**——新持久化行为优先落在拥有该端口的模块测；禁止再增「快乐路径 CRUD」宿主类。
- **`*AcceptanceTest`**：仅保留风险/现行门控（见归档索引）；历史设计交付 Acceptance 已移出树。

## 禁止

- 对未批准数据库执行建删库。
- 未开对应 `EAP_*` 环境变量却宣称 Acceptance / 实库覆盖。
