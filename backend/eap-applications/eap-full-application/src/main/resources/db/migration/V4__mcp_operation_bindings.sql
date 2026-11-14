ALTER TABLE eap.mcp_server ADD COLUMN operation_bindings JSONB NOT NULL DEFAULT '[]';
ALTER TABLE eap.mcp_server ADD COLUMN binding_revision BIGINT NOT NULL DEFAULT 0;
ALTER TABLE eap.mcp_server ADD COLUMN binding_endpoint TEXT NOT NULL DEFAULT '';
ALTER TABLE eap.mcp_server ADD COLUMN binding_transport TEXT NOT NULL DEFAULT '';
