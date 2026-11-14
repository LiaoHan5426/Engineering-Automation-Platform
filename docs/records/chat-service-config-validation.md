# 聊天服务配置与有界语音：验证记录

日期：2026-11-14。状态：**配置与有界语音实现已通过代码审阅、相关测试、构建及双视口浏览器检查；最终配对图像和局部滚动可达性已验证，具备代码审阅条件。** 本轮不以具体供应商配置作为开发前置阻塞；真实网页、识别和合成效果尚未验收，用户验收另行确认。

## 1. 基线与范围

本轮在既有聊天重构之后继续实现可预留、可编辑的服务配置及ASR/TTS操作。实际BEFORE为 `dfa9612c25cd12be1822bd16fc14fcd07dc5b133`，新增代码尚未提交；最终提交revision与未列命令原文归档 **PENDING**；父任务报告最终浏览器生产源码树摘要为 `3621149bbab3b913b0df12db78fe5f01973e276b9611d2deb6e98f9f14f0fde8`，最终捕获标志为true。前轮 `0f7defa` 的[聊天核心验证](chat-core-refactor-validation.md)与图像是保留历史，不能用本轮结果覆盖当时“语音未实现”或旧命令、失败、测试数字。

仍保留Vue、Java/Spring AI、一个DSH前端适配器与EAP内置计划；本轮没有扩大DSH原包兼容范围，没有独立宿主或第二模型循环。语音操作直接调用受授权MCP服务，不通过聊天模型生成工具参数，不自动发送识别结果到聊天。

## 2. 服务配置与唯一权威

[类型化映射](../../backend/eap-engine/eap-engine-mcp/src/main/java/com/lh/eap/runtime/mcp/client/McpOperationBinding.java)最多四个唯一操作SEARCH、READ、ASR、TTS，保存工具名、专家身份、approved、输入schema及各操作的字段/结果格式映射。[V4](../../backend/eap-applications/eap-full-application/src/main/resources/db/migration/V4__mcp_operation_bindings.sql)只在既有mcp_server增加operation_bindings、binding_revision、binding_endpoint、binding_transport四列；[注册表](../../backend/eap-engine/eap-engine-mcp/src/main/java/com/lh/eap/persistence/mapper/McpServerRegistry.java)是唯一权威，读取失败拒绝操作。旧属性来源已移除，没有属性回退或第二套可写映射。

[管理服务](../../backend/eap-engine/eap-engine-mcp/src/main/java/com/lh/eap/application/service/McpServerService.java)经GET/PUT `/api/mcp-servers/{id}/operation-bindings`读写revision，PUT使用expectedRevision CAS。空配置/未批准是默认状态；保存approved映射须已有可用服务器、工具白名单和精确专家grant。保存不会启用、信任、授予权限、探测或调用服务器。聊天服务配置Dialog和能力目录共同复用[映射编辑器](../../frontend/apps/web/src/features/capability/McpOperationBindingsEditor.vue)，不另建注册表；保存中、未保存关闭、CAS冲突和保存响应不明后的读回核对仍按真实行为验收。

[客户端](../../backend/eap-engine/eap-engine-mcp/src/main/java/com/lh/eap/runtime/mcp/client/McpClientService.java)固定映射revision、endpoint与transport，调用前后复核CapabilitySwitches、live取消、服务器启用/信任、工具白名单及持久grant；tools/list中唯一匹配工具的inputSchema须与配置精确相等。这里只验证明确支持的字段约束与schema一致性，**不是完整JSON Schema验证器**。前端选择是意图，可信expertId从服务端映射解析。[网页服务](../../backend/eap-engine/eap-engine-mcp/src/main/java/com/lh/eap/runtime/mcp/client/McpWebService.java)沿用既有受授权网页调用链；可用性GET不做协议初始化或远端调用。

## 3. 语音实现与资源边界

[语音引擎](../../backend/eap-engine/eap-engine-mcp/src/main/java/com/lh/eap/runtime/mcp/client/McpSpeechService.java)、[应用](../../backend/eap-ai/eap-ai-codegen/src/main/java/com/lh/eap/ai/AiSpeechApplication.java)和[HTTP控制器](../../backend/eap-web/eap-web-ai/src/main/java/com/lh/eap/web/controller/AiSpeechController.java)实现：

- GET `/api/ai/speech/services`：只读服务和预算投影。
- POST `/api/ai/speech/transcriptions`、POST `/api/ai/speech/synthesis`：带operationId显式执行一次操作。
- GET `/api/ai/speech/operations/{operationId}`：核对观察结果；POST `/api/ai/speech/{operationId}/cancel`：请求取消。查询与取消路径不同，不提供兼容别名。

语音仅允许http/stdio，未开放sse或streamable-http语音；不缩减网页工具原有传输范围。ASR输入取配置schema MIME enum、EAP允许的wav/mpeg/ogg/webm及浏览器录音能力的交集。输出MIME列表是EAP可接收上限，不证明远端能生成全部格式；容器签名检查也不等于完整音频解码或供应商codec认证。ASR返回TEXT或映射JSON文本，TTS返回AUDIO或映射JSON音频。

请求音频最多4MiB，wire最多6MiB，TTS输入最多4000字符，转录最多16000字符。应用使用当前操作者/工作区内的进程级观察缓存：最多2个运行操作、64条记录、16MiB音频、10分钟TTL和每秒清理。operationId绑定精确请求摘要，冲突拒绝；相同ID核对不再次执行。缓存和取消是有界观察，不是持久任务、跨重启回放或远端必然已停止的证明。原件不落数据库/共享模型记忆；取消、过期、驱逐及关闭释放临时音频。

[前端音频逻辑](../../frontend/apps/web/src/features/chat/useChatAudio.ts)与[语音控件](../../frontend/apps/web/src/features/chat/SpeechControls.vue)已挂载到聊天：显式请求麦克风→录音→停止→本机预览→显式转录到草稿；请求后草稿/会话变化时不覆盖新草稿，识别结果需确认追加。回答显式生成语音，再显式播放，不自动播放。离开、切换和卸载停止轨道/播放并释放Object URL；响应不明保留operationId，显式GET核对不盲目重发。没有实时双向语音、后台持久录音或自动发消息承诺。

## 4. 已取得的阶段检查

下列产品命令由父任务/源码负责人执行；本次文档工作没有运行产品测试、构建或Maven。重叠范围分别记账，不累加总数。

| 范围 | 已知实际结果 | 证据与限制 |
|---|---|---|
| 后端编译 | 退出0 | 父任务日志 `/tmp/eap-services-compile.log`（安静模式无输出）；实际命令见下方 |
| 后端focused | 84项，0 failure、0 error、4环境门控skip | 父任务日志 `/tmp/eap-services-backend-tests.log`；skip不算通过，不代表完整reactor |
| MIME及边界定向 | 18项，0 failure/error/skip，退出0 | 父任务实读XML；6引擎语音、2映射、4应用、3HTTP/filter、3H2持久化；日志 `/tmp/eap-services-mime-tests.log`；不与84项相加 |
| V4/H2 | 上述3个持久化case有阶段结果 | 通过JSON driver桥接执行H2，不宣称PostgreSQL验证；本轮PG服务器upsert仅源码审阅，未工具实测 |
| 前端全量 | 最新199文件1198项通过，父任务确认退出0 | 从仓库根执行 `/home/superagent/.local/share/vite-plus/bin/vp -C frontend test run`；已读取 `/tmp/eap-service-config-frontend-final.log`，包含最终编辑器恢复与hook修复；替代198文件1190项阶段结果，不相加 |
| 类型/边界 | 父任务报告根tsc两项脚本及最终boundary通过 | 从仓库根执行 `/home/superagent/.local/share/vite-plus/bin/vp -C frontend run typecheck`，日志 `/tmp/eap-service-config-typecheck.log`，父任务确认退出0；边界负责人命令 `/home/superagent/.local/share/vite-plus/bin/vp -C frontend run check:boundaries` 通过；最终架构另列 |
| 新语音hook/编辑器恢复 | 负责人最终hook16项、编辑器4项合计20项通过 | 覆盖迟到play/catch/ended不影响新播放器，以及保存丢失后新草稿不被旧GET覆盖；包含在最新全量范围，不额外累加 |
| 最终生产构建 | 退出0，5003 modules，built in 3.74s | 已读取 `/tmp/eap-service-config-build-final.log`；从仓库根执行 `/home/superagent/.local/share/vite-plus/bin/vp -C frontend run build`，父任务确认退出0 |
| 最终架构检查 | 退出0，vsh check passed | 已读取 `/tmp/eap-service-config-architecture.log`；从仓库根执行 `/home/superagent/.local/share/vite-plus/bin/vp -C frontend run check:architecture` |
| 最终领域合同 | 退出0；22状态域、26错误目录、547错误码、12配对bundle | 已读取 `/tmp/eap-service-config-domain-final.log`；从仓库根执行 `python3 scripts/verify-domain-contracts.py` |
| 浏览器BEFORE | 8张实际旧应用图，1440/390×1000浅色 | 实际基线dfa9612；同场景GET守卫，无MCP调用 |
| 浏览器AFTER | 父任务报告最新8张配对场景及fresh双视口完整行为通过，finalCaptures为true | 来源摘要见§1；同场景配对图像、带名称的四个批准复选框断言和局部滚动可达性均已实际通过，见[证据索引](../evidence/chat-service-config/README.md) |

父任务确认1440/390两个视口完整行为均通过：四种操作映射保存/关闭/重开、CAS失配、PUT响应丢失→GET失败→GET重试核对成功且无额外PUT、录音停止/本机预览且不自动ASR、ASR草稿与迟到结果显式追加、TTS不自动播放及显式播放、取消断网后查询结果。取消终态使用严格合同SPEECH_CANCELLED，两视口均errors为空、blocked为空。此前RUNNING观察源于fixture的CANCELLED错误码为空，与严格wire不符；fixture已修正，不作为产品取消缺陷保留。以上模拟行为不代表远端识别/合成或音频硬件效果。

后端编译和84项focused从仓库根执行以下实际命令，父任务已核对原执行文本及退出0；安静编译日志无输出不单独证明结果，退出码由父任务确认。本次文档工作未执行这些命令：

```sh
source /home/superagent/.local/env/java-maven.sh
mvn -q -f backend/pom.xml -pl :eap-full-application -am -DskipTests compile
mvn -q -f backend/pom.xml -pl :eap-full-application -am '-Dtest=*Mcp*Test,*Speech*Test,FullApplicationCompositionTest' -Dsurefire.failIfNoSpecifiedTests=false test
```

18项MIME定向从仓库根执行以下实际命令，父任务确认退出0；这是已运行命令归档，本次文档工作未执行：

```sh
source /home/superagent/.local/env/java-maven.sh
mvn -q -f backend/pom.xml -pl :eap-full-application -am '-Dtest=McpSpeechServiceTest,McpOperationBindingsTest,AiSpeechApplicationTest,SpeechHttpContractTest,McpOperationBindingsPersistenceTest' -Dsurefire.failIfNoSpecifiedTests=false test
```

父任务已核对后端84项及18项定向两份日志退出均为0，4项环境跳过继续单列。最后发现映射配置的批准复选框标签未显示，采用外层label补正文的局部修正，操作合同不变。先前199文件1198项全量为该标签修正前结果；修正后执行相同vp入口的20项编辑器/音频定向、typecheck及生产build全部通过，日志分别为 `/tmp/eap-service-config-label-tests.log`、`/tmp/eap-service-config-label-typecheck.log`、`/tmp/eap-service-config-label-build.log`。相关定向命令为 `vp -C frontend test run apps/web/__tests__/features/capability/McpOperationBindingsEditor.test.ts apps/web/__tests__/features/chat/useChatAudio.test.ts`。网页与语音选项展开后的原生wheel局部滚动、模型选择器pointer hit/focus/click已通过；窗口和工作台scrollTop均为0，快捷键位置不变，原始测量保存在证据目录。标签修正后的图像和清单由浏览器记录关联。前轮194文件1167项和后端基线失败仅归前轮历史，不移用为本轮新功能验证。

## 5. 未验证与提交前关口

实际MCP服务的初始化、发现、调用、识别内容、合成声音、真实麦克风与声卡播放效果未验。Fake MCP和浏览器stub只验证协议/界面合同，不能声称实网识别或真实听感。未选供应商是效果联调限制，不阻止完成配置入口、授权边界和有界语音实现，也不要求用户先提供供应商才能继续开发。

本轮实现与上述技术检查已通过，最终配对图像、标签修正后的双视口完整行为与窄屏局部滚动测量已归档；逐文件源码摘要已独立核对。PostgreSQL真实迁移/upsert、真实服务效果和用户验收分别确认；CT-01执行持久接管缺口不由语音观察缓存关闭。
