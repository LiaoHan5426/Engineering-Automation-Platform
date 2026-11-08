-- PB03: immutable candidate + durable single-file intent/result. No Board task attribution.
CREATE TABLE eap.code_proposal (
    id uuid PRIMARY KEY,
    generation_id uuid NOT NULL REFERENCES eap.code_generation(id),
    principal text NOT NULL,
    conversation_id uuid NOT NULL,
    workspace text NOT NULL,
    proposal jsonb NOT NULL,
    status text NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED','APPLYING','APPLIED','FAILED','UNKNOWN')),
    result jsonb,
    reason text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz,
    CHECK (jsonb_array_length(proposal->'files') = 1),
    CHECK ((proposal->>'id')::uuid = id),
    CHECK ((proposal->>'conversationId')::uuid = conversation_id),
    CHECK (proposal->>'workspace' = workspace),
    CHECK ((proposal->'generation'->>'id')::uuid = generation_id),
    CHECK ((status = 'APPLIED') = (result IS NOT NULL)),
    CHECK (status NOT IN ('APPLYING','UNKNOWN') OR started_at IS NOT NULL)
);
CREATE UNIQUE INDEX code_proposal_active_workspace ON eap.code_proposal(lower(workspace))
    WHERE status IN ('APPLYING','UNKNOWN');
CREATE INDEX code_proposal_scope ON eap.code_proposal(principal, conversation_id);
CREATE FUNCTION eap.protect_code_proposal_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF ROW(NEW.id, NEW.generation_id, NEW.principal, NEW.conversation_id, NEW.workspace, NEW.proposal, NEW.created_at)
       IS DISTINCT FROM ROW(OLD.id, OLD.generation_id, OLD.principal, OLD.conversation_id, OLD.workspace, OLD.proposal, OLD.created_at) THEN
        RAISE EXCEPTION 'immutable code proposal evidence';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER code_proposal_immutable BEFORE UPDATE ON eap.code_proposal
    FOR EACH ROW EXECUTE FUNCTION eap.protect_code_proposal_evidence();

COMMENT ON TABLE eap.code_proposal IS 'Immutable single-file generation candidate and durable apply intent; no Board task attribution';
COMMENT ON COLUMN eap.code_proposal.id IS 'Server-generated immutable proposal identity';
COMMENT ON COLUMN eap.code_proposal.generation_id IS 'Original pre-model source snapshot authority';
COMMENT ON COLUMN eap.code_proposal.principal IS 'Server-resolved local principal, never browser selected';
COMMENT ON COLUMN eap.code_proposal.conversation_id IS 'Exact owning conversation identity';
COMMENT ON COLUMN eap.code_proposal.workspace IS 'Server-captured real workspace path and shared interlock key';
COMMENT ON COLUMN eap.code_proposal.proposal IS 'Immutable candidate content, original before hash and explicit write permission';
COMMENT ON COLUMN eap.code_proposal.status IS 'PROPOSED/APPLYING/APPLIED/FAILED/UNKNOWN; active or unknown blocks the workspace';
COMMENT ON COLUMN eap.code_proposal.result IS 'Saved APPLIED result with readback SHA-256, no automatic verification';
COMMENT ON COLUMN eap.code_proposal.reason IS 'Bounded non-sensitive machine reason for failure or ambiguity';
COMMENT ON COLUMN eap.code_proposal.created_at IS 'Database proposal insertion timestamp';
COMMENT ON COLUMN eap.code_proposal.started_at IS 'Committed intent timestamp before filesystem effects';
COMMENT ON COLUMN eap.code_proposal.finished_at IS 'Result observation timestamp, not proof of verification or task completion';
