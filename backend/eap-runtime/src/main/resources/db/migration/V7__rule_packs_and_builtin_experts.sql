ALTER TABLE eap.expert_definition ADD COLUMN IF NOT EXISTS builtin boolean NOT NULL DEFAULT false;

-- Rule packs are configuration, not code. A pack may be shipped with the platform (builtin = true,
-- seeded from classpath:rules/*.json) or authored by an operator through the rule pack API.
CREATE TABLE IF NOT EXISTS eap.rule_pack (
    id varchar(100) PRIMARY KEY,
    name varchar(200) NOT NULL,
    manifest jsonb NOT NULL,
    builtin boolean NOT NULL DEFAULT false,
    enabled boolean NOT NULL DEFAULT true,
    revision integer NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now()
);
