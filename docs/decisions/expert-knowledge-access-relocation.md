# 专家知识授权端口归位与 knowledge 编译依赖解除（2026-11-22）

## 背景

台账 BM-01～07 的模块边界长期标注编排层/AI 层对实现模块的编译依赖需单独评审。继 SQL、MCP、local 纯契约之后，本片处理 knowledge 侧。

排查事实：

1. `ExpertKnowledgeAccess` 是**纯接口**，只依赖 JDK 类型（`List`/`Map`/`Optional`/`UUID`），无 knowledge 实现细节，注释明确写「independent of workflow implementation」。
2. 它物理定义在 `eap-engine-knowledge`，但 knowledge 模块**自身无任何代码引用它**——只有自己的定义，是纯粹的「借住」。
3. 真正的消费者是 `eap-ai-context` 的 `ExpertKnowledgeContextService`（AI 上下文层）；
4. 真正的实现是 `eap-engine-workflow` 的 `WorkflowExpertKnowledgeAccess`（适配器，委托 `ExpertDefinitionMapper` 的行锁与实时授权读）。
5. 依赖方向因此被拧成：**消费方 ai-context 与实现方 workflow 都编译依赖 knowledge 实现模块**，只为一个空端口。
6. 编译期排查（test-compile 暴露）进一步发现第二个同类端口 `KnowledgeQueryEnricher`（`@FunctionalInterface`，只依赖 core 的 `CapabilityContext`）：workflow 的 `SqlKnowledgeQueryEnricher` 实现它、knowledge 的 `KnowledgeSearchHandler` 消费它，同样因共享 `com.lh.eap.runtime.handler` 包名而在 grep 包前缀时漏检。它也是 workflow 编译依赖 knowledge 的原因。

这是依赖倒置做了一半的典型：端口没有归位到双方共同依赖的 core，反而挂在其中一方的实现模块上。两个端口一并归位，才能干净移除 workflow→knowledge 的编译边。

## 决定

1. 把两个纯端口从 `eap-engine-knowledge` 归位到 `eap-engine-core`，**删除旧定义、不留别名**：

   - `ExpertKnowledgeAccess` → `com.lh.eap.core.ExpertKnowledgeAccess`，方法签名、javadoc 语义（短事务行锁、每次实时授权读、禁止缓存快照）完全不变。
   - `KnowledgeQueryEnricher` → `com.lh.eap.core.KnowledgeQueryEnricher`，函数签名 `String enrich(CapabilityContext, String)` 不变。workflow 的实现 `SqlKnowledgeQueryEnricher` 与 knowledge 的消费方 `KnowledgeSearchHandler` 均改指 core。

2. 解除两条编译依赖边：

   - `eap-engine-workflow` 移除 `eap-engine-knowledge` 依赖：其对 knowledge 的编译引用只有两个端口（`ExpertKnowledgeAccess`、`KnowledgeQueryEnricher`，后者因共享包根在编译期才暴露），均改指 core 后 pom 依赖可整条移除。
   - `eap-ai-context` 的 **main** 移除 `eap-engine-knowledge` 依赖：`ExpertKnowledgeContextService` 唯一 knowledge 引用是该端口，改指 core 后 main 不再依赖 knowledge 实现。

3. `eap-ai-context` 的 `KnowledgeContextCompositionTest` 仍用 `KnowledgeRepository`（物理在 knowledge 模块）做真实装配测试。因此 ai-context 的 `eap-engine-knowledge` 依赖**降为 `<scope>test</scope>`**，而非彻底删除——保留测试真实性，不让 main classpath 承载实现。

4. 全量改引用点（workflow / ai-context main+test / full-app test）到 core 新包。

5. 架构守卫新增断言：`eap-engine-workflow` 与 `eap-ai-context` 的 pom 不声明 `eap-engine-knowledge` 的 **compile** 依赖（ai-context 仅允许 test scope）；workflow 源码不 import `com.lh.eap.knowledge.`；两个端口定义确实位于 core、knowledge 的 `com.lh.eap.knowledge` 与 `com.lh.eap.runtime.handler.KnowledgeQueryEnricher` 旧定义已删除。共享包根的第二个端口用「旧文件不存在」断言覆盖，避免只靠 import 前缀漏检。

## 红线

- 不改运行时行为、HTTP 契约、数据库 schema；端口方法签名与 javadoc 语义不变。
- `WorkflowExpertKnowledgeAccess` 的 `@Transactional(MANDATORY)`、行锁与实时授权读语义不变。
- `KnowledgeContextCompositionTest` 的负向守卫（ai-context 类路径不含 workflow/sql/mcp 实现）继续成立。
- ai-context 的 knowledge 依赖仅降为 test scope，**不删**，保住装配测试真实性。
- 不触碰 knowledge 模块其余 12 个类型（`KnowledgeManagementService`、检索器、mapper、handler 等），它们是实现、归 knowledge 合理。

## 验证口径

- `mvn -o -q -DskipTests test-compile` 先排除编译错（跨 4 模块改 import + pom scope，编译先行降本）。
- `mvn -o -q test` 全量，按 mtime 过滤 surefire 报告统计；测试数应与基线 1206 一致（本片新增守卫合并进既有测试方法或单列，若单列则 +1）。
- `git diff --check`、文档链接检查；本决策文档零失效链接。
- 架构守卫：workflow/ai-context 的 knowledge 编译依赖断言通过，端口归位断言通过。
