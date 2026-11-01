# 单专家授权知识到 Chat 的最小接线

状态：最小接线实现、父任务全量回归、真实数据库隔离测试、内置预览交互及最终独立复核通过。接续 `69892f3` 后的资源阶段；不把此切片当成 Skill、MCP 协议或自主 Agent 完成，真实供应商与用户最终验收仍待。

## 现有依据及取舍

- `ExpertController` / `ExpertDefinitionMapper` 已有专家清单、revision、草稿与启用。保存草稿会撤销知识/数据库/MCP grants，不能凭客户端专家ID或演示角色授权。
- `KnowledgeSearchHandler` 复用 `KnowledgeRepository.searchAuthorized`，限制授权库、返回本地关键词/FTS来源及有界摘录。新接线只调用此Handler，不执行专家DAG，不触发SQL/CLI/MCP或扩大Git权限。
- 现有Chat的 general/sql/frontend 是静态指引；前端演示协作专家不是持久专家，保持名称与行为区分。expert-sdk旧Manifest与后端合同不一致，本片不借它定义Chat DTO，也不顺带重写SDK。
- 当前尚未确认真正Skill加载器/API；MCP登记与probe不是协议initialize/list/call。先做依赖已具备的知识来源接线，不新建统一资源注册中心或第二检索器。

## 最小合同

1. 仅chat模式可带可选 `knowledgeExpertRef {id,revision}`，不接受grants或可信正文。code/PREBOUND不合并该能力。
2. 复用现有专家列表选择一个已启用的持久专家；独立只读preview入口，按草稿问题检索，可无模型使用。预览只展示发送材料，不授予新权限，不自动发送。
3. 服务端preview与实际send共用解析：身份/revision/enabled、声明∩持久grants、Capability实现与启停全部核对。有授权但无匹配为正常空态；无授权/过期/禁用明确失败。
4. 发送重新检索并检查，不信浏览器缓存的预览正文。引用放用户任务材料，明确不是系统指令或执行授权；响应列明本次提供给模型的来源，不宣称模型实际采用或引用正确。
5. 复用Chat registry的exclusive与清理机制，含知识的每轮模型调用前清掉旧记忆；移除/换专家及撤权失败后也不能经旧memory重新外发知识。已发出的内容无法追溯撤回，权限为本次请求检查快照，不承诺撤回在途供应商请求。
6. 查询范围显式有界：当前底层query限500、结果最多5条、单片段1200字符；新入口不得静默截短问题并声称完整检索。具体错误与最终DTO在合同联调后固定。

## 验证关口

- 专家A/B授权不同库，同关键词预览及模型输入不跨库。
- 草稿/停用/旧revision/伪造参数/能力禁用在模型前拒绝；预览后撤权仍拒绝发送。
- 更换/移除/更新/删除后旧模型记忆不外发；并发发送遵循现有busy约束。
- 真实数据库知识导入/检索/更新/删除及来源；Fake ChatModel仅证明输入合同，不当作真实供应商验收。
- UI显式选择/预览/取消/移除、draft保留、错误引导、同合同mock与内置预览；类型/测试/构建/边界和独立审查。

保持Spring AI/Capability/现有持久权限为唯一事实源；不安装新依赖，不改启动配置，不自动调用付费模型。阶段验收前不提交，完整台账其余事项保持未完成。

## 父任务验证与审查记录

- 前后端已实现；详细后端HTTP/请求快照/记忆清理边界见 `backend/docs/expert-knowledge-chat.md`。无新增迁移；不把知识接线写成Skill/MCP已执行。
- 父任务执行 `EAP_RUN_BOARD_PERSISTENCE=true EAP_RUN_MISSION_GIT_ACCEPTANCE=true rtk proxy mvn -f backend/pom.xml test`：582项、0失败/错误、6条件跳过。2项新真实PostgreSQL夹具测试已运行，Fake模型验证输入及旧记忆不重放，不是供应商效果证明。
- 父任务前端全量86文件/411项通过，typecheck、check:boundaries、build通过。
- 真实5173/8080浏览器：当前唯一sql-expert已启用但无knowledgeBases，不擅自扩其授权；preview实际403 `EXPERT_CONTEXT_NOT_AUTHORIZED`，取消保留原草稿、无发送。1440×900/708×640页面无横溢。成功A/B检索由隔离实库测试证明，非生产浏览器成功数据。
- 实际Hermes内置预览经computer_use打开选择弹窗、选择sql-expert并显式采用；显示r1、500字符限制和移除入口，未调用模型。截图仅本机：`E:/ai/Hermes/profiles/eap/cache/images/computer_use_c522534b4f734742bb00680482951081.png`。
- 独立审查未通过，确认四项P2：HTTP拒绝轮的记忆清理标志未显示；关闭重开目录后迟到响应可覆盖新目录；来源文案过度宣称已提供给模型；mock字段集合及错误码与真实接口不一致。另补公开DTO的knowledgeContext可null。已进入定向修复及回归，修复后需重新独立复核，不提交当前状态。后端授权交集/快照/exclusive/全记忆清理未发现确证越权，不能据此忽略前端合同问题。真实供应商行为/最终人工验收继续待定。
- 修复后父任务全量86文件/469项及typecheck/boundaries/build/diff通过：失败轮提示按原会话保存；目录/预览生命周期失效保护；引用仅写检索/准备而非供应商已收到；mock严格校验与nullable响应对齐。真实preview复验额外grants/顶层字段均400 INVALID_EXPERT_CONTEXT，501字符400 EXPERT_CONTEXT_QUERY_TOO_LARGE，没有模型调用。最终独立复核待回收，仍未提交。
- 复核确认上述四项已关闭，但发现两个跨端合同缺口：后端尚未显式拒绝知识+git_status组合（前端/mock已拒绝），以及mock发送空白问题沿用了preview错误码。进入第二轮最小修复；新增用例必须在知识授权有效/Git可用时证明模型未调用，而非先撤权后得到拒绝。阶段继续未提交，不把前端测试通过当作真实后端合同通过。
- 第二轮已修复：有效知识授权且Git可用时，组合请求由后端明确400 EXPERT_CONTEXT_MODE_UNSUPPORTED并保证模型/工具0调用；mock按真实send顺序校验基础参数，空白/非字符串消息及缺失工具字段返回INVALID_CHAT_REQUEST，不套preview规则。父任务最终全量后端584项、0失败/错误、6跳过；前端86文件/475项及类型/边界/构建通过。最终独立复核进行中。

最终独立复核通过：两轮确证问题均已关闭，未发现限定范围内安全/逻辑阻断项。上述早期未通过/待复核状态作为过程证据保留，以本结论和文件首行状态为准；成功检索依旧是实库夹具证据，真实浏览器现有无授权专家的拒绝不冒充成功授权检索。
