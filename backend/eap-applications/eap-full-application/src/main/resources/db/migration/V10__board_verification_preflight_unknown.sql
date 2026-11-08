-- V9 is already deployed: preserve its history and extend the shape without inventing a plan/hash.
ALTER TABLE eap.board_task_run DROP CONSTRAINT board_verification_snapshot_shape;
ALTER TABLE eap.board_task_run ADD CONSTRAINT board_verification_snapshot_shape CHECK (
    verification_snapshot IS NULL OR COALESCE((
        jsonb_typeof(verification_snapshot) = 'object'
        AND verification_snapshot ?& ARRAY['id','status','plan','checks','startedAt']
        AND verification_snapshot->>'status' IN ('QUEUED','RUNNING','PASSED','FAILED','STALE','UNKNOWN')
        AND jsonb_typeof(verification_snapshot->'checks') = 'array'
        AND (
            (
                jsonb_typeof(verification_snapshot->'plan') = 'object'
                AND verification_snapshot->'plan' ?& ARRAY['workspacePath','planHash']
                AND length(verification_snapshot->'plan'->>'workspacePath') BETWEEN 1 AND 2048
                AND verification_snapshot->'plan'->>'planHash' ~ '^[a-f0-9]{64}$'
            ) OR (
                verification_snapshot->'plan' = 'null'::jsonb
                AND verification_snapshot->>'status' = 'UNKNOWN'
                AND verification_snapshot->>'reason' = 'BOARD_VERIFICATION_PROCESS_UNKNOWN'
                AND jsonb_typeof(verification_snapshot->'workspacePath') = 'string'
                AND length(verification_snapshot->>'workspacePath') BETWEEN 1 AND 2048
                AND verification_snapshot->'checks' = '[]'::jsonb
                AND verification_snapshot->'sourceAfter' = 'null'::jsonb
                AND verification_snapshot->'finishedAt' = 'null'::jsonb
            )
        )
    ), false)
);
DROP INDEX eap.board_verification_one_active_workspace;
CREATE UNIQUE INDEX board_verification_one_active_workspace
    ON eap.board_task_run (lower(COALESCE(verification_snapshot->'plan'->>'workspacePath', verification_snapshot->>'workspacePath')))
    WHERE verification_snapshot->>'status' IN ('QUEUED','RUNNING','UNKNOWN');
