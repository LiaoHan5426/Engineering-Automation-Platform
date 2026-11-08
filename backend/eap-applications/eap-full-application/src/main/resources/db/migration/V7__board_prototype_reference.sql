ALTER TABLE eap.board_task ADD COLUMN prototype_version_id uuid REFERENCES eap.prototype_version(id);
COMMENT ON COLUMN eap.board_task.prototype_version_id IS 'Optional immutable saved prototype selected for this task; does not imply design acceptance or repository authorization';
