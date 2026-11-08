-- One immutable external evidence set and one explicit human decision per Run.
ALTER TABLE eap.board_task_run ADD COLUMN delivery_snapshot jsonb;
ALTER TABLE eap.board_task_run ADD COLUMN delivery_request_hash text;
ALTER TABLE eap.board_task_run ADD COLUMN delivery_decision_hash text;
ALTER TABLE eap.board_task_run ADD CONSTRAINT board_delivery_shape CHECK (
    (delivery_snapshot IS NULL AND delivery_request_hash IS NULL AND delivery_decision_hash IS NULL)
    OR COALESCE((jsonb_typeof(delivery_snapshot)='object'
        AND delivery_snapshot ?& ARRAY['id','source','requestId','taskRevision','submittedRevision','workspacePath','baseCommit','verificationId','sourceHash','goal','acceptanceCriteria','note','files','createdAt','decision']
        AND delivery_snapshot->>'source'='EXTERNAL_MANUAL'
        AND delivery_request_hash ~ '^[a-f0-9]{64}$'
        AND delivery_snapshot->>'sourceHash' ~ '^[a-f0-9]{64}$'
        AND jsonb_typeof(delivery_snapshot->'files')='array'
        AND jsonb_array_length(delivery_snapshot->'files') BETWEEN 1 AND 8
        AND ((delivery_snapshot->'decision'='null'::jsonb AND delivery_decision_hash IS NULL)
            OR (jsonb_typeof(delivery_snapshot->'decision')='object'
                AND delivery_snapshot->'decision'->>'decision' IN ('ACCEPT','REJECT')
                AND delivery_snapshot->'decision'->>'operator'='local-operator'
                AND delivery_decision_hash ~ '^[a-f0-9]{64}$'))), false)
);
