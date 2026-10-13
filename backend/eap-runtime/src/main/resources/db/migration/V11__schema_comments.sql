-- Column and table comments for the schema created by V1–V8.
--
-- Why a separate migration instead of editing V1–V8: those versions are already applied on real
-- databases, and Flyway validates checksums of applied migrations on every start. Editing them in
-- place would make every existing installation fail to boot. Comments are documentation, so they can
-- wait for a forward migration — the schema they describe does not change.
--
-- Every comment states what the code actually does. Where a value has an enumerated set, the set is
-- listed, because a column whose possible values only exist in a Vue mapping is a column nobody can
-- reason about from the database.

-- ------------------------------------------------------------------ 知识（V1、V3、V5）
COMMENT ON TABLE eap.knowledge_base IS
    '一个知识库 = 一组文档的容器。检索按已授权的知识库并集限定范围，未授权的知识库贡献零条结果，而不是回退到全部。';
COMMENT ON COLUMN eap.knowledge_base.id IS '知识库标识，被专家清单 knowledgeBases 引用';
COMMENT ON COLUMN eap.knowledge_base.name IS '名称，最多 200 字符；含凭据会被拒绝';
COMMENT ON COLUMN eap.knowledge_base.description IS '可选说明；含凭据会被拒绝';
COMMENT ON COLUMN eap.knowledge_base.visibility IS
    '可见性，默认 private。可见性不等于授权：专家要读它必须在专家定义里显式声明并启用。';
COMMENT ON COLUMN eap.knowledge_base.created_at IS '创建时刻';

COMMENT ON TABLE eap.knowledge_document IS
    '一篇文档。平台只保存人工录入的正文，不接收凭据或连接字符串。';
COMMENT ON COLUMN eap.knowledge_document.id IS '文档标识';
COMMENT ON COLUMN eap.knowledge_document.knowledge_base_id IS
    '所属知识库；删除知识库会级联删除它的全部文档与分段';
COMMENT ON COLUMN eap.knowledge_document.object_key IS
    '文档标题，也是界面上显示的标题。改名知识库不会改它。';
COMMENT ON COLUMN eap.knowledge_document.source_path IS
    '可选的来源路径备注，仅供人追溯，不是平台读取文件的依据';
COMMENT ON COLUMN eap.knowledge_document.content_sha256 IS
    '入库正文的 SHA-256，用于判断内容是否变过；当前不参与检索，也不用于去重';
COMMENT ON COLUMN eap.knowledge_document.media_type IS '媒体类型，录入纯文本时为 text/plain';
COMMENT ON COLUMN eap.knowledge_document.version IS '文档版本号，每次重新录入自增';
COMMENT ON COLUMN eap.knowledge_document.created_at IS '入库时刻';

COMMENT ON TABLE eap.knowledge_chunk IS
    '文档按 1500 字符切分的检索单位。检索命中的是段而不是整篇，所以引用始终能落到具体的一段。';
COMMENT ON COLUMN eap.knowledge_chunk.id IS '分段标识';
COMMENT ON COLUMN eap.knowledge_chunk.document_id IS '所属文档；删除文档会级联删除它的全部分段';
COMMENT ON COLUMN eap.knowledge_chunk.chunk_index IS '段序号，从 0 开始，按此顺序拼接可还原正文';
COMMENT ON COLUMN eap.knowledge_chunk.content IS '段正文，全文检索就是在这段文本上匹配的';
COMMENT ON COLUMN eap.knowledge_chunk.token_count IS '可选的 token 数，未计算时为空';
COMMENT ON COLUMN eap.knowledge_chunk.embedding_model IS
    '生成该向量时使用的模型名；未启用向量检索时写 not-embedded。';
COMMENT ON COLUMN eap.knowledge_chunk.embedding_version IS '向量版本，便于将来换模型后重建';
COMMENT ON COLUMN eap.knowledge_chunk.embedding IS
    '向量表示，可为空。当前检索只走全文检索，这个列存在是为了让「尚未启用向量检索」成为可核对的状态，而不是一句口头说明。';
COMMENT ON COLUMN eap.knowledge_chunk.created_at IS '分段写入时刻';

-- ------------------------------------------------------------------ 任务与证据（V2）
COMMENT ON TABLE eap.task IS
    '一次分析运行。重新运行会新增一行而不是覆盖旧行，所以「这次和上次差在哪」永远可回答。';
COMMENT ON COLUMN eap.task.id IS '运行标识';
COMMENT ON COLUMN eap.task.goal IS
    '操作者提交的目标，入库前经 SensitiveData 脱敏，因此读回来的是脱敏后的文本。';
COMMENT ON COLUMN eap.task.status IS
    '运行状态：needs-planning（刚建、尚未规划）/ completed（流程跑完）/ partial（已返回可用分析，但有节点缺少上下文或独立验证）/ failed（必需节点未通过，已停止其后续依赖）。';
COMMENT ON COLUMN eap.task.decision IS
    '判定：accepted（确定性证据已足够）/ needs-review（已返回分析但缺少上下文或独立验证）/ rejected（必需节点未通过）。判定不等于「SQL 变快了」——完成状态只说明流程跑完。';
COMMENT ON COLUMN eap.task.created_at IS '创建时刻，也是任务列表的排序依据';
-- eap.task.model_enhancement 的注释在 V10 里，就地跟着那一列的 ALTER，不在这里重复。

COMMENT ON TABLE eap.task_observation IS
    '一次能力执行的证据。这是操作者能独立核对的东西，所以原始 stdout/stderr 保留在此（写入前脱敏），而不是只留一个结论。';
COMMENT ON COLUMN eap.task_observation.id IS '证据标识';
COMMENT ON COLUMN eap.task_observation.task_id IS '所属运行；删除运行会级联删除它的全部证据';
COMMENT ON COLUMN eap.task_observation.capability IS '执行的能力 id';
COMMENT ON COLUMN eap.task_observation.success IS '该能力是否成功。失败会让依赖它的后续节点不再执行。';
COMMENT ON COLUMN eap.task_observation.exit_code IS '进程退出码；不是每个能力都是进程，因此它不总是 0';
COMMENT ON COLUMN eap.task_observation.stdout IS '标准输出，入库前脱敏';
COMMENT ON COLUMN eap.task_observation.stderr IS '标准错误，入库前脱敏';
COMMENT ON COLUMN eap.task_observation.metadata IS
    '该次执行的结构化元数据（如 CLI 通道的覆盖值与解析结果）。手动新增的操作只能写进程证据，发布结构化事实仍然需要代码。';
COMMENT ON COLUMN eap.task_observation.created_at IS '执行时刻';

-- ------------------------------------------------------------------ 专家（V4、V7）
COMMENT ON TABLE eap.expert_definition IS
    '一个已发布的专家定义。专家是配置不是代码：流程、授权与规则包引用都在 manifest 里，因此校验可以由后端自己完成。';
COMMENT ON COLUMN eap.expert_definition.id IS '专家标识，清单与授权都以它为准';
COMMENT ON COLUMN eap.expert_definition.name IS '显示名称';
COMMENT ON COLUMN eap.expert_definition.manifest IS
    '专家清单：knowledgeBases / databaseProfiles / steps / edges / capabilities / rulePacks / mcpTools。草稿引用不等于授权——启用时才写入授权行。';
COMMENT ON COLUMN eap.expert_definition.enabled IS
    'false = 未启用。只有启用的专家才会在运行中被调度，也才持有资料读取授权。';
COMMENT ON COLUMN eap.expert_definition.revision IS '每次保存自增。数字在变，就说明专家是数据。';
COMMENT ON COLUMN eap.expert_definition.updated_at IS '最后一次保存的时刻';
COMMENT ON COLUMN eap.expert_definition.builtin IS
    'true = 随平台发布的内置专家（V7 引入）。内置清单是只读的；要改先复制一份自定义的。';

-- ------------------------------------------------------------------ 资料与授权（V6）
COMMENT ON TABLE eap.database_profile IS
    '脱敏的表结构与索引快照。只保存人工录入的结构，不接受凭据或连接字符串，也不会连接业务数据库。';
COMMENT ON COLUMN eap.database_profile.id IS '资料标识，被专家清单 databaseProfiles 引用';
COMMENT ON COLUMN eap.database_profile.label IS '资料名称，最多 200 字符';
COMMENT ON COLUMN eap.database_profile.engine IS '数据库引擎（PostgreSQL / MySQL / SQL Server / Oracle / SQLite 等）';
COMMENT ON COLUMN eap.database_profile.environment IS '环境标识，例如 local；用来提醒这份结构对应哪个环境，不是连接参数';
COMMENT ON COLUMN eap.database_profile.metadata IS
    '结构快照本体：tables（表名与字段）、indexes（索引列与顺序）等。字段含凭据或连接串会被拒绝保存。';
COMMENT ON COLUMN eap.database_profile.created_at IS '创建时刻';
COMMENT ON COLUMN eap.database_profile.updated_at IS '最后一次保存的时刻';

COMMENT ON TABLE eap.expert_knowledge_grant IS
    '专家对知识库的读取授权。授权只在启用时写入，停用或改清单时随之撤销——所以「清单里写了」不等于「有权读」。';
COMMENT ON COLUMN eap.expert_knowledge_grant.expert_id IS '被授权的专家';
COMMENT ON COLUMN eap.expert_knowledge_grant.knowledge_base_id IS '被授予读取的知识库';

COMMENT ON TABLE eap.expert_database_grant IS
    '专家对数据库资料的读取授权，规则同上：授权属于已发布的专家，不属于草稿。';
COMMENT ON COLUMN eap.expert_database_grant.expert_id IS '被授权的专家';
COMMENT ON COLUMN eap.expert_database_grant.database_profile_id IS '被授予读取的资料；资料被已启用专家引用时，删除会被拒绝并点名这些专家';

-- ------------------------------------------------------------------ 规则包（V7）
COMMENT ON TABLE eap.rule_pack IS
    '规则包。规则是数据：新增规则、调严重级、改证据与建议都只改这一行里的 manifest，不需要改代码或重新部署。';
COMMENT ON COLUMN eap.rule_pack.id IS '规则包标识。内置标识是保留标识，后端拒绝在其下写入——内置包只能「复制为自定义」。';
COMMENT ON COLUMN eap.rule_pack.name IS '显示名称';
COMMENT ON COLUMN eap.rule_pack.manifest IS
    '规则清单：rules（每条含 when / evidence / suggestion / severity）、requires.capabilities、policy。引用的每个事实都必须来自事实词表，否则规则永远不会命中，却看起来像「没有问题」。';
COMMENT ON COLUMN eap.rule_pack.builtin IS
    'true = 随平台发布（从 classpath:rules/*.json 载入），页面上只读。被已启用专家引用时停用或删除都会被拒绝。';
COMMENT ON COLUMN eap.rule_pack.enabled IS 'false = 停用。规则只在专家流程包含产出其事实的能力时才会被判定。';
COMMENT ON COLUMN eap.rule_pack.revision IS '每次保存自增。';
COMMENT ON COLUMN eap.rule_pack.updated_at IS '最后一次保存的时刻';

-- ------------------------------------------------------------------ MCP（V8）
COMMENT ON TABLE eap.mcp_server IS
    '登记的 MCP 服务器。MCP 工具永远是专家级的，不做平台级全局启用：登记是平台的显式动作，授权是每个专家自己的事。';
COMMENT ON COLUMN eap.mcp_server.id IS '服务器标识';
COMMENT ON COLUMN eap.mcp_server.name IS '显示名称';
COMMENT ON COLUMN eap.mcp_server.transport IS
    '传输方式，默认 stdio。探测只描述传输目标是否可达（unknown / reachable / missing），绝不写成「已连接」——平台还没有 MCP 客户端。';
COMMENT ON COLUMN eap.mcp_server.endpoint IS
    'stdio 传输下的启动命令或地址。只在启用了 MCP 客户端时才会被使用；在此之前它是被保存的配置，不是可执行的承诺。';
COMMENT ON COLUMN eap.mcp_server.trusted IS
    'true = 操作者已确认信任。未信任的服务器不会向任何专家提供工具。';
COMMENT ON COLUMN eap.mcp_server.enabled IS 'false = 停用。登记不等于启用，默认关闭。';
COMMENT ON COLUMN eap.mcp_server.tools IS
    '该服务器发布的工具清单，每项是 {name, source, verified} 对象而不是字符串。逐工具放行开关推迟到平台有 MCP 客户端之后。';
COMMENT ON COLUMN eap.mcp_server.updated_at IS '最后一次登记或编辑的时刻';

COMMENT ON TABLE eap.expert_mcp_grant IS
    '专家对某个专家级能力（MCP 工具）的调用授权。启用时写入，停用或改清单时删除；会话按 (execution, expert, server) 隔离，不会跨专家串用。';
COMMENT ON COLUMN eap.expert_mcp_grant.expert_id IS '被授权的专家';
COMMENT ON COLUMN eap.expert_mcp_grant.capability IS
    '被授予调用的专家级能力 id。该能力必须由一个已登记、已启用且已信任的 MCP 服务器发布，否则专家校验会拒绝这份清单。';
COMMENT ON COLUMN eap.expert_mcp_grant.granted_at IS '授权写入的时刻';
