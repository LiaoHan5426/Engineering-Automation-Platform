-- User configuration only. Resource labels do not activate tools or grant execution permissions.
CREATE TABLE eap.scenario_definition (
    id varchar(100) PRIMARY KEY,
    revision bigint NOT NULL CHECK (revision > 0),
    definition jsonb NOT NULL,
    deleted boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE eap.scenario_definition IS 'Local user scenario configuration with CAS revision and deletion tombstone; not execution or authorization evidence';
