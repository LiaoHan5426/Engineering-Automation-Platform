# Backend guidance

短表。模块组合与历史拆分见 [`docs/decisions/backend-module-composition.md`](../docs/decisions/backend-module-composition.md)。

## 硬约束

- Java 25 + Spring Boot；Maven reactor 在本目录。`eap-api` 稳定契约（无 Spring/model SDK）；`eap-engine` / `eap-ai` / `eap-web` / `eap-spring` 分层；**唯一 Boot 宿主** `eap-applications/eap-full-application`。库不得反向依赖宿主；engine 不得依赖 ai/web。
- Flyway 仅宿主 `src/main/resources/db/migration`。增量迁移；不改写已应用版本；不擅自 clean/repair/baseline 未授权库。禁止对未批准库执行建删库测试。
- CLI：参数数组、校验 cwd、有界输出/时间、脱敏、传播取消。MCP：注册/探测 ≠ 协议执行。Skill 指令与可执行 Capability/Expert 分离。Mission 自有持久状态/审批/恢复。
- 复用 Capability、Expert DAG、Rule、CLI、MCP、知识服务；Expert DAG 是静态编排，不是自主规划。

## 验证（按 §3.6，不默认全跑）

- 日常：`rtk proxy mvn -f backend/pom.xml -pl :模块 -am test`。
- 发布/契约：`rtk proxy mvn -f backend/pom.xml test`。
- `clean` 仅在源码移动、模块归属变化或怀疑 `target` 陈旧时使用。
- 门控 Acceptance / 实库 / 真浏览器测试默认跳过；未开对应 `EAP_*` 环境变量不得宣称覆盖。资产政策见 [`docs/decisions/test-asset-convergence.md`](../docs/decisions/test-asset-convergence.md)。
- 主类：`com.lh.eap.EapApplication`。模块变更后 IDEA 重新导入 Maven。
