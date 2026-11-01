# 专家知识与Skill资源接入总览

## 当前结论与阅读方式

单专家授权知识到Chat与Skill文本上传/粘贴、不可变版本、启停和精确引用首片已有实现。材料准备不是供应商使用证据，不授予工具权限。Skill目录/仓库导入、MCP真实协议和规划/Work执行仍未完成；范围见[台账](../planning-status.md)。

以下按主题合并完整阶段记录，日期保留在记录中而不再作为文件名。记录中的“本轮/未提交/下一步”和测试数字仅代表当时快照；不得覆盖上面的当前结论、有效产品合同或用户授权。原文完整保留（只调整标题层级、锚点及链接），后续更新本总览，不另建日期报告。

## 记录索引

| 原记录 | 完整章节 |
|---|---|
| `docs/decisions/expert-knowledge-chat-2026-11-01.md` | [单专家授权知识到 Chat 的最小接线](#expert-knowledge-chat) |
| `docs/decisions/skill-text-import-2026-11-01.md` | [Skill 文本导入与 Chat 使用：首片合同](#skill-text-import) |

---

<a id="expert-knowledge-chat"></a>

## 单专家授权知识到 Chat 的最小接线

来源：`docs/decisions/expert-knowledge-chat-2026-11-01.md`；合并基线 `82aa504`。

<!-- record:start docs/decisions/expert-knowledge-chat-2026-11-01.md -->
<a id="expert-knowledge-chat--单专家授权知识到-chat-的最小接线"></a>
### 单专家授权知识到 Chat 的最小接线

状态：最小接线实现、父任务全量回归、真实数据库隔离测试、内置预览交互及最终独立复核通过。接续 `69892f3` 后的资源阶段；不把此切片当成 Skill、MCP 协议或自主 Agent 完成，真实供应商与用户最终验收仍待。

<a id="expert-knowledge-chat--现有依据及取舍"></a>
#### 现有依据及取舍

- `ExpertController` / `ExpertDefinitionMapper` 已有专家清单、revision、草稿与启用。保存草稿会撤销知识/数据库/MCP grants，不能凭客户端专家ID或演示角色授权。
- `KnowledgeSearchHandler` 复用 `KnowledgeRepository.searchAuthorized`，限制授权库、返回本地关键词/FTS来源及有界摘录。新接线只调用此Handler，不执行专家DAG，不触发SQL/CLI/MCP或扩大Git权限。
- 现有Chat的 general/sql/frontend 是静态指引；前端演示协作专家不是持久专家，保持名称与行为区分。expert-sdk旧Manifest与后端合同不一致，本片不借它定义Chat DTO，也不顺带重写SDK。
- 当前尚未确认真正Skill加载器/API；MCP登记与probe不是协议initialize/list/call。先做依赖已具备的知识来源接线，不新建统一资源注册中心或第二检索器。

<a id="expert-knowledge-chat--最小合同"></a>
#### 最小合同

1. 仅chat模式可带可选 `knowledgeExpertRef {id,revision}`，不接受grants或可信正文。code/PREBOUND不合并该能力。
2. 复用现有专家列表选择一个已启用的持久专家；独立只读preview入口，按草稿问题检索，可无模型使用。预览只展示发送材料，不授予新权限，不自动发送。
3. 服务端preview与实际send共用解析：身份/revision/enabled、声明∩持久grants、Capability实现与启停全部核对。有授权但无匹配为正常空态；无授权/过期/禁用明确失败。
4. 发送重新检索并检查，不信浏览器缓存的预览正文。引用放用户任务材料，明确不是系统指令或执行授权；响应列明本次提供给模型的来源，不宣称模型实际采用或引用正确。
5. 复用Chat registry的exclusive与清理机制，含知识的每轮模型调用前清掉旧记忆；移除/换专家及撤权失败后也不能经旧memory重新外发知识。已发出的内容无法追溯撤回，权限为本次请求检查快照，不承诺撤回在途供应商请求。
6. 查询范围显式有界：当前底层query限500、结果最多5条、单片段1200字符；新入口不得静默截短问题并声称完整检索。具体错误与最终DTO在合同联调后固定。

<a id="expert-knowledge-chat--验证关口"></a>
#### 验证关口

- 专家A/B授权不同库，同关键词预览及模型输入不跨库。
- 草稿/停用/旧revision/伪造参数/能力禁用在模型前拒绝；预览后撤权仍拒绝发送。
- 更换/移除/更新/删除后旧模型记忆不外发；并发发送遵循现有busy约束。
- 真实数据库知识导入/检索/更新/删除及来源；Fake ChatModel仅证明输入合同，不当作真实供应商验收。
- UI显式选择/预览/取消/移除、draft保留、错误引导、同合同mock与内置预览；类型/测试/构建/边界和独立审查。

保持Spring AI/Capability/现有持久权限为唯一事实源；不安装新依赖，不改启动配置，不自动调用付费模型。阶段验收前不提交，完整台账其余事项保持未完成。

<a id="expert-knowledge-chat--父任务验证与审查记录"></a>
#### 父任务验证与审查记录

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
<!-- record:end docs/decisions/expert-knowledge-chat-2026-11-01.md -->

---

<a id="skill-text-import"></a>

## Skill 文本导入与 Chat 使用：首片合同

来源：`docs/decisions/skill-text-import-2026-11-01.md`；合并基线 `82aa504`。

<!-- record:start docs/decisions/skill-text-import-2026-11-01.md -->
<a id="skill-text-import--skill-文本导入与-chat-使用首片合同"></a>
### Skill 文本导入与 Chat 使用：首片合同

状态：用户确认的文本导入首片实现、父任务全量回归、真实数据库/浏览器检查和最终独立复核通过。开发基线 c9d23a7；不代表目录导入、真实供应商效果或用户最终产品验收完成。

用户选择：先做 SKILL.md 文本上传／粘贴及显式文本资源，目录导入后续补齐。上传仅由浏览器读取明确选择的文本并作为请求正文提交；服务端不按用户路径读文件，不解压、不扫描目录、不抓取链接、不执行脚本。

<a id="skill-text-import--交互与范围"></a>
#### 交互与范围

设置二级“技能”：版本列表→导入表单→校验预览→显式确认来源可信后保存（默认禁用）→独立启用。Chat沿既有＋技能入口选择一个精确版本、预览正文与显式选中资源、应用/移除引用，不自动发送。升级保存新版本；回退显式启用旧版本再选，不做latest。保持五个固定一级入口和公共UI。

仅chat、toolMode=none、单Skill，不与knowledgeExpertRef/code/PREBOUND组合。正文仅作为用户级指导材料，不能写入TaskContext.instructions系统提示。requiredCapabilities只是依赖诊断，不授权、不注册工具、不执行。Skill使用后沿现有敏感会话逐轮清理旧记忆，移除/停用/换版/拒绝轮也不能重放旧内容；保留知识接口兼容。

<a id="skill-text-import--前后端约定"></a>
#### 前后端约定

- SkillImportInput：`{rawSkillMd,version,sourceLabel,resources:[{path,mediaType,content}],requiredCapabilities:string[]}`。版本限定major.minor.patch；SKILL.md YAML frontmatter必须name/description，正文非空。UTF-16原文≤16000、最多4文本资源、原文+资源总计≤24000；来源说明有界。拒绝不支持字段/格式，不能静默丢弃。
- `POST /api/skills/preview` input→完整SkillSnapshot（无信任声明，含digest、诊断）。
- `POST /api/skills` `{input,expectedDigest,confirmed:true}`→SkillSnapshot；服务端重新解析并核对摘要、作用域，同scope/id/version同digest幂等，异digest409。默认disabled，stateRevision=1。
- `GET /api/skills`→`{items:SkillSummary[]}`，只元数据，不传全文。
- `GET /api/skills/{id}/versions/{version}`→SkillSnapshot（显式读取全文）。
- `POST /api/skills/{id}/versions/{version}/activation` `{enabled:boolean,stateRevision:number}`→SkillSnapshot；CAS修订。
- `POST /api/skills/context/preview` `{skillRef,resourcePaths:string[]}`→SkillContext。
- `TaskContext.skillRef?:{id,version,digest,stateRevision}`、`skillResourcePaths?:string[]`：省略无Skill；显式null/额外字段/路径未导入拒绝。发送从服务端按精确引用重新加载，不接客户端可信正文。
- SkillSummary：`{id,version,description,digest,enabled,stateRevision,sourceLabel,createdAt,dependencies:[{id,status}]}`。
- SkillSnapshot：Summary加`{schemaVersion:1,entry:'SKILL.md',rawSkillMd,instructions,resources,requiredCapabilities,scope,trust}`；trust为null（预览）或服务端`{operator,confirmedAt}`。列表不返回scope/raw/resources正文。
- SkillContext：`{skillRef,instructions,resources,dependencies}`，仅选中资源，响应`skillContext?:SkillContext|null`。`contextMemoryCleared`表示知识/Skill统一清理，旧knowledgeMemoryCleared合同保留。

<a id="skill-text-import--安全与实现"></a>
#### 安全与实现

复用Spring Boot管理的SnakeYAML SafeConstructor并显式声明依赖；拒绝重复key、别名/merge、自定义tag、多文档，深度/数量/大小有界。Agent Skills格式不等于全部扩展字段均支持；支持子集明确展示，allowed-tools不生效且显式拒绝不支持字段。

资源只允许相对.md/.txt（text/markdown或text/plain匹配）；禁scripts、绝对/盘符/UNC/父路径/反斜杠、重复及大小写冲突，不读取Markdown链接。内容及摘要保留原始换行，不修剪正文；固定顺序+UTF-8长度前缀构造digest。凭据内容拒绝保存而非静默改写。scope由现有RuntimeWorkspace实际绑定生成，不能客户端覆盖。

单Skill版本表复用PostgreSQL/JDBC/Flyway；不可变内容与可变启停分离，新增增量迁移（从当前实际最高版本后追加），不得改旧checksum。短事务获取有效快照后释放再调用模型。无新注册中心/调度器/模型loop。

<a id="skill-text-import--验收范围"></a>
#### 验收范围

解析恶意YAML/路径/凭据、摘要篡改、同版本冲突/幂等、CAS/跨scope隔离、保存重开/启停/旧版回退、引用时重核/停用拒绝/模型无工具/旧memory不重放。真实DB夹具与Fake模型验证分开；mock同合同并标模拟，界面浏览器验证不代替供应商效果。完成后父任务全量、独立审查、用户交互检查与阶段提交推送，application.yml持续排除。目录／仓库导入仍待后续。

<a id="skill-text-import--实施及验证记录"></a>
#### 实施及验证记录

已实现上述前后端最小合同，完整后端约束见 `backend/SKILL_TEXT_API.md`。SafeConstructor支持license/compatibility/metadata有界可选字段，拒绝allowed-tools；资源ASCII相对路径。V18/V19已由正常运行环境加载并经真实数据库测试使用，不得改写checksum。mock不引入第二YAML解析器，只接受明示的固定安全示例，其余输入明确MOCK_SKILL_PARSER_UNSUPPORTED；这不是通用mock解析验收。

父任务执行：后端全量 `EAP_RUN_BOARD_PERSISTENCE=true EAP_RUN_MISSION_GIT_ACCEPTANCE=true rtk proxy mvn -f backend/pom.xml test` 599项、0失败/错误、6条件跳过；前端92文件/510项通过，typecheck、check:boundaries、build通过。真实PostgreSQL/FakeModel用于持久性/范围/提示和记忆验证，不宣称真实供应商效果。

本地自动浏览器5173/真实API已走通：显式粘贴多行文本→校验→来源确认→保存默认禁用（1.0.0/r1）→启用r2→Chat＋技能读取全文/上下文预览/应用引用，不发送且保留原草稿；上传事件使用明确生成的浏览器File测试SKILL.md与checklist.md，保存1.0.1默认禁用，GET回读原始资源内容。新版本未替换Chat原引用。1440×900、708×640无页面横溢。

测试标识 `eap-review-text-skill`，版本1.0.0及1.0.1保留作可识别验收样例；结束将1.0.0停用为r3，回读disabled，旧r2上下文preview真实409 SKILL_REF_STALE。没有模型调用/脚本执行；这是自动浏览器证据，实际内置预览及最终独立审查仍需收口。首次粘贴工具丢换行导致400已核为工具输入问题；按原文多行输入后通过，不修改解析器掩盖问题。

独立审查阻断发布：真实MockMvc确认分号路径可绕过Skill写入Host/Origin/JSON防护；真实解析器未拒绝Bearer/PEM私钥标记；实际组件脚本复现KeepAlive离开/返回后旧保存响应可清除另一新保存的恢复日志。已分派后端安全与前端请求身份两条修复，必须RED→GREEN及独立复核后才允许提交。599/510通过不覆盖这些新增反例，不宣称阶段完成。

修复后父任务全量：后端647项、0失败/错误、6条件跳过；前端92文件/525项，typecheck/boundaries/build通过。分号路径按Spring实际路由解析拒绝，共享Bearer/PEM检测与脱敏补齐；保存/激活请求身份与journal精确匹配保护已补KeepAlive/卸载重建竞态回归。独立复核仍进行中，未提交。实际Hermes内置预览已点击读取1.0.1全文，看到SKILL.md、checklist.md与服务端来源确认，两测试版本均保持禁用；本机截图 `E:/ai/Hermes/profiles/eap/cache/images/computer_use_d9c3ec49ace443d191b6a1a4c3be6259.png`。没有模型调用或用户最终验收声明。

最终独立复核通过：指定三项缺陷已关闭，独立实际定向后端54项和前端43项通过，未发现该范围确证回归；结合上述父任务全量及真实数据库/浏览器证据，文本导入首片达到阶段交付条件。前文审查中/未通过表述为过程记录，不再是当前结论。提交前已同步主方案§0B.9/§2C.1及完整台账，目录/仓库导入、脚本执行、通用mock YAML解析和真实模型效果明确保留未完成/不支持。
<!-- record:end docs/decisions/skill-text-import-2026-11-01.md -->
