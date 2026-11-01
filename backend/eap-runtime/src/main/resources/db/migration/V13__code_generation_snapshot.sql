-- PB02: immutable single-target context, captured and committed before model invocation.
-- Deliberately independent of process-local chat memory, Board/Task/Mission and PB03 apply state.
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
        (prototype_version_id <> '' AND prototype_content_hash <> ''))
);
CREATE INDEX code_generation_conversation_idx ON eap.code_generation(conversation_id, captured_at);
COMMENT ON TABLE eap.code_generation IS 'PB02 append-only generation evidence; not a durable proposal, apply authorization, or filesystem transaction';
COMMENT ON COLUMN eap.code_generation.id IS 'Server-generated immutable generation identity';
COMMENT ON COLUMN eap.code_generation.principal IS 'Server-bound local operator identity, never selected by browser input';
COMMENT ON COLUMN eap.code_generation.conversation_id IS 'Originating process-local chat identity, retained as evidence without chat-memory lifetime coupling';
COMMENT ON COLUMN eap.code_generation.workspace IS 'Server-canonical workspace real path at capture time';
COMMENT ON COLUMN eap.code_generation.target_path IS 'Only permitted workspace-relative proposal target, exact path spelling';
COMMENT ON COLUMN eap.code_generation.base_hash IS 'SHA-256 of exact source UTF-8 bytes, or absent when no target existed';
COMMENT ON COLUMN eap.code_generation.prototype_version_id IS 'Optional immutable saved prototype UUID, empty when no prototype is referenced';
COMMENT ON COLUMN eap.code_generation.prototype_content_hash IS 'Hash supplied by the stored canonical prototype version, empty when absent';
COMMENT ON COLUMN eap.code_generation.captured_at IS 'Server capture time before the model call, persisted at PostgreSQL microsecond precision';
COMMENT ON COLUMN eap.code_generation.source_content IS 'Complete bounded UTF-8 source used in model context; NULL denotes absent target; denied/redacted/truncated sources must never be inserted';
