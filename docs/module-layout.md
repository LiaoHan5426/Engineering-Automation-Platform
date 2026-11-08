# 前后端模块边界与 CLI 实现

本次实现覆盖浏览器控制台、运行时 CLI 程序/操作管理，以及已有管理模块的后端分层。桌面外壳与 MCP 协议客户端仍按各自路线图推进。

## 前端工作区

| 包 | 职责 | 公开入口 |
|---|---|---|
| `@eap/web` | Vue 页面、交互与页面内状态 | 应用入口 |
| `@eap/runtime-client` | HTTP 客户端、请求/响应 TypeScript 类型 | `@eap/runtime-client` |
| `@eap/style` | 设计令牌、可切换主题（light/dark）与文档底座 | `@eap/style` / `@eap/style/index.css` |
| `@eap/icons` | UI内部本地SVG资源、尺寸/线宽与可访问性；currentColor随主题 | UI内部依赖；应用统一用`@eap/ui`的Icon，不直接引用资源包 |
| `@eap/ui` | **全部**基础展示/交互原语与组件样式（依赖 `@eap/style`） | `@eap/ui` / `@eap/ui/styles.css` |
| `@eap/plugin-table` | 纯表格插件。运行时只有 `vxe-table` 与 `@vxe-ui/core`，不注册 vxe-pc-ui 组件 | `@eap/plugin-table` / `@eap/plugin-table/styles.css` |
| `@eap/expert-sdk` | 专家清单编写与 id 校验（控制台保存前复用 `assertExpertId`） | `@eap/expert-sdk` |
| `@eap/tsconfig` | 工作区 TypeScript 基础配置 | `@eap/tsconfig/base.json` |
| `@eap/vsh` | 前端规范工具：包入口/依赖/UI/测试目录及循环检查；位于`scripts/vsh` | `vsh` CLI / `@eap/vsh` |

**规划中的共享模块**（hooks / effects / layout / toggle / plugin-sdk|runtime 等）：目标职责与 Agent 落点流程见 [frontend-ui-shared-module-boundaries.md](decisions/frontend-ui-shared-module-boundaries.md)。未建包前可按该文档暂存登记；禁止另起平行「共享 UI」包名。

图标统一方案及迁移/验证范围见[图标决策](records/frontend-history.md#frontend-icons)。`@eap/ui`允许依赖`@eap/icons`这一纯视觉叶子包；Button/Tooltip等交互仍由UI拥有，图标不访问HTTP或运行时加载远程资源。

`@eap/web` 通过包名导入 `@eap/style`、`@eap/ui`、`@eap/plugin-table` 与 `@eap/runtime-client`，不再在页面内复制确认框、模态壳、指标卡或 `<table>`。入口只 `use(tablePlugin)`，不注册 vxe-pc-ui。模态统一用 `@eap/ui` `Dialog`（看板详情、ConnectionDialog）；破坏性确认继续用 `ConfirmBox`（z-index 高于 Dialog）。`apps/web/src/style.css` 先导入 `@eap/style` 的 light/dark 主题与 `base.css`，再写控制台布局与功能区样式；组件视觉规则由 `@eap/ui/styles.css` 提供。

主题用法：加载主题 CSS 后调用 `applyTheme("light" | "dark")`（写入 `data-eap-theme`）。也可在子树上设置 `data-eap-theme`；无 Tailwind 的应用可直接用 `@eap/style/index.css`。

`applyAppearance({ theme, skin, density, layout })` 配置皮肤/密度/布局尺寸，`applyTokens` 覆盖局部 Token；`@eap/style/tailwind.css` 提供可选 Tailwind 4 映射，不引入 Sass。`WorkbenchFrame` 位于 `packages/ui/src/layout` 并用于Chat网格，业务SessionPanel保持在应用。同目录的`EditorWorkbench`已为专家固定流程、SQL Agent和GrapesJS提供三栏/窄屏Drawer布局；领域文档、保存及授权状态仍归应用，见[工作区合同](decisions/expert-workspace-navigation.md)。通用复合 UI（Collapse、Descriptions、Pagination）和基础定义统一由 `@eap/ui` 导出，明确的跨仓库复用需求不必等待第二消费者。复制依赖与契约见 [`packages/ui/README.md`](../frontend/packages/ui/README.md)。

`features/settings/AppearanceSettings.vue`（`#appearance`）组装公共 Segmented/Slider/Splitter/Tooltip；偏好模型与本地存储在同目录 `appearance.ts`，由 main 初始化，支持系统主题、跨标签页同步、版本/范围校验和恢复默认。存储失败展示提示，不将 web 策略写入 `@eap/style`。RepositoryBrowser 保留仓库 API 与懒加载，树键盘/选择行为使用 `@eap/ui` Tree；Chat 文件浮层使用 Drawer，复用 Dialog 的焦点和叠层。

`@eap/ui` 内部依赖固定的 `reka-ui@2.11.0`，供 Tree、Segmented、Splitter、Tooltip 使用；shadcn-vue 首个源码接入为 TooltipContent，提交、改动说明和 MIT 许可存于 `packages/ui/src/tooltip`。这些依赖不得从应用模板直接引用。

后续开发统一使用公共 Button 语义变体、ActionCard、DropdownMenu、SvgActionPath 与 anchored Popover；侧栏/聊天菜单定位和关闭、composer 浮层避让/焦点已归 UI 包，领域动作仍由应用传入。应用禁止 custom 变体和原生交互 role 模拟控件；宿主颜色取 style Token（含终端/代码），设计模型数据保留原值。当前UI导出组件的契约与可复制依赖见UI README；前后端业务按 v1.6 与现有接口边界推进，本次 UI 收敛不代表规划中的后端业务已实现。

`@eap/ui` 按组件分目录：每个组件目录含 `.vue` 与同名样式；`src/styles.css` 仅汇总组件样式（不内嵌主题）；`src/index.ts` 再导出全部组件。类名统一 `eap-<block>` / `__` 元素 / `--` 修饰（如 `eap-button--primary`、`eap-confirm__dialog`）；`@eap/stylelint-config` 对 `packages/ui` 强制该 BEM 约定。换肤改 `--eap-*`，不改类名前缀，也不用 Sass 再生成一套变量。

每个工作区目录都有 `package.json`；依赖写入包自身的 `dependencies` / `devDependencies`，本地包使用 `workspace:*`。页面从公开包名导入客户端，不使用跨包相对路径或其他包的 `src` 私有路径。TypeScript 项目引用用于类型构建，不替代包依赖声明。

`@eap/web` 的 `src` 按目录拆分，避免单目录堆平：

```text
apps/web/src
  App.vue / main.ts     壳层入口
  components/           跨 feature 组合：ConnectionDialog、SessionPanel、WorkspaceWelcome、RepositoryBrowser、WorkflowCanvas。领域状态仍在 features；基础控件在 @eap/ui
  features/<area>/      能力、专家、知识库、数据库、规则等页面与局部逻辑
  lib/                  展示、脱敏、改写、工作流图、i18n 等共享工具

```

工作区使用 Vite+；工具目录里的 `vite` 统一指向 `npm:@voidzero-dev/vite-plus-core` 别名。子包通过同一 catalog 声明构建依赖，避免独立 Vite 与 Vite+ 的命令分发冲突。

测试统一位于每个应用/包根`__tests__/`，与`src/`同级：例如`apps/web/__tests__/features/`、`apps/web/__tests__/integration/`、`packages/ui/__tests__/`。测试专用夹具、快照和类型合同一起隔离；工程工具测试位于`frontend/scripts/vsh/__tests__/`。测试发现、编译/打包边界及lint/fmt命令以[测试目录决策](decisions/frontend-test-layout.md)为准，不再沿用src/tests或组件旁测试落点。

`pnpm run check:boundaries` 检查缺失清单、未声明的包依赖，以及越过包根目录的相对导入。构建工具和测试依赖同样在使用它们的包中声明，共享 Stylelint 配置通过 peer dependency 声明宿主的 `stylelint`。`pnpm run typecheck` 构建 Vue 与公共子包的类型，声明产物写入各包的 `node_modules/.types`。

检查实现统一在`@eap/vsh`；跨包只允许声明的依赖及公开`exports`，禁止相对/绝对路径、file URL、私有深层入口和别名绕过。`check:architecture`汇总边界与循环；根`check`先运行该门禁再运行既有Vite+检查。实现/依赖采用与失败口径见[工具边界决策](decisions/frontend-tooling-boundaries.md)。

## 后端层次

<a id="maven模块归属runtime拆分"></a>
### 当前Maven模块归属（2026-11-08阶段收束）

| 模块 | 实现归属 | 依赖边界 |
|---|---|---|
| eap-api（JAR） | 稳定执行/能力契约及TaskRef | 无Spring/模型SDK |
| eap-engine（POM） | core/local/sql/knowledge/mcp/delivery/workflow七个子模块 | core/local无Spring/JDBC/模型；core含中立输入上下文、清单序列化及固定流程定义/结构校验/调度原语；workflow承担产品跨域整合 |
| eap-ai（POM） | chat/model-openai/skill/context/codegen/sql六个子模块 | chat不依赖供应商/workflow/delivery；codegen/context均无workflow依赖，但仍组合knowledge/skill等领域 |
| eap-web（POM） | core/local/sql/knowledge/mcp/workflow/ai七个HTTP子模块 | 本地文件HTTP不依赖AI/SQL/知识；CLI管理暂归workflow |
| eap-spring（POM） | autoconfigure及core/local/ai三个starter | 领域依赖optional；按类/配置/Bean条件装配，支持覆盖，缺授权拒绝 |
| eap-applications（POM） | eap-full-application | 唯一Boot宿主：产品资源/迁移/显式装配及跨模块验收；无库反向依赖 |

原五模块拆分记录保留为[历史快照](records/architecture-history.md#backend-runtime-modules)。详细依赖、剩余解耦与验证见[模块组合实施](decisions/backend-module-composition.md#implementation)。现有本地、Chat和HTTP组合已通过离线验证；不能将Expert/目录/JDBC任务整合视为已完全可选。

### 当前Java包职责

大多数包名保留；交付类迁至`com.lh.eap.delivery`，TaskRef归`com.lh.eap.api`。rules资源在engine-sql、chat资源在ai-codegen，experts播种与Flyway在full应用。早期IDEA界面重导入尝试受工具初始化失败阻断（历史）；后续原配置已通过full宿主classpath启动验证，主类不变。更改模块后仍需同步Maven模型。

```text
com.lh.eap
  web.controller       HTTP 路由与状态码（eap-web）
  application.dto      跨应用/HTTP的普通请求合同（eap-engine）
  ai.dto               AI响应合同（eap-ai）
  application.service  管理校验、生命周期、任务与专家编排
  persistence.mapper   JDBC 查询、写入和持久化映射
  domain.model         能力、专家、CLI 程序/操作和节点结果
  domain.expert        专家图校验与排序
  runtime.handler      确定性能力执行与处理器查找
  runtime.sql          SQL 事实提取与快照解释
  runtime.mcp          单次执行中的 MCP 会话范围
  common               脱敏等共享基础功能
  config               Spring 装配与内置资源播种
```

原 `web` 包中的控制器、模型、服务、仓储和处理器已经按职责迁移。专家、知识库、数据库资料和规则包的管理控制器通过服务调用对应 mapper；事务放在管理服务上，HTTP 请求 DTO 独立于控制器。任务创建的规划、执行与保存移入 `TaskService`，并检查能力启用状态。

## CLI 使用与持久化

`eap.cli_program` 保存程序，`eap.cli_operation` 保存可被专家引用的固定参数操作。Git 预置一次程序登记，以及 `git-status`、`git-diff` 两个操作。用户直接选择预置操作；增加新操作时才打开表单。新程序可以先登记，再按需配置操作。

| 方法 | 路径 | 用途 |
|---|---|---|
| GET / POST | `/api/cli-programs` | 列出或登记程序 |
| PUT / DELETE | `/api/cli-programs/{id}` | 覆盖二进制位置 / 删除手动程序 |
| POST | `/api/cli-programs/{id}/probe` | 对程序执行一次受限的 `--version` 探测 |
| POST / PUT / DELETE | `/api/cli-programs/{id}/operations/{capabilityId}` | 新增、编辑或删除固定参数操作 |
| PUT | `/api/capabilities/{name}/activation` | 单独启停某个操作 |

操作参数以 JSON 字符串数组提交，例如 `{"capabilityId":"git-log","title":"查看提交","args":["log","--oneline","-10"],"description":"查看最近十条提交"}`。数组边界在保存和执行时保持一致，参数不会经 shell 拼接。手动操作只记录脱敏 stdout、stderr 和退出码，不发布供规则判断的结构化事实，也不宣称操作必然只读。

手动操作被已启用专家引用时不能编辑或删除。删除手动程序会先检查其所有操作的引用；删除最后一个手动操作时同时移除所属手动程序。预置程序与预置操作不能删除。程序位置调整影响其下所有操作，登记、编辑和删除无需重启。

开发期迁移已合并为 `V1__initial_schema.sql`，直接写入 Git/ripgrep 程序及操作的预置登记。旧能力级覆盖值搬运语句已删除；旧能力级 CLI 接口仍保留，并转到所属程序配置。已有开发库需按确认范围重新初始化。

## 验证

```powershell
# 在仓库根目录执行后端回归
rtk mvn -f backend/pom.xml clean test

# 在 frontend 目录执行
rtk pnpm run check:boundaries
rtk pnpm run typecheck
rtk pnpm exec vp test
rtk pnpm exec vp build

# 在 frontend/apps/web 目录启动隔离的浏览器 QA 页面
rtk pnpm exec vp dev --config test/preview.config.ts
```

浏览器 QA 地址为 `http://127.0.0.1:5187/`，使用独立的内存 API 样本，适合确认 CLI 分组、新增操作、MCP 表单和响应式详情抽屉。它不执行真实命令、不持久化数据，不能替代 PostgreSQL/Flyway 集成验证。正常开发继续使用应用的默认 Vite 配置和实际后端地址。

`CliProgramIntegrationTest` 通过 `EAP_RUN_CLI_INTEGRATION=true` 显式开启，读取本机数据库连接配置并创建独立临时测试库。测试使用当前 V1 初始化并写入程序级覆盖值，再启动 Spring Boot，验证覆盖值保留、HTTP 登记、专家授权、真实 `java --version` 执行、引用保护与清理；不再测试已删除的 V9→V12 升级。结束后关闭应用并删除该临时测试库，不修改原业务库。`EAP_CHECK_SCHEMA=true` 开启现有库只读结构检查。

包名迁移后的首次构建需要 `clean`，以清掉旧包名对应的 `.class`；否则 Spring 可能同时扫描旧、新两份 Bean。

本轮模块边界补充：ai-context通过engine-knowledge的ExpertKnowledgeAccess读取专家知识授权，完整产品由workflow适配原存储；ai-context不再依赖workflow。Web模块不直接访问Mapper或声明业务事务，CLI/能力开关/MCP事务归各自服务。ExpertExecution现通过core分析/资源端口组合sql策略与mcp会话生命周期；workflow整体仍依赖SQL/MCP，产品Chat的完整可选化仍见模块组合记录。

第四轮：CliChannels及CliChannelStore已归engine-local，无Spring/JDBC依赖；workflow的JdbcCliChannelStore负责原表持久化与写事务。starter-local提供可覆盖、默认只读的通道装配，产品使用JDBC适配；配置读取失败明确拒绝，不静默使用默认二进制。CLI程序/操作登记及审批执行仍在workflow。

第五轮：ai-codegen通过delivery的PrototypeVersionQuery读取原型，产品PrototypeVersionService实现该接口；不再依赖workflow，也不带入SQL/MCP。ExecutionArtifactStore/FileExecutionArtifactStore及本地文件回归归engine-local，AiConnectionAssignment归ai-chat，现有Java包名与HTTP响应字段保留。codegen仍组合模型适配、knowledge/skill及delivery，并非最小headless Chat；按用例可选贡献仍待拆解。

第六轮：core提供RulePackQuery与ExpertScopedCapabilityQuery；SQL/MCP原服务实现接口，专家定义/编辑目录消费接口且注入实际CapabilitySettings。事实目录JSON合同保持，workflow整体仍依赖SQL/MCP。专家仍为固定DAG；专业Agent与流程分离的目标及模块落点见[专家行为提案](decisions/agent-runtime-evolution.md#expert-agent-boundary)，尚未实现自主决策。

第七轮：core提供WorkflowDefinition/WorkflowGraph/FixedWorkflowRunner，独立于专家身份、SQL及授权存储。workflow中的ExpertGraph作为v1兼容与领域校验，ExpertExecutionService复用固定流程调度，继续持有产品授权/分析/保存。该执行器不是Agent自主循环或持久任务运行时；EA-02后续仍需角色、行为绑定与输入输出合同。

第八轮：core的CapabilityRequest不再声明SQL/检索字段；SQL模块提供DatabaseEvidenceInput，local提供WorkspaceSearchInput。产品旧六字段请求组合领域接口，公共上下文文本改名input；SQL/local处理器按接口取值，错误/缺输入不启动外部操作，权限仍须原调用链验证。HTTP兼容，Java自定义请求及sql()访问器需要适配。

第九轮：core的ExpertAnalysisPolicyResolver负责宿主按专家选择分析策略；workflow执行服务解析一次并把策略与不可变事实词表绑定至Run。full宿主显式提供SQL兼容默认且允许自定义Resolver，空策略前置拒绝；不引入平行能力注册表或自动策略猜测。此为第九轮当时快照；持久绑定进度见下一段，专业Agent仍待。

第十轮：core的ExpertBehaviorBinding/ExpertBehaviorCatalog提供专业分析行为精确版本合同和宿主映射；workflow在既有专家manifest JSONB中持久保存并校验绑定，旧编辑器省略时原子保留，变更走停用/版本递增/撤权/重启用。full发布sql-analysis v1，API目录和执行/历史观察可追溯版本。实库回归仅验证绑定、授权生命周期和历史保存；固定DAG、SQL应用输入/全局规则目录及90秒事务仍保留。

第十一轮（历史快照，恢复扩展见下）：core新增ExpertAgentDefinition/ExpertAgentAccess，既有行为目录公开agent模式及allowedTools/requiredTools；ai-sql的SqlExpertAgentService复用Spring AI工具循环并实施只读取证/终结/预算/取消；workflow的WorkflowExpertAgentAccess在短事务中复用专家/grant/Task表，模型调用不持事务；web-ai依赖ai-sql提供独立Agent启动/取消入口。full显式装配sql-readonly-agent v1，旧sql-analysis及DAG保留。没有新模块/迁移；自主只读行为的真实供应商、UI和跨重启持久运行仍待验。

第十二轮：core新增ExpertAgentJournal/ExpertAgentWrites端口；workflow持有JdbcExpertAgentJournal及ExpertAgentApprovalService，在原Task下保存输入、专家快照、检查点、租约与审批决定。ai-sql仅保存候选，无文件应用工具；审批服务复用delivery的CodeChangeService及JDBC候选/基线/UNKNOWN互锁。web-ai增加查询、显式resume和approval；full显式装配恢复钩子及V23/V24增量迁移。跨JVM恢复使用累计预算和新owner令牌，不自动启动模型或重放写操作；未新增模块或替换原Spring AI循环。


第十三轮：ai-sql增加SqlExpertAgentScheduler，复用原Agent服务与core Journal端口；workflow负责有界入队、扫描/领取及自动许可不变式，full显式装配并持有V25迁移。web-ai提供202后台入口和持久任务列表；前端runtime-client集中合同，features/expert持有后台任务/审批业务，components/ProposalDiffView供Chat/专家共用，确认框等原语继续来自@eap/ui。无新增模块或平行任务/写入机制；自动恢复仅覆盖显式后台提交，旧手动任务不迁移授权。

第十四轮：model-openai补齐Responses函数工具声明、完成响应与工具结果/加密reasoning回传；ai-sql复用既有Spring AI循环。未新增模块。真实候选审批整链、当前32模块验证与剩余产品耦合见[阶段收束](decisions/backend-module-composition.md#stage-checkpoint)。
