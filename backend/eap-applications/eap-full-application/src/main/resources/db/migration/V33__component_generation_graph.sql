-- One root plus explicitly selected companion components. Existing root-only evidence is a leaf.
-- The migration adds empty companion metadata only; no content, attribution or application is invented.
ALTER TABLE eap.code_generation ADD COLUMN companion_sources jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE eap.code_generation ALTER COLUMN companion_sources DROP DEFAULT;
ALTER TABLE eap.code_generation ADD CONSTRAINT code_generation_companions CHECK (
    jsonb_typeof(companion_sources)='array' AND jsonb_array_length(companion_sources)<=7
);
ALTER TABLE eap.code_proposal DISABLE TRIGGER code_proposal_immutable;
UPDATE eap.code_proposal SET proposal=jsonb_set(proposal,'{generation,companionFiles}','[]'::jsonb);
ALTER TABLE eap.code_proposal ENABLE TRIGGER code_proposal_immutable;
DO $$ DECLARE item record; BEGIN
    FOR item IN SELECT conname FROM pg_constraint WHERE conrelid='eap.code_proposal'::regclass
        AND contype='c' AND pg_get_constraintdef(oid) LIKE '%jsonb_array_length%files% = 1)%'
    LOOP EXECUTE format('ALTER TABLE eap.code_proposal DROP CONSTRAINT %I',item.conname); END LOOP;
END $$;
ALTER TABLE eap.code_proposal ADD CONSTRAINT code_proposal_component_count CHECK (
    jsonb_array_length(proposal->'files') BETWEEN 1 AND 8
    AND jsonb_typeof(proposal->'generation'->'companionFiles')='array'
    AND jsonb_array_length(proposal->'files')=1+jsonb_array_length(proposal->'generation'->'companionFiles')
);
