ALTER TABLE eap.handoff DROP CONSTRAINT handoff_source;
ALTER TABLE eap.handoff ADD CONSTRAINT handoff_source CHECK (source IN ('chat', 'builder', 'board'));
COMMENT ON COLUMN eap.handoff.source IS 'chat, builder or an internal board task snapshot; not a repository grant';

CREATE TABLE eap.board_task_run (
    execution_id uuid PRIMARY KEY REFERENCES eap.mission_execution(id),
    task_id uuid NOT NULL REFERENCES eap.board_task(id),
    request_id uuid NOT NULL,
    task_revision bigint NOT NULL,
    task_snapshot jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT board_task_run_request_unique UNIQUE (task_id, request_id)
);
CREATE INDEX board_task_run_task_idx ON eap.board_task_run(task_id, created_at DESC);
COMMENT ON TABLE eap.board_task_run IS 'Immutable task snapshot and start-request identity; execution truth remains in mission_execution';
COMMENT ON COLUMN eap.board_task_run.execution_id IS 'Existing Mission execution identifier; no parallel execution status';
COMMENT ON COLUMN eap.board_task_run.task_id IS 'Owning board task, whose project scopes all reads and starts';
COMMENT ON COLUMN eap.board_task_run.request_id IS 'Client request identity retained across timeouts and retries';
COMMENT ON COLUMN eap.board_task_run.task_revision IS 'Saved task version explicitly selected when starting';
COMMENT ON COLUMN eap.board_task_run.task_snapshot IS 'Title, goal and acceptance criteria at the time of the run';
COMMENT ON COLUMN eap.board_task_run.created_at IS 'Run association creation time';
