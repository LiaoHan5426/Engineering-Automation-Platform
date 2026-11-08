-- EAP development baseline, consolidated from V1-V18 on 2026-10-26.

-- For a fresh database/schema only. Existing development schemas must be reset separately.

-- Flyway owns migration history; application startup never cleans or repairs an existing schema.

CREATE SCHEMA IF NOT EXISTS eap;



-- eap.task

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



-- eap.task_observation

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

CREATE INDEX task_observation_task_idx ON eap.task_observation(task_id);

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



-- eap.knowledge_base

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



-- eap.knowledge_document

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



-- eap.knowledge_chunk

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

CREATE INDEX knowledge_chunk_content_idx ON eap.knowledge_chunk USING gin (to_tsvector('simple', content));

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



-- eap.expert_definition

CREATE TABLE eap.expert_definition (
 id varchar(100) PRIMARY KEY,
 name varchar(200) NOT NULL,
 manifest jsonb NOT NULL,
 builtin boolean NOT NULL DEFAULT false,
 enabled boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);

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
    'true = 随平台发布的内置专家。内置清单是只读的；要改先复制一份自定义的。';



-- eap.database_profile

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



-- eap.expert_knowledge_grant

CREATE TABLE eap.expert_knowledge_grant (
    expert_id varchar(100) NOT NULL REFERENCES eap.expert_definition(id) ON DELETE CASCADE,
    knowledge_base_id uuid NOT NULL REFERENCES eap.knowledge_base(id) ON DELETE CASCADE,
    PRIMARY KEY (expert_id, knowledge_base_id)
);

COMMENT ON TABLE eap.expert_knowledge_grant IS
    '专家对知识库的读取授权。授权只在启用时写入，停用或改清单时随之撤销——所以「清单里写了」不等于「有权读」。';

COMMENT ON COLUMN eap.expert_knowledge_grant.expert_id IS '被授权的专家';

COMMENT ON COLUMN eap.expert_knowledge_grant.knowledge_base_id IS '被授予读取的知识库';



-- eap.expert_database_grant

CREATE TABLE eap.expert_database_grant (
    expert_id varchar(100) NOT NULL REFERENCES eap.expert_definition(id) ON DELETE CASCADE,
    database_profile_id uuid NOT NULL REFERENCES eap.database_profile(id) ON DELETE CASCADE,
    PRIMARY KEY (expert_id, database_profile_id)
);

COMMENT ON TABLE eap.expert_database_grant IS
    '专家对数据库资料的读取授权，规则同上：授权属于已发布的专家，不属于草稿。';

COMMENT ON COLUMN eap.expert_database_grant.expert_id IS '被授权的专家';

COMMENT ON COLUMN eap.expert_database_grant.database_profile_id IS '被授予读取的资料；资料被已启用专家引用时，删除会被拒绝并点名这些专家';



-- eap.rule_pack

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



-- eap.mcp_server

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
    '传输方式，默认 stdio。探测只描述传输目标是否可达（unknown / reachable / missing），绝不写成「已连接」——平台还没有 MCP 客户端。';

COMMENT ON COLUMN eap.mcp_server.endpoint IS
    'stdio 传输下的启动命令或地址。只在启用了 MCP 客户端时才会被使用；在此之前它是被保存的配置，不是可执行的承诺。';

COMMENT ON COLUMN eap.mcp_server.trusted IS
    'true = 操作者已确认信任。未信任的服务器不会向任何专家提供工具。';

COMMENT ON COLUMN eap.mcp_server.enabled IS 'false = 停用。登记不等于启用，默认关闭。';

COMMENT ON COLUMN eap.mcp_server.tools IS
    '该服务器发布的工具清单，每项是 {name, source, verified} 对象而不是字符串。逐工具放行开关推迟到平台有 MCP 客户端之后。';

COMMENT ON COLUMN eap.mcp_server.updated_at IS '最后一次登记或编辑的时刻';



-- eap.expert_mcp_grant

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



-- eap.capability_setting

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



-- eap.cli_channel

CREATE TABLE eap.cli_channel (
    capability varchar(200) PRIMARY KEY,
    binary_path text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE eap.cli_channel IS
    '本地 CLI 能力的可执行文件位置。命令、参数与它发布的事实都在代码里，只有「装在哪台机器上」属于安装，所以只有这一个值被持久化。没有这一行 = 用随能力声明的默认程序名。';

COMMENT ON COLUMN eap.cli_channel.capability IS 'CLI 能力 id，主键';

COMMENT ON COLUMN eap.cli_channel.binary_path IS
    '可执行文件名或绝对路径。不能为空串（空串等于「删掉这一行、恢复默认」），不能以 - 开头，不能含控制字符，不能含凭据——写入前由后端校验。';

COMMENT ON COLUMN eap.cli_channel.updated_at IS '覆盖值最后一次变更的时刻。覆盖是即时生效的，不需要重启后端。';



-- eap.cli_program

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



-- eap.cli_operation

CREATE TABLE eap.cli_operation (
    capability_id text PRIMARY KEY,
    program_id text NOT NULL REFERENCES eap.cli_program(id),
    title text NOT NULL,
    args jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(args) = 'array'),
    description text NOT NULL DEFAULT '',
    builtin boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cli_operation_program_idx ON eap.cli_operation(program_id);

COMMENT ON TABLE eap.cli_operation IS '受控 CLI 操作，专家通过 capability_id 引用固定参数数组';

COMMENT ON COLUMN eap.cli_operation.capability_id IS '专家引用的操作能力唯一标识';

COMMENT ON COLUMN eap.cli_operation.program_id IS '所属 CLI 程序';

COMMENT ON COLUMN eap.cli_operation.title IS '操作显示名称';

COMMENT ON COLUMN eap.cli_operation.args IS '固定参数字符串数组，不经 shell 拼接';

COMMENT ON COLUMN eap.cli_operation.description IS '操作用途说明';

COMMENT ON COLUMN eap.cli_operation.builtin IS '是否系统预置操作';

COMMENT ON COLUMN eap.cli_operation.updated_at IS '最后更新时间';



-- eap.handoff

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
    CONSTRAINT handoff_source CHECK (source IN ('chat', 'builder')),
    CONSTRAINT handoff_status_recorded CHECK (status = 'recorded'),
    CONSTRAINT handoff_execution_not_started CHECK (execution = 'not_started'),
    CONSTRAINT handoff_approval_not_requested CHECK (approval = 'not_requested'),
    CONSTRAINT handoff_grant_none CHECK (grant_state = 'none')
);

COMMENT ON TABLE eap.handoff IS
    '操作者显式记录的交接意图。不是 eap.task，不会被重新运行，也不是 Mission 调度。';

COMMENT ON COLUMN eap.handoff.execution IS '固定 not_started。本表没有执行接口。';

COMMENT ON COLUMN eap.handoff.grant_state IS '固定 none。记录交接不产生授权。';

COMMENT ON COLUMN eap.handoff.id IS '交接标识。重新记录会新增一行，不覆盖旧行。';

COMMENT ON COLUMN eap.handoff.source IS '来源只能是 chat 或 builder。';

COMMENT ON COLUMN eap.handoff.source_ref IS '来源标签，例如会话 id、draft、builder-alpha。不是路径，也不是授权。';

COMMENT ON COLUMN eap.handoff.summary IS '操作者本次提交的文本，入库前脱敏。';

COMMENT ON COLUMN eap.handoff.status IS '固定 recorded。没有后续状态机。';

COMMENT ON COLUMN eap.handoff.approval IS '固定 not_requested。记录交接不是审批。';

COMMENT ON COLUMN eap.handoff.created_at IS '记录时刻。';



-- eap.mission

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



-- eap.mission_execution

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

CREATE UNIQUE INDEX mission_execution_one_open
    ON eap.mission_execution (mission_id)
    WHERE status IN ('CREATED', 'RUNNING', 'CANCELLING');

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



-- eap.prototype_version

CREATE TABLE eap.prototype_version (
    id uuid PRIMARY KEY,
    source_ref varchar(32) NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    button_presses integer NOT NULL,
    interaction text NOT NULL,
    acceptance text NOT NULL,
    content_hash varchar(64) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT prototype_version_source CHECK (source_ref IN ('builder-alpha', 'builder-beta')),
    CONSTRAINT prototype_version_presses CHECK (button_presses >= 0),
    CONSTRAINT prototype_version_interaction CHECK (interaction = '预览按钮使计数加一')
);

COMMENT ON TABLE eap.prototype_version IS
    '一次保存插入的原型版本。应用没有更新入口。此注释不是防更新约束，也没有触发器阻止数据库直改。不是浏览器草稿，也不是交接或 Mission。';

COMMENT ON COLUMN eap.prototype_version.id IS '服务端生成的版本号，全表唯一，不按实例递增。';

COMMENT ON COLUMN eap.prototype_version.source_ref IS '来源 Builder 实例，只取 builder-alpha 或 builder-beta。';

COMMENT ON COLUMN eap.prototype_version.title IS '先脱敏再规范化的标题。应用只插入，本列没有防更新约束。';

COMMENT ON COLUMN eap.prototype_version.body IS '先脱敏再规范化的正文。应用只插入，本列没有防更新约束。';

COMMENT ON COLUMN eap.prototype_version.button_presses IS '保存时的按钮次数，作为重开预览的初始值。应用只插入。';

COMMENT ON COLUMN eap.prototype_version.interaction IS '服务端固定的交互说明。';

COMMENT ON COLUMN eap.prototype_version.acceptance IS '先脱敏再规范化的验收条件 JSON 数组。本表不执行这些条件。应用只插入。';

COMMENT ON COLUMN eap.prototype_version.content_hash IS '服务端对脱敏并规范化后的内容计算的 SHA-256。应用只插入，不回写已有哈希。';

COMMENT ON COLUMN eap.prototype_version.created_at IS '版本插入时间。同一实例的先后只看这一列。';



-- eap.prototype_delivery

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



-- Built-in CLI programs and fixed operations; all other configuration starts empty.

INSERT INTO eap.cli_program(id,name,binary_name,builtin) VALUES ('git','Git','git',true),('rg','ripgrep','rg',true);

INSERT INTO eap.cli_operation(capability_id,program_id,title,args,description,builtin) VALUES
('git-status','git','读取本地 Git 状态','["status"]','只读查看工作区状态',true),
('git-diff','git','读取本地 Git 差异','["diff","--stat"]','只读查看改动范围',true),
('rg-search','rg','工作空间检索','["--line-number","--hidden"]','在工作空间内进行有界检索',true);
