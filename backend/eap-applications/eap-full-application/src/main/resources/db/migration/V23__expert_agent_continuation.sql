-- A continuation belongs to the existing task; it is not a second task or capability registry.
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
    CHECK (jsonb_typeof(snapshot) = 'object' AND jsonb_typeof(request) = 'object' AND jsonb_typeof(checkpoint) = 'object')
);
CREATE INDEX expert_agent_recovery ON eap.expert_agent_run(state,lease_until);
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
CREATE TRIGGER expert_agent_immutable BEFORE UPDATE ON eap.expert_agent_run
    FOR EACH ROW EXECUTE FUNCTION eap.protect_expert_agent_source();
COMMENT ON TABLE eap.expert_agent_run IS 'Existing Task continuation: exact expert/input, bounded checkpoints, fenced attempts and human-approved immutable code proposal';
