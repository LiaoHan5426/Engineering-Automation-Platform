-- SQL expert UNKNOWN evidence review / manual resolution (P1 EX-01).
-- Incremental migration only; approved V1 baseline and V2/V3/V4 migrations are never modified.
-- Design contract (docs/decisions/sql-expert-unknown-manual-resolution.md):
--   * UNKNOWN is an observation; manual resolution moves the run to closed-unconfirmed.
--   * The new value is NOT an applied/failed claim: proposal binding, digest, decision and result
--     stay untouched, and the code proposal is not closed by this action.
--   * Audit values are server-owned: note is human evidence, operator is a server-side label,
--     resolved_at is server time. None of them are accepted from the request as identity/time.

DO $$
DECLARE state_check text;
BEGIN
    -- V1 declared the state vocabulary as an inline CHECK, so its generated name is not a
    -- stable API. Identify it by the vocabulary it constrains and leave the separate
    -- (state = 'running') = (owner IS NOT NULL) invariant untouched.
    FOR state_check IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'eap.expert_agent_run'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%awaiting-approval%'
    LOOP
        EXECUTE format('ALTER TABLE eap.expert_agent_run DROP CONSTRAINT %I', state_check);
    END LOOP;
END $$;

ALTER TABLE eap.expert_agent_run
    ADD CONSTRAINT expert_agent_run_state_check CHECK (state IN (
        'queued', 'running', 'interrupted', 'completed', 'partial', 'needs-input', 'failed',
        'cancelled', 'timed-out', 'awaiting-approval', 'applying', 'applied', 'denied',
        'expired', 'unknown', 'closed-unconfirmed'
    ));

ALTER TABLE eap.expert_agent_run
    ADD COLUMN resolution_note text,
    ADD COLUMN resolution_operator varchar(64),
    ADD COLUMN resolved_at timestamptz;

COMMENT ON COLUMN eap.expert_agent_run.state IS
    '专家运行状态。closed-unconfirmed 是人工证据核对后的解除终态，不代表文件已写入。';
COMMENT ON COLUMN eap.expert_agent_run.resolution_note IS
    '人工解除的证据核对说明，10-2000 字符，由服务端校验。';
COMMENT ON COLUMN eap.expert_agent_run.resolution_operator IS
    '人工解除的操作者审计标签，服务端取值，不接受请求自报。';
COMMENT ON COLUMN eap.expert_agent_run.resolved_at IS
    '人工解除的服务端时间。';
