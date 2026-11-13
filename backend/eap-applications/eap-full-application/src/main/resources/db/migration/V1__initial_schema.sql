-- EAP fresh-schema baseline, consolidated from V1-V37 on 2026-11-13.
-- Development reset is explicit and external; Flyway never cleans or repairs an existing schema.
-- Only built-in CLI configuration is seeded. Optional examples live in db/dev.

CREATE SCHEMA IF NOT EXISTS eap;

CREATE FUNCTION eap.valid_application_source(source jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item jsonb; seen_paths text[] := ARRAY[]::text[]; previous_path text := ''; current_path text;
BEGIN
 IF jsonb_typeof(source->'files') IS DISTINCT FROM 'array'
    OR jsonb_typeof(source->'exclusions') IS DISTINCT FROM 'array'
    OR jsonb_array_length(source->'files') > 4096 THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(source->'files') LOOP
  current_path := item->>'path';
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT (item ?& ARRAY['path','contentHash','bytes'])
     OR jsonb_typeof(item->'path') IS DISTINCT FROM 'string' OR current_path NOT LIKE 'frontend/%'
     OR current_path = ANY(seen_paths) OR current_path COLLATE "C" <= previous_path COLLATE "C"
     OR jsonb_typeof(item->'contentHash') IS DISTINCT FROM 'string'
     OR COALESCE(item->>'contentHash' !~ '^[a-f0-9]{64}$',true)
     OR jsonb_typeof(item->'bytes') IS DISTINCT FROM 'number'
     OR COALESCE(item->>'bytes' !~ '^[0-9]+$',true) THEN RETURN false; END IF;
  IF (item->>'bytes')::numeric > 4194304 THEN RETURN false; END IF;
  seen_paths := array_append(seen_paths,current_path); previous_path := current_path;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(source->'exclusions') LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END;
$$;

CREATE TABLE eap.task (
    id uuid PRIMARY KEY,
    goal text NOT NULL,
    status varchar(32) NOT NULL,
    decision varchar(32) NOT NULL,
    model_enhancement varchar(32),
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN eap.task.model_enhancement IS
    '本次运行走的模型路线：NULL = 未到达判定阶段（规划任务）/ unverified-observation（调用了模型，输出只是待验证观察）/ skipped（有模型，但确定性证据已足够）/ unavailable（到了判定阶段但没有模型可用）。NULL 与 skipped 必须分开：规划任务根本没有模型可跳过，把它算成「确定性解决」会抬高概览上的确定性占比。';

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

CREATE TABLE eap.task_observation (
    id bigserial PRIMARY KEY,
    task_id uuid NOT NULL REFERENCES eap.task(id) ON DELETE CASCADE,
    capability varchar(200) NOT NULL,
    success boolean NOT NULL,
    exit_code integer NOT NULL,
    stdout text,
    stderr text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE eap.knowledge_base (
    id uuid PRIMARY KEY,
    name varchar(200) NOT NULL,
    description text,
    visibility varchar(32) NOT NULL DEFAULT 'private',
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE eap.knowledge_base IS
    '一个知识库 = 一组文档的容器。检索按已授权的知识库并集限定范围，未授权的知识库贡献零条结果，而不是回退到全部。';

COMMENT ON COLUMN eap.knowledge_base.id IS '知识库标识，被专家清单 knowledgeBases 引用';

COMMENT ON COLUMN eap.knowledge_base.name IS '名称，最多 200 字符；含凭据会被拒绝';

COMMENT ON COLUMN eap.knowledge_base.description IS '可选说明；含凭据会被拒绝';

COMMENT ON COLUMN eap.knowledge_base.visibility IS
    '可见性，默认 private。可见性不等于授权：专家要读它必须在专家定义里显式声明并启用。';

COMMENT ON COLUMN eap.knowledge_base.created_at IS '创建时刻';

CREATE TABLE eap.knowledge_document (
    id uuid PRIMARY KEY,
    knowledge_base_id uuid NOT NULL REFERENCES eap.knowledge_base(id) ON DELETE CASCADE,
    object_key varchar(1000) NOT NULL,
    source_path varchar(2000),
    content_sha256 char(64),
    media_type varchar(255),
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE eap.knowledge_chunk (
    id uuid PRIMARY KEY,
    document_id uuid NOT NULL REFERENCES eap.knowledge_document(id) ON DELETE CASCADE,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    token_count integer,
    embedding_model varchar(255),
    embedding_version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now()
);

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

COMMENT ON COLUMN eap.knowledge_chunk.created_at IS '分段写入时刻';

CREATE TABLE eap.expert_definition (
    id varchar(100) PRIMARY KEY,
    name varchar(200) NOT NULL,
    manifest jsonb NOT NULL,
    builtin boolean NOT NULL DEFAULT false,
    enabled boolean NOT NULL DEFAULT false,
    revision integer NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT expert_explicit_behavior_graph CHECK (
    (jsonb_typeof(manifest->'behavior') = 'object'
     AND jsonb_typeof(manifest->'behavior'->'id') = 'string'
     AND (manifest->'behavior'->>'id') ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     AND jsonb_typeof(manifest->'behavior'->'version') = 'number'
     AND (manifest->'behavior'->>'version') ~ '^[1-9][0-9]*$'
     AND length(manifest->'behavior'->>'version') <= 10
     AND (manifest->'behavior'->>'version')::numeric <= 2147483647
     AND jsonb_typeof(manifest->'steps') = 'array'
     AND jsonb_typeof(manifest->'edges') = 'array'
     AND NOT manifest ? 'capabilities') IS TRUE
)
);

COMMENT ON TABLE eap.expert_definition IS
    '一个已发布的专家定义。专家是配置不是代码：流程、授权与规则包引用都在 manifest 里，因此校验可以由后端自己完成。';

COMMENT ON COLUMN eap.expert_definition.id IS '专家标识，清单与授权都以它为准';

COMMENT ON COLUMN eap.expert_definition.name IS '显示名称';

COMMENT ON COLUMN eap.expert_definition.manifest IS
    '专家清单：显式behavior及其版本、steps / edges流程图、knowledgeBases / databaseProfiles / rulePacks / mcpTools引用；不接受旧capabilities列表。草稿引用不等于授权——启用时才写入授权行。';

COMMENT ON COLUMN eap.expert_definition.enabled IS
    'false = 未启用。只有启用的专家才会在运行中被调度，也才持有资料读取授权。';

COMMENT ON COLUMN eap.expert_definition.revision IS '每次保存自增。数字在变，就说明专家是数据。';

COMMENT ON COLUMN eap.expert_definition.updated_at IS '最后一次保存的时刻';

COMMENT ON COLUMN eap.expert_definition.builtin IS
    'true = 随平台发布的内置专家。内置清单是只读的；要改先复制一份自定义的。';

CREATE TABLE eap.database_profile (
    id uuid PRIMARY KEY,
    label varchar(200) NOT NULL,
    engine varchar(40) NOT NULL,
    environment varchar(40) NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE eap.expert_knowledge_grant (
    expert_id varchar(100) NOT NULL REFERENCES eap.expert_definition(id) ON DELETE CASCADE,
    knowledge_base_id uuid NOT NULL REFERENCES eap.knowledge_base(id) ON DELETE CASCADE,
    PRIMARY KEY (expert_id, knowledge_base_id)
);

COMMENT ON TABLE eap.expert_knowledge_grant IS
    '专家对知识库的读取授权。授权只在启用时写入，停用或改清单时随之撤销——所以「清单里写了」不等于「有权读」。';

COMMENT ON COLUMN eap.expert_knowledge_grant.expert_id IS '被授权的专家';

COMMENT ON COLUMN eap.expert_knowledge_grant.knowledge_base_id IS '被授予读取的知识库';

CREATE TABLE eap.expert_database_grant (
    expert_id varchar(100) NOT NULL REFERENCES eap.expert_definition(id) ON DELETE CASCADE,
    database_profile_id uuid NOT NULL REFERENCES eap.database_profile(id) ON DELETE CASCADE,
    PRIMARY KEY (expert_id, database_profile_id)
);

COMMENT ON TABLE eap.expert_database_grant IS
    '专家对数据库资料的读取授权，规则同上：授权属于已发布的专家，不属于草稿。';

COMMENT ON COLUMN eap.expert_database_grant.expert_id IS '被授权的专家';

COMMENT ON COLUMN eap.expert_database_grant.database_profile_id IS '被授予读取的资料；资料被已启用专家引用时，删除会被拒绝并点名这些专家';

CREATE TABLE eap.rule_pack (
    id varchar(100) PRIMARY KEY,
    name varchar(200) NOT NULL,
    manifest jsonb NOT NULL,
    builtin boolean NOT NULL DEFAULT false,
    enabled boolean NOT NULL DEFAULT true,
    revision integer NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE eap.mcp_server (
    id varchar(80) PRIMARY KEY,
    name varchar(200) NOT NULL,
    transport varchar(20) NOT NULL DEFAULT 'stdio',
    endpoint text NOT NULL DEFAULT '',
    trusted boolean NOT NULL DEFAULT false,
    enabled boolean NOT NULL DEFAULT false,
    tools jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE eap.mcp_server IS
    '登记的 MCP 服务器。MCP 工具永远是专家级的，不做平台级全局启用：登记是平台的显式动作，授权是每个专家自己的事。';

COMMENT ON COLUMN eap.mcp_server.id IS '服务器标识';

COMMENT ON COLUMN eap.mcp_server.name IS '显示名称';

COMMENT ON COLUMN eap.mcp_server.transport IS
    '传输方式，默认stdio。登记和可达性探测不等于已完成MCP协议初始化或获准执行工具。';

COMMENT ON COLUMN eap.mcp_server.endpoint IS
    'MCP传输目标配置；stdio表示启动命令或地址。保存配置本身不建立协议会话，也不授予执行权限。';

COMMENT ON COLUMN eap.mcp_server.trusted IS
    'true = 操作者已确认信任。未信任的服务器不会向任何专家提供工具。';

COMMENT ON COLUMN eap.mcp_server.enabled IS 'false = 停用。登记不等于启用，默认关闭。';

COMMENT ON COLUMN eap.mcp_server.tools IS
    '该服务器发布的工具清单，每项是{name, source, verified}对象。工具调用仍须核对服务器信任、启用状态及专家级授权。';

COMMENT ON COLUMN eap.mcp_server.updated_at IS '最后一次登记或编辑的时刻';

CREATE TABLE eap.expert_mcp_grant (
    expert_id varchar(100) NOT NULL,
    capability varchar(200) NOT NULL,
    granted_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (expert_id, capability)
);

COMMENT ON TABLE eap.expert_mcp_grant IS
    '专家对某个专家级能力（MCP 工具）的调用授权。启用时写入，停用或改清单时删除；会话按 (execution, expert, server) 隔离，不会跨专家串用。';

COMMENT ON COLUMN eap.expert_mcp_grant.expert_id IS '被授权的专家';

COMMENT ON COLUMN eap.expert_mcp_grant.capability IS
    '被授予调用的专家级能力 id。该能力必须由一个已登记、已启用且已信任的 MCP 服务器发布，否则专家校验会拒绝这份清单。';

COMMENT ON COLUMN eap.expert_mcp_grant.granted_at IS '授权写入的时刻';

CREATE TABLE eap.capability_setting (
    capability varchar(200) PRIMARY KEY,
    enabled boolean NOT NULL DEFAULT true,
    notes text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE eap.capability_setting IS
    '每个能力一个开关，与能力种类无关。没有这一行 = 已启用：没人配置过的能力必须可用，所以设置是「退出」而不是「加入」。';

COMMENT ON COLUMN eap.capability_setting.capability IS '能力 id，与 /api/capabilities 声明的同一个标识';

COMMENT ON COLUMN eap.capability_setting.enabled IS
    'false 表示操作者主动停用。已启用的专家正在运行该能力时后端会拒绝写入，并点名这些专家。';

COMMENT ON COLUMN eap.capability_setting.notes IS '停用原因或备注，只给人看，不参与判定';

COMMENT ON COLUMN eap.capability_setting.updated_at IS '最后一次改动的时刻；页面上「最近刷新」与此无关，那是另一条时间线';

CREATE TABLE eap.cli_program (
    id text PRIMARY KEY,
    name text NOT NULL,
    binary_name text NOT NULL UNIQUE,
    builtin boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE eap.cli_program IS '本机 CLI 程序注册表，同一程序统一维护二进制位置';

COMMENT ON COLUMN eap.cli_program.id IS '程序唯一标识';

COMMENT ON COLUMN eap.cli_program.name IS '程序显示名称';

COMMENT ON COLUMN eap.cli_program.binary_name IS '默认可执行文件名称或绝对路径';

COMMENT ON COLUMN eap.cli_program.builtin IS '是否系统预置程序';

COMMENT ON COLUMN eap.cli_program.updated_at IS '最后更新时间';

CREATE TABLE eap.cli_channel (
    program_id varchar(200) PRIMARY KEY,
    binary_path text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cli_channel_program_fk
    FOREIGN KEY (program_id) REFERENCES eap.cli_program(id) ON DELETE CASCADE
);

COMMENT ON TABLE eap.cli_channel IS '程序级可执行文件绑定；同一程序的所有操作共用一条绑定，没有旧操作键回退';

COMMENT ON COLUMN eap.cli_channel.binary_path IS
    '可执行文件名或绝对路径。不能为空串（空串等于「删掉这一行、恢复默认」），不能以 - 开头，不能含控制字符，不能含凭据——写入前由后端校验。';

COMMENT ON COLUMN eap.cli_channel.updated_at IS '覆盖值最后一次变更的时刻。覆盖是即时生效的，不需要重启后端。';

COMMENT ON COLUMN eap.cli_channel.program_id IS 'CLI程序标识，引用cli_program.id；不能使用git-status/git-diff等操作标识';

CREATE TABLE eap.cli_operation (
    capability_id text PRIMARY KEY,
    program_id text NOT NULL REFERENCES eap.cli_program(id),
    title text NOT NULL,
    args jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(args) = 'array'),
    description text NOT NULL DEFAULT '',
    builtin boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE eap.cli_operation IS '受控 CLI 操作，专家通过 capability_id 引用固定参数数组';

COMMENT ON COLUMN eap.cli_operation.capability_id IS '专家引用的操作能力唯一标识';

COMMENT ON COLUMN eap.cli_operation.program_id IS '所属 CLI 程序';

COMMENT ON COLUMN eap.cli_operation.title IS '操作显示名称';

COMMENT ON COLUMN eap.cli_operation.args IS '固定参数字符串数组，不经 shell 拼接';

COMMENT ON COLUMN eap.cli_operation.description IS '操作用途说明';

COMMENT ON COLUMN eap.cli_operation.builtin IS '是否系统预置操作';

COMMENT ON COLUMN eap.cli_operation.updated_at IS '最后更新时间';

CREATE TABLE eap.handoff (
    id uuid PRIMARY KEY,
    source varchar(16) NOT NULL,
    source_ref varchar(200) NOT NULL,
    summary text NOT NULL,
    status varchar(32) NOT NULL DEFAULT 'recorded',
    execution varchar(32) NOT NULL DEFAULT 'not_started',
    approval varchar(32) NOT NULL DEFAULT 'not_requested',
    grant_state varchar(32) NOT NULL DEFAULT 'none',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT handoff_status_recorded CHECK (status = 'recorded'),
    CONSTRAINT handoff_execution_not_started CHECK (execution = 'not_started'),
    CONSTRAINT handoff_approval_not_requested CHECK (approval = 'not_requested'),
    CONSTRAINT handoff_grant_none CHECK (grant_state = 'none'),
    CONSTRAINT handoff_source CHECK (source IN ('chat', 'builder', 'board'))
);

COMMENT ON TABLE eap.handoff IS
    '操作者显式记录的交接意图。不是 eap.task，不会被重新运行，也不是 Mission 调度。';

COMMENT ON COLUMN eap.handoff.execution IS '固定 not_started。本表没有执行接口。';

COMMENT ON COLUMN eap.handoff.grant_state IS '固定 none。记录交接不产生授权。';

COMMENT ON COLUMN eap.handoff.id IS '交接标识。重新记录会新增一行，不覆盖旧行。';

COMMENT ON COLUMN eap.handoff.source IS 'chat, builder or an internal board task snapshot; not a repository grant';

COMMENT ON COLUMN eap.handoff.source_ref IS '来源标签，例如会话 id、draft、builder-alpha。不是路径，也不是授权。';

COMMENT ON COLUMN eap.handoff.summary IS '操作者本次提交的文本，入库前脱敏。';

COMMENT ON COLUMN eap.handoff.status IS '固定 recorded。没有后续状态机。';

COMMENT ON COLUMN eap.handoff.approval IS '固定 not_requested。记录交接不是审批。';

COMMENT ON COLUMN eap.handoff.created_at IS '记录时刻。';

CREATE TABLE eap.mission (
    id uuid PRIMARY KEY,
    handoff_id uuid NOT NULL,
    status varchar(32) NOT NULL DEFAULT 'created',
    execution varchar(32) NOT NULL DEFAULT 'not_started',
    approval varchar(32) NOT NULL DEFAULT 'not_requested',
    verification varchar(32) NOT NULL DEFAULT 'not_requested',
    grant_state varchar(32) NOT NULL DEFAULT 'none',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT mission_handoff_id_key UNIQUE (handoff_id),
    CONSTRAINT mission_handoff_fk FOREIGN KEY (handoff_id) REFERENCES eap.handoff (id),
    CONSTRAINT mission_status_created CHECK (status = 'created'),
    CONSTRAINT mission_execution_projection CHECK (
    execution IN ('not_started', 'running', 'cancelling', 'succeeded', 'failed', 'timed_out', 'cancelled', 'interrupted')
),
    CONSTRAINT mission_approval_not_requested CHECK (approval = 'not_requested'),
    CONSTRAINT mission_verification_not_requested CHECK (verification = 'not_requested'),
    CONSTRAINT mission_grant_none CHECK (grant_state = 'none')
);

COMMENT ON TABLE eap.mission IS
    '由一条交接显式建立的未执行任务壳。没有调度、审批、取消、续跑或验证执行。';

COMMENT ON COLUMN eap.mission.id IS '平台生成的任务壳标识。';

COMMENT ON COLUMN eap.mission.handoff_id IS '关联的 eap.handoff。第一切片全表唯一，冲突后返回已有行。';

COMMENT ON COLUMN eap.mission.status IS '固定 created。本表没有完成态。';

COMMENT ON COLUMN eap.mission.execution IS '最近一次只读执行的投影。权威状态在 mission_execution，本列不能由请求指定。';

COMMENT ON COLUMN eap.mission.approval IS '固定 not_requested。创建任务壳不申请审批。';

COMMENT ON COLUMN eap.mission.verification IS '固定 not_requested。本表没有验证入口。';

COMMENT ON COLUMN eap.mission.grant_state IS '固定 none。创建任务壳不产生授权。';

COMMENT ON COLUMN eap.mission.created_at IS '任务壳建立时间。';

CREATE TABLE eap.mission_execution (
    id uuid PRIMARY KEY,
    mission_id uuid NOT NULL REFERENCES eap.mission (id),
    status varchar(32) NOT NULL,
    capability varchar(64) NOT NULL,
    principal varchar(64) NOT NULL,
    workspace_path text NOT NULL,
    workspace_label varchar(64) NOT NULL,
    executable text NOT NULL,
    policy_snapshot text NOT NULL,
    os_pid bigint,
    process_started_at timestamptz,
    process_user text,
    process_executable text,
    started_at timestamptz NOT NULL,
    finished_at timestamptz,
    exit_code integer,
    stdout text,
    stderr text,
    exit_evidence text,
    unconfirmed_reason text,
    cancel_requested boolean NOT NULL DEFAULT false,
    approval varchar(32) NOT NULL,
    created_at timestamptz NOT NULL,
    CONSTRAINT mission_execution_status CHECK (status IN (
        'CREATED', 'RUNNING', 'CANCELLING', 'SUCCEEDED', 'FAILED', 'REJECTED', 'TIMED_OUT', 'CANCELLED', 'INTERRUPTED'
    )),
    CONSTRAINT mission_execution_capability CHECK (capability = 'git-status'),
    CONSTRAINT mission_execution_principal CHECK (principal = 'local-operator'),
    CONSTRAINT mission_execution_approval CHECK (approval = 'NOT_REQUIRED'),
    CONSTRAINT mission_execution_terminal_evidence CHECK (
        status NOT IN ('CANCELLED', 'INTERRUPTED')
        OR (exit_evidence IS NOT NULL AND length(btrim(exit_evidence)) > 0)
    )
);

COMMENT ON TABLE eap.mission_execution IS 'Mission 的一次只读 git-status。进程成功不表示任务壳完成。';

COMMENT ON COLUMN eap.mission_execution.id IS '交给 runManaged 的执行号，同一次启动不再另编号。';

COMMENT ON COLUMN eap.mission_execution.mission_id IS '所属任务壳。';

COMMENT ON COLUMN eap.mission_execution.status IS '执行状态。CANCELLED 与 INTERRUPTED 必须带进程退出证据。';

COMMENT ON COLUMN eap.mission_execution.capability IS '固定为 git-status。';

COMMENT ON COLUMN eap.mission_execution.principal IS '服务端常量 local-operator，不来自请求。';

COMMENT ON COLUMN eap.mission_execution.workspace_path IS '启动时服务端工作区实路径。';

COMMENT ON COLUMN eap.mission_execution.workspace_label IS '工作区显示标签，不是路径或授权。';

COMMENT ON COLUMN eap.mission_execution.executable IS 'git-status 通道解析出的可执行文件。';

COMMENT ON COLUMN eap.mission_execution.policy_snapshot IS '放行时的服务端策略快照，不是 grant_state。';

COMMENT ON COLUMN eap.mission_execution.os_pid IS '进程号。单独出现不能当作销毁依据。';

COMMENT ON COLUMN eap.mission_execution.process_started_at IS '该进程的启动时间，用于核对进程号是否被复用。';

COMMENT ON COLUMN eap.mission_execution.process_user IS '操作系统用户。';

COMMENT ON COLUMN eap.mission_execution.process_executable IS '进程可执行文件路径。';

COMMENT ON COLUMN eap.mission_execution.started_at IS '执行行开始时间。';

COMMENT ON COLUMN eap.mission_execution.finished_at IS '终态写入时间。';

COMMENT ON COLUMN eap.mission_execution.exit_code IS '进程退出码。';

COMMENT ON COLUMN eap.mission_execution.stdout IS '脱敏后的标准输出。';

COMMENT ON COLUMN eap.mission_execution.stderr IS '脱敏后的标准错误。';

COMMENT ON COLUMN eap.mission_execution.exit_evidence IS '进程退出或确认不存在的证据。取消和中断终态不能为空。';

COMMENT ON COLUMN eap.mission_execution.unconfirmed_reason IS '身份或退出证据不足时的原因。此时状态保持在途。';

COMMENT ON COLUMN eap.mission_execution.cancel_requested IS '是否收到过取消请求。后到的取消不覆盖已有退出终态。';

COMMENT ON COLUMN eap.mission_execution.approval IS '固定 NOT_REQUIRED，不能写成 APPROVED。';

COMMENT ON COLUMN eap.mission_execution.created_at IS '执行行创建时间。';

CREATE TABLE eap.prototype_version (
    id uuid PRIMARY KEY,
    source_ref varchar(32) NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    acceptance text NOT NULL,
    content_hash varchar(64) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT prototype_version_source CHECK (source_ref IN ('builder-alpha', 'builder-beta')),
    CONSTRAINT prototype_semantic_envelope CHECK (
    ((body::jsonb)->>'format' = 'eap-prototype-v1'
     AND (body::jsonb)->'schema'->>'version' = '1'
     AND jsonb_typeof((body::jsonb)->'schema'->'root') = 'object'
     AND jsonb_typeof((body::jsonb)->'schema'->'grapesProject') = 'object'
     AND (body::jsonb)->'schema'->'unknownMappings' = '[]'::jsonb) IS TRUE
),
    request_id uuid NOT NULL,
    CONSTRAINT prototype_publication_request_unique UNIQUE(request_id)
);

COMMENT ON TABLE eap.prototype_version IS
    '一次保存插入的原型版本。应用没有更新入口。此注释不是防更新约束，也没有触发器阻止数据库直改。不是浏览器草稿，也不是交接或 Mission。';

COMMENT ON COLUMN eap.prototype_version.id IS '服务端生成的版本号，全表唯一，不按实例递增。';

COMMENT ON COLUMN eap.prototype_version.source_ref IS '来源 Builder 实例，只取 builder-alpha 或 builder-beta。';

COMMENT ON COLUMN eap.prototype_version.title IS '先脱敏再规范化的标题。应用只插入，本列没有防更新约束。';

COMMENT ON COLUMN eap.prototype_version.body IS 'eap-prototype-v1语义设计及GrapesJS项目数据；不接受文本/计数演示版本，发布前由服务校验映射和复杂度';

COMMENT ON COLUMN eap.prototype_version.acceptance IS '先脱敏再规范化的验收条件 JSON 数组。本表不执行这些条件。应用只插入。';

COMMENT ON COLUMN eap.prototype_version.content_hash IS '服务端对脱敏并规范化后的内容计算的 SHA-256。应用只插入，不回写已有哈希。';

COMMENT ON COLUMN eap.prototype_version.created_at IS '版本插入时间。同一实例的先后只看这一列。';

COMMENT ON COLUMN eap.prototype_version.request_id IS '调用方生成的发布请求身份；同一身份同内容返回原版本，异内容拒绝；响应丢失后可只读核对，不自动重发';

CREATE TABLE eap.prototype_delivery (
    id uuid PRIMARY KEY,
    version_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT prototype_delivery_version_fk FOREIGN KEY (version_id) REFERENCES eap.prototype_version (id),
    CONSTRAINT prototype_delivery_one_version UNIQUE (version_id)
);

COMMENT ON TABLE eap.prototype_delivery IS
    '引用一个原型版本的可审阅交付单。不绑定仓库，不调用 Agent，也不是交接。';

COMMENT ON COLUMN eap.prototype_delivery.id IS '服务端生成的交付单号。';

COMMENT ON COLUMN eap.prototype_delivery.version_id IS '所引用的原型版本。全表唯一，并发冲突时返回已有行。';

COMMENT ON COLUMN eap.prototype_delivery.created_at IS '交付单插入时间。';

CREATE TABLE eap.board_task (
    id uuid PRIMARY KEY,
    project_id varchar(120) NOT NULL,
    title varchar(200) NOT NULL,
    column_id varchar(20) NOT NULL DEFAULT 'planned' CHECK (column_id IN ('planned','ready','running','acceptance','done')),
    notes text NOT NULL DEFAULT '',
    session_id varchar(120) NOT NULL DEFAULT '',
    revision bigint NOT NULL DEFAULT 1,
    events jsonb NOT NULL DEFAULT '["created"]',
    created_at timestamptz NOT NULL DEFAULT now(),
    priority varchar(8) NOT NULL DEFAULT 'none'
    CHECK (priority IN ('none', 'p0', 'p1', 'p2')),
    goal text NOT NULL DEFAULT '',
    acceptance_criteria text NOT NULL DEFAULT '',
    request_id uuid,
    request_fingerprint varchar(64),
    CONSTRAINT board_task_request_unique UNIQUE (project_id, request_id),
    prototype_version_id uuid REFERENCES eap.prototype_version(id)
);

COMMENT ON TABLE eap.board_task IS 'Project-scoped task preparation; execution and acceptance require separate evidence';

COMMENT ON COLUMN eap.board_task.id IS 'Stable task identifier';

COMMENT ON COLUMN eap.board_task.project_id IS 'Local project scope; not a repository access grant';

COMMENT ON COLUMN eap.board_task.title IS 'Task display title';

COMMENT ON COLUMN eap.board_task.column_id IS 'Saved board state; only planned and ready can be changed by preparation APIs';

COMMENT ON COLUMN eap.board_task.notes IS 'Supplementary user notes';

COMMENT ON COLUMN eap.board_task.session_id IS 'Optional conversation reference; does not start or restore a session';

COMMENT ON COLUMN eap.board_task.revision IS 'Optimistic concurrency version, incremented once per changed update';

COMMENT ON COLUMN eap.board_task.events IS 'Ordered preparation activity labels, not execution evidence';

COMMENT ON COLUMN eap.board_task.created_at IS 'Task creation timestamp';

COMMENT ON COLUMN eap.board_task.priority IS 'User-selected priority: none, p0, p1 or p2';

COMMENT ON COLUMN eap.board_task.goal IS 'Task goal; blank is incomplete preparation';

COMMENT ON COLUMN eap.board_task.acceptance_criteria IS 'Human-readable checkable acceptance criteria; not an acceptance result';

COMMENT ON COLUMN eap.board_task.request_id IS 'Client creation request identity, unique within the project';

COMMENT ON COLUMN eap.board_task.request_fingerprint IS 'SHA-256 of the original normalized create request, stable across later edits';

COMMENT ON COLUMN eap.board_task.prototype_version_id IS 'Optional immutable saved prototype selected for this task; does not imply design acceptance or repository authorization';

CREATE TABLE eap.board_task_run (
    execution_id uuid PRIMARY KEY REFERENCES eap.mission_execution(id),
    task_id uuid NOT NULL REFERENCES eap.board_task(id),
    request_id uuid NOT NULL,
    task_revision bigint NOT NULL,
    task_snapshot jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT board_task_run_request_unique UNIQUE (task_id, request_id),
    review_snapshot jsonb,
    verification_snapshot jsonb,
    CONSTRAINT board_verification_snapshot_shape CHECK (
    verification_snapshot IS NULL OR COALESCE((
        jsonb_typeof(verification_snapshot) = 'object'
        AND verification_snapshot ?& ARRAY['id','status','plan','checks','startedAt']
        AND verification_snapshot->>'status' IN ('QUEUED','RUNNING','PASSED','FAILED','STALE','UNKNOWN')
        AND jsonb_typeof(verification_snapshot->'checks') = 'array'
        AND (
            (
                jsonb_typeof(verification_snapshot->'plan') = 'object'
                AND verification_snapshot->'plan' ?& ARRAY['workspacePath','planHash']
                AND length(verification_snapshot->'plan'->>'workspacePath') BETWEEN 1 AND 2048
                AND verification_snapshot->'plan'->>'planHash' ~ '^[a-f0-9]{64}$'
            ) OR (
                verification_snapshot->'plan' = 'null'::jsonb
                AND verification_snapshot->>'status' = 'UNKNOWN'
                AND verification_snapshot->>'reason' = 'BOARD_VERIFICATION_PROCESS_UNKNOWN'
                AND jsonb_typeof(verification_snapshot->'workspacePath') = 'string'
                AND length(verification_snapshot->>'workspacePath') BETWEEN 1 AND 2048
                AND verification_snapshot->'checks' = '[]'::jsonb
                AND verification_snapshot->'sourceAfter' = 'null'::jsonb
                AND verification_snapshot->'finishedAt' = 'null'::jsonb
            )
        )
    ), false)
),
    delivery_snapshot jsonb,
    delivery_request_hash text,
    delivery_decision_hash text,
    CONSTRAINT board_delivery_shape CHECK (
    (delivery_snapshot IS NULL AND delivery_request_hash IS NULL AND delivery_decision_hash IS NULL)
    OR COALESCE((jsonb_typeof(delivery_snapshot)='object'
        AND delivery_snapshot ?& ARRAY['id','source','requestId','taskRevision','submittedRevision','workspacePath','baseCommit','verificationId','sourceHash','goal','acceptanceCriteria','note','files','createdAt','decision']
        AND (
            (delivery_snapshot->>'source'='EXTERNAL_MANUAL'
                AND (NOT delivery_snapshot ? 'applicationEvidence' OR delivery_snapshot->'applicationEvidence'='null'::jsonb))
            OR (delivery_snapshot->>'source' IN ('CHAT_APPLIED_POST_HOC','CHAT_APPLIED_PREBOUND')
                AND jsonb_typeof(delivery_snapshot->'applicationEvidence')='object'
                AND delivery_snapshot->'applicationEvidence' ?& ARRAY['association','conversationId','proposalId','generationId','targetPath','generationBaseHash','appliedAfterHash','generationCapturedAt','prototypeVersionId','prototypeContentHash','associatedAt','operator']
                AND ((delivery_snapshot->>'source'='CHAT_APPLIED_POST_HOC'
                    AND delivery_snapshot->'applicationEvidence'->>'association'='POST_HOC'
                    AND (NOT delivery_snapshot->'applicationEvidence' ? 'taskBinding'
                        OR delivery_snapshot->'applicationEvidence'->'taskBinding'='null'::jsonb))
                    OR (delivery_snapshot->>'source'='CHAT_APPLIED_PREBOUND'
                        AND delivery_snapshot->'applicationEvidence'->>'association'='PREBOUND'
                        AND jsonb_typeof(delivery_snapshot->'applicationEvidence'->'taskBinding')='object'
                        AND delivery_snapshot->'applicationEvidence'->'taskBinding' ?& ARRAY['projectId','taskId','revision']
                        AND length(trim(delivery_snapshot->'applicationEvidence'->'taskBinding'->>'projectId')) > 0
                        AND delivery_snapshot->'applicationEvidence'->'taskBinding'->>'taskId'=task_id::text
                        AND delivery_snapshot->'applicationEvidence'->'taskBinding'->'revision'=to_jsonb(task_revision)
                        AND delivery_snapshot->'applicationEvidence'->'taskBinding'->'revision'=delivery_snapshot->'taskRevision'))
                AND delivery_snapshot->'applicationEvidence'->>'operator'='local-operator'
                AND delivery_snapshot->'applicationEvidence'->>'conversationId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
                AND delivery_snapshot->'applicationEvidence'->>'proposalId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
                AND delivery_snapshot->'applicationEvidence'->>'generationId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
                AND delivery_snapshot->'applicationEvidence'->>'targetPath'=delivery_snapshot->'files'->0->>'path'
                AND delivery_snapshot->'applicationEvidence'->>'generationBaseHash' ~ '^(absent|[a-f0-9]{64})$'
                AND delivery_snapshot->'applicationEvidence'->>'appliedAfterHash' ~ '^[a-f0-9]{64}$'
                AND delivery_snapshot->'applicationEvidence'->>'appliedAfterHash'=delivery_snapshot->'files'->0->>'afterHash'
                AND jsonb_typeof(delivery_snapshot->'applicationEvidence'->'generationCapturedAt')='string'
                AND length(delivery_snapshot->'applicationEvidence'->>'generationCapturedAt')>0
                AND jsonb_typeof(delivery_snapshot->'applicationEvidence'->'associatedAt')='string'
                AND length(delivery_snapshot->'applicationEvidence'->>'associatedAt')>0
                AND ((delivery_snapshot->'applicationEvidence'->'prototypeVersionId'='null'::jsonb
                        AND delivery_snapshot->'applicationEvidence'->'prototypeContentHash'='null'::jsonb
                        AND delivery_snapshot->'prototypeVersionId'='null'::jsonb)
                    OR (delivery_snapshot->'applicationEvidence'->>'prototypeVersionId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
                        AND delivery_snapshot->'applicationEvidence'->>'prototypeVersionId'=delivery_snapshot->>'prototypeVersionId'
                        AND delivery_snapshot->'applicationEvidence'->>'prototypeContentHash' ~ '^[a-f0-9]{64}$')))
        )
        AND delivery_request_hash ~ '^[a-f0-9]{64}$'
        AND delivery_snapshot->>'sourceHash' ~ '^[a-f0-9]{64}$'
        AND jsonb_typeof(delivery_snapshot->'files')='array'
        AND jsonb_array_length(delivery_snapshot->'files') BETWEEN 1 AND 8
        AND ((delivery_snapshot->'decision'='null'::jsonb AND delivery_decision_hash IS NULL)
            OR (jsonb_typeof(delivery_snapshot->'decision')='object'
                AND delivery_snapshot->'decision'->>'decision' IN ('ACCEPT','REJECT')
                AND delivery_snapshot->'decision'->>'operator'='local-operator'
                AND delivery_decision_hash ~ '^[a-f0-9]{64}$'))), false)
)
);

COMMENT ON TABLE eap.board_task_run IS 'Immutable task snapshot and start-request identity; execution truth remains in mission_execution';

COMMENT ON COLUMN eap.board_task_run.execution_id IS 'Existing Mission execution identifier; no parallel execution status';

COMMENT ON COLUMN eap.board_task_run.task_id IS 'Owning board task, whose project scopes all reads and starts';

COMMENT ON COLUMN eap.board_task_run.request_id IS 'Client request identity retained across timeouts and retries';

COMMENT ON COLUMN eap.board_task_run.task_revision IS 'Saved task version explicitly selected when starting';

COMMENT ON COLUMN eap.board_task_run.task_snapshot IS 'Title, goal and acceptance criteria at the time of the run';

COMMENT ON COLUMN eap.board_task_run.created_at IS 'Run association creation time';

COMMENT ON COLUMN eap.board_task_run.review_snapshot IS 'One immutable, server-collected repository review captured after this Run; includes capture time, redacted diff and whitespace-check evidence, not implementation attribution or acceptance';

COMMENT ON COLUMN eap.board_task_run.verification_snapshot IS 'One independently confirmed verification per Run; UNKNOWN retains workspace exclusion; not task completion or human acceptance';

COMMENT ON COLUMN eap.board_task_run.delivery_snapshot IS 'Immutable EXTERNAL_MANUAL, CHAT_APPLIED_POST_HOC or CHAT_APPLIED_PREBOUND evidence for one to eight files, with at most one explicit local human decision; never inferred from git-status success';

COMMENT ON COLUMN eap.board_task_run.delivery_request_hash IS 'SHA-256 of exact typed submission request for identity and content conflict detection';

COMMENT ON COLUMN eap.board_task_run.delivery_decision_hash IS 'SHA-256 of exact typed acceptance or rejection request; null until a human decision is recorded';

CREATE TABLE eap.code_generation (
    id uuid PRIMARY KEY,
    principal varchar(160) NOT NULL,
    conversation_id uuid NOT NULL,
    workspace text NOT NULL,
    target_path varchar(240) NOT NULL,
    base_hash varchar(64) NOT NULL,
    source_content text,
    prototype_version_id varchar(36) NOT NULL DEFAULT '',
    prototype_content_hash varchar(64) NOT NULL DEFAULT '',
    captured_at timestamptz NOT NULL,
    CONSTRAINT code_generation_source_bound CHECK (octet_length(source_content) <= 24000),
    CONSTRAINT code_generation_source_hash CHECK (
        (source_content IS NULL AND base_hash = 'absent') OR
        (source_content IS NOT NULL AND base_hash ~ '^[0-9a-f]{64}$')),
    CONSTRAINT code_generation_prototype_pair CHECK (
        (prototype_version_id = '' AND prototype_content_hash = '') OR
        (prototype_version_id <> '' AND prototype_content_hash <> '')),
    task_project_id varchar(120),
    task_id uuid,
    task_revision bigint,
    task_snapshot jsonb,
    CONSTRAINT code_generation_task_group CHECK (
    (task_project_id IS NULL AND task_id IS NULL AND task_revision IS NULL AND task_snapshot IS NULL)
    OR COALESCE((task_project_id IS NOT NULL AND length(trim(task_project_id)) > 0
        AND task_id IS NOT NULL AND task_revision > 0 AND task_snapshot IS NOT NULL
        AND jsonb_typeof(task_snapshot) = 'object'
        AND task_snapshot ?& ARRAY['projectId','taskId','revision','title','goal','acceptanceCriteria','prototype']
        AND task_snapshot->>'projectId' = task_project_id
        AND task_snapshot->>'taskId' = task_id::text
        AND task_snapshot->'revision' = to_jsonb(task_revision)
        AND jsonb_typeof(task_snapshot->'title') = 'string'
        AND jsonb_typeof(task_snapshot->'goal') = 'string' AND length(trim(task_snapshot->>'goal')) > 0
        AND jsonb_typeof(task_snapshot->'acceptanceCriteria') = 'string' AND length(trim(task_snapshot->>'acceptanceCriteria')) > 0
        AND ((task_snapshot->'prototype' = 'null'::jsonb AND prototype_version_id = '' AND prototype_content_hash = '')
            OR (jsonb_typeof(task_snapshot->'prototype') = 'object'
                AND task_snapshot->'prototype' ?& ARRAY['id','requestId','sourceRef','title','body','acceptance','contentHash','createdAt']
                AND NOT (task_snapshot->'prototype') ?| ARRAY['buttonPresses','interaction']
                AND ((task_snapshot->'prototype'->>'body')::jsonb)->>'format' = 'eap-prototype-v1'
                AND task_snapshot->'prototype'->>'id' = prototype_version_id
                AND task_snapshot->'prototype'->>'contentHash' = prototype_content_hash))), false)
),
    companion_sources jsonb NOT NULL,
    CONSTRAINT code_generation_companions CHECK (
    jsonb_typeof(companion_sources)='array' AND jsonb_array_length(companion_sources)<=7
)
);

COMMENT ON TABLE eap.code_generation IS 'Immutable pre-model root and companion source evidence with optional original task binding; distinct from proposal, apply authorization and filesystem results';

COMMENT ON COLUMN eap.code_generation.id IS 'Server-generated immutable generation identity';

COMMENT ON COLUMN eap.code_generation.principal IS 'Server-bound local operator identity, never selected by browser input';

COMMENT ON COLUMN eap.code_generation.conversation_id IS 'Originating process-local chat identity, retained as evidence without chat-memory lifetime coupling';

COMMENT ON COLUMN eap.code_generation.workspace IS 'Server-canonical workspace real path at capture time';

COMMENT ON COLUMN eap.code_generation.target_path IS 'Root workspace-relative proposal target with exact path spelling; explicitly selected companion targets are frozen in companion_sources';

COMMENT ON COLUMN eap.code_generation.base_hash IS 'SHA-256 of exact source UTF-8 bytes, or absent when no target existed';

COMMENT ON COLUMN eap.code_generation.prototype_version_id IS 'Optional immutable saved prototype UUID, empty when no prototype is referenced';

COMMENT ON COLUMN eap.code_generation.prototype_content_hash IS 'Hash supplied by the stored canonical prototype version, empty when absent';

COMMENT ON COLUMN eap.code_generation.captured_at IS 'Server capture time before the model call, persisted at PostgreSQL microsecond precision';

COMMENT ON COLUMN eap.code_generation.source_content IS 'Complete bounded UTF-8 source used in model context; NULL denotes absent target; denied/redacted/truncated sources must never be inserted';

COMMENT ON COLUMN eap.code_generation.companion_sources IS '按显式选择顺序冻结的组件源码与基线；最多七项，不表示授权或应用完成。';

COMMENT ON COLUMN eap.code_generation.task_project_id IS 'Original project identity captured with the optional task binding';
COMMENT ON COLUMN eap.code_generation.task_id IS 'Original task identity captured before generation; not an apply authorization';
COMMENT ON COLUMN eap.code_generation.task_revision IS 'Positive task revision frozen at generation time';
COMMENT ON COLUMN eap.code_generation.task_snapshot IS 'Immutable task title, goal, acceptance criteria and prototype evidence at generation time';

CREATE TABLE eap.code_proposal (
    id uuid PRIMARY KEY,
    generation_id uuid NOT NULL REFERENCES eap.code_generation(id),
    principal text NOT NULL,
    conversation_id uuid NOT NULL,
    workspace text NOT NULL,
    proposal jsonb NOT NULL,
    status text NOT NULL DEFAULT 'PROPOSED',
    result jsonb,
    reason text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz,
    CHECK ((proposal->>'id')::uuid = id),
    CHECK ((proposal->>'conversationId')::uuid = conversation_id),
    CHECK (proposal->>'workspace' = workspace),
    CHECK ((proposal->'generation'->>'id')::uuid = generation_id),
    CHECK ((status = 'APPLIED') = (result IS NOT NULL)),
    CHECK (status NOT IN ('APPLYING','UNKNOWN') OR started_at IS NOT NULL),
    CONSTRAINT code_proposal_component_count CHECK (
    jsonb_array_length(proposal->'files') BETWEEN 1 AND 8
    AND jsonb_typeof(proposal->'generation'->'companionFiles')='array'
    AND jsonb_array_length(proposal->'files')=1+jsonb_array_length(proposal->'generation'->'companionFiles')
),
    CONSTRAINT code_proposal_status_check
    CHECK (status IN ('PROPOSED','APPLYING','APPLIED','FAILED','UNKNOWN','CLOSED_UNKNOWN','REFUSED')),
    unknown_review jsonb,
    CONSTRAINT code_proposal_unknown_review_check CHECK (
    (status = 'CLOSED_UNKNOWN') = (unknown_review IS NOT NULL)
    AND (unknown_review IS NULL OR
        (jsonb_typeof(unknown_review) = 'object' AND started_at IS NOT NULL AND result IS NULL
         AND unknown_review ?& ARRAY['requestId','operator','closedAt','note','observation']))
),
    application_baseline jsonb,
    CONSTRAINT code_proposal_application_baseline_check CHECK (
 application_baseline IS NULL OR COALESCE(
  jsonb_typeof(application_baseline) = 'object'
  AND application_baseline ?& ARRAY['workspacePath','baseCommit','source','capturedAt']
  AND jsonb_typeof(application_baseline->'workspacePath') = 'string'
  AND application_baseline->>'workspacePath' = workspace
  AND jsonb_typeof(application_baseline->'baseCommit') = 'string'
  AND application_baseline->>'baseCommit' ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'
  AND jsonb_typeof(application_baseline->'capturedAt') = 'string'
  AND length(application_baseline->>'capturedAt') > 0
  AND jsonb_typeof(application_baseline->'source') = 'object'
  AND (application_baseline->'source') ?& ARRAY['scope','contentHash','files','exclusions']
  AND application_baseline->'source'->>'scope' = 'frontend'
  AND application_baseline->'source'->>'contentHash' ~ '^[a-f0-9]{64}$'
  AND jsonb_typeof(application_baseline->'source'->'files') = 'array'
  AND jsonb_typeof(application_baseline->'source'->'exclusions') = 'array'
   AND eap.valid_application_source(application_baseline->'source'), false)
)
);

COMMENT ON TABLE eap.code_proposal IS 'Immutable root and companion generation candidate for one to eight files, with durable apply intent, result and optional original task attribution via code_generation';

COMMENT ON COLUMN eap.code_proposal.id IS 'Server-generated immutable proposal identity';

COMMENT ON COLUMN eap.code_proposal.generation_id IS 'Original pre-model source snapshot authority';

COMMENT ON COLUMN eap.code_proposal.principal IS 'Server-resolved local principal, never browser selected';

COMMENT ON COLUMN eap.code_proposal.conversation_id IS 'Exact owning conversation identity';

COMMENT ON COLUMN eap.code_proposal.workspace IS 'Server-captured real workspace path and shared interlock key';

COMMENT ON COLUMN eap.code_proposal.proposal IS 'Immutable candidate content, original before hash and explicit write permission';

COMMENT ON COLUMN eap.code_proposal.status IS 'Only APPLYING and UNKNOWN block the workspace. CLOSED_UNKNOWN preserves ambiguity after an explicit operator review';

COMMENT ON COLUMN eap.code_proposal.result IS 'Saved APPLIED result with per-file readback SHA-256 evidence; application itself does not establish independent verification or acceptance';

COMMENT ON COLUMN eap.code_proposal.reason IS 'Bounded non-sensitive machine reason for failure or ambiguity';

COMMENT ON COLUMN eap.code_proposal.created_at IS 'Database proposal insertion timestamp';

COMMENT ON COLUMN eap.code_proposal.started_at IS 'Committed intent timestamp before filesystem effects';

COMMENT ON COLUMN eap.code_proposal.finished_at IS 'Result observation timestamp, not proof of verification or task completion';

COMMENT ON COLUMN eap.code_proposal.unknown_review IS 'Immutable operator closure and bounded file hash observation; never proves original write, independent verification, or acceptance';

COMMENT ON COLUMN eap.code_proposal.application_baseline IS 'Server-owned full frontend hashes and HEAD captured under task/workspace claim locks before any application write; NULL history is never backfilled';

CREATE TABLE eap.skill_version (
    scope text NOT NULL,
    id varchar(64) NOT NULL,
    version varchar(32) NOT NULL,
    description text NOT NULL,
    digest char(64) NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
    source_label varchar(200) NOT NULL,
    raw_skill_md text NOT NULL,
    resources jsonb NOT NULL CHECK (jsonb_typeof(resources) = 'array'),
    required_capabilities jsonb NOT NULL CHECK (jsonb_typeof(required_capabilities) = 'array'),
    enabled boolean NOT NULL DEFAULT false,
    state_revision bigint NOT NULL DEFAULT 1 CHECK (state_revision >= 1),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    confirmed_by text NOT NULL,
    confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (scope, id, version)
);

COMMENT ON TABLE eap.skill_version IS 'Workspace-scoped immutable text Skill versions; activation uses optimistic revision checks.';

COMMENT ON COLUMN eap.skill_version.scope IS 'Server-derived digest of the process-bound real RuntimeWorkspace root; never supplied by clients.';

COMMENT ON COLUMN eap.skill_version.id IS 'Validated lowercase Skill frontmatter name; unique together with workspace scope and version.';

COMMENT ON COLUMN eap.skill_version.version IS 'Explicit major.minor.patch version, never an implicit latest alias.';

COMMENT ON COLUMN eap.skill_version.description IS 'Validated frontmatter description, included in metadata listings.';

COMMENT ON COLUMN eap.skill_version.digest IS 'SHA-256 of length-prefixed UTF-8 original text, resources, provenance, version and scope.';

COMMENT ON COLUMN eap.skill_version.source_label IS 'User-supplied bounded provenance label; does not confer trust or execution authority.';

COMMENT ON COLUMN eap.skill_version.raw_skill_md IS 'Exact submitted SKILL.md text including frontmatter and original line endings.';

COMMENT ON COLUMN eap.skill_version.resources IS 'Explicit submitted text resources as JSON; paths are labels, never server filesystem reads.';

COMMENT ON COLUMN eap.skill_version.required_capabilities IS 'Declared capability identifiers for diagnostics only; not grants or executable tools.';

COMMENT ON COLUMN eap.skill_version.enabled IS 'Operator-controlled activation state; new versions default to disabled.';

COMMENT ON COLUMN eap.skill_version.state_revision IS 'Positive CAS revision incremented on every accepted activation write.';

COMMENT ON COLUMN eap.skill_version.created_at IS 'Server timestamp of the immutable version creation.';

COMMENT ON COLUMN eap.skill_version.confirmed_by IS 'Server-bound local operator who explicitly confirmed this exact content digest.';

COMMENT ON COLUMN eap.skill_version.confirmed_at IS 'Server timestamp of first trust confirmation; idempotent saves never replace it.';

CREATE TABLE eap.scenario_definition (
    id varchar(100) PRIMARY KEY,
    revision bigint NOT NULL CHECK (revision > 0),
    definition jsonb NOT NULL,
    deleted boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE eap.scenario_definition IS 'Local user scenario configuration with CAS revision and deletion tombstone; not execution or authorization evidence';

COMMENT ON COLUMN eap.scenario_definition.id IS 'User scenario ID; custom- prefix reserves built-in preset identities';

COMMENT ON COLUMN eap.scenario_definition.revision IS 'Optimistic compare-and-set revision; creation expects zero, persisted revisions start at one';

COMMENT ON COLUMN eap.scenario_definition.definition IS 'Bounded display and instruction configuration; resource labels are not runtime grants or verified availability';

COMMENT ON COLUMN eap.scenario_definition.deleted IS 'Deletion tombstone prevents stale clients recreating the same ID at revision zero';

COMMENT ON COLUMN eap.scenario_definition.updated_at IS 'Last successful configuration save or deletion time';

CREATE TABLE eap.expert_agent_run (
    task_id uuid PRIMARY KEY REFERENCES eap.task(id) ON DELETE CASCADE,
    expert_id varchar(100) NOT NULL,
    snapshot jsonb NOT NULL,
    request jsonb NOT NULL,
    checkpoint jsonb NOT NULL DEFAULT '{}',
    state text NOT NULL DEFAULT 'queued' CHECK (state IN
        ('queued','running','interrupted','completed','partial','needs-input','failed','cancelled','timed-out',
         'awaiting-approval','applying','applied','denied','expired','unknown')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
    owner uuid,
    lease_until timestamptz,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
    result jsonb,
    proposal_id uuid REFERENCES eap.code_proposal(id),
    approval_digest text,
    approval_expires_at timestamptz,
    decision text,
    decided_by text,
    decided_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((state = 'running') = (owner IS NOT NULL)),
    CHECK (jsonb_typeof(snapshot) = 'object' AND jsonb_typeof(request) = 'object' AND jsonb_typeof(checkpoint) = 'object'),
    automatic boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE eap.expert_agent_run IS 'Existing Task continuation: exact expert/input, bounded checkpoints, fenced attempts and human-approved immutable code proposal';

COMMENT ON COLUMN eap.expert_agent_run.task_id IS 'Existing Task identity; one continuation per execution';

COMMENT ON COLUMN eap.expert_agent_run.expert_id IS 'Expert identity bound when the execution is created';

COMMENT ON COLUMN eap.expert_agent_run.snapshot IS 'Immutable expert manifest and revision; live authority must still be checked';

COMMENT ON COLUMN eap.expert_agent_run.request IS 'Immutable bounded and redacted execution input including optional SQL candidate target';

COMMENT ON COLUMN eap.expert_agent_run.checkpoint IS 'Committed evidence, consumed model budget, grants and optional candidate; no external effect replay';

COMMENT ON COLUMN eap.expert_agent_run.state IS 'Execution, approval or application state; unknown never authorizes replay';

COMMENT ON COLUMN eap.expert_agent_run.attempts IS 'Claim count across restarts, limited to three attempts';

COMMENT ON COLUMN eap.expert_agent_run.owner IS 'Unique attempt token fencing stale workers; present only while running';

COMMENT ON COLUMN eap.expert_agent_run.lease_until IS 'Database-clock deadline for the current attempt lease';

COMMENT ON COLUMN eap.expert_agent_run.expires_at IS 'Immutable deadline for resuming or approving this execution';

COMMENT ON COLUMN eap.expert_agent_run.result IS 'Bounded unverified agent result; file application evidence stays in code_proposal';

COMMENT ON COLUMN eap.expert_agent_run.proposal_id IS 'Single immutable code proposal selected for separate human approval';

COMMENT ON COLUMN eap.expert_agent_run.approval_digest IS 'SHA-256 binding of candidate snapshot and expert revision';

COMMENT ON COLUMN eap.expert_agent_run.approval_expires_at IS 'Immutable expiry of the candidate approval opportunity';

COMMENT ON COLUMN eap.expert_agent_run.decision IS 'Explicit local operator approval or denial, independent of model text';

COMMENT ON COLUMN eap.expert_agent_run.decided_by IS 'Local operator identity used for the explicit approval decision';

COMMENT ON COLUMN eap.expert_agent_run.decided_at IS 'Time approval or denial was committed before any file effect';

COMMENT ON COLUMN eap.expert_agent_run.created_at IS 'Immutable execution creation timestamp';

COMMENT ON COLUMN eap.expert_agent_run.updated_at IS 'Last journal transition or checkpoint commit timestamp';

COMMENT ON COLUMN eap.expert_agent_run.automatic IS 'Immutable explicit background scheduling consent; historical synchronous runs stay manual';

CREATE TABLE eap.tool_execution (
    id uuid PRIMARY KEY,
    request_id uuid NOT NULL,
    workspace_path text NOT NULL,
    program_id text NOT NULL CHECK (program_id = 'git'),
    capability_id text NOT NULL,
    status text NOT NULL,
    snapshot jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_path, request_id),
    CHECK (snapshot->>'id' = id::text AND snapshot->>'status' = status
        AND snapshot->>'workspacePath' = workspace_path
        AND snapshot->>'programId' = program_id AND snapshot->>'capabilityId' = capability_id),
    CONSTRAINT tool_execution_capability_id_check
    CHECK (capability_id IN ('git-status', 'git-diff')),
    CONSTRAINT tool_execution_status_check CHECK (status IN
    ('CREATED','RUNNING','CANCELLING','SUCCEEDED','FAILED','REJECTED','TIMED_OUT','CANCELLED','UNKNOWN','CLOSED_UNKNOWN')),
    CONSTRAINT tool_execution_manual_closure_check CHECK (
    CASE WHEN status = 'CLOSED_UNKNOWN' THEN
        COALESCE(jsonb_typeof(snapshot->'resolution') = 'object'
            AND snapshot->'resolution'->>'operator' = 'local-operator'
            AND snapshot->'resolution'->'processTreeStopped' = 'true'::jsonb
            AND length(snapshot->'resolution'->>'note') BETWEEN 1 AND 2000
            AND snapshot->'resolution'->>'requestId' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
            AND snapshot->'resolution'->>'requestDigest' ~ '^[a-f0-9]{64}$'
            AND length(snapshot->'resolution'->>'resolvedAt') > 0, false)
    ELSE snapshot->'resolution' IS NULL OR snapshot->'resolution' = 'null'::jsonb END
)
);

COMMENT ON TABLE eap.tool_execution IS '受控工具操作的持久执行与退出证据；不归属虚构 Mission。';

COMMENT ON COLUMN eap.tool_execution.request_id IS '当前工作区内的启动去重标识，不授予执行权限。';

COMMENT ON COLUMN eap.tool_execution.snapshot IS
    '脱敏有界执行证据及独立resolution人工核对记录；关闭保留原输出、步骤、未知原因及退出字段。';

COMMENT ON COLUMN eap.tool_execution.status IS
    'UNKNOWN阻塞同操作；CLOSED_UNKNOWN为人工核对后关闭阻塞，原执行结果仍未知，不等于成功/取消或进程退出证明。';

COMMENT ON COLUMN eap.tool_execution.id IS '平台生成的调用标识，同一次调用的所有预检与进程归属此记录。';

COMMENT ON COLUMN eap.tool_execution.workspace_path IS '服务端授权工作区的规范实路径，用于读取隔离与在途互锁。';

COMMENT ON COLUMN eap.tool_execution.program_id IS '受控操作所属的本地程序，本切片固定为 git。';

COMMENT ON COLUMN eap.tool_execution.capability_id IS
    '内置只读 git-status 或 git-diff；在途及 UNKNOWN 按工作区和操作互锁。';

COMMENT ON COLUMN eap.tool_execution.created_at IS '调用持久化创建时间，用于历史排序。';

CREATE INDEX task_observation_task_idx ON eap.task_observation(task_id);

CREATE INDEX knowledge_chunk_content_idx ON eap.knowledge_chunk USING gin (to_tsvector('simple', content));

CREATE INDEX cli_operation_program_idx ON eap.cli_operation(program_id);

CREATE UNIQUE INDEX mission_execution_one_open
    ON eap.mission_execution (mission_id)
    WHERE status IN ('CREATED', 'RUNNING', 'CANCELLING');

CREATE INDEX board_task_project_idx ON eap.board_task(project_id, created_at DESC);

CREATE INDEX board_task_run_task_idx ON eap.board_task_run(task_id, created_at DESC);

CREATE UNIQUE INDEX board_verification_one_active_workspace
    ON eap.board_task_run (lower(COALESCE(verification_snapshot->'plan'->>'workspacePath', verification_snapshot->>'workspacePath')))
    WHERE verification_snapshot->>'status' IN ('QUEUED','RUNNING','UNKNOWN');

CREATE INDEX code_generation_conversation_idx ON eap.code_generation(conversation_id, captured_at);

CREATE UNIQUE INDEX code_proposal_active_workspace ON eap.code_proposal(lower(workspace))
    WHERE status IN ('APPLYING','UNKNOWN');

CREATE INDEX code_proposal_scope ON eap.code_proposal(principal, conversation_id);

CREATE INDEX code_generation_task_idx ON eap.code_generation(task_id) WHERE task_id IS NOT NULL;

CREATE INDEX expert_agent_recovery ON eap.expert_agent_run(state,lease_until);

CREATE INDEX expert_agent_pending ON eap.expert_agent_run(updated_at,task_id)
    WHERE automatic AND state IN ('queued','interrupted');

CREATE UNIQUE INDEX tool_execution_one_open ON eap.tool_execution(workspace_path, capability_id)
    WHERE status IN ('CREATED','RUNNING','CANCELLING','UNKNOWN');

CREATE INDEX tool_execution_history ON eap.tool_execution(workspace_path, created_at DESC);

CREATE FUNCTION eap.protect_code_proposal_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF ROW(NEW.id, NEW.generation_id, NEW.principal, NEW.conversation_id, NEW.workspace, NEW.proposal, NEW.created_at)
       IS DISTINCT FROM ROW(OLD.id, OLD.generation_id, OLD.principal, OLD.conversation_id, OLD.workspace, OLD.proposal, OLD.created_at) THEN
        RAISE EXCEPTION 'immutable code proposal evidence';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION eap.code_generation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'code generation evidence is immutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION eap.protect_skill_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (to_jsonb(NEW) - ARRAY['enabled','state_revision']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['enabled','state_revision']) THEN
        RAISE EXCEPTION 'SKILL_VERSION_IMMUTABLE';
    END IF;
    IF NEW.state_revision <> OLD.state_revision + 1 THEN
        RAISE EXCEPTION 'SKILL_STATE_REVISION_REQUIRED';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION eap.protect_expert_agent_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF ROW(NEW.task_id,NEW.expert_id,NEW.snapshot,NEW.request,NEW.created_at,NEW.expires_at)
       IS DISTINCT FROM ROW(OLD.task_id,OLD.expert_id,OLD.snapshot,OLD.request,OLD.created_at,OLD.expires_at) THEN
        RAISE EXCEPTION 'immutable agent source';
    END IF;
    IF OLD.proposal_id IS NOT NULL AND ROW(NEW.proposal_id,NEW.approval_digest,NEW.approval_expires_at)
       IS DISTINCT FROM ROW(OLD.proposal_id,OLD.approval_digest,OLD.approval_expires_at) THEN
        RAISE EXCEPTION 'immutable agent approval scope';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION eap.protect_expert_agent_scheduling() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.automatic IS DISTINCT FROM OLD.automatic THEN
        RAISE EXCEPTION 'immutable agent scheduling consent';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION eap.protect_source_write_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status = 'CLOSED_UNKNOWN' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'immutable source write review';
    END IF;
    IF NEW.status = 'CLOSED_UNKNOWN' AND OLD.status <> 'CLOSED_UNKNOWN'
        AND (OLD.status <> 'UNKNOWN' OR
            ROW(NEW.reason, NEW.started_at, NEW.finished_at, NEW.result)
            IS DISTINCT FROM ROW(OLD.reason, OLD.started_at, OLD.finished_at, OLD.result)) THEN
        RAISE EXCEPTION 'source write review must preserve the unknown result';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION eap.protect_code_application_baseline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
  IF NEW.application_baseline IS NOT NULL THEN
   RAISE EXCEPTION 'application baseline must be captured by claim';
  END IF;
 ELSIF NEW.application_baseline IS DISTINCT FROM OLD.application_baseline THEN
  IF OLD.application_baseline IS NOT NULL OR NEW.application_baseline IS NULL
     OR OLD.status <> 'PROPOSED' OR NEW.status <> 'APPLYING' OR NEW.started_at IS NULL THEN
   RAISE EXCEPTION 'immutable application baseline';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;

CREATE TRIGGER code_proposal_immutable BEFORE UPDATE ON eap.code_proposal
    FOR EACH ROW EXECUTE FUNCTION eap.protect_code_proposal_evidence();

CREATE TRIGGER code_generation_immutable BEFORE UPDATE ON eap.code_generation
    FOR EACH ROW EXECUTE FUNCTION eap.code_generation_immutable();

CREATE TRIGGER skill_version_immutable BEFORE UPDATE ON eap.skill_version
    FOR EACH ROW EXECUTE FUNCTION eap.protect_skill_version();

CREATE TRIGGER expert_agent_immutable BEFORE UPDATE ON eap.expert_agent_run
    FOR EACH ROW EXECUTE FUNCTION eap.protect_expert_agent_source();

CREATE TRIGGER expert_agent_scheduling_immutable BEFORE UPDATE ON eap.expert_agent_run
    FOR EACH ROW EXECUTE FUNCTION eap.protect_expert_agent_scheduling();

CREATE TRIGGER code_proposal_review_immutable BEFORE UPDATE ON eap.code_proposal
    FOR EACH ROW EXECUTE FUNCTION eap.protect_source_write_review();

CREATE TRIGGER code_proposal_application_baseline_immutable BEFORE INSERT OR UPDATE ON eap.code_proposal
 FOR EACH ROW EXECUTE FUNCTION eap.protect_code_application_baseline();

INSERT INTO eap.cli_program(id,name,binary_name,builtin) VALUES ('git','Git','git',true),('rg','ripgrep','rg',true);

INSERT INTO eap.cli_operation(capability_id,program_id,title,args,description,builtin) VALUES
('git-status','git','读取本地 Git 状态','["status"]','只读查看工作区状态',true),
('git-diff','git','读取本地 Git 差异','["diff","--stat"]','只读查看改动范围',true),
('rg-search','rg','工作空间检索','["--line-number","--hidden"]','在工作空间内进行有界检索',true);
