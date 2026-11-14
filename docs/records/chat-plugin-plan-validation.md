# CT-02：DSH前端适配与内置执行计划验证

日期：2026-11-14。状态：**首个原client插件纵向路径、受控升级工具及内置执行计划已实现并技术验证；用户接受独立，完整CT-02尚未完成。** 实施前基线`35ff91ab556b8357d5c42d26be0db2fddb73794c`，DSH基线`39163dd30f703a79079e2d2446545cff3c453738`。本记录覆盖本轮实施，不替代先前[G1记录](chat-g1-validation.md)。

## 变更及唯一生产路径

- 新独立包[DSH适配模块](../../frontend/packages/dsh-adapter/package.json)：原browser module system、context-menu client、LocaleRuntime和浏览器ShortcutsService；原React/Cordis共享身份、加载注册及fiber生命周期。82份固定上游源码/许可/包声明逐文件SHA256校验后构建，原client字节不改；生成JS/CSS有窄类型门面及输入清单。现有PluginSlot嵌入同一前端；不引入Node服务器、DSH Agent、Remote聚合或第二套权限/会话状态。EAP通过明确shell.overlay/props/factory与语言端口适配，原DSH全量layout/settings/Host不在兼容范围。
- [兼容矩阵](../../frontend/packages/dsh-adapter/compat/matrix.json)及[已接受基线](../../frontend/packages/dsh-adapter/baseline/accepted.json)集中声明实际范围、依赖替换、服务与已知限制。原插件复制动作捕获不可变消息文本/会话UI身份，右键/可见“更多”按钮共用ready握手，失败时保留原生菜单或明确反馈；关闭、切路由、停用与重挂清理按真实dispose串行执行。
- [升级命令](../../frontend/packages/dsh-adapter/upgrade/report.mjs)接受精确40位候选SHA，先校验本地摘要，再用`gh api`的JSON/base64读取固定文件原字节并生成包/源码/export差异。仅写候选报告，不自动修改accepted；变化一律review-required。正式提升仍需同PR锁/产物/适配/测试证据，回退不能撤销工具副作用。本轮真实同SHA演练82项全部unchanged、0变更；不同export/service样本的回归会要求review，**没有新的上游版本可提升，未声称跨版本升级已通过**。
- Java新增[计划服务](../../backend/eap-ai/eap-ai-chat/src/main/java/com/lh/eap/ai/ChatPlanService.java)/[JDBC Store](../../backend/eap-ai/eap-ai-chat/src/main/java/com/lh/eap/ai/JdbcChatPlanStore.java)、领域状态/DTO/本地化错误、fullhost显式配置及[V2增量迁移](../../backend/eap-applications/eap-full-application/src/main/resources/db/migration/V2__chat_task_plan.sql)。同一数据库事务内锁定执行归属行、CAS及操作去重，完整快照/稳定ID与空列表明确更新；最多32项、每项500 Unicode codepoints、32KiB持久快照。未创建计划也有可授权的持久执行归属行，GET可返回JSON null；历史读取不依赖内存会话。
- [内置计划工具](../../backend/eap-ai/eap-ai-codegen/src/main/java/com/lh/eap/ai/ChatPlanTool.java)只注册在原有明确授权的源码/Git工具模式，PLAN仍无工具；原有工具调用额度4不被挤占，启用计划时最多额外2次，合计6；没有计划则仍为4。预留18KiB实际进入ContextBudget计费，其中16KiB覆盖计划原始参数/全部成功或失败结果累计，2KiB覆盖schema/指令；超出前置或循环预算终止，不把超限参数带入下一次模型请求。服务的32KiB存储上限与工具更窄的上下文预算职责不同。
- 事务提交后发`plan.updated`完整快照，外层状态不混入待办状态；[GET控制器](../../backend/eap-web/eap-web-ai/src/main/java/com/lh/eap/web/controller/AiChatController.java)按持久principal/workspace/conversation/execution授权。取消先信号模型再关闭可写行，真实终态关闭写入，旧快照保留；注册失败不进入模型。
- runtime-client严格解析同一合同，生产chatSession经[计划观察器](../../frontend/apps/web/src/features/chat/planObserver.ts)在执行身份筛选后处理事件/版本与GET，丢事件读回、迟到响应不覆盖新快照；final重建与取消保留观察，缓存标为历史观察，刷新由服务端重申权威。[摘要](../../frontend/apps/web/src/components/SessionPanel.vue)只读显示条目/错误/加载/重试，计划完成不应用代码、不运行验证、不变审批或业务Task/Run。

## 自动检查（本轮实际运行）

当前shell未自动加载开发工具，Java/Maven通过`source /home/superagent/.local/env/java-maven.sh`；Vite+实际可执行路径为`/home/superagent/.local/share/vite-plus/1.6.0/bin/vp`，下文以`$EAP_VP`表示。未安装RTK，不伪称使用了包装器。

```sh
$EAP_VP -C frontend test run
$EAP_VP -C frontend run typecheck
$EAP_VP -C frontend run check:architecture
$EAP_VP -C frontend/apps/web build
source /home/superagent/.local/env/java-maven.sh
mvn -q -f backend/pom.xml -pl :eap-full-application -am test \
  -Dtest=ChatPlanPersistenceTest,ContextBudgetTest,EngineeringChatServiceTest,ChatExecutionStreamTest,FullApplicationCompositionTest \
  -Dsurefire.failIfNoSpecifiedTests=false
python3 -B scripts/verify-domain-contracts.py
```

- 父代理全前端最终合并运行：**184文件1135项全部通过**；随后适配模块新增升级/拒绝样本的3项测试由该包定向复验，包最终6项通过（不是将定向项再重复累加为全套重跑）。类型、架构/边界/循环、Web生产构建全部通过；构建保留原有大chunk提示。34份受影响前端自有源码/脚本fmt检查通过、lint零错误；初次两处浏览器console警告改stdout后复检零警告。原始snapshot不格式化，构建以摘要校验原字节；generated产物由可复现构建而非手工改写。
- 父代理最终后端复验：**62项全部通过，0失败/错误/跳过**（ChatPlanPersistence14、ContextBudget6、EngineeringChatService33、ChatExecutionStream7、FullApplicationComposition2），涵盖实际Spring AI fake-provider循环2次计划+4次源码读取、PLAN保护、事务/并发CAS/回滚/所有权/HTTP合同、取消与终态、注册失败及上下文预算。没有付费模型调用。
- 状态/错误验证：21领域、24错误目录、532机器码、12对中英文bundle通过。新增机器错误保持领域归属；未用文本解析业务分支。文档与`git diff --check`另外执行并在PR记录最终结果。

## 真实PostgreSQL验证

首次环境无Postgres/psql/docker；为避免将H2等同实库，独立下载并解包PostgreSQL18.6及必要动态库至临时目录，以普通用户启动独立空集群`127.0.0.1:56437`。没有系统安装、没有使用Windows日常数据源、没有读取生产凭据、没有对已有库运行DDL。验证程序从Maven实际编译类路径加载生产Store/Service/Controller，Flyway12.4实际执行完整V1+V2并validate。

已通过：注册/空计划读取、首次写、完整替换/稳定ID重排、相同操作精确重放、同键异文冲突、旧revision拒绝、8个独立JDBC连接事务CAS恰好一胜、重建datasource/store/service读取一致、外部owner404、取消/关闭后拒写及保留快照、失败写回滚行数；MockMvc接真实PostgreSQL返回字面JSON null与关闭后快照，无内存registry依赖。临时集群正常停止、端口关闭。

验证产物在执行工作区外的`/tmp/eap-pr7-pg-verify-20261114`：独立`VerifyPostgres.java`、命令README、verification.log、postgres.log和编译指纹。它验证真实PostgreSQL18及生产JDBC/迁移/控制器；**不是实际JVM/数据库重启、完整Boot监听服务或真实模型浏览器端到端验收**，重建服务实例只证明读取不依赖原内存对象。H2兼容模式测试作为日常自动回归另行保留。

## 实际浏览器与视觉证据

匹配基线及After见[内置计划](../evidence/chat-native-plan/README.md)和[原client菜单](../evidence/dsh-plugin-context/README.md)，共8张真实应用截图，1440×1000及390×1000，同主题/会话/执行/草稿。脚本使用用户Vite+管理的Playwright、Chromium与临时共享库，不依赖其他仓库node_modules；基线使用精确35ff91a独立worktree，改变实现使用本PR工作树。

已通过：GET计划revision2的两项与状态、原menu真实渲染、Clipboard实际权限和读回全文（未stub）、右键与更多/键盘开启、Escape回焦、外点关闭、视口边界、草稿及会话/执行保持、零pageerror/零API写入。菜单背景在原token缺失时真实失败，补齐既有EAP token映射后不透明背景/圆角/轮廓同验；没有自画旧界面或弱化断言。

## 失败、限制与尚未实施

- 后端全clean reactor尝试被Linux环境的既有Windows Junction测试`FileExecutionArtifactStoreTest.rejectsJunctionOutsideArtifactRoot`阻断；未忽略或削弱。另一个`AiChatApplicationTest.statusIsReadWithoutCallingTheModel`的路径泄漏断言，在单独归档35ff91a基线的新reactor中同样失败，证明与本轮无关；未在计划功能内改动状态DTO或删断言。定向62项通过不等于全后端绿。
- 原DSH `View.tsx`失败Toast与菜单使用冲突的React sibling key，保留原字节并披露：会警告，失败后快速重开可留下一个空的零尺寸root span直至dispose；独立验证重开/清反馈/Escape与复制仍正确。没有隐藏警告或为它修改原包语义；后续上游修复经受审升级引入。
- 插件只支持受审静态浏览器闭包，非全部DSH插件兼容，未安装市场或任意URL/npm执行。当前上游仍同基线，未实测新的上游commit升级；差异工具和变化样本已验证。
- 不支持手工编辑计划、永久跨轮主计划、自动Task/Run、子任务/DAG调度或DSH原生Host执行。没有声称执行持久回放、日志不淘汰或CT-01接管；消息图/分支、富文本、多模态、Chat MCP及其余聊天区域尚按原路线推进。
- 没有真实供应商/MCP调用或全用户流程人工接受，本轮技术证据不能升级为用户接受。迁移只在隔离临时库验证，未修改用户日常库。
