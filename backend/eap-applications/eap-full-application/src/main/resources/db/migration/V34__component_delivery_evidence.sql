-- Replace the obsolete root-only application limit. All file sets use the same 1..8 delivery contract.
-- Keep original identity, task, prototype and decision guards; no evidence is rewritten.
ALTER TABLE eap.board_task_run DROP CONSTRAINT board_delivery_shape;
ALTER TABLE eap.board_task_run ADD CONSTRAINT board_delivery_shape CHECK (
    (delivery_snapshot IS NULL AND delivery_request_hash IS NULL AND delivery_decision_hash IS NULL)
    OR COALESCE((jsonb_typeof(delivery_snapshot)='object'
        AND delivery_snapshot ?& ARRAY['id','source','requestId','taskRevision','submittedRevision','workspacePath','baseCommit','verificationId','sourceHash','goal','acceptanceCriteria','note','files','createdAt','decision']
        AND (
            (delivery_snapshot->>'source'='EXTERNAL_MANUAL'
                AND (NOT delivery_snapshot ? 'applicationEvidence' OR delivery_snapshot->'applicationEvidence'='null'::jsonb))
            OR (delivery_snapshot->>'source' IN ('CHAT_APPLIED_POST_HOC','CHAT_APPLIED_PREBOUND')
                AND jsonb_typeof(delivery_snapshot->'applicationEvidence')='object'
                AND delivery_snapshot->'applicationEvidence' ?& ARRAY['association','conversationId','proposalId','generationId','targetPath','generationBaseHash','appliedAfterHash','generationCapturedAt','prototypeVersionId','prototypeContentHash','associatedAt','operator']
                AND ((delivery_snapshot->>'source'='CHAT_APPLIED_POST_HOC'
                    AND delivery_snapshot->'applicationEvidence'->>'association'='POST_HOC'
                    AND (NOT delivery_snapshot->'applicationEvidence' ? 'taskBinding'
                        OR delivery_snapshot->'applicationEvidence'->'taskBinding'='null'::jsonb))
                    OR (delivery_snapshot->>'source'='CHAT_APPLIED_PREBOUND'
                        AND delivery_snapshot->'applicationEvidence'->>'association'='PREBOUND'
                        AND jsonb_typeof(delivery_snapshot->'applicationEvidence'->'taskBinding')='object'
                        AND delivery_snapshot->'applicationEvidence'->'taskBinding' ?& ARRAY['projectId','taskId','revision']
                        AND length(trim(delivery_snapshot->'applicationEvidence'->'taskBinding'->>'projectId')) > 0
                        AND delivery_snapshot->'applicationEvidence'->'taskBinding'->>'taskId'=task_id::text
                        AND delivery_snapshot->'applicationEvidence'->'taskBinding'->'revision'=to_jsonb(task_revision)
                        AND delivery_snapshot->'applicationEvidence'->'taskBinding'->'revision'=delivery_snapshot->'taskRevision'))
                AND delivery_snapshot->'applicationEvidence'->>'operator'='local-operator'
                AND delivery_snapshot->'applicationEvidence'->>'conversationId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
                AND delivery_snapshot->'applicationEvidence'->>'proposalId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
                AND delivery_snapshot->'applicationEvidence'->>'generationId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
                AND delivery_snapshot->'applicationEvidence'->>'targetPath'=delivery_snapshot->'files'->0->>'path'
                AND delivery_snapshot->'applicationEvidence'->>'generationBaseHash' ~ '^(absent|[a-f0-9]{64})$'
                AND delivery_snapshot->'applicationEvidence'->>'appliedAfterHash' ~ '^[a-f0-9]{64}$'
                AND delivery_snapshot->'applicationEvidence'->>'appliedAfterHash'=delivery_snapshot->'files'->0->>'afterHash'
                AND jsonb_typeof(delivery_snapshot->'applicationEvidence'->'generationCapturedAt')='string'
                AND length(delivery_snapshot->'applicationEvidence'->>'generationCapturedAt')>0
                AND jsonb_typeof(delivery_snapshot->'applicationEvidence'->'associatedAt')='string'
                AND length(delivery_snapshot->'applicationEvidence'->>'associatedAt')>0
                AND ((delivery_snapshot->'applicationEvidence'->'prototypeVersionId'='null'::jsonb
                        AND delivery_snapshot->'applicationEvidence'->'prototypeContentHash'='null'::jsonb
                        AND delivery_snapshot->'prototypeVersionId'='null'::jsonb)
                    OR (delivery_snapshot->'applicationEvidence'->>'prototypeVersionId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
                        AND delivery_snapshot->'applicationEvidence'->>'prototypeVersionId'=delivery_snapshot->>'prototypeVersionId'
                        AND delivery_snapshot->'applicationEvidence'->>'prototypeContentHash' ~ '^[a-f0-9]{64}$')))
        )
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
