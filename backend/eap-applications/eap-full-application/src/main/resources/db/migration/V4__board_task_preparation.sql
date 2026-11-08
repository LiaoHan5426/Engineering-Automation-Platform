-- Preserve existing drafts; empty goal/criteria is explicitly incomplete preparation.
ALTER TABLE eap.board_task
    ADD COLUMN goal text NOT NULL DEFAULT '',
    ADD COLUMN acceptance_criteria text NOT NULL DEFAULT '',
    ADD COLUMN request_id uuid,
    ADD COLUMN request_fingerprint varchar(64),
    ADD CONSTRAINT board_task_request_unique UNIQUE (project_id, request_id);
