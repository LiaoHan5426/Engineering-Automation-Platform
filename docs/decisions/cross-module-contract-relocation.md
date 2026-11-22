# 跨模块纯契约批量归位 core（AI wire 枚举 / 实现模块错误码 / CLI domain 模型）

- 日期：2026-11-22
- 范围：4 个 eap-ai 子模块、3 个 eap-engine 实现模块、eap-engine-workflow 中 14 个纯契约归位 `eap-engine-core`
- 关联：[领域契约归位](workflow-domain-contract-relocation.md)、[错误码归位](workflow-error-codes-relocation.md)、[状态枚举归位](workflow-wirevalue-enums-relocation.md)、[BM-01～07](../planning-status.md#pb-01-design-delivery)

## 背景与判断

此前按模块逐个归位编排层纯契约（SQL/MCP/local/knowledge/delivery/领域/错误码/状态枚举）。全局扫描后发现同类错位契约仍散落在 AI 与实现模块：wire 协议词表、机器码枚举、CLI 领域模型定义在其消费/实现模块而非 core。依赖方向已核实：所有持有方均依赖 core，core 只依赖 eap-api，无环。本批一次性归位，避免逐片往返。

## 归位清单（14 个）

### A. AI wire 枚举 → `com.lh.eap.domain.model`（改包名）

| 类型 | 源模块 | 源包 |
|---|---|---|
| `AiToolMode` | eap-ai-chat | `com.lh.eap.ai` |
| `ChatExecutionStatus` | eap-ai-chat | `com.lh.eap.ai` |
| `TaskMode` | eap-ai-chat | `com.lh.eap.ai` |
| `ModelConnectionState` | eap-ai-codegen | `com.lh.eap.ai` |
| `ChatGptLoginStatus` | eap-ai-model-openai | `com.lh.eap.ai` |
| `SkillDependencyStatus` | eap-ai-skill | `com.lh.eap.skill` |

### B. 实现模块错误码 → `com.lh.eap.error`（包名不变，import 零改）

| 类型 | 源模块 |
|---|---|
| `SkillErrors` | eap-ai-skill |
| `KnowledgeErrors` | eap-engine-knowledge |
| `McpErrors` | eap-engine-mcp |
| `DatabaseErrors` | eap-engine-sql |
| `RuleErrors` | eap-engine-sql |

### C. CLI domain 模型 → `com.lh.eap.domain.model`（包名不变，import 零改）

| 类型 | 源模块 |
|---|---|
| `CliOperation` | eap-engine-workflow |
| `CliProgram` | eap-engine-workflow |
| `TaskStatistics` | eap-engine-workflow |

## 实施约定

1. `git mv` 保留 14 个文件 rename 历史；归位后无别名、无桥接。
2. A 组改包声明 + 全 backend 精确词边界替换 import/全限定引用（负向前瞻防前缀误伤）+ 补同包裸引用 import；B/C 组包名不变，import 零改。
3. 全量 `test-compile` 兜底检出任何裸引用遗漏。
4. 行为不变：枚举 wire 契约、`code()`、record 字段零改动。

## 守卫口径

`BackendModuleBoundaryTest` 新增断言：14 个类型定义于 core；各源模块旧文件不存在；A 组源码无旧包 import（逐行精确匹配）。

## 验证口径

- `mvn -o -q -DskipTests test-compile` 全量编译通过；
- 边界守卫 + 相关 wire/错误码契约测试定向通过；
- `rtk proxy python scripts/verify-domain-contracts.py` 通过；
- 本批为里程碑，跑一次全量 `mvn -o test` 坐实终态；
- `git diff --check` 通过。
