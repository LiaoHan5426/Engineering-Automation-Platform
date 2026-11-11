ALTER TABLE eap.code_proposal DROP CONSTRAINT code_proposal_status_check;
ALTER TABLE eap.code_proposal ADD CONSTRAINT code_proposal_status_check
    CHECK (status IN ('PROPOSED','APPLYING','APPLIED','FAILED','UNKNOWN','CLOSED_UNKNOWN','REFUSED'));
ALTER TABLE eap.code_proposal ADD COLUMN unknown_review jsonb;
ALTER TABLE eap.code_proposal ADD CONSTRAINT code_proposal_unknown_review_check CHECK (
    (status = 'CLOSED_UNKNOWN') = (unknown_review IS NOT NULL)
    AND (unknown_review IS NULL OR
        (jsonb_typeof(unknown_review) = 'object' AND started_at IS NOT NULL AND result IS NULL
         AND unknown_review ?& ARRAY['requestId','operator','closedAt','note','observation']))
);

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
CREATE TRIGGER code_proposal_review_immutable BEFORE UPDATE ON eap.code_proposal
    FOR EACH ROW EXECUTE FUNCTION eap.protect_source_write_review();
COMMENT ON COLUMN eap.code_proposal.unknown_review IS 'Immutable operator closure and bounded file hash observation; never proves original write, independent verification, or acceptance';
COMMENT ON COLUMN eap.code_proposal.status IS 'Only APPLYING and UNKNOWN block the workspace. CLOSED_UNKNOWN preserves ambiguity after an explicit operator review';
