# Chat 应用证据与看板交付的事后关联

状态：最小事后关联切片实现、父任务全量回归、实库关联协议、浏览器阻塞交互及独立复核通过。承接 f614272 持久单文件应用；复用现有交付、独立验证与人工决定，不新增实现Run或调度系统。不代表生成前任务归因或真实模型产品闭环验收。

## 事实边界

此片 `CHAT_APPLIED_POST_HOC` 证明一个 Chat 持久候选已经受控应用，操作者随后将其与当前 Task/Run 的交付关联。不能证明生成时绑定了任务，不能把 git-status Run 写成代码实现者，也不能断言整个 Git diff 都由 Chat 创作。生成前工作树基线和交付 Git 基线分别展示。完整预绑定任务归因是后续关口，不能倒写已有 generation。

## 合同

现有交付 POST 增加可选 `applicationRef:{conversationId,proposalId}`。不传保留 EXTERNAL_MANUAL 及旧请求指纹；传入仅单文件，服务端从持久 store 读取身份、generation、APPLIED/result/afterHash/finishedAt，不接受客户端可信状态或哈希。候选无需活跃内存会话可只读关联，但不因此恢复聊天或开放写入。现有 Chat 无projectId，只能证明Task属于项目、Run属于Task及候选principal/conversation/workspace一致，不宣称不存在的原始项目归属。

要求 generation/proposal/应用结果/验证清单/采集后源码目标及哈希一致，原型ID/hash与Run一致，应用完成不晚于独立验证开始。完整源码清单、HEAD、授权路径和目录互锁仍由原流程检查；只比较目标哈希不足以提交。关联摘要与交付和任务流转同事务保存，已存在记录不可补换引用；接受再次核对，拒绝不因源码过期而禁止。

返回 applicationEvidence 固定 POST_HOC，保留conversation/proposal/generation身份、目标、两类原始哈希、采集/关联时间、原型及local-operator。刷新重放不执行进程。前端用户显式勾选、填写UUID，确认框展示身份与事后关联边界；响应丢失保留原请求身份/关联，不新建或静默改引用。mock不能生成已应用证据。

## 实施与验证

前端复用已有Dialog/Checkbox/Input/Collapse，领域组件留L4。先复现4项缺失入口/错误引用未拒绝，再实现输入、严格UUID与单文件限制、不可变重试及证据分区；初轮相关58项、类型和边界通过。后端仍在实施，最终DTO、实库迁移、同源/时间/原型负向用例与浏览器及独立审查未完成前不得标交付。

后续实现已完成：V15已由开发环境加载，不改写历史迁移；后台薄证据服务读取APPLIED及起止时间，校验原型、同源哈希和先应用后验证，接受前重核，拒绝保留关联。旧fingerprint兼容由回归覆盖。前端补applicationRef显式null拒绝（与真实控制器一致），APPLIED显示conversation/proposal ID供选用，mock即使有引用仍明确404。

父任务实际命令：`EAP_RUN_BOARD_PERSISTENCE=true EAP_RUN_MISSION_GIT_ACCEPTANCE=true rtk proxy mvn -f backend/pom.xml test` 542项，0失败/错误、6条件跳过；前端全量80文件/382项通过，typecheck、check:boundaries、build通过，新增mock引用拒绝7项定向通过。实库/真实Git夹具包含33项BoardRun持久化、40项应用证据核对；验证命令使用测试double，不冒充生产三项检查或真实模型。

浏览器真实服务本次项目列表为空，未恢复或删除旧数据；新建明确的界面测试任务 `4d95a36d-1afa-47b1-a0bf-23a96942e045` 和一次只读Run `4b7a2e87-62bb-4ba2-b7a5-2f2709804856`。打开关联入口、填写测试UUID/单路径，因缺独立验证提交始终禁用；关闭后GET确认record=null。1440×900和708×640无页面横溢。没有生产应用记录注入或模拟成功提交，未调用模型。成功关联/接受协议由隔离实库夹具证明，完整模型→应用→验证→用户接受的浏览器路径仍需后续专门验收。

最终契约复核：请求 applicationRef 仅可省略或完整对象，显式 null 与服务端一致拒绝；response evidence 仍可空。新增编译graph类型断言、实际Axios序列化和journal拒绝回归；最终前端80文件/383项通过，类型/边界/构建通过。独立复核通过，无已确认阻塞项；后端仍为上述542项（6跳过），未将审查读报告写成再次运行。
