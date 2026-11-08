ALTER TABLE eap.code_proposal DROP CONSTRAINT IF EXISTS code_proposal_status_check;
ALTER TABLE eap.code_proposal ADD CONSTRAINT code_proposal_status_check
    CHECK (status IN ('PROPOSED','APPLYING','APPLIED','FAILED','UNKNOWN','REFUSED'));
COMMENT ON COLUMN eap.code_proposal.status IS 'PROPOSED/APPLYING/APPLIED/FAILED/UNKNOWN/REFUSED; REFUSED is operator decline before apply';
