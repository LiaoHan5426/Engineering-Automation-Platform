CREATE TABLE IF NOT EXISTS eap.task (
    id uuid PRIMARY KEY,
    goal text NOT NULL,
    status varchar(32) NOT NULL,
    decision varchar(32) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eap.task_observation (
    id bigserial PRIMARY KEY,
    task_id uuid NOT NULL REFERENCES eap.task(id) ON DELETE CASCADE,
    capability varchar(200) NOT NULL,
    success boolean NOT NULL,
    exit_code integer NOT NULL,
    stdout text,
    stderr text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_observation_task_idx ON eap.task_observation(task_id);
