ALTER TABLE eap.board_task_run ADD COLUMN verification_snapshot jsonb;
COMMENT ON COLUMN eap.board_task_run.verification_snapshot IS 'One independently confirmed verification per Run; UNKNOWN retains workspace exclusion; not task completion or human acceptance';
ALTER TABLE eap.board_task_run ADD CONSTRAINT board_verification_snapshot_shape CHECK (
    verification_snapshot IS NULL OR (
        jsonb_typeof(verification_snapshot) = 'object'
        AND verification_snapshot ?& ARRAY['id','status','plan','checks','startedAt']
        AND verification_snapshot->>'status' IN ('QUEUED','RUNNING','PASSED','FAILED','STALE','UNKNOWN')
        AND jsonb_typeof(verification_snapshot->'plan') = 'object'
        AND verification_snapshot->'plan' ?& ARRAY['workspacePath','planHash']
        AND length(verification_snapshot->'plan'->>'workspacePath') BETWEEN 1 AND 2048
        AND verification_snapshot->'plan'->>'planHash' ~ '^[a-f0-9]{64}$'
        AND jsonb_typeof(verification_snapshot->'checks') = 'array'
    )
);
-- Lowercase is deliberately conservative for case-insensitive Windows workspace identities.
CREATE UNIQUE INDEX board_verification_one_active_workspace
    ON eap.board_task_run (lower(verification_snapshot->'plan'->>'workspacePath'))
    WHERE verification_snapshot->>'status' IN ('QUEUED','RUNNING','UNKNOWN');
