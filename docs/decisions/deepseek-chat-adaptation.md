# DeepSeek 聊天体验重做与前后端边界

日期：2026-11-14。状态：**范围按用户本轮修订记录；技术方案供评审，尚未实施或验收。** 当前进度仅由[CT-02台账](../planning-status.md#ct-02-chat-adaptation)维护。本方案不将源码审阅、上游功能或既有测试升级为新增能力已完成。

## 1. 范围与依据

用户明确要求：Markdown、代码块、公式、图表优先；消息排版、复制、输入与滚动以及编辑提问、重新生成、消息分支参照上游重做；会话导航、移动端、主题局部适配；图片和文件原件由前端本机保存，EAP Java后端不保存原件；按需搜索互联网网页、链接阅读和语音评估通过MCP接入。

上游参考固定为 [deepseek-ai/chat-demo v0.1.1 / 5d5dd754](https://github.com/deepseek-ai/chat-demo/tree/5d5dd754ebc1948e977ddb880a9eb5aa25f37b4c)。原方案的EAP审阅基线为 `cc090d7da0a4c2b4d9e951d99730b466b5b1260c`（历史记录）；本次修订以 `29e097c30258ec918bd8ac7b8f8e6eb3b017b0f0` 为基线，开始时工作区干净。保留Vue 3、Vite+、Java/Spring AI和公共包职责；React组件按交互合同改写，适用的纯TypeScript逻辑选择性移植并保留来源及许可证。重做范围为聊天核心，不扩展到五入口全站重写。

| 能力 | 源码事实 | 本轮目标 |
|---|---|---|
| 富文本 | [ChatWorkspace](../../frontend/apps/web/src/features/chat/ChatWorkspace.vue)以文本插值显示回答；上游有AST渲染、代码高亮、KaTeX和Mermaid | 定义统一富文本展示，处理流式未闭合内容及按需加载 |
| 消息与输入 | 当前ChatWorkspace承担消息、输入与工程证据装配；已有草稿及滚动保护 | 按上游重做消息区、操作区、输入区及滚动行为，工程证据通过明确区域装配 |
| 编辑、重新生成、分支 | [chatSession](../../frontend/apps/web/src/features/chat/chatSession.ts)是线性ChatTurn；上游[branches.ts](https://github.com/deepseek-ai/chat-demo/blob/5d5dd754ebc1948e977ddb880a9eb5aa25f37b4c/src/services/chat/branches.ts)用父子关系选路径 | 新建分支、保留旧分支、上下文按分支构建，执行记录保持不可变关联 |
| 附件 | [acceptFiles](../../frontend/apps/web/src/features/chat/acceptFiles.ts)拒绝媒体；[TaskContext](../../backend/eap-ai/eap-ai-codegen/src/main/java/com/lh/eap/ai/TaskContext.java)只接收name/content文本 | 前端保存原件，后端有限校验及调用时转发，按模型/解析能力限定可发送格式 |
| 存储 | [chatHistory](../../frontend/apps/web/src/features/chat/chatHistory.ts)使用浏览器Storage；后端聊天会话和聊天事件日志为进程内Map（不代表任务、候选等领域证据均不持久） | 明确草稿、已发送消息、执行证据、附件原件各自权威来源；不双写两套可编辑消息历史 |
| MCP | [McpClientService](../../backend/eap-engine/eap-engine-mcp/src/main/java/com/lh/eap/runtime/mcp/client/McpClientService.java)已有会话隔离及矩阵授权；[生产Handler](../../backend/eap-engine/eap-engine-mcp/src/main/java/com/lh/eap/runtime/handler/McpReadonlyHandler.java)仅桥接无参read_graph | 在现有调用路径扩展按需网页搜索/链接阅读及后续语音，不能把已登记或tools/list当已接通 |

上游也有前端本地原件与供应商文件两种身份：[db.ts](https://github.com/deepseek-ai/chat-demo/blob/5d5dd754ebc1948e977ddb880a9eb5aa25f37b4c/src/services/chat/db.ts)存IndexedDB Blob，[attachments.ts](https://github.com/deepseek-ai/chat-demo/blob/5d5dd754ebc1948e977ddb880a9eb5aa25f37b4c/src/services/attachments.ts)通过供应商Files API上传。其选文件即上传的行为与EAP选择/上传分离合同冲突，适配时使用EAP明确操作合同。

### 上游可借鉴范围与不可照搬部分

上游是浏览器直连供应商的聊天应用，不提供EAP的授权、审批、工程执行或后端消息图；不能把其本地分支算法直接当成服务端并发合同。固定版本的源码依据如下（不是已运行验证）：

| 参考 | 可借鉴 | EAP适配差异 |
|---|---|---|
| [parse.ts](https://github.com/deepseek-ai/chat-demo/blob/5d5dd754ebc1948e977ddb880a9eb5aa25f37b4c/src/services/markdown/parse.ts) | Markdown AST及引用映射 | 上游关闭缩进代码、将部分GFM节点还原原文；EAP先列明确支持语法及流式样例，不宣称完整Markdown支持；引用必须绑定实际来源 |
| [mermaid.ts](https://github.com/deepseek-ai/chat-demo/blob/5d5dd754ebc1948e977ddb880a9eb5aa25f37b4c/src/services/markdown/mermaid.ts) | 延迟加载、串行渲染、取消过期结果、失败不阻塞后续图 | 保留严格安全配置并补EAP资源预算；不能只复制图片标签替换就声称内容已安全 |
| [branches.ts](https://github.com/deepseek-ai/chat-demo/blob/5d5dd754ebc1948e977ddb880a9eb5aa25f37b4c/src/services/chat/branches.ts) | 父子关系、兄弟版本与已选后续恢复 | 根版本切换同样要覆盖；服务端校验图完整性、授权及请求身份，不接受浏览器提供任意历史图 |
| [speech.ts](https://github.com/deepseek-ai/chat-demo/blob/5d5dd754ebc1948e977ddb880a9eb5aa25f37b4c/src/services/api/speech.ts) | 录音后ASR、按次TTS的交互 | 上游调用供应商HTTP接口，**不是MCP语音实现**；EAP的MCP服务、适配和音频生命周期仍待验证 |

移植时记录原文件、固定revision与本地改动，并按上游[MIT许可证](https://github.com/deepseek-ai/chat-demo/blob/5d5dd754ebc1948e977ddb880a9eb5aa25f37b4c/LICENSE)保留版权及许可文本；仅保留来源链接不替代许可证。供应商地址、Key管理和浏览器直连逻辑不随UI移植。

## 2. 聊天核心重做合同

- 消息展示：用户与助手分区、正文/思考/引用/操作分层；复制整条回答及独立代码块；长代码和表格局部滚动；公式与图表失败可查看原文并重试渲染，不能影响发送或执行状态。思考内容仅显示供应商实际返回且允许展示的内容。
- 输入：自适应高度、中文输入法组合期间不误发送、明确换行/发送键、发送中停止按钮、附件预览与移除；切换会话、页面返回、异步附件读取保留草稿归属。模型/专家/Skill/任务上下文沿现有业务合同接入。
- 滚动：靠近底部时随增量跟随；用户向上阅读后保持位置，提供返回底部；历史扩展保持锚点；异步公式/图表和窗口缩放不抢阅读位置。切换会话后恢复该会话的位置。
- 分支：编辑提问创建新的用户节点及后续回复；重新生成在同一问题下创建新的助手节点；切换兄弟版本恢复该分支已选后续。旧内容及执行证据不覆盖；编辑取消保留原图，提交前确认目标消息仍有效。
- 执行：每次新生成关联新的执行身份和选中路径快照；断线重连继续观察原执行，不能当成重新生成。重复点击、响应丢失和切换分支不得重复启动。停止必须映射到后端取消及真实终态。
- 工程操作：查看旧分支不触发工具、源码应用、审批或任务状态变更；审批和候选保留原所属域身份及基线；现有[源码Proposal/Generation](../../backend/eap-engine/eap-engine-delivery/src/main/java/com/lh/eap/delivery/CodeChangeService.java)并无executionId字段，须保留proposalId/generationId、conversationId、workspace、任务revision及基线哈希，由新消息图显式关联生成执行/节点，不能拿generationId冒充executionId。重新生成须重新校验当下任务、授权和上下文，不能复用过去的写入许可；UNKNOWN核对遵循原所属域。
- 导航、主题和窄屏：复用现有会话轨和主题系统，按新消息/输入布局调整；不以聊天重做替换专家、设置、任务或设计器。

### 富文本安全与展示预算

模型、附件、网页和历史消息均是不可信内容。渲染合同必须覆盖：原始HTML不作为可执行DOM插入；链接限制允许的协议并防止新窗口反向访问；远端图片不默认加载，避免显示回答时隐式联网。KaTeX禁用可信命令，Mermaid保持严格模式，输出SVG的插入策略需单独审查；不运行代码块、图表脚本或任意嵌入页面。只影响展示的解析失败保留原文及复制能力，不改写消息内容或执行终态。

实现B前确定并记录正文长度、AST深度、代码高亮/公式/图表大小、渲染频率及超时上限；使用实际长消息测量，不凭上游默认值承诺性能。流式只更新受影响内容，取消、切换分支或主题后的迟到渲染结果不得覆盖新视图。键盘可达、焦点恢复、屏幕阅读器通知及reduced-motion与1440/390布局同验，不能逐token抢焦点或朗读。

## 3. 状态与模块归属（拟议目标）

| 数据/行为 | 权威归属 | 约束 |
|---|---|---|
| 已发送消息图、父子关系、内容版本、执行关联 | 后端聊天域 | 前端为投影；分支路径随生成请求固定，不能依赖浏览器任意改写历史来重放工具 |
| 草稿、当前阅读分支、滚动位置、界面偏好 | 前端会话域 | 当前阅读路径不改变进行中的执行快照；草稿与已发送消息职责分离 |
| 模型上下文 | 后端从已发送消息图的选定路径构建 | 供应商记忆只能是派生缓存；不能继续以会话全局线性记忆混入另一分支 |
| 原始图片、文件和录音 | 前端本机附件存储 | Java后端不持久保存原件；元数据、摘要与执行关联和原件区分 |
| 审批、工具、候选、任务与Run | 现有所属领域 | 聊天视图不另建执行状态机；历史展示不能改变审计事实 |

此方案会替换已发送聊天历史的本地权威及后端线性上下文构建路径，属于实质重构。切片实施时同步DTO、HTTP/SSE、Mock、调用方和测试，移除被替代的读写及兼容入口；旧本机展示记录不伪造服务端执行身份。历史数据处置须先给出可审阅的导出/迁移方案，不在本轮清理数据。

模块落点遵守[共享模块边界](frontend-ui-shared-module-boundaries.md)：无领域富文本/代码块/输入原语进入 `@eap/ui`，样式token进入 `@eap/style`；聊天消息、分支、附件和引用编排留 `features/chat`；DTO与事件解析归 `@eap/runtime-client`，传输归 `@eap/request`。后端聊天图与上下文落现有AI聊天/上下文职责，供应商适配落AI模型模块，MCP调用落现有engine-mcp，HTTP适配落web-ai。实现时先确认依赖方向，不把领域编排放入UI或App.vue，不新建平行能力注册表。

### 分支协议前置与恢复边界

当前[发送入口](../../backend/eap-ai/eap-ai-codegen/src/main/java/com/lh/eap/ai/AiChatApplication.java)接受message/toolMode/context，准备后才分配executionId；[取消入口](../../backend/eap-web/eap-web-ai/src/main/java/com/lh/eap/web/controller/AiChatController.java)按会话取消。[ChatExecutionJournal](../../backend/eap-ai/eap-ai-chat/src/main/java/com/lh/eap/ai/ChatExecutionJournal.java)最多保留64次执行、每次512条事件，完成日志可被淘汰，重启丢失。已有并发互斥不等于响应丢失后的请求幂等；新增消息图也不会自动补齐跨重启续跑。

C在实现前需明确以下合同，并同步DTO、HTTP/SSE、Mock和所有调用方；下列是待设计的语义，不是现有字段或已实现API：

- 服务端拥有会话内稳定消息ID、父节点、图revision及执行关联。拒绝跨会话父节点、缺失父节点、环、非法角色顺序、过期编辑目标及越权引用；根问题的编辑也必须保留旧根分支。当前阅读分支是前端偏好，不能与服务端图结构revision互相覆盖。
- 首次发送、编辑和重新生成携带客户端操作身份、父节点和预期revision。服务端原子绑定操作、消息节点和执行身份；同一操作重试返回原关联，不同负载复用身份应拒绝，真正重新生成使用新身份。先查原操作再决定重试，不能靠按钮禁用防重复。幂等记录的保留期及淘汰后的处理须显式定义。
- 生成冻结路径、内容版本、附件引用、模型/任务/授权与上下文依赖；前端不回传任意可编辑历史作为可信输入。历史摘要、预算、知识与Skill失效检查按该路径重算，旧分支摘要不得混入新分支。[AiConversationRegistry](../../backend/eap-ai/eap-ai-chat/src/main/java/com/lh/eap/ai/AiConversationRegistry.java)目前对含知识/Skill及其派生回答的敏感上下文保持后续轮次清空保护；图中可见不等于可重新注入模型。选路须保留sticky失效、显式清空边界、依赖版本/启停/撤权校验及敏感摘要限制，拒绝请求、取消选择或切换兄弟分支均不能绕过。先保留每会话一个在途生成，不隐式引入分支并行执行。
- 取消必须定位当前目标执行，迟到的旧取消不能停止下一次生成；切换阅读分支不等于取消。事件按conversationId/executionId/消息关联及sequence投影，重复事件去重、旧执行事件不能写入新分支。取消响应与真实终态分别处理。
- 消息图的存储、提交时机和失败恢复在C开工前定案；若消息需跨重启保留，不能只建另一张进程内Map。已完成消息读回与执行接管分开验证。已有/reconnect会按目标重绑，并在会话重建或绑定变化时清空模型上下文；同目标的存活会话重连保留模型窗口，它不是执行事件续看接口。日志淘汰/重启后明确显示不可恢复或待核对，日志缺失不等于从未执行，也不等于SQL/源码等域的业务UNKNOWN，禁止自动重发或伪造终态；持久回放、跨重启推理/工具接管仍属CT-01独立范围。

## 4. 附件只在前端本机保存

**首片建议使用IndexedDB保存附件Blob及本机引用，沿用上游方式。** 此为技术建议，不把“本机存储”误写为浏览器可以静默操作任意固定磁盘目录。原件不进入localStorage，也不同时保存到多种后端作为兜底。

| 本机方式 | 适用性与边界 | 本方案处理 |
|---|---|---|
| 内存File/Blob | 临时草稿；关闭/刷新会丢失 | 可作为写入本机存储前的临时态，不能宣称已保存 |
| IndexedDB | 会话和Blob可事务关联，上游已有实现参考 | Web首片建议；按工作区/服务身份隔离，错误与配额明确可见 |
| OPFS | 浏览器源私有目录，非用户可见的固定磁盘路径 | 大文件读写出现明确需求后评估，届时替换原件存储而非双写 |
| 用户选择的目录 | 浏览器需支持目录选择API并由用户交互授权 | 若必须可见目录，明确目标浏览器后单独实现；取消/撤权不静默改存其他地方 |
| Electron应用目录 | 需要主进程受限文件桥及目录生命周期 | 当前preload没有附件文件桥；不因已有桌面脚手架宣称支持 |

浏览器存储受源、配额及用户清理影响；持久存储请求不等于绝对不丢失。清理前提示受影响会话；分支共用附件时按引用关系回收，不能删除仍被其他分支引用的原件。固定目录采用应用生成的附件ID文件名及受限根，原文件名只作展示。

发送合同：选取/粘贴/拖入只添加本机材料；支持inline内容的模型在用户明确发送含附件消息时，经后端校验、有限内存转发；需要供应商Files API时，独立明确上传动作及远端保留/删除行为。EAP后端不保存原件，不代表第三方模型/MCP服务不保存。原件、Base64及音频不得落入请求日志、trace、持久模型记忆、执行快照或multipart临时文件；实现时验证框架缓存与临时文件行为，超限明确拒绝。

后端仍需判断真实类型、大小/数量、模型能力和目标授权。当前[EngineeringChatService](../../backend/eap-ai/eap-ai-codegen/src/main/java/com/lh/eap/ai/EngineeringChatService.java)以字符串构造user消息，[Responses适配器](../../backend/eap-ai/eap-ai-model-openai/src/main/java/com/lh/eap/ai/OpenAiResponsesChatModel.java)也将USER/ASSISTANT序列化为文本；仅修改DTO或模型目录不能打通多模态。图片需贯通类型化prompt、预算、模型记忆策略及适配器序列化，并按连接/协议分别验证实际发出的多模态载荷；PDF/Office等需有可验证的解析器或供应商文件能力，不能仅增加扩展名即可宣称可读。远端模型/MCP看不到浏览器的File、blob URL或本机路径；必须按目标协议传输实际内容或可访问的受控引用。

后续分支生成若需要历史原件，由前端补给对应本机附件；已丢失且无有效供应商引用时明确阻止相关请求并要求重选，不能静默省略。后台/跨设备任务不假定能访问这些本机原件；持久执行另按CT-01边界设计。

附件身份至少区分本机原件ID与摘要、消息/执行引用及供应商文件ID（绑定供应商连接与有效期）；供应商ID不能跨连接复用。选取并完成本机保存、显式远端上传、消息发送分别反馈，上传成功不等于消息已发送。重试应复用已确认有效的上传结果；超时结果不明先核对，不能静默重复上传。Object URL、读取任务及音频资源在移除/离开后释放；多标签页删除与写入需要一致性校验。

原件不留存与派生文本留存必须分开说明：当前name/content将文本内容放入模型材料，目标方案需逐项定义提取文本、摘要、OCR及供应商引用能否进入消息图/记忆/执行证据、保留期及删除行为；不得以“摘要”名义保存整份原件。删除本机原件不等于删除已发送内容或第三方副本，也不自动抹除审计事实。缺失时仅阻止依赖该原件的生成，历史文字与已有证据仍可查看；重选必须校验摘要，内容变化作为新附件。

## 5. MCP承接按需网页搜索、链接阅读与语音

**搜索的业务含义是：在聊天回答需要外部资料或最新信息时，按需检索互联网网页。** 此处不包含仓库文件搜索、会话历史搜索或本地知识库检索；现有文件系统MCP的 `search_files` 和memory的 `read_graph` 均不能作为网页搜索实现。

目标调用路径为 `前端 → EAP业务API → 受授权MCP客户端 → 网页搜索/网页读取/语音服务`，复用现有MCP客户端，但聊天调用链尚未接通。MCP负责接入，互联网搜索引擎、网页解析器、ASR/TTS仍由具体服务提供。

按需触发与回答合同：

- 用户明确要求查网页，或在本次会话已允许联网搜索的范围内，由模型判断需要外部网页证据时调用；开启能力表示允许按需使用，不表示每条消息都搜索。关闭或未获授权时不联网，必要时说明需要启用搜索。
- 网页搜索以问题生成关键词/查询，返回相关网页结果；需要阅读全文核实时，再按需读取选定结果页。基本流程为“问题 → 网页搜索 → 按需读取结果页 → 整理回答及来源引用”，不预先爬取网站或建立本地搜索索引。
- 链接阅读接收用户提供或搜索结果中的具体URL；用户直接给出链接时可以直接读取，不强制先进行关键词搜索。
- 界面显示实际发生的搜索/阅读及来源，回答引用与本次返回资料对应。结果摘要与已读取正文分别记录；无结果、调用失败或取消时说明实际情况，不能宣称已查证网页。

| 能力 | 首片合同 | 仍需完成 |
|---|---|---|
| 按需网页搜索 | 根据当前问题按需查询互联网网页；关键词/条数/时间等有界参数，返回网页标题、URL、摘录与来源标识 | 网页搜索服务选择、按需触发、精确授权、参数/结果校验、超时/取消与引用映射 |
| 链接阅读 | 按需读取用户提供或搜索结果中的具体URL，返回正文/标题/来源，设大小与跳转上限 | 限制服务端可达目标及重定向，验证独立读取、失败与来源回传 |
| 语音输入 | 前端录音，显式提交一次录音，MCP调用ASR返回文本草稿，用户再发送 | 音频传输合同、权限、格式、时长、取消；识别结束不自动发聊天消息 |
| 回复朗读 | 显式朗读所选回答，经MCP调用TTS，前端播放及停止 | 音频结果/资源引用、大小与生命周期、播放取消；不绕道LLM生成语音工具参数 |

MCP工具可以返回audio内容，但普通tools/call和Streamable HTTP不自动提供实时双向音频。当前方案先按录音后识别/按次朗读；若要求边说边识别或低延迟双向对话，再评估媒体通道，不能以SSE连接证明实时语音已实现。

当前差距：`McpProtocolClient`声明2024-11-05协议；`McpClientService`调用超时固定5秒；现有生产矩阵包含echo、顺序思考、memory及文件系统有限工具，但 `McpReadonlyHandler` 仅桥接read_graph。不能通过删除生产授权门禁或仅凭工具名/只读注解放行新服务。应扩展既有精确授权与能力合同，核对协商版本、工具schema、结果内容类型及有界调用预算，然后完成真实工具调用。搜索结果只作为资料，不作为授权或指令。

[EngineeringChatService](../../backend/eap-ai/eap-ai-codegen/src/main/java/com/lh/eap/ai/EngineeringChatService.java)目前装配Git/源码工具，现有Expert的McpReadonlyHandler不会自动变成聊天模型工具。E需要把选中工具schema、精确grant、参数校验、调用结果和引用接入现有Spring AI循环；不另建平行执行循环。[现有MCP会话](../../backend/eap-engine/eap-engine-mcp/src/main/java/com/lh/eap/runtime/mcp/McpSessionRegistry.java)要求执行、专家、服务器三者隔离；Chat须由服务端解析可信专家/grant身份，不能把前端角色标签视作授权。新桥接必须保留Handler原有的持久grant复核，不得直接调用客户端而绕过；打开同一执行的资源作用域，并在成功/失败/取消时统一关闭。PLAN继续拒绝工具，未授权或原无工具范围不能因启用联网选项被自动升级，Responses等连接也须逐一核对实际工具能力。网页和工具返回中的指令不能获得审批或写入权限。读取服务需验证私网/本机/云元数据地址、重定向及DNS解析后的目标限制；具体限制由实际发起抓取的一侧强制执行，不能仅校验UI输入URL。

网页搜索、链接阅读与语音所需的具体MCP服务/模型尚未选择，不能给出实网可用或延迟结论；选择与验证放入相应切片，不阻塞前面的展示与交互工作。

## 6. 分步替换与验收

| 顺序 | 交付范围 | 替换/保留与完成关口 |
|---|---|---|
| A 核心交互原型 | 消息、输入、滚动、分支切换、附件本机状态、窄屏；确定富文本样例 | 可点击并明确模拟；用户核对交互。列表/已有会话/新会话/编辑取消/未保存/错误状态逐项验证，不能用静态截图接受 |
| B 展示与输入生产切片 | 公共富文本及输入原语，新消息/输入/滚动实现 | 替换原纯文本展示和对应旧交互；保留现有执行合同及工程证据。浏览器验1440/390、输入法、复制、长内容、流式未闭合、HTML/危险URL、图表失败及滚动锚点 |
| C 分支闭环 | 先定消息图存储、操作幂等、revision、执行级取消及事件关联合同，再做前后端消息图/上下文选路与投影 | 同批替换线性历史/上下文路径；验证根/深层分支、并发及过期编辑、响应丢失重试、迟到事件/取消、日志淘汰/重启的明确边界、清空/摘要/模型变更及敏感材料失效、审批/UNKNOWN和任务草稿保护；不宣称CT-01持久接管完成 |
| D 本机附件 | IndexedDB原件、预览/重选/删除、受限转发，先文本及支持模型的图片 | 替换纯name/content附件合同；HTTP/Mock/测试同批更新。验证刷新、配额失败、缺失/重选校验、分支共享回收、上传重试及连接变更、后端无落盘/日志泄露及真实模型识别 |
| E MCP网页资料 | 按需互联网网页搜索、链接阅读、引用卡片及聊天上下文接入 | 复用并扩展现有MCP调用/授权；验证无需联网时零调用、明确要求搜索、授权范围内按需触发、关闭/撤权后不调用、直接链接阅读、搜索→按需读页→引用，以及无结果/失败/超时/取消；真实服务初始化、发现、调用与引用一致性分别验 |
| F MCP语音 | 录音→ASR草稿；回答→TTS播放 | 与网页搜索的授权和内容类型分别建合同；实测音频、失败、停止、刷新/离开释放资源；不扩大为实时通话承诺 |

A→B先取得交互证据；C依赖协议/存储合同评审，D生产发送依赖C稳定消息与附件引用（本机存储可独立验证），E依赖C的执行关联且可独立于D，F依赖音频转发及资源合同，不要求先完成网页搜索。未选MCP服务不阻塞B/C。每片列出被替换入口、调用方及回归清单；UI交付保留同场景/视口/主题的真实Before/After，并标识基线与变更revision。

这是一个连续改造范围的分批验收顺序，不把当前讨论理解为“只做富文本”。新增界面先满足A的交互接受，再实施对应生产切片；技术检查、确定性HTTP夹具、真实供应商/MCP及用户接受分别记账。用户本轮要求优先于旧规划中“仅局部借鉴聊天”的建议。

## 7. 验证入口与本轮证据

本次对29e097c的修订仅为固定版本上游及EAP源码/合同审阅和文档更新；未运行应用测试、构建、浏览器、模型或MCP服务，未修改实现、安装依赖或操作数据库。`git status --short`起始为空；查看上述文件确认当前结构。文档交付检查：`git diff --check`通过；Python 3对四份修改文档执行UTF-8无BOM、248个本地链接目标存在性及仅四份docs文件变更的检查，全部通过。这些结果仅证明文档格式与本地目标有效，不证明外部服务、产品实现或用户接受。

实现时从根执行 `rtk proxy vp -C frontend run typecheck`、`rtk proxy vp -C frontend run check:architecture`，按受影响文件运行 `rtk proxy vp -C frontend test run <测试路径>`；Web构建使用 `frontend/apps/web` 中的 `rtk proxy vp build`。后端按模块选择reactor回归，最终按影响执行 `rtk proxy mvn -f backend/pom.xml test`；改状态/错误目录后运行 `rtk proxy python scripts/verify-domain-contracts.py`。真实数据库、模型、MCP及浏览器按切片的实际授权和环境分别记录，不用脚本存在代替通过。

参考资料：[OPFS边界](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)、[浏览器目录选择](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)、[MCP工具与音频结果](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)。
