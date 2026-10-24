CREATE TABLE eap.mission (
    id uuid PRIMARY KEY,
    handoff_id uuid NOT NULL UNIQUE,
    status varchar(32) NOT NULL DEFAULT 'created',
    execution varchar(32) NOT NULL DEFAULT 'not_started',
    approval varchar(32) NOT NULL DEFAULT 'not_requested',
    verification varchar(32) NOT NULL DEFAULT 'not_requested',
    grant_state varchar(32) NOT NULL DEFAULT 'none',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT mission_handoff_id_key UNIQUE (handoff_id),
    CONSTRAINT mission_handoff_fk FOREIGN KEY (handoff_id) REFERENCES eap.handoff (id),
    CONSTRAINT mission_status_created CHECK (status = 'created'),
    CONSTRAINT mission_execution_not_started CHECK (execution = 'not_started'),
    CONSTRAINT mission_approval_not_requested CHECK (approval = 'not_requested'),
    CONSTRAINT mission_verification_not_requested CHECK (verification = 'not_requested'),
    CONSTRAINT mission_grant_none CHECK (grant_state = 'none')
);

COMMENT ON TABLE eap.mission IS
    '由一条交接显式建立的未执行任务壳。没有调度、审批、取消、续跑或验证执行。';
COMMENT ON COLUMN eap.mission.id IS '平台生成的任务壳标识。';
COMMENT ON COLUMN eap.mission.handoff_id IS '关联的 eap.handoff。第一切片全表唯一，冲突后返回已有行。';
COMMENT ON COLUMN eap.mission.status IS '固定 created。本表没有完成态。';
COMMENT ON COLUMN eap.mission.execution IS '固定 not_started。本表没有执行接口。';
COMMENT ON COLUMN eap.mission.approval IS '固定 not_requested。创建任务壳不申请审批。';
COMMENT ON COLUMN eap.mission.verification IS '固定 not_requested。本表没有验证入口。';
COMMENT ON COLUMN eap.mission.grant_state IS '固定 none。创建任务壳不产生授权。';
COMMENT ON COLUMN eap.mission.created_at IS '任务壳建立时间。';
