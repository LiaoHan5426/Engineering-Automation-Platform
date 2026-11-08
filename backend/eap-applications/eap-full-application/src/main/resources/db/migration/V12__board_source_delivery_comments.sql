-- V11 may already be applied by development hot reload; never rewrite its checksum.
COMMENT ON COLUMN eap.board_task_run.delivery_snapshot IS 'Immutable EXTERNAL_MANUAL source evidence with at most one explicit local human decision; never inferred from git-status success';
COMMENT ON COLUMN eap.board_task_run.delivery_request_hash IS 'SHA-256 of exact typed submission request for identity and content conflict detection';
COMMENT ON COLUMN eap.board_task_run.delivery_decision_hash IS 'SHA-256 of exact typed acceptance or rejection request; null until a human decision is recorded';
