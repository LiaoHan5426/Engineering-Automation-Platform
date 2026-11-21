-- Chat message graph: durable backend authority for sent messages (CT-02 slice C data base).
-- Incremental migration only; the approved V1 baseline is never modified.
-- Design contract (docs/decisions/deepseek-chat-adaptation.md §2/§3):
--   * Sent messages form an append-only tree (a forest per conversation). Editing a question
--     adds a new user node; regenerating adds a sibling assistant node. Old nodes and their
--     execution evidence are never overwritten.
--   * The reader's current branch is a client preference, NOT stored here: switching branches
--     is a read-only selection of an existing path and must never change execution facts.
--   * principal / workspace identity is bound by the server; the browser cannot supply it.
--   * Model context is later derived from a selected path in this graph, never from a global
--     linear memory that mixes branches.
-- No data migration is performed here. Legacy local-only display records are NOT imported as
-- server-backed messages; see docs/decisions/local-chat-history-migration.md.

CREATE TABLE eap.chat_conversation (
    id uuid PRIMARY KEY,
    principal varchar(64) NOT NULL,
    workspace_path text NOT NULL,
    workspace_label varchar(64) NOT NULL,
    connection_id uuid,
    connection_revision bigint,
    model varchar(160),
    created_at timestamptz NOT NULL,
    touched_at timestamptz NOT NULL,
    CONSTRAINT chat_conversation_principal CHECK (principal = 'local-operator'),
    CONSTRAINT chat_conversation_touched CHECK (touched_at >= created_at),
    CONSTRAINT chat_conversation_connection_pair CHECK (
        (connection_id IS NULL AND connection_revision IS NULL)
        OR (connection_id IS NOT NULL AND connection_revision IS NOT NULL AND connection_revision >= 0)
    )
);

COMMENT ON TABLE eap.chat_conversation IS
    '已发送消息图的会话根。principal 为服务端常量，不接受请求参数；绑定元数据仅作展示与重建参考。';

COMMENT ON COLUMN eap.chat_conversation.id IS '会话标识，前端会话轨引用此值。';

COMMENT ON COLUMN eap.chat_conversation.principal IS '服务端常量 local-operator，不来自浏览器。';

COMMENT ON COLUMN eap.chat_conversation.workspace_path IS '创建时服务端授权工作区的规范实路径，用于隔离与重连核对。';

COMMENT ON COLUMN eap.chat_conversation.workspace_label IS '工作区显示标签，不是路径或授权。';

COMMENT ON COLUMN eap.chat_conversation.connection_id IS '最近一次使用的模型连接；为派生展示信息，不授予调用权限。';

COMMENT ON COLUMN eap.chat_conversation.connection_revision IS '连接配置的修订号，与 connection_id 成对出现。';

COMMENT ON COLUMN eap.chat_conversation.model IS '最近一次使用的模型标识，仅作展示与重建参考。';

COMMENT ON COLUMN eap.chat_conversation.created_at IS '会话创建时间。';

COMMENT ON COLUMN eap.chat_conversation.touched_at IS '最近一次消息追加时间，用于会话排序。';

CREATE TABLE eap.chat_message (
    id uuid PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES eap.chat_conversation (id),
    parent_id uuid REFERENCES eap.chat_message (id),
    role varchar(16) NOT NULL,
    version integer NOT NULL,
    snapshot jsonb NOT NULL,
    execution_id uuid,
    sequence bigint NOT NULL,
    created_at timestamptz NOT NULL,
    CONSTRAINT chat_message_role CHECK (role IN ('USER', 'ASSISTANT')),
    CONSTRAINT chat_message_version CHECK (version >= 1),
    CONSTRAINT chat_message_sequence CHECK (sequence >= 1),
    CONSTRAINT chat_message_snapshot_object CHECK (jsonb_typeof(snapshot) = 'object'),
    -- The node id and role embedded in the snapshot must match the columns, so a stored
    -- payload cannot silently describe a different node than the row that carries it.
    CONSTRAINT chat_message_snapshot_identity CHECK (
        snapshot->>'id' = id::text AND snapshot->>'role' = role
    ),
    -- Text is bounded; either content is present as a non-empty string or explicitly absent.
    -- No HTML is stored as executable markup — rendering stays in the frontend RichText primitive.
    CONSTRAINT chat_message_snapshot_content CHECK (
        snapshot ? 'text' AND length(snapshot->>'text') BETWEEN 1 AND 24000
        AND (snapshot->'thinking' IS NULL OR jsonb_typeof(snapshot->'thinking') = 'string')
        AND (snapshot->'citations' IS NULL OR jsonb_typeof(snapshot->'citations') = 'array')
    ),
    -- Roots may be versioned: editing the first question appends an alternative root (version 2)
    -- rather than overwriting version 1. Sibling uniqueness is enforced by the index below.
    CONSTRAINT chat_message_execution_role CHECK (
        execution_id IS NULL OR role = 'ASSISTANT'
    ),
    -- Referenced columns must be unique; id alone is PK, but a composite FK needs its own key.
    CONSTRAINT chat_message_conversation_id_unique UNIQUE (conversation_id, id),
    -- A child's parent must live in the SAME conversation, not merely exist anywhere.
    CONSTRAINT chat_message_parent_same_conversation
        FOREIGN KEY (conversation_id, parent_id)
        REFERENCES eap.chat_message (conversation_id, id)
);

COMMENT ON TABLE eap.chat_message IS
    '已发送消息图的不可变节点。追加写、从不更新；编辑与重生成通过新节点和新版本表达，保留旧内容与执行证据。';

COMMENT ON COLUMN eap.chat_message.id IS '消息节点标识，同时写入 snapshot.id。';

COMMENT ON COLUMN eap.chat_message.conversation_id IS '所属会话。';

COMMENT ON COLUMN eap.chat_message.parent_id IS '父节点；为空表示根。同一父节点下的多个子节点构成兄弟版本（分支）。';

COMMENT ON COLUMN eap.chat_message.role IS 'USER 或 ASSISTANT。执行关联只允许出现在 ASSISTANT 节点。';

COMMENT ON COLUMN eap.chat_message.version IS '同一父节点下的兄弟版本号，从 1 递增；根节点固定为 1。';

COMMENT ON COLUMN eap.chat_message.snapshot IS
    '消息正文的结构化快照：id/role/text 必填，thinking/citations 可选。不存可执行 HTML。';

COMMENT ON COLUMN eap.chat_message.execution_id IS '产生该助手回答的执行身份；断线重连据此继续观察同一执行，而非重新生成。';

COMMENT ON COLUMN eap.chat_message.sequence IS '会话内单调追加序号，用于稳定排序与增量拉取。';

COMMENT ON COLUMN eap.chat_message.created_at IS '节点创建时间。';

-- A sibling version must be unique under a given parent. NULL-parent roots share one sibling
-- bucket, so a conversation may hold versioned alternative roots (editing the first question).
CREATE UNIQUE INDEX chat_message_sibling_version
    ON eap.chat_message (conversation_id, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), version);

CREATE UNIQUE INDEX chat_message_conversation_sequence
    ON eap.chat_message (conversation_id, sequence);

CREATE INDEX chat_message_parent_idx ON eap.chat_message (parent_id) WHERE parent_id IS NOT NULL;

CREATE INDEX chat_message_execution_idx ON eap.chat_message (execution_id) WHERE execution_id IS NOT NULL;

-- Append-only enforcement: node identity, topology and content are immutable once written.
-- Only touched_at on the conversation root advances when a message is appended.
CREATE FUNCTION eap.protect_chat_message_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'chat_message is append-only: nodes, branches and content versions are immutable';
END;
$$;

CREATE TRIGGER chat_message_immutable BEFORE UPDATE OR DELETE ON eap.chat_message
    FOR EACH ROW EXECUTE FUNCTION eap.protect_chat_message_immutable();
