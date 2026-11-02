-- Add metadata without rewriting the already applied V20 migration.
COMMENT ON COLUMN eap.scenario_definition.id IS 'User scenario ID; custom- prefix reserves built-in preset identities';
COMMENT ON COLUMN eap.scenario_definition.revision IS 'Optimistic compare-and-set revision; creation expects zero, persisted revisions start at one';
COMMENT ON COLUMN eap.scenario_definition.definition IS 'Bounded display and instruction configuration; resource labels are not runtime grants or verified availability';
COMMENT ON COLUMN eap.scenario_definition.deleted IS 'Deletion tombstone prevents stale clients recreating the same ID at revision zero';
COMMENT ON COLUMN eap.scenario_definition.updated_at IS 'Last successful configuration save or deletion time';
