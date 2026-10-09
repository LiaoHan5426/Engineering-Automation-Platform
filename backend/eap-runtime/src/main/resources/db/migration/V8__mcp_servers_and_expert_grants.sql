-- MCP tools are expert-scoped, never platform-global. Registration is a deliberate platform action
-- (and a server is disabled and untrusted by default), while authorisation is a per-expert grant
-- written on activation.
CREATE TABLE IF NOT EXISTS eap.mcp_server (
    id varchar(80) PRIMARY KEY,
    name varchar(200) NOT NULL,
    transport varchar(20) NOT NULL DEFAULT 'stdio',
    endpoint text NOT NULL DEFAULT '',
    trusted boolean NOT NULL DEFAULT false,
    enabled boolean NOT NULL DEFAULT false,
    tools jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Which expert may call which expert-scoped capability. Written when an expert is enabled and deleted
-- when it is disabled or re-saved, exactly like the knowledge and database grants: a draft reference is
-- not an authorisation, and revoking the expert revokes the tool.
CREATE TABLE IF NOT EXISTS eap.expert_mcp_grant (
    expert_id varchar(100) NOT NULL,
    capability varchar(200) NOT NULL,
    granted_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (expert_id, capability)
);
