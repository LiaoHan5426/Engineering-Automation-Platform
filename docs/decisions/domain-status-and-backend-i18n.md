# 分域状态常量与后端消息国际化

状态：2026-11-10用户已批准并集中实施；当前新增未提交。当前实现、验证范围及限制见第6节，实施前审计保留为历史快照。

本轮保留已有多文件页面交付的全部未提交改动，不提交、不启动新模型、不重跑其测试。本文解决两项新问题：状态值缺少分域权威定义，以及后端机器错误码与用户文案混用。状态集中化、错误协议与文案资源应作为同一批前后端变更交付，不能只翻译异常字符串。

## 1. 实施前证据（保留的历史快照）

以当前工作区源码为准，不把历史文档当实现事实。静态候选扫描覆盖311个后端生产Java文件、137个前端应用/runtime-client文件，排除测试、target、node_modules和dist。选定状态字面量包括Java中SQL字符串；候选数不是语义重复数，也不是穷尽证明。

| 观察 | 当前源码证据 | 影响 |
|---|---|---|
| 后端状态有部分枚举基础，但多数合同仍是String | `CliExecution.Status/Approval/Verification`、`AnalysisStatus`已存在；`ToolExecution.status`、`MissionExecution.status`、`CodeProposalStore.Stored.status`、`BoardVerificationService.Record/Check.status`、`ExpertAgentJournal.Entry.state`仍为String | 应复用已有正确枚举，再按职责补齐，不能新建一个总Status |
| 同一域状态列表重复 | 候选状态在`CodeChangeService`、JDBC store、Board service、前端DTO、`BoardCodeCandidates`、`ProposalApplication`重复；工具执行active/blocking在record、持久查询及前端分别判断 | 有限状态值、活动/阻塞分类和序列化需要统一；事务授权规则仍归业务服务 |
| 同名值不保证同一含义 | 工具执行UNKNOWN继续阻塞；进程身份UNAVAILABLE表示无法检查；Board验证PASSED不代表用户接受；专家运行采用小写/短横线，候选应用采用大写 | 不按字符串相同跨域合并，也不通过大小写转换投影 |
| 后端detail兼做机器码和文案 | `ApiErrorHandler.expected`直接将getReason写入detail；invalid透传IllegalArgumentException.message；数据库错误则写固定中文 | 客户端无法稳定区分协议字段和展示字段，通用异常还可能泄露未审查内部信息 |
| 错误响应绕过统一Advice | `AiBrowserRequestGuard`手写JSON；`ToolExecutionController`、`BoardRuntimeController`返回detail Map；`SkillController`自行创建ProblemDetail | 仅修改全局Advice不能覆盖全部出口，且不能丢失工具阻塞execution等业务上下文 |
| 前端依赖detail分支 | 静态候选发现16个生产文件读取detail；`applyError.ts`搜索展示消息中的错误码；`ProposalApplication`、`chatSession`、工具/Run/交付处理直接比较detail | 直接国际化detail会破坏冲突、撤权、过期及UNKNOWN恢复逻辑 |
| 没有后端产品消息国际化装配 | 生产代码未发现MessageSource/ResourceBundle/LocaleResolver；未发现产品消息properties或spring.messages配置 | Spring框架有能力，不等于本项目已经接通消息目录和语言协商 |
| 前端已有国际化但未贯通传输 | vue-i18n具有zh-CN/en-US资源，默认zh-CN、fallback en-US；`presentation.ts`/工具调用提示仍有固定中文；Axios与SSE fetch均未设置Accept-Language | 应使用应用当前语言统一HTTP/SSE，而不是增加只覆盖Axios的第二种语言机制 |

扫描限定集合中，后端UNKNOWN为12文件37处、RUNNING为12文件40处、APPLIED为5文件13处；前端相应为6文件23处、6文件10处、3文件8处。异常构造/部分helper调用提取224个稳定错误码候选、371次出现及167处非码文本候选。后者包含内部开发诊断，必须人工分类，不能批量翻译后全部发给用户。完整临时扫描在`backend/target/state-i18n-audit/`，没有写入生产源码。

## 2. 状态定义边界

### 2.1 按有限状态机归属，不按字符串归属

| 领域 | 后端权威落点 | 前端权威落点 | 保留的边界 |
|---|---|---|---|
| 原生命令执行、审批、验证 | 复用`eap-api`现有`CliExecution.Status/Approval/Verification` | runtime-client中`contracts/cliExecution.ts` | 不给原生执行器加入应用持久核对状态 |
| 持久工具执行及进程身份检查 | 工具持久状态归workflow的`ToolExecutionStatus`；进程身份状态归`eap-api`的独立类型 | `contracts/toolExecution.ts`、`contracts/processIdentity.ts` | 工具UNKNOWN/CLOSED_UNKNOWN、执行器终态及身份检查结果不是一套状态 |
| Mission执行 | workflow中的`MissionExecutionStatus`，与原生命令结果显式映射 | `contracts/missionExecution.ts` | 持久状态、unconfirmedReason和只读UNKNOWN投影分开，保留storedStatus |
| 源码候选与应用 | delivery的`CodeProposalStatus`，JDBC/Board/AI消费同一类型 | `contracts/codeProposal.ts` | PROPOSED/APPLYING/APPLIED/FAILED/UNKNOWN/REFUSED；与专家运行applied明确映射 |
| 独立验证记录及单项检查 | workflow的`BoardVerificationStatus`和`BoardVerificationCheckStatus` | `contracts/boardVerification.ts` | check的TIMED_OUT等不能放宽整体记录状态；验证通过不完成Task |
| 看板任务、交付来源及决定 | workflow按功能拆`BoardTaskColumn`、`BoardDeliverySource`、`BoardDeliveryDecision` | `contracts/boardTask.ts`、`contracts/boardDelivery.ts` | planned/ready/acceptance/done不是执行状态；ACCEPT/REJECT不是进程成功失败 |
| 专家运行/审批 | core的`ExpertAgentState`供workflow持久适配及AI服务使用 | 拆到`contracts/expertAgent.ts`供现有expertAgent API复用 | queued/awaiting-approval/unknown等沿用当前语义，显式转换源码候选结果 |
| Chat执行、事件、连接 | Chat执行合同归ai-chat；连接状态归对应model/codegen职责 | `contracts/chatExecution.ts`、`contracts/modelConnection.ts` | 连接可用性不等于任务成功；流结束不等于应用完成 |
| Chat请求目的 | `ai-chat/TaskMode`：CHAT、CODE、PLAN | `contracts/taskMode.ts` | 规划请求不注册工具、不创建源码候选；Agent复用CODE目的，不增加第二个代码生成状态机 |
| 单次Chat工具面 | `ai-chat/AiToolMode`：NONE、GIT_STATUS、CODE_SOURCES | `contracts/aiToolMode.ts` | 严格拒绝非法wire值；CODE_SOURCES仅对已绑定任务的CODE请求开放，与既有Git授权及规划无工具合同分开 |
| 场景、插件、资源管理 | 每一原领域定义配置/依赖/发布/保存状态 | runtime共享合同分域；仅UI本地状态留对应feature | 配置/草稿/服务器不可变版本各有职责，不合并成运行状态 |

后端优先使用类型安全枚举。需要不同wire值时显式提供wireValue与严格fromWire，在Jackson/JDBC边界集中转换，不依赖enum.ordinal或隐式toString；数据库和HTTP编码在没有语义变化时保持原值，这不需要旧值解析兼容分支。前端使用`as const`对象推导联合类型，运行时校验、分组和状态标签引用相同定义，禁止联合类型与另一个数组各写一遍。

公开wire合同放runtime-client，根index仅按现有公开exports组合，不继续堆声明。纯UI本地状态留feature，不引入UI包到runtime-client；后端仅真实跨底层模块的合同才进入eap-api/core，禁止向上依赖workflow/ai/web。基础样式、variant、HTTP标准码和外部协议码不因为外观像状态就机械抽取。

### 2.2 分类规则和非法值

- 同一状态机的活动、阻塞、终态分类只定义一次。授权、当前Task/revision、原型、基线等写入门禁仍归原服务；常量文件不是业务服务容器。
- 状态名字相同不共享定义；不同状态机转换使用显式switch并由行为测试覆盖。删除重复的本地状态集合与无意义的`| string`，不增加总状态类、总常量包或互相兜底的识别器。
- 未知协议值/非法数据库值属于合同错误，不能自动映射为业务UNKNOWN。业务UNKNOWN必须有原执行证据/不确定原因；格式错误应明确报错并禁止写操作。
- SQL查询用对应枚举wire值绑定参数；Flyway历史迁移保留冻结字面量，不让迁移依赖运行期枚举。当前CHECK与枚举不符时新增迁移并验证，不修改已应用迁移。
- 不为只出现一次的普通字符串制造文件；按职责和复用需要拆分，不按每个字符串建一个类。原有正确的枚举/资源复用，避免抽取后出现两套定义。

## 3. 统一错误协议

2026-11-12接续：客户端已经断开时没有可交付的错误体。统一异常处理使用Spring `DisconnectedClientHelper`识别实际断连，停止再次生成500响应，调试日志只记录路由模板；真实序列化异常仍返回原平台500合同。意外错误诊断增加匹配路由模板、直接原因类名和响应提交状态，不记录异常正文、请求参数、密钥或原始路径值。实库/Chromium复现定位到关闭页面后的 `/api/capabilities`、响应已提交、Jackson写出链；修复后同场景不再出现该写出警告，不能由此声称任意断连和所有运行日志已无异常。

采用现有ProblemDetail作为HTTP envelope，明确机器字段和展示字段：

```json
{
  "type": "about:blank",
  "title": "操作冲突",
  "status": 409,
  "code": "FILE_CHANGED_SINCE_PROPOSAL",
  "detail": "文件已在候选生成后发生变化，请重新核对源码。",
  "requestId": "server-generated-uuid"
}
```

英文请求保留相同status/code和业务上下文，title/detail返回英文，响应标明Content-Language。requestId是服务器诊断身份，不替代请求去重身份。已有knowledgeMemoryCleared/contextMemoryCleared、工具阻塞execution等允许的结构化上下文必须原样保留，不能在规范化时丢失其安全语义。

- `code`为稳定分域错误码，业务判断只读code；`detail`为本次语言下的人类消息，不是控制协议。不保留`code ?? detail`或在errorMessage里搜索错误码的旧分支。
- 通用错误码仅含JSON/字段/内部/数据库/资源等真正通用的错误；Code、Board、Tool、AI、Skill、Knowledge、Model各自拥有错误码定义及消息key，不建ErrorCodes超级类。
- 业务异常携带错误码及经过约束的消息参数；HTTP映射与消息渲染由外层负责。eap-api中如需错误码接口/异常基本合同，应无Spring/HTTP/模型SDK依赖；不借本任务重写所有服务层。
- 未分类的IllegalArgumentException、JSON解析、数据库/SDK错误均映射安全的通用错误，不直接透传error.message、SQL、响应体、路径或凭据。日志保留requestId/code/异常类别和受控诊断；日志、源码、命令输出、模型原文不是翻译对象。
- 统一Advice、controller局部异常处理、Filter拒绝、SSE握手失败及流内平台错误，全部使用同一错误构建器/合同；本地handler仍可保留业务上下文，但不再拼另一种错误JSON。
- 外部模型/工具本身的业务自然语言不做强制翻译；只有平台拥有的用户提示通过资源渲染。

## 4. 后端i18n落点和语言协商

先形成逻辑清晰的i18n子模块，复用Spring MessageSource和MessageFormat，不为了命名新增空Maven模块。HTTP的语言协商、ProblemDetail渲染放`eap-web-core`的i18n子包；错误码和资源随对应业务模块归属，full宿主显式组合各资源basename。

示例资源布局：

```text
eap-web-core/src/main/resources/i18n/common/messages_zh_CN.properties
eap-web-core/src/main/resources/i18n/common/messages_en_US.properties
eap-engine-delivery/src/main/resources/i18n/code/messages_zh_CN.properties
eap-engine-delivery/src/main/resources/i18n/code/messages_en_US.properties
eap-engine-workflow/src/main/resources/i18n/board/messages_zh_CN.properties
eap-engine-workflow/src/main/resources/i18n/tool/messages_zh_CN.properties
eap-ai-model-openai/src/main/resources/i18n/model/messages_zh_CN.properties
```

每个生效目录均配对中英文；不把所有模块文案搬到host的大文件。组合配置可以列出basename，但不能使底层业务模块反向依赖host。消息key采用领域命名空间，启动/定向检查拒绝重复key及缺失翻译；最小组合只装配其已有资源，不因缺可选模块而失效。

语言首版与前端一致，仅zh-CN和en-US。按Accept-Language权重匹配受支持语言，zh/zh-*归zh-CN，en/en-*归en-US；缺失、不支持或格式异常使用确定的zh-CN默认，不读取服务器OS默认语言。UTF-8无BOM、关闭系统语言隐式fallback；缺消息key按安全通用消息返回并带code/requestId，开发检查必须发现缺key，不能把key或内部异常直接展示给用户。

前端在应用启动及语言切换时，把当前vue-i18n locale交给runtime-client的独立配置入口；runtime-client不能反向import应用i18n。Axios、专用API实例和SSE fetch共用同一取语言函数，统一发送Accept-Language。SSE/后台任务在请求入口捕获locale或只持久保存code/参数，不能依赖虚拟线程/线程池继承LocaleContextHolder；重读持久记录按当前查看者语言渲染，不因语言切换重放模型或执行。

状态标签属于前端既有按功能Messages；平台HTTP错误detail由后端翻译。前端恢复指引、确认框、本地存储/网络错误、Mock自有提示归前端Messages。避免前后端维护同一套完整错误文案：前端仅为有明确恢复交互的code提供额外指引，普通错误展示后端detail。

## 5. 实施顺序与验收

本方案涉及跨模块状态类型、HTTP错误协议和所有detail消费者，用户已明确批准整体实施。以下顺序已按同一合同集中执行，不保留旧响应分支。

1. 冻结分域状态/错误码清单，记录当前wire值与持久CHECK；以当前未提交工作区为基线，保存差异清单，不丢多文件交付改动。
2. 集中完成工具/Mission/源码应用/独立验证/看板交付/专家运行的后端类型和前端分域常量，替换该域全部读写/分类/投影/Mock；保留不同状态机，移除重复状态数组。
3. 建立公共错误envelope、错误构建器、语言解析及Spring消息装配，分域整理安全提示和资源，统一Advice/Filter/局部handler。保留真实上下文，删除用户可见原异常透传。
4. 同批迁移前端所有机器detail读取/子串搜索为code，统一Axios/SSE语言；把presentation/工具等固定中文提示迁入已有Messages。Mock同步当前新协议，无新旧响应双解析。
5. 迁移其余Chat/连接/资源/插件场景等分域状态及剩余用户提示；核对持久reason/error字段只保存稳定码与必要参数，不将显示文案变成新的状态源。仅确有结构变化才新增数据库迁移。
6. 完成有意义的定向回归：同一错误中英文code/status/context一致而detail不同；缺失/不支持语言、权重、多线程/SSE/后台重读；原生执行到持久状态、UNKNOWN互锁与清理证据、非法wire值拒绝；状态/DB/序列化契约对齐。
7. 在真正full和浏览器完成中文/英文的源码基线冲突、工具阻塞/存储失败、会话过期/撤权及SSE错误链；语言切换不改变应用/恢复/接受行为，不重跑无关真实模型。更新主方案、台账、相关decision及规范后再提交。

退出标准不是出现几个新文件，而是：受影响领域只留一个权威定义；所有平台错误出口具有独立code与本地化detail；客户端无业务detail判断；语言贯通HTTP/SSE且不污染持久状态；原互锁、授权、上下文清理和去重行为保持可验证。最终报告区分已迁移、未覆盖、静态检查、真实链路及用户接受。

## 6. 当前实现及验证

本次已完成上述合同迁移。16组Java枚举/前端值对象逐值一致；原有CliExecution、状态标签和前端功能Messages继续复用。132个接口模型从runtime-client根入口拆到9个分域Models文件；纯`@eap/runtime-client/contracts`入口不加载Axios、NProgress或浏览器环境。Mock通过纯入口消费合同。纯TS合同使用显式`.ts`相对导入。2026-11-11独立Mock改由Node服务加载；新增无领域传输包@eap/request，原runtime-client迁为其业务适配，见[当前传输合同](frontend-product-workspaces-and-transport.md)，不保留第二条生产请求路径。

后端分域目录共23个、516个错误码，配对11个basename；CommonErrors只保留8个真正通用错误，工作区、安全、协议、执行、CLI、Git、Chat、OAuth、模型、知识、数据库资料及规则有各自定义。管理接口原中文拒绝已迁移，未分类内部错误返回安全通用文案。用户可见错误保持status/code/context，detail根据Accept-Language渲染；数字消息参数受约束。普通DTO/JDBC的String字段作为wire信封可保留，由所属枚举在构造/读取边界校验；没有声称所有Java字段都已换成enum。

状态活动/阻塞分类供业务和PostgreSQL数组参数共用，未更改授权、任务版本及审批门禁。Board聚合仍为单SQL快照，按RUN/VERIFICATION/SOURCE_WRITE各自校验；Mission持久状态含INTERRUPTED，UNKNOWN只作观察投影，保留storedStatus与稳定unconfirmedReason。非法wire值拒绝，不生造业务UNKNOWN。V35只补V33新增列注释，V33/V34与既有页面交付证据保持原hash。

HTTP、SSE及Mock已同批迁移；前端只读code判定恢复行为，detail仅展示，未保留兼容解析。SSE在请求入口捕获locale，事件增加本次语言message，持久事件只保留原code/证据；快照中英重读的journal哈希一致，前端展示文案不写入本地历史。内部诊断、工具/模型原文和历史执行证据不是强制翻译对象；本轮也不扩为全部管理页面静态文案英文化。

验证结果及命令见[交付记录](../records/delivery-history.md#domain-status-i18n)和[证据目录](../../frontend/apps/web/__tests__/browser/artifacts/status-i18n/README.md)。前端149文件914项及后续14文件230项、请求中语言切换2文件61项通过；后端157项修复、55项后续回归通过，数据库9个用例的1项旧夹具修复后补跑通过。必要full真实HTTP12组、Chromium中英2组和JDBC状态/CHECK核对通过；2次确定性失败provider调用，外部模型0次。

完整root check格式检查及stylelint仍发现存量问题，不能记为全绿。更改范围的格式/lint、typecheck、build和architecture已通过；不得通过关闭守卫、扩大权限或忽略名单掩盖问题。环境门控其余集成矩阵未全部执行；既有真实模型证据不重跑、不改写，用户产品接受仍独立。
