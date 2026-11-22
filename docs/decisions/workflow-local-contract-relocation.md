# 编排层 local 契约归位（2026-11-22）

## 背景

台账 BM-01～07 的模块边界长期标注「workflow 仍依赖 local，需端口抽取 + 装配改造单独评审」。继 SQL 输入端口（`DatabaseEvidenceInput`）、MCP 目录端口（`McpCatalogQuery`）归位 core 后，本片继续按同一依赖倒置原则处理 local 侧。

彻底排查 `eap-engine-local` 的 12 个类型与 workflow 的引用关系后，事实如下：

| 类型 | 包名 | 性质 | workflow 引用文件数 |
| --- | --- | --- | --- |
| `WorkspaceSearchInput` | `com.lh.eap.local` | `@FunctionalInterface` 输入端口，仅继承 core 的 `CapabilityRequest`，多一个 `pattern()` | 3 |
| `CliChannelStore` | `com.lh.eap.local` | 配置端口接口，仅依赖 `java.util.Map`，含 `readOnlyDefaults()` 空实现 | 2 |
| `LocalProcessIdentityInspector` | `com.lh.eap.local` | 无状态工具类，只依赖 eap-api 的 `ProcessIdentityInspection/Status` 与 core 的 `SensitiveData` | 1 |
| `GitCapability` | `com.lh.eap.capability` | 有行为的 git 能力封装 | 15 |
| `RuntimeWorkspace` | `com.lh.eap.config` | 运行时工作区（路径/布局） | 13 |
| `CliChannels` | `com.lh.eap.application.service` | CLI 通道配置服务 | 11 |
| `LocalBinaries` | `com.lh.eap.core` | 本地二进制解析 | 5 |
| 其余（`ExecutionArtifactStore`/`FileExecutionArtifactStore`/`GitCapability`/`RipgrepCapability`/`WorkspaceFilesService`/`Main`） | 中性包 | 有行为能力/入口 | 各 1～2 |

关键结论：

1. 三个 `com.lh.eap.local` 包下的类型都是**纯契约或无状态工具**，只依赖 core / eap-api / JDK，是本片可干净归位的部分。
2. 另九个行为型能力类（`GitCapability`/`RuntimeWorkspace`/`CliChannels`/`LocalBinaries` 等）虽物理上位于 eap-engine-local 模块，但包名本就是中性的领域包（`com.lh.eap.capability`/`com.lh.eap.config`/等）。workflow 编排层**调用它们的能力**是正常依赖方向，不是「编排层被实现模块反向污染」。为凑「拆边」而给这九个类再抽一层端口 + 适配器，属于为拆而拆，不在本片范围。

## 决定

1. 把三个纯契约/工具类从 `eap-engine-local` 归位到 `eap-engine-core`，**删除旧定义、不留别名**：

   - `WorkspaceSearchInput` → `com.lh.eap.domain.model.WorkspaceSearchInput`（与 `DatabaseEvidenceInput` 同包，同为 `CapabilityRequest` 输入契约）
   - `CliChannelStore` → `com.lh.eap.domain.model.CliChannelStore`（配置端口）
   - `LocalProcessIdentityInspector` → `com.lh.eap.core.LocalProcessIdentityInspector`（无状态工具，与 `ProcessTree` 同包）

2. 全量改引用点（main + test，跨 workflow / full-app / local / spring-autoconfigure 四模块），包括同包共享包名的静态引用与测试里的全限定名断言。

3. 归位后 `com.lh.eap.local` 包在 local 模块内不再有任何生产类型；架构守卫新增断言：workflow 源码不存在 `import com.lh.eap.local.`，且三个契约类型确实定义于 core，防止回退。

4. **不移除 workflow 对 `eap-engine-local` 的 pom 依赖**：`GitCapability`/`RuntimeWorkspace`/`CliChannels`/`LocalBinaries` 等行为型能力类仍由 local 模块实现并被编排层使用，这条编译依赖是真实的、正常的。本片是「契约归位」，不是「local 依赖边拆除」，台账与叙述不得宣称 local 已拆。

## 红线

- 不改运行时行为、HTTP 契约、数据库 schema；三个类型的方法签名与语义保持完全一致。
- `WorkspaceSearchInputTest` 的守卫（local 输入不需 sql/workflow/spring 契约）保持成立。
- `LocalProcessIdentityInspector` 的 Windows/POSIX 兼容、JIT 注入的 lookup 构造不变。
- 不为拆而拆：不抽九个行为类的端口、不改 local 模块物理结构、不动 full 装配。

## 验证口径

- `mvn -o -q -DskipTests test-compile` 先排除编译错（跨 4 模块改 import，编译先行降本）。
- `mvn -o -q test` 全量，按 mtime 过滤 surefire 报告统计；测试数应与基线 1205 一致（纯结构迁移，无新增/删除测试方法）。
- `git diff --check`、文档链接检查；本决策文档零失效链接。
- 架构守卫测试通过，且新增的 local 契约守卫能挡住回退。
