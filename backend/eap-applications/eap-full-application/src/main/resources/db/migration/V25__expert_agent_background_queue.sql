ALTER TABLE eap.expert_agent_run ADD COLUMN automatic boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN eap.expert_agent_run.automatic IS 'Immutable explicit background scheduling consent; historical synchronous runs stay manual';
CREATE INDEX expert_agent_pending ON eap.expert_agent_run(updated_at,task_id)
    WHERE automatic AND state IN ('queued','interrupted');
CREATE FUNCTION eap.protect_expert_agent_scheduling() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.automatic IS DISTINCT FROM OLD.automatic THEN
        RAISE EXCEPTION 'immutable agent scheduling consent';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER expert_agent_scheduling_immutable BEFORE UPDATE ON eap.expert_agent_run
    FOR EACH ROW EXECUTE FUNCTION eap.protect_expert_agent_scheduling();
