-- Use the current semantic publication snapshot for PREBOUND generation.
-- Invalid historical snapshots must be explicitly disposed of; never synthesize old fields.
ALTER TABLE eap.code_generation DROP CONSTRAINT code_generation_task_group;
ALTER TABLE eap.code_generation ADD CONSTRAINT code_generation_task_group CHECK (
    (task_project_id IS NULL AND task_id IS NULL AND task_revision IS NULL AND task_snapshot IS NULL)
    OR COALESCE((task_project_id IS NOT NULL AND length(trim(task_project_id)) > 0
        AND task_id IS NOT NULL AND task_revision > 0 AND task_snapshot IS NOT NULL
        AND jsonb_typeof(task_snapshot) = 'object'
        AND task_snapshot ?& ARRAY['projectId','taskId','revision','title','goal','acceptanceCriteria','prototype']
        AND task_snapshot->>'projectId' = task_project_id
        AND task_snapshot->>'taskId' = task_id::text
        AND task_snapshot->'revision' = to_jsonb(task_revision)
        AND jsonb_typeof(task_snapshot->'title') = 'string'
        AND jsonb_typeof(task_snapshot->'goal') = 'string' AND length(trim(task_snapshot->>'goal')) > 0
        AND jsonb_typeof(task_snapshot->'acceptanceCriteria') = 'string' AND length(trim(task_snapshot->>'acceptanceCriteria')) > 0
        AND ((task_snapshot->'prototype' = 'null'::jsonb AND prototype_version_id = '' AND prototype_content_hash = '')
            OR (jsonb_typeof(task_snapshot->'prototype') = 'object'
                AND task_snapshot->'prototype' ?& ARRAY['id','requestId','sourceRef','title','body','acceptance','contentHash','createdAt']
                AND NOT (task_snapshot->'prototype') ?| ARRAY['buttonPresses','interaction']
                AND ((task_snapshot->'prototype'->>'body')::jsonb)->>'format' = 'eap-prototype-v1'
                AND task_snapshot->'prototype'->>'id' = prototype_version_id
                AND task_snapshot->'prototype'->>'contentHash' = prototype_content_hash))), false)
);
