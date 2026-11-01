# Skill 文本导入与 Chat 使用：首片合同

状态：用户确认的文本导入首片实现、父任务全量回归、真实数据库/浏览器检查和最终独立复核通过。开发基线 c9d23a7；不代表目录导入、真实供应商效果或用户最终产品验收完成。

用户选择：先做 SKILL.md 文本上传／粘贴及显式文本资源，目录导入后续补齐。上传仅由浏览器读取明确选择的文本并作为请求正文提交；服务端不按用户路径读文件，不解压、不扫描目录、不抓取链接、不执行脚本。

## 交互与范围

设置二级“技能”：版本列表→导入表单→校验预览→显式确认来源可信后保存（默认禁用）→独立启用。Chat沿既有＋技能入口选择一个精确版本、预览正文与显式选中资源、应用/移除引用，不自动发送。升级保存新版本；回退显式启用旧版本再选，不做latest。保持五个固定一级入口和公共UI。

仅chat、toolMode=none、单Skill，不与knowledgeExpertRef/code/PREBOUND组合。正文仅作为用户级指导材料，不能写入TaskContext.instructions系统提示。requiredCapabilities只是依赖诊断，不授权、不注册工具、不执行。Skill使用后沿现有敏感会话逐轮清理旧记忆，移除/停用/换版/拒绝轮也不能重放旧内容；保留知识接口兼容。

## 前后端约定

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

## 安全与实现

复用Spring Boot管理的SnakeYAML SafeConstructor并显式声明依赖；拒绝重复key、别名/merge、自定义tag、多文档，深度/数量/大小有界。Agent Skills格式不等于全部扩展字段均支持；支持子集明确展示，allowed-tools不生效且显式拒绝不支持字段。

资源只允许相对.md/.txt（text/markdown或text/plain匹配）；禁scripts、绝对/盘符/UNC/父路径/反斜杠、重复及大小写冲突，不读取Markdown链接。内容及摘要保留原始换行，不修剪正文；固定顺序+UTF-8长度前缀构造digest。凭据内容拒绝保存而非静默改写。scope由现有RuntimeWorkspace实际绑定生成，不能客户端覆盖。

单Skill版本表复用PostgreSQL/JDBC/Flyway；不可变内容与可变启停分离，新增增量迁移（从当前实际最高版本后追加），不得改旧checksum。短事务获取有效快照后释放再调用模型。无新注册中心/调度器/模型loop。

## 验收范围

解析恶意YAML/路径/凭据、摘要篡改、同版本冲突/幂等、CAS/跨scope隔离、保存重开/启停/旧版回退、引用时重核/停用拒绝/模型无工具/旧memory不重放。真实DB夹具与Fake模型验证分开；mock同合同并标模拟，界面浏览器验证不代替供应商效果。完成后父任务全量、独立审查、用户交互检查与阶段提交推送，application.yml持续排除。目录／仓库导入仍待后续。

## 实施及验证记录

已实现上述前后端最小合同，完整后端约束见 `backend/SKILL_TEXT_API.md`。SafeConstructor支持license/compatibility/metadata有界可选字段，拒绝allowed-tools；资源ASCII相对路径。V18/V19已由正常运行环境加载并经真实数据库测试使用，不得改写checksum。mock不引入第二YAML解析器，只接受明示的固定安全示例，其余输入明确MOCK_SKILL_PARSER_UNSUPPORTED；这不是通用mock解析验收。

父任务执行：后端全量 `EAP_RUN_BOARD_PERSISTENCE=true EAP_RUN_MISSION_GIT_ACCEPTANCE=true rtk proxy mvn -f backend/pom.xml test` 599项、0失败/错误、6条件跳过；前端92文件/510项通过，typecheck、check:boundaries、build通过。真实PostgreSQL/FakeModel用于持久性/范围/提示和记忆验证，不宣称真实供应商效果。

本地自动浏览器5173/真实API已走通：显式粘贴多行文本→校验→来源确认→保存默认禁用（1.0.0/r1）→启用r2→Chat＋技能读取全文/上下文预览/应用引用，不发送且保留原草稿；上传事件使用明确生成的浏览器File测试SKILL.md与checklist.md，保存1.0.1默认禁用，GET回读原始资源内容。新版本未替换Chat原引用。1440×900、708×640无页面横溢。

测试标识 `eap-review-text-skill`，版本1.0.0及1.0.1保留作可识别验收样例；结束将1.0.0停用为r3，回读disabled，旧r2上下文preview真实409 SKILL_REF_STALE。没有模型调用/脚本执行；这是自动浏览器证据，实际内置预览及最终独立审查仍需收口。首次粘贴工具丢换行导致400已核为工具输入问题；按原文多行输入后通过，不修改解析器掩盖问题。

独立审查阻断发布：真实MockMvc确认分号路径可绕过Skill写入Host/Origin/JSON防护；真实解析器未拒绝Bearer/PEM私钥标记；实际组件脚本复现KeepAlive离开/返回后旧保存响应可清除另一新保存的恢复日志。已分派后端安全与前端请求身份两条修复，必须RED→GREEN及独立复核后才允许提交。599/510通过不覆盖这些新增反例，不宣称阶段完成。

修复后父任务全量：后端647项、0失败/错误、6条件跳过；前端92文件/525项，typecheck/boundaries/build通过。分号路径按Spring实际路由解析拒绝，共享Bearer/PEM检测与脱敏补齐；保存/激活请求身份与journal精确匹配保护已补KeepAlive/卸载重建竞态回归。独立复核仍进行中，未提交。实际Hermes内置预览已点击读取1.0.1全文，看到SKILL.md、checklist.md与服务端来源确认，两测试版本均保持禁用；本机截图 `E:/ai/Hermes/profiles/eap/cache/images/computer_use_d9c3ec49ace443d191b6a1a4c3be6259.png`。没有模型调用或用户最终验收声明。

最终独立复核通过：指定三项缺陷已关闭，独立实际定向后端54项和前端43项通过，未发现该范围确证回归；结合上述父任务全量及真实数据库/浏览器证据，文本导入首片达到阶段交付条件。前文审查中/未通过表述为过程记录，不再是当前结论。提交前已同步主方案§0B.9/§2C.1及完整台账，目录/仓库导入、脚本执行、通用mock YAML解析和真实模型效果明确保留未完成/不支持。
