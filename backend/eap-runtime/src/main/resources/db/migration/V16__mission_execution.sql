ALTER TABLE eap.mission DROP CONSTRAINT mission_execution_not_started;
ALTER TABLE eap.mission ADD CONSTRAINT mission_execution_projection CHECK (
    execution IN ('not_started', 'running', 'cancelling', 'succeeded', 'failed', 'timed_out', 'cancelled', 'interrupted')
);
COMMENT ON COLUMN eap.mission.execution IS '最近一次只读执行的投影。权威状态在 mission_execution，本列不能由请求指定。';

CREATE TABLE eap.mission_execution (
    id uuid PRIMARY KEY,
    mission_id uuid NOT NULL REFERENCES eap.mission (id),
    status varchar(32) NOT NULL,
    capability varchar(64) NOT NULL,
    principal varchar(64) NOT NULL,
    workspace_path text NOT NULL,
    workspace_label varchar(64) NOT NULL,
    executable text NOT NULL,
    policy_snapshot text NOT NULL,
    os_pid bigint,
    process_started_at timestamptz,
    process_user text,
    process_executable text,
    started_at timestamptz NOT NULL,
    finished_at timestamptz,
    exit_code integer,
    stdout text,
    stderr text,
    exit_evidence text,
    unconfirmed_reason text,
    cancel_requested boolean NOT NULL DEFAULT false,
    approval varchar(32) NOT NULL,
    created_at timestamptz NOT NULL,
    CONSTRAINT mission_execution_status CHECK (status IN (
        'CREATED', 'RUNNING', 'CANCELLING', 'SUCCEEDED', 'FAILED', 'REJECTED', 'TIMED_OUT', 'CANCELLED', 'INTERRUPTED'
    )),
    CONSTRAINT mission_execution_capability CHECK (capability = 'git-status'),
    CONSTRAINT mission_execution_principal CHECK (principal = 'local-operator'),
    CONSTRAINT mission_execution_approval CHECK (approval = 'NOT_REQUIRED'),
    CONSTRAINT mission_execution_terminal_evidence CHECK (
        status NOT IN ('CANCELLED', 'INTERRUPTED')
        OR (exit_evidence IS NOT NULL AND length(btrim(exit_evidence)) > 0)
    )
);

CREATE UNIQUE INDEX mission_execution_one_open
    ON eap.mission_execution (mission_id)
    WHERE status IN ('CREATED', 'RUNNING', 'CANCELLING');

COMMENT ON TABLE eap.mission_execution IS 'Mission 的一次只读 git-status。进程成功不表示任务壳完成。';
COMMENT ON COLUMN eap.mission_execution.id IS '交给 runManaged 的执行号，同一次启动不再另编号。';
COMMENT ON COLUMN eap.mission_execution.mission_id IS '所属任务壳。';
COMMENT ON COLUMN eap.mission_execution.status IS '执行状态。CANCELLED 与 INTERRUPTED 必须带进程退出证据。';
COMMENT ON COLUMN eap.mission_execution.capability IS '固定为 git-status。';
COMMENT ON COLUMN eap.mission_execution.principal IS '服务端常量 local-operator，不来自请求。';
COMMENT ON COLUMN eap.mission_execution.workspace_path IS '启动时服务端工作区实路径。';
COMMENT ON COLUMN eap.mission_execution.workspace_label IS '工作区显示标签，不是路径或授权。';
COMMENT ON COLUMN eap.mission_execution.executable IS 'git-status 通道解析出的可执行文件。';
COMMENT ON COLUMN eap.mission_execution.policy_snapshot IS '放行时的服务端策略快照，不是 grant_state。';
COMMENT ON COLUMN eap.mission_execution.os_pid IS '进程号。单独出现不能当作销毁依据。';
COMMENT ON COLUMN eap.mission_execution.process_started_at IS '该进程的启动时间，用于核对进程号是否被复用。';
COMMENT ON COLUMN eap.mission_execution.process_user IS '操作系统用户。';
COMMENT ON COLUMN eap.mission_execution.process_executable IS '进程可执行文件路径。';
COMMENT ON COLUMN eap.mission_execution.started_at IS '执行行开始时间。';
COMMENT ON COLUMN eap.mission_execution.finished_at IS '终态写入时间。';
COMMENT ON COLUMN eap.mission_execution.exit_code IS '进程退出码。';
COMMENT ON COLUMN eap.mission_execution.stdout IS '脱敏后的标准输出。';
COMMENT ON COLUMN eap.mission_execution.stderr IS '脱敏后的标准错误。';
COMMENT ON COLUMN eap.mission_execution.exit_evidence IS '进程退出或确认不存在的证据。取消和中断终态不能为空。';
COMMENT ON COLUMN eap.mission_execution.unconfirmed_reason IS '身份或退出证据不足时的原因。此时状态保持在途。';
COMMENT ON COLUMN eap.mission_execution.cancel_requested IS '是否收到过取消请求。后到的取消不覆盖已有退出终态。';
COMMENT ON COLUMN eap.mission_execution.approval IS '固定 NOT_REQUIRED，不能写成 APPROVED。';
COMMENT ON COLUMN eap.mission_execution.created_at IS '执行行创建时间。';
