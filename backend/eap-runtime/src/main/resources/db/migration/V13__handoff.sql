CREATE TABLE eap.handoff (
    id uuid PRIMARY KEY,
    source varchar(16) NOT NULL,
    source_ref varchar(200) NOT NULL,
    summary text NOT NULL,
    status varchar(32) NOT NULL DEFAULT 'recorded',
    execution varchar(32) NOT NULL DEFAULT 'not_started',
    approval varchar(32) NOT NULL DEFAULT 'not_requested',
    grant_state varchar(32) NOT NULL DEFAULT 'none',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT handoff_source CHECK (source IN ('chat', 'builder')),
    CONSTRAINT handoff_status_recorded CHECK (status = 'recorded'),
    CONSTRAINT handoff_execution_not_started CHECK (execution = 'not_started'),
    CONSTRAINT handoff_approval_not_requested CHECK (approval = 'not_requested'),
    CONSTRAINT handoff_grant_none CHECK (grant_state = 'none')
);

COMMENT ON TABLE eap.handoff IS
    '操作者显式记录的交接意图。不是 eap.task，不会被重新运行，也不是 Mission 调度。';
COMMENT ON COLUMN eap.handoff.execution IS '固定 not_started。本表没有执行接口。';
COMMENT ON COLUMN eap.handoff.grant_state IS '固定 none。记录交接不产生授权。';
