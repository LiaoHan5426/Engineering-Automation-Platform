-- Development contract convergence. Invalid old records must be explicitly corrected or removed;
-- this migration never infers an authorization, expert behavior, or design from legacy data.
ALTER TABLE eap.cli_channel RENAME COLUMN capability TO program_id;
ALTER TABLE eap.cli_channel ADD CONSTRAINT cli_channel_program_fk
    FOREIGN KEY (program_id) REFERENCES eap.cli_program(id) ON DELETE CASCADE;
COMMENT ON TABLE eap.cli_channel IS '程序级可执行文件绑定；同一程序的所有操作共用一条绑定，没有旧操作键回退';
COMMENT ON COLUMN eap.cli_channel.program_id IS 'CLI程序标识，引用cli_program.id；不能使用git-status/git-diff等操作标识';

-- The shipped SQL definition has a known current behavior. This is a product seed update,
-- never a default for authored experts; their missing/invalid contracts fail the migration.
UPDATE eap.expert_definition
SET manifest = jsonb_set(manifest, '{behavior}', '{"id":"sql-analysis","version":1}'::jsonb),
    revision = revision + 1, updated_at = now()
WHERE id = 'sql-expert' AND builtin AND manifest->'behavior' IS DISTINCT FROM '{"id":"sql-analysis","version":1}'::jsonb;

ALTER TABLE eap.expert_definition ADD CONSTRAINT expert_explicit_behavior_graph CHECK (
    (jsonb_typeof(manifest->'behavior') = 'object'
     AND jsonb_typeof(manifest->'behavior'->'id') = 'string'
     AND (manifest->'behavior'->>'id') ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     AND jsonb_typeof(manifest->'behavior'->'version') = 'number'
     AND (manifest->'behavior'->>'version') ~ '^[1-9][0-9]*$'
     AND length(manifest->'behavior'->>'version') <= 10
     AND (manifest->'behavior'->>'version')::numeric <= 2147483647
     AND jsonb_typeof(manifest->'steps') = 'array'
     AND jsonb_typeof(manifest->'edges') = 'array'
     AND NOT manifest ? 'capabilities') IS TRUE
);

ALTER TABLE eap.prototype_version DROP COLUMN button_presses, DROP COLUMN interaction;
ALTER TABLE eap.prototype_version ADD CONSTRAINT prototype_semantic_envelope CHECK (
    ((body::jsonb)->>'format' = 'eap-prototype-v1'
     AND (body::jsonb)->'schema'->>'version' = '1'
     AND jsonb_typeof((body::jsonb)->'schema'->'root') = 'object'
     AND jsonb_typeof((body::jsonb)->'schema'->'grapesProject') = 'object'
     AND (body::jsonb)->'schema'->'unknownMappings' = '[]'::jsonb) IS TRUE
);
COMMENT ON COLUMN eap.prototype_version.body IS 'eap-prototype-v1语义设计及GrapesJS项目数据；不接受文本/计数演示版本，发布前由服务校验映射和复杂度';
