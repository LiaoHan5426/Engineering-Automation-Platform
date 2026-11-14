# DSH 前端插件适配与 EAP 内置执行计划：确定路线

日期：2026-11-14。**首个原client适配、升级差异工具及EAP内置执行计划已实现并技术验证，本轮原ui-shortcuts/ui-file-actions也已进入源码，最终回归PENDING；完整生态兼容未完成，用户接受独立。** 不部署独立 DSH 宿主，不引入 DSH Agent/模型循环，不通过 SDK 运行原生 todo。插件集中到一个独立前端适配模块，任务计划由 EAP 内置。当前可运行的 G1 局部实现与验证仍见[交互决定](chat-context-plugins-and-progress.md)及[验证记录](../records/chat-g1-validation.md)。

## 1. 总体归属

| 部分 | 确定承担者 | 边界 |
|---|---|---|
| 模型循环、工程执行、工具授权、审批、执行证据 | 现有 Java/Spring AI 与受控能力链 | 插件不获得第二套执行器，不能替代审批、应用、验证或验收 |
| DSH 客户端模块格式、依赖图、贡献点及生命周期适配 | 已建 `frontend/packages/dsh-adapter`（`@eap/dsh-adapter`） | 一个有版本基线的浏览器兼容模块，接现有 EAP PluginHost；不是新建独立应用、服务器或第二个全局插件目录 |
| 适配插件实际需要的后端服务 | 现有 Java 领域服务经 runtime-client 的明确方法 | 为具体已选插件补有界门面；不虚构 DSH 全量 Remote/Node API |
| 结构化执行计划 | EAP Chat 执行域 | Java 权威快照及内置工具，前端仅投影；DSH 仅作为行为参考 |

普通前端构建使用 Node 打包插件产物是已有开发工具链，区别于部署并启动 DSH Node 宿主。生产仍是现有 Vue 前端和 Java 后端；DSH 客户端兼容层嵌入同一前端，复用现有页面/面板入口，不另开会话工作面。

## 2. 独立前端模块的具体内容

模块不是保存一个上游链接的空壳。首个插件纵向接入时同步建立下列内容；当前实际实现和目录差异见[验证记录](../records/chat-plugin-plan-validation.md)：已创建包及baseline/graph/compat/upgrade，首片runtime/bridge集中在src而不预建空目录。

| 目标内容 | 必须保存的职责 |
|---|---|
| `baseline/` | 精确 DSH commit、相关上游包版本、manifest/schema 版本、源文件摘要、许可/版权、依赖与服务清单，以及该组合的验证记录 |
| `manifest/`、`graph/` | 解析已知 DSH manifest/client inject/平台声明；从受审构建产物生成客户端模块图，检查依赖闭包、资源地址和服务要求；不把 `bundle.patch` 当 Vue 组件列表 |
| `runtime/` | 复用可移植的 DSH 浏览器模块加载逻辑，补注册 facade、共享模块身份及 Cordis 生命周期；加载器只消费受信静态产物，不接受聊天内容生成 import URL |
| `bridge/` | EAP 槽位、路由、locale、配置及精确服务方法的适配；数据由 EAP 权威源提供。贡献/启停仍交由现有 PluginHost，不建平行 Capability Registry |
| `view/` | 必要时使用同一个 React/Cordis 兼容岛承接 DSH 客户端原组件，再由 Vue 薄包装挂载；安装、卸载及重连必须 dispose，不复制一份上游应用壳 |
| `compat/`、`__tests__/fixtures/` | 精确插件版本→所需包/服务/贡献点→适配器→通过的验收；测试和冻结样本均在包根`__tests__/`；冻结上游实际样本和迁移样本，记录尚缺什么，不只写一个 supported 布尔值 |
| `upgrade/` | 对候选基线生成差异报告、更新源清单、运行兼容矩阵，验证后才修改正式基线 |

Web 应用仅负责装配该模块与业务界面；通用 UI 继续归 `@eap/ui`，网络传输归 `@eap/request`，业务 API/错误合同归 `@eap/runtime-client`。模块不能导入某一 feature 的会话实现，所需会话/配置/执行方法由宿主传入有界接口。DSH store 可以镜像供原组件读取，但不得成为模型配置、插件启停、会话或计划的第二个可写权威源。

### 原插件使用范围

这里的“支持 DSH 插件体系”明确包括 manifest/依赖/生命周期/客户端贡献的适配，不缩减成只读取 SKILL.md；也不承诺任意 npm 原包零修改运行。

| 产物 | 接入方式 | 能够宣称兼容的证据 |
|---|---|---|
| 纯浏览器 DSH client 插件 | 受审原 client 产物进入构建图；提供其实际需要的共享模块、注册/注入/槽位与资源，组件可保留 React | 原插件代码完成加载、交互、停用/dispose、重启/重连和错误回归；没有隐藏 Host 依赖 |
| Host/client 双入口包 | 保留可移植 client 部分；逐服务将其 Host 依赖映射到 EAP Java 已有能力或实现有界适配 | 每个实际调用的方法、入参/结果/事件、权限和取消都测过；只完成 client 的包不能标整包兼容 |
| Host-only Cordis 工具/provider/生命周期包 | 复用声明及可移植纯逻辑，所需执行能力通过既有 Java Handler/工具链适配 | 必须逐包迁移其语义；浏览器不能执行 Node/fs/process/Cordis Host 实现，缺适配就明确不可用 |
| Skill 文本资源 | 走原 Skill 预览、digest、版本/作用域和启停链 | 真实材料可被当前 Chat 引用；脚本不因导入自动执行 |
| MCP 能力 | 复用同一个 MCP 服务器，由 EAP 原客户端管理登记/信任与授权、会话隔离、初始化、发现及当前受支持的只读调用；凭据认证尚未实现，不承诺任意远端或写工具 | 针对实际传输及结果类型验证；不是在 Java 中加载 DSH MCP 客户端 Node 包 |

首片沿既有可信静态打包边界，没有插件市场、任意 URL/任意 npm 动态执行或安装脚本授权。来源/版本/digest、配置、启用和工具授权分别处理。插件的服务闭包不满足时拒绝激活并列出缺项；不偷偷启动 DSH，不悄悄换成演示界面，也不把残缺实例保留为成功状态。任意第三方同页 JS 没有安全沙箱保证，扩大来源范围需另有隔离设计。

### 固定源码依据

经本轮`gh api`核对，上游HEAD当前仍为以下commit（2026-11-13）；当前**首片已验证的评估基线**固定为 DSH `39163dd30f703a79079e2d2446545cff3c453738`，不是 `latest`，仅对已记录context-menu浏览器闭包通过兼容测试。[浏览器模块系统](https://github.com/deepseek-ai/deepseek-harness/tree/39163dd30f703a79079e2d2446545cff3c453738/packages/client/modules/src/client)提供构建浏览器兼容层的依据；[服务端模块装配](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/modules/src/index.ts)原来生成 boot 图与资源；EAP 改为受信构建阶段产生所需图/产物，不要求部署该 Node 服务。[DSH Web平台模块](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/web/src/platform.ts)和[主题入口](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-theme/package.json)说明 React 挂载本身不足以运行插件。首片必须核实实际共享身份、槽位和服务闭包，不能用 UI 主题包名称猜它没有后端依赖。

### 首个实际插件：上下文菜单

P1固定使用该基线的`@deepseek-ai/dsh-client-ui-context-menu/client`，保留原client代码，接一个明确捕获当前消息身份的“复制消息”动作。它注册上下文菜单按钮及`shell.overlay`，能实际验证原插件加载、贡献注册、渲染、异步动作/失败及卸载，不用静态组件或自制样例冒充插件兼容。[原client](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-context-menu/src/client/index.ts)需要slots/locale/shortcuts，且其包图还声明layout等依赖。

第一片明确适配依赖：构建图将所需locale/layout包行映射到已审计的EAP provider，shortcuts采用原浏览器服务并核对全局监听不冲突，记录替换关系和服务/方法清单，不声称原依赖包全量原样运行。locale采用可无Host运行的原LocaleRuntime内核并同步EAP当前语言；提供真实菜单所需的locale注册/绑定、shortcut目录读取及overlay渲染，不用空对象或成功占位。菜单只消费原绑定目标的文本，异步动作不得切会话后误用新目标，Clipboard失败在原操作反馈。上游React primitives只作为原client兼容闭包的内部依赖，不形成EAP第二套公共UI导出。

## 3. 跟随 DSH 升级的操作逻辑

1. **发现候选，不自动上线**：按维护周期或指定版本，通过仓库脚本比较候选 commit 与正式 baseline，输出包版本、manifest/模块图、共享依赖、服务接口、事件与资源结构的差异。上游分支推进不改变已安装产物；每个插件保留版本和内容摘要。
2. **限定受影响面**：依据 compat 清单求出受影响插件/适配器；只更新相关 facade、映射及 fixtures。核心纯逻辑尽量保留上游形态，EAP 差异集中 bridge，避免升级时全站搜索散落补丁。
3. **旧样本及新样本共同验证**：解析的合法/非法/未知必需字段、依赖缺失、平台不匹配、循环图、重复 React/Cordis 身份、资源加载失败、贡献点注册、配置读回、事件订阅及释放、服务错误/授权/取消均有合同回归；至少一个真实原 client 插件从加载到停用完整验证。未知必需能力不降级为默认允许。
4. **构建及浏览器验收**：基线/候选同场景对比桌面与窄屏，验证已有 EAP 会话、草稿、路由、焦点及审批。更新版改变产品 UI 时提供真实 Before/After。Node/服务依赖不能被构建插件静默注入浏览器，亦不靠 polyfill 伪造文件系统。
5. **提升基线**：源码摘要、包锁、构建产物、bridge 变更、兼容清单和证据在同一 PR 提交；通过后才将候选设为正式基线。为每条已支持组合保留可复现命令，不能仅按 semver 主版本判定兼容。
6. **回退与退出**：未迁移配置时回到上一受审产物和 baseline；需要配置迁移的升级必须同时定义可逆策略或明确不可逆点，保留用户配置原始副本。先停用并 dispose 旧贡献/订阅再切换，失败不双挂两版。回退不声称撤销已执行的工具副作用，不恢复被撤销权限，不删除业务任务或计划。

首版人工运行该确定性脚本并随 PR 交付报告；不是先增加常驻升级服务。达到稳定夹具覆盖后再接现有 CI。按“精确上游基线 + 插件产物 + EAP适配版本 + 验证结果”承诺兼容，升级成本可以集中和快速定位，但新宿主能力仍需要真实开发，不能保证所有未来版本自动兼容。

## 4. 任务计划由 EAP 内置

### 唯一权威及数据合同

计划属于 Chat 执行域，模型通过内置计划工具提交有界完整快照；普通任务计划不依赖上述插件包，也不需要 DSH 可用。复用 DSH 易理解的待办/进行中/完成三态和完整替换方式，但采用 EAP 稳定条目 ID、revision 和关联字段。状态常量由后端领域拥有，runtime-client 派生类型，非法 wire 值拒绝；实现时同步运行状态合同验证，不新建全局状态表。

记录含独立`schemaVersion`，存储行包含服务端可信principal/workspace所有权；当前记录：`planId`、`conversationId`、执行绑定的会话上下文（消息图落地后绑定真实 branchId，不预造根分支字符串）、`executionId`、`revision`、`updatedAt`，以及有界 `items[{id, content, status}]`。首次创建时由服务端分配身份；更新保留条目 ID，重排不改 ID，新增条目由服务端分配。初始预算为最多32项、单项500字符、规范化快照最多32KiB，实施以边界/Unicode用例验证；暂不做父子任务、依赖图、百分比估算、调度器或多 Agent 聚合，不接受未执行的依赖字段。清空使用显式空快照，不靠缺字段删除。

每次更新包含操作幂等键和期望 revision。幂等重试返回原结果，同键不同内容拒绝；并发修改冲突不覆盖。调用者身份、execution 归属及仍可更新条件由后端验证，不能让模型指定另一执行或任意会话。首版前端只读，模型和后续人工编辑若需要并存，也走同一领域命令与CAS，不在 UI 加一套本地计划。

计划领域服务/状态/DTO/Store及JDBC实现归`eap-ai-chat`；内置工具接入现有`eap-ai-codegen`，HTTP/SSE边界归`eap-web-ai`。不把实现放进engine导致engine反向依赖AI。chat模块已增加JDBC/事务依赖，在FullApplicationConfiguration显式装配，不给正式环境偷偷回退内存Store。

保留现有[PLAN模式](../../backend/eap-ai/eap-ai-codegen/src/main/java/com/lh/eap/ai/TaskContext.java)“无工具、只读方案”合同，不向该模式暗中注册计划工具，也不解析自由文本制造结构化列表。自动更新只在具备工具协议和明确执行权限的原模型循环中接入；不支持的模型可无结构化计划。[ChatClients](../../backend/eap-ai/eap-ai-chat/src/main/java/com/lh/eap/ai/ChatClients.java)保留原工具4次额度；有计划工具时额外2次，合计6，否则仍为4。18KiB预留计入真实上下文预算，计划参数/结果累计16KiB，失败尝试也计费，超限终止下一次模型调用。

### 生命周期与证据

- 首版**每次执行独立计划**：新 execution 初始没有计划；下一轮不覆盖上一轮记录。摘要按当前选择的 execution 读取，不误读为永久跨轮主计划。重试产生新 execution、新 plan；需要沿用时显式复制内容和来源关系，进度重置，不能默默继承 completed。未来按用户需求增加跨轮目标计划时显式扩展领域，不靠数组下标或文本相似度拼接。
- 在途只接受所属执行上下文的更新；取消中/终态后拒绝新的模型计划写入，保留最后已提交快照，取消/失败不会把未完成项自动改成完成。UNKNOWN 保留在执行状态，不塞进计划三态。首版允许多个进行中项并据实展示，不假装是自动调度。
- completed 是计划进度声明，不证明工具成功、源码已应用、测试通过、Task/Run完成或人工接受。原证据和业务状态继续独立；PLAN 文本材料也不自动拆成计划、启动工具或创建看板任务。

### 存储、事件与读取

选择 Java JDBC/Flyway 落地 PlanStore 的权威快照及幂等操作记录，避免浏览器 localStorage 作为真相。保存事务提交后发布带 planId/executionId/revision 的完整快照事件；读取提供领域 GET，经 runtime-client 和独立 Mock 使用相同合同。Flyway使用full-application唯一migration目录的后续增量（已新增`V2__chat_task_plan.sql`），不重写已应用V1。历史读取按持久行的principal/workspace/conversation/execution授权，不能依赖重启即消失的内存conversation注册。提交与通知间进程崩溃由GET读回修复，不声称已有持久outbox或SSE回放。已实现GET `/api/ai/conversations/{conversationId}/executions/{executionId}/plan`，返回严格快照或JSON null；领域错误及中英文资源同批交付。

前端按计划身份与 revision 忽略重复/旧快照；序号跳跃、刷新或重连后 GET 最新快照，不把全量事件重放作为前置。DB可读取历史计划不等于旧执行能继续运行。当前执行日志/会话注册仍有进程内及淘汰边界，持久计划不能冒充 CT-01 跨重启接管；读取不到与确实无计划须可区分，读失败不显示假完成或清空旧证据。

## 5. 顺序与验收

| 切片 | 可评审产出 | 验收 |
|---|---|---|
| P1（已技术验证，用户接受独立） | 在同一提交建立真实使用的独立包、固定基线/图生成及现有Host入口；按上文固定context-menu原client及明确provider替换清单，先产出依赖报告再接入 | 原包client代码实际加载/交互/dispose；缺服务不激活；模块没有独立Agent/Node服务；用户先接受改变的区域原型 |
| P2（工具与同SHA演练已验证，扩大能力待做） | 对下一固定候选执行上述差异流程，提交新旧兼容报告；一个Skill及一个实际支持的MCP服务走已有链，双入口插件按方法补后端适配 | 升级/回退不丢配置/草稿、不双挂；调用遵守原授权/取消；依赖缺项与原包可用范围准确 |
| T1（已技术验证） | 后端领域常量/内置工具、PlanStore迁移/GET/事件、runtime-client/Mock和摘要一起接入 | 首次无计划、创建/完整替换/清空、CAS/幂等/非法状态、越权执行、乱序/漏事件后读回、取消/失败保留、刷新及重启后历史可读；不冒充后台恢复 |
| T2 后续按用户需求扩展 | 在统一合同上增加人工编辑、跨轮目标、子项等实际需要 | 每项变更有明确来源/冲突/生命周期及行为验收；不建立第二套todo系统 |

本轮按实施授权完成P1、T1及P2的升级差异工具/同SHA演练；[验证记录](../records/chat-plugin-plan-validation.md)含184文件1135项前端、62项后端、真实隔离PostgreSQL18.6及同场景[计划](../evidence/chat-native-plan/README.md)/[菜单](../evidence/dsh-plugin-context/README.md)Before/After。新上游版本尚未出现，未宣称跨版本升级或全部DSH插件兼容。P2扩大插件/Skill/MCP实测、T2及消息图等后续范围仍待实际需求推进，用户接受不由测试替代。

## 6. 本轮原 client 扩展与技术验证

本轮范围覆盖聊天核心重构与更多插件兼容，保留单前端适配器、无独立DSH宿主、Java执行和EAP原生计划方向。本轮[源码审计](../../frontend/packages/dsh-adapter/compat/source-audit.json)与[兼容矩阵](../../frontend/packages/dsh-adapter/compat/matrix.json)增加原`ui-shortcuts`/`ui-file-actions`浏览器client，仍使用同一个React/Cordis岛；并非只列插件名称或重写一个下载按钮冒充原client。

固定上游`39163dd30f703a79079e2d2446545cff3c453738`不变；审计记录原82项摘要不变，source roster扩至106项。该数字是受审源码清单，不是106个插件。升级到不同上游SHA仍未验证；摘要核对和实际命令结果见[当前记录](../records/chat-core-refactor-validation.md)；浏览器原快捷键及下载已实际验证，不由矩阵字段推导未测能力。

| 原client | 实际接入及权威边界 | 保留限制 |
|---|---|---|
| ui-shortcuts | 原ShortcutsRow/ShortcutReference、浏览器快捷键服务与本机偏好，同岛注册settings项/overlay及shortcuts.open | 不接完整DSH设置壳或桌面键盘桥；参考表的上游条目不代表EAP都有对应命令；不写EAP后端配置 |
| ui-file-actions | 原apply及BrowserFileActions；捕获当前消息后由有界Blob reader调用原fileActions.save | 只证明下载请求及字节，不证明本机保存完成；不暴露任意URL读取；无Remote workspace/session、desktop saveAs或native clipboard桥 |

ui-commands、ui-theme、ui-settings及account通知依赖闭包未满足，审计明确不支持；Host-only Node provider仍不支持。来源、生命周期、缺服务拒绝、dispose/remount、单实例及窄屏真实交互已按当前受审范围验证。历史context-menu和内置PlanStore/工具/API/摘要已测结果保留，不能扩展成全插件兼容或用户接受。

本轮前端全量194文件1167项、类型/边界及最终生产构建通过，覆盖当前受审适配包；不能因此扩大为未列插件或跨SHA兼容。浏览器同UUID滚动锚点偏移0.15625px通过，Mermaid标签、最终1440/390视觉及初始布局均通过，源码revision随提交归档。后端宿主仍有既有隐私断言失败及9项环境跳过；详见当前验证记录，不宣称全链全绿或用户接受。
