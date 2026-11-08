-- User task drafts are separate from eap.task, which represents an analysis run.
CREATE TABLE eap.board_task (
    id uuid PRIMARY KEY,
    project_id varchar(120) NOT NULL,
    title varchar(200) NOT NULL,
    column_id varchar(20) NOT NULL DEFAULT 'planned' CHECK (column_id IN ('planned','ready','running','acceptance','done')),
    notes text NOT NULL DEFAULT '',
    session_id varchar(120) NOT NULL DEFAULT '',
    revision bigint NOT NULL DEFAULT 1,
    events jsonb NOT NULL DEFAULT '["created"]',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX board_task_project_idx ON eap.board_task(project_id, created_at DESC);
