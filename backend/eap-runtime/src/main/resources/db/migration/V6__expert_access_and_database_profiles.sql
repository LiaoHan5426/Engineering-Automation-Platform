CREATE TABLE IF NOT EXISTS eap.database_profile (
    id uuid PRIMARY KEY,
    label varchar(200) NOT NULL,
    engine varchar(40) NOT NULL,
    environment varchar(40) NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
-- Grants belong to a published expert. Draft references alone do not grant access.
CREATE TABLE IF NOT EXISTS eap.expert_knowledge_grant (
    expert_id varchar(100) NOT NULL REFERENCES eap.expert_definition(id) ON DELETE CASCADE,
    knowledge_base_id uuid NOT NULL REFERENCES eap.knowledge_base(id) ON DELETE CASCADE,
    PRIMARY KEY (expert_id, knowledge_base_id)
);
CREATE TABLE IF NOT EXISTS eap.expert_database_grant (
    expert_id varchar(100) NOT NULL REFERENCES eap.expert_definition(id) ON DELETE CASCADE,
    database_profile_id uuid NOT NULL REFERENCES eap.database_profile(id) ON DELETE CASCADE,
    PRIMARY KEY (expert_id, database_profile_id)
);
