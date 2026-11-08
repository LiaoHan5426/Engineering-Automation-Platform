-- PREBOUND: only new generations may carry original task evidence; never backfill old rows.
ALTER TABLE eap.code_generation
    ADD COLUMN task_project_id varchar(120),
    ADD COLUMN task_id uuid,
    ADD COLUMN task_revision bigint,
    ADD COLUMN task_snapshot jsonb;
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
                AND task_snapshot->'prototype' ?& ARRAY['id','sourceRef','title','body','buttonPresses','interaction','acceptance','contentHash','createdAt']
                AND task_snapshot->'prototype'->>'id' = prototype_version_id
                AND task_snapshot->'prototype'->>'contentHash' = prototype_content_hash))), false)
);
CREATE INDEX code_generation_task_idx ON eap.code_generation(task_id) WHERE task_id IS NOT NULL;
CREATE FUNCTION eap.code_generation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'code generation evidence is immutable';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER code_generation_immutable BEFORE UPDATE ON eap.code_generation
    FOR EACH ROW EXECUTE FUNCTION eap.code_generation_immutable();
