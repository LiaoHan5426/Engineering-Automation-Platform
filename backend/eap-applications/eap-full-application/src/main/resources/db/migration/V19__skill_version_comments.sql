-- V18 may already be applied by the local development application. Preserve its checksum.
COMMENT ON TABLE eap.skill_version IS 'Workspace-scoped immutable text Skill versions; activation uses optimistic revision checks.';
COMMENT ON COLUMN eap.skill_version.scope IS 'Server-derived digest of the process-bound real RuntimeWorkspace root; never supplied by clients.';
COMMENT ON COLUMN eap.skill_version.id IS 'Validated lowercase Skill frontmatter name; unique together with workspace scope and version.';
COMMENT ON COLUMN eap.skill_version.version IS 'Explicit major.minor.patch version, never an implicit latest alias.';
COMMENT ON COLUMN eap.skill_version.description IS 'Validated frontmatter description, included in metadata listings.';
COMMENT ON COLUMN eap.skill_version.digest IS 'SHA-256 of length-prefixed UTF-8 original text, resources, provenance, version and scope.';
COMMENT ON COLUMN eap.skill_version.source_label IS 'User-supplied bounded provenance label; does not confer trust or execution authority.';
COMMENT ON COLUMN eap.skill_version.raw_skill_md IS 'Exact submitted SKILL.md text including frontmatter and original line endings.';
COMMENT ON COLUMN eap.skill_version.resources IS 'Explicit submitted text resources as JSON; paths are labels, never server filesystem reads.';
COMMENT ON COLUMN eap.skill_version.required_capabilities IS 'Declared capability identifiers for diagnostics only; not grants or executable tools.';
COMMENT ON COLUMN eap.skill_version.enabled IS 'Operator-controlled activation state; new versions default to disabled.';
COMMENT ON COLUMN eap.skill_version.state_revision IS 'Positive CAS revision incremented on every accepted activation write.';
COMMENT ON COLUMN eap.skill_version.created_at IS 'Server timestamp of the immutable version creation.';
COMMENT ON COLUMN eap.skill_version.confirmed_by IS 'Server-bound local operator who explicitly confirmed this exact content digest.';
COMMENT ON COLUMN eap.skill_version.confirmed_at IS 'Server timestamp of first trust confirmation; idempotent saves never replace it.';
