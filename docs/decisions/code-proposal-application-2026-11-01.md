# 持久候选与受控单文件应用（PB-03）

状态：最小持久单文件应用切片实现、全量回归、实库/隔离文件验证与独立审查通过；承接已推送 f6aed04 的生成前持久快照。真实模型到完整任务交付与用户产品验收仍未完成。

## 当前关口

后端 V14、持久候选/意图/结果和共享 WorkspaceInterlock 已落地，独立静态复核未发现阻塞项。首次实库失败因 V14 未加载；用户 IDEA 启动暴露 JdbcCodeGenerationStore 的 final 阻止 CGLIB repository 代理，父任务同时修复两个 JDBC adapter 并补真实代理构造 RED→GREEN（此前直接new的持久化测试未覆盖此启动差异）。用户再次启动后 8080 返回200，V14结构经真实持久化用例确认可用；没有手工 reset/repair 或绕过迁移。

前端已补 status/afterHash/reason DTO，APPLIED回放展示读回哈希；新增3项不一致状态/结果测试先失败再修复，GET不可核对时不开放写入。未知状态不会反复POST。application.yml未修改。

## 本阶段验证

- 父任务 `EAP_RUN_BOARD_PERSISTENCE=true EAP_RUN_MISSION_GIT_ACCEPTANCE=true rtk proxy mvn -f backend/pom.xml test`：494项，0失败/错误、6条件跳过；CodeProposalPersistenceTest 5项、BoardRunPersistenceTest 29项实际运行，覆盖真实DB并发/意图提交/互锁/结果回放/失败恢复及隔离文件写入；CodeStoreProxyTest通过。跳过项仍为外部模型、建删库等既有条件及Windows符号链接权限。
- 前端 `rtk proxy pnpm --dir frontend test run`：80文件/375项通过；typecheck、check:boundaries、build、diff --check通过，大包警告保留。ProposalApplication 10项含响应丢失后只GET、不重复POST、失败禁写、迟到响应和状态/result一致性。
- 真实5173→8080新GET端点对未知会话返回404 UNKNOWN_CONVERSATION；未人为插入生产候选，未调用付费模型。
- 独立浏览器加载真实组件，用显式“模拟夹具、不调用后端、不写仓库”测试UNKNOWN禁写、确认后POST响应丢失→GET APPLIED、只调用一次模拟POST；1440×900/708×640无夹具横溢，测试后还原API并卸载。第一次夹具错误导入HMR模块仅验证了读失败阻止写入，修正模块URL后通过；这些证据不冒充生产源码写入或内置预览验收。
- 独立只读审查无确证阻塞缺陷；其非阻塞建议（DTO补字段、状态一致性测试）已由父任务补齐并回归。
- 现有文件使用ATOMIC_MOVE，不支持则未知阻塞，不静默降级；新增不覆盖move。最后检查仍不是对外部编辑器的OS CAS，保留外部并发修改风险。会话过期仍404，持久候选不等于持久Chat会话；未知人工核对/解除和Task/Run归因未在本片实现。

## 范围

复用现有 CodeChangeService、真实工作区绑定、单目标生成快照和 PostgreSQL。生产候选先持久再返回；明确确认后，写入意图先落盘，再实施单文件操作并读回哈希，最后保存结果。应用不意味着测试通过或任务完成，暂不伪造 Task/Run 源码实现归因。

## 状态与交互合同

- PROPOSED：可审阅确认；APPLYING：已有持久意图，禁止重复启动；APPLIED：可回放结果，不重写；FAILED：明确失败；UNKNOWN：无法证明结果，保持目录阻塞。
- 读取接口 `/api/ai/conversations/{conversation}/proposals/{proposal}` 按同一身份返回 proposal/status/result/reason，不执行写入或自动恢复。
- 应用继续使用既有 POST apply，只允许服务端保存的单目标与明确确认、非只读策略。相同已应用候选返回原结果；不能由客户端替换内容、基线或路径。
- 写入与看板 Run/独立验证/交付采集共享同一目录互锁；持久活跃/未知意图在请求结束或服务重启后继续阻塞，不只依赖 JVM synchronized。
- 写后数据库失败、未确认文件结果不盲目重跑或回滚用户文件。外部编辑器不受平台锁控制，不能宣称普通文件系统已具备事务CAS。
- 不复用旧自动验证 ProcessBuilder 来冒充独立验证；现有看板检查仍显式确认。

## 前端

ProposalApplication 属 chat L4，复用 Button/Checkbox/Badge/Feedback。加载/刷新先只读核对，读取失败不开放写入。显式确认后 POST，成功或响应丢失均重新 GET，只有持久 APPLIED 才向父级投影已写入；APPLYING/UNKNOWN/FAILED不显示第二次写入。切换候选忽略迟到响应。旧/mock候选保留旧展示，不伪造服务端持久证据，mock GET 明确404不可用。

## 验收要求

先RED→GREEN：跨身份拒绝、只读拒绝、基线冲突、幂等重放、并发领取、与既有Run/验证双向互锁、写后保存失败/重启未知、路径与链接边界；实际数据库仅自有样例行，实际文件仅隔离临时样例。前端测试覆盖回放、不重复POST、失败后重读和迟到响应；随后全量及独立复核，阶段完成后提交推送，持续排除 application.yml。
