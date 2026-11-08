CREATE TABLE eap.skill_version (
    scope text NOT NULL,
    id varchar(64) NOT NULL,
    version varchar(32) NOT NULL,
    description text NOT NULL,
    digest char(64) NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
    source_label varchar(200) NOT NULL,
    raw_skill_md text NOT NULL,
    resources jsonb NOT NULL CHECK (jsonb_typeof(resources) = 'array'),
    required_capabilities jsonb NOT NULL CHECK (jsonb_typeof(required_capabilities) = 'array'),
    enabled boolean NOT NULL DEFAULT false,
    state_revision bigint NOT NULL DEFAULT 1 CHECK (state_revision >= 1),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    confirmed_by text NOT NULL,
    confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (scope, id, version)
);

-- Content, provenance, scope and confirmation are immutable; only activation can advance.
CREATE FUNCTION eap.protect_skill_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (to_jsonb(NEW) - ARRAY['enabled','state_revision']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['enabled','state_revision']) THEN
        RAISE EXCEPTION 'SKILL_VERSION_IMMUTABLE';
    END IF;
    IF NEW.state_revision <> OLD.state_revision + 1 THEN
        RAISE EXCEPTION 'SKILL_STATE_REVISION_REQUIRED';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER skill_version_immutable BEFORE UPDATE ON eap.skill_version
    FOR EACH ROW EXECUTE FUNCTION eap.protect_skill_version();
