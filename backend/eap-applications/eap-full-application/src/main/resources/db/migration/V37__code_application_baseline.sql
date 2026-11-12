-- Validate the hash-only source manifest; source bodies are deliberately not part of this contract.
CREATE FUNCTION eap.valid_application_source(source jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item jsonb; seen_paths text[] := ARRAY[]::text[]; previous_path text := ''; current_path text;
BEGIN
 IF jsonb_typeof(source->'files') IS DISTINCT FROM 'array'
    OR jsonb_typeof(source->'exclusions') IS DISTINCT FROM 'array'
    OR jsonb_array_length(source->'files') > 4096 THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(source->'files') LOOP
  current_path := item->>'path';
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT (item ?& ARRAY['path','contentHash','bytes'])
     OR jsonb_typeof(item->'path') IS DISTINCT FROM 'string' OR current_path NOT LIKE 'frontend/%'
     OR current_path = ANY(seen_paths) OR current_path COLLATE "C" <= previous_path COLLATE "C"
     OR jsonb_typeof(item->'contentHash') IS DISTINCT FROM 'string'
     OR COALESCE(item->>'contentHash' !~ '^[a-f0-9]{64}$',true)
     OR jsonb_typeof(item->'bytes') IS DISTINCT FROM 'number'
     OR COALESCE(item->>'bytes' !~ '^[0-9]+$',true) THEN RETURN false; END IF;
  IF (item->>'bytes')::numeric > 4194304 THEN RETURN false; END IF;
  seen_paths := array_append(seen_paths,current_path); previous_path := current_path;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(source->'exclusions') LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END;
$$;
ALTER TABLE eap.code_proposal ADD COLUMN application_baseline jsonb;
-- Existing applications deliberately retain NULL: current files cannot prove write-before history.
ALTER TABLE eap.code_proposal ADD CONSTRAINT code_proposal_application_baseline_check CHECK (
 application_baseline IS NULL OR COALESCE(
  jsonb_typeof(application_baseline) = 'object'
  AND application_baseline ?& ARRAY['workspacePath','baseCommit','source','capturedAt']
  AND jsonb_typeof(application_baseline->'workspacePath') = 'string'
  AND application_baseline->>'workspacePath' = workspace
  AND jsonb_typeof(application_baseline->'baseCommit') = 'string'
  AND application_baseline->>'baseCommit' ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'
  AND jsonb_typeof(application_baseline->'capturedAt') = 'string'
  AND length(application_baseline->>'capturedAt') > 0
  AND jsonb_typeof(application_baseline->'source') = 'object'
  AND (application_baseline->'source') ?& ARRAY['scope','contentHash','files','exclusions']
  AND application_baseline->'source'->>'scope' = 'frontend'
  AND application_baseline->'source'->>'contentHash' ~ '^[a-f0-9]{64}$'
  AND jsonb_typeof(application_baseline->'source'->'files') = 'array'
  AND jsonb_typeof(application_baseline->'source'->'exclusions') = 'array'
   AND eap.valid_application_source(application_baseline->'source'), false)
);
CREATE FUNCTION eap.protect_code_application_baseline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
  IF NEW.application_baseline IS NOT NULL THEN
   RAISE EXCEPTION 'application baseline must be captured by claim';
  END IF;
 ELSIF NEW.application_baseline IS DISTINCT FROM OLD.application_baseline THEN
  IF OLD.application_baseline IS NOT NULL OR NEW.application_baseline IS NULL
     OR OLD.status <> 'PROPOSED' OR NEW.status <> 'APPLYING' OR NEW.started_at IS NULL THEN
   RAISE EXCEPTION 'immutable application baseline';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER code_proposal_application_baseline_immutable BEFORE INSERT OR UPDATE ON eap.code_proposal
 FOR EACH ROW EXECUTE FUNCTION eap.protect_code_application_baseline();
COMMENT ON COLUMN eap.code_proposal.application_baseline IS 'Server-owned full frontend hashes and HEAD captured under task/workspace claim locks before any application write; NULL history is never backfilled';
