-- Chat execution event log: durable, read-only replay evidence (CT-01).
-- Incremental migration only; approved V1 baseline and V2 message graph are never modified.
-- Design contract (docs/decisions/chat-execution-log-persistence.md):
--   * Execution events are append-only. Once written, an event is never updated or deleted.
--   * This log is READ-ONLY replay evidence for snapshot(afterSequence); it never resumes an
--     in-process model call. A restarted, still-unfinished execution is replayed as UNKNOWN,
--     never fabricated as a success/terminal state.
--   * The log carries process evidence, not the authority for sent messages (that is the
--     chat_message graph in V2) and not approval/tool/candidate/Run authority.
--   * Bodies are redacted before persistence by the emitter; no executable markup is stored.

CREATE TABLE eap.chat_execution (
    id uuid PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES eap.chat_conversation (id),
    status varchar(32) NOT NULL,
    complete boolean NOT NULL,
    opened_at timestamptz NOT NULL,
    closed_at timestamptz,
    CONSTRAINT chat_execution_status_known CHECK (
        status IN ('CREATED', 'RUNNING', 'CANCELLING', 'SUCCEEDED', 'FAILED', 'REJECTED',
                   'REFUSED', 'TIMED_OUT', 'CANCELLED', 'UNKNOWN')
    ),
    CONSTRAINT chat_execution_closed CHECK (
        (complete = false AND closed_at IS NULL) OR (complete = true AND closed_at IS NOT NULL)
    )
);

COMMENT ON TABLE eap.chat_execution IS
    '聊天执行头：一次生成的身份与终态证据。跨重启只读回放；不承载模型推理续约。';
COMMENT ON COLUMN eap.chat_execution.id IS '执行身份，前端断线重连与快照回放引用此值。';
COMMENT ON COLUMN eap.chat_execution.conversation_id IS '所属会话，引用已发送消息图的会话根。';
COMMENT ON COLUMN eap.chat_execution.status IS '最新执行状态；活跃态在重启回放时收敛为 UNKNOWN。';
COMMENT ON COLUMN eap.chat_execution.complete IS '是否已收到终态；false 表示执行未完成或中断。';
COMMENT ON COLUMN eap.chat_execution.opened_at IS '执行开始时间。';
COMMENT ON COLUMN eap.chat_execution.closed_at IS '终态时间；仅 complete=true 时有值。';

CREATE TABLE eap.chat_execution_event (
    execution_id uuid NOT NULL REFERENCES eap.chat_execution (id),
    sequence bigint NOT NULL,
    event_id uuid NOT NULL UNIQUE,
    type varchar(64) NOT NULL,
    text text NOT NULL,
    code varchar(128) NOT NULL,
    status varchar(32) NOT NULL,
    payload jsonb,
    occurred_at timestamptz NOT NULL,
    CONSTRAINT chat_execution_event_sequence CHECK (sequence >= 1),
    CONSTRAINT chat_execution_event_type_nonempty CHECK (length(type) >= 1),
    CONSTRAINT chat_execution_event_text_bounded CHECK (length(text) <= 1048576),
    CONSTRAINT chat_execution_event_status_known CHECK (
        status = '' OR status IN ('CREATED', 'RUNNING', 'CANCELLING', 'SUCCEEDED', 'FAILED',
                                  'REJECTED', 'REFUSED', 'TIMED_OUT', 'CANCELLED', 'UNKNOWN')
    ),
    CONSTRAINT chat_execution_event_payload_object_or_null CHECK (
        payload IS NULL OR jsonb_typeof(payload) IN ('object', 'array')
    ),
    PRIMARY KEY (execution_id, sequence)
);

COMMENT ON TABLE eap.chat_execution_event IS
    '执行事件日志，按游标有序追加且不可变；供快照按 afterSequence 只读回放。';
COMMENT ON COLUMN eap.chat_execution_event.execution_id IS '所属执行头。';
COMMENT ON COLUMN eap.chat_execution_event.sequence IS '执行内单调游标，从 1 递增；与 event_id 一起用于去重。';
COMMENT ON COLUMN eap.chat_execution_event.event_id IS '事件唯一标识，对应 SSE id 与前端去重键。';
COMMENT ON COLUMN eap.chat_execution_event.type IS '事件类型：status/answer.delta/tool/approval/error/final。';
COMMENT ON COLUMN eap.chat_execution_event.text IS '已脱敏正文；final 为完整回答。';
COMMENT ON COLUMN eap.chat_execution_event.code IS '错误码；无错误为空串。';
COMMENT ON COLUMN eap.chat_execution_event.status IS '事件时点的执行状态。';
COMMENT ON COLUMN eap.chat_execution_event.payload IS '结构化证据；final 为完整消息信封。脱敏后写入。';
COMMENT ON COLUMN eap.chat_execution_event.occurred_at IS '事件产生时间。';

CREATE INDEX chat_execution_conversation_idx ON eap.chat_execution (conversation_id);
CREATE INDEX chat_execution_event_occurred_idx ON eap.chat_execution_event (occurred_at);

-- Append-only enforcement: event identity, cursor and content are immutable once written.
-- The execution head may advance only status/complete/closed_at as the turn reaches a terminal state.
CREATE FUNCTION eap.protect_chat_execution_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'chat_execution_event is append-only: cursor, identity and payload are immutable';
END;
$$;

CREATE TRIGGER chat_execution_event_immutable BEFORE UPDATE OR DELETE ON eap.chat_execution_event
    FOR EACH ROW EXECUTE FUNCTION eap.protect_chat_execution_event_immutable();
