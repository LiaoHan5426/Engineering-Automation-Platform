-- Mission UNKNOWN evidence review / manual resolution (P1 Mission UNKNOWN).
-- Incremental migration only; approved V1 baseline and V2/V3 migrations are never modified.
-- Design contract (docs/decisions/mission-unknown-manual-resolution.md):
--   * UNKNOWN itself is an observation: the row stays in an in-flight status plus unconfirmed_reason.
--   * Manual resolution moves that row to CLOSED_UNCONFIRMED, which is NOT an exit/terminal-success
--     claim. exit_code and exit_evidence stay untouched (null on an unknown row); no tool-domain
--     CLOSED_UNKNOWN wire value and no processTreeStopped assertion are used.
--   * The resolution is an audit record: operator is a server-side label, note is the human evidence
--     summary, resolvedAt is server time. None of them are accepted from the request as identity/time.

ALTER TABLE eap.mission_execution
    DROP CONSTRAINT mission_execution_status;

ALTER TABLE eap.mission_execution
    ADD CONSTRAINT mission_execution_status CHECK (status IN (
        'CREATED', 'RUNNING', 'CANCELLING', 'CLOSED_UNCONFIRMED',
        'SUCCEEDED', 'FAILED', 'REJECTED', 'TIMED_OUT', 'CANCELLED', 'INTERRUPTED'
    ));

ALTER TABLE eap.mission_execution
    ADD COLUMN resolution_note text,
    ADD COLUMN resolution_operator varchar(64),
    ADD COLUMN resolved_at timestamptz;

COMMENT ON COLUMN eap.mission_execution.status IS
    '执行状态。CLOSED_UNCONFIRMED 是人工证据核对后的解除终态，不代表进程已退出。';
COMMENT ON COLUMN eap.mission_execution.resolution_note IS
    '人工解除的证据核对说明，10-2000 字符，由服务端校验。';
COMMENT ON COLUMN eap.mission_execution.resolution_operator IS
    '人工解除的操作者审计标签，服务端取值，不接受请求自报。';
COMMENT ON COLUMN eap.mission_execution.resolved_at IS
    '人工解除的服务端时间。';
