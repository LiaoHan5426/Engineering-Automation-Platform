CREATE TABLE eap.tool_execution (
    id uuid PRIMARY KEY,
    request_id uuid NOT NULL,
    workspace_path text NOT NULL,
    program_id text NOT NULL CHECK (program_id = 'git'),
    capability_id text NOT NULL CHECK (capability_id = 'git-status'),
    status text NOT NULL CHECK (status IN
        ('CREATED','RUNNING','CANCELLING','SUCCEEDED','FAILED','REJECTED','TIMED_OUT','CANCELLED','UNKNOWN')),
    snapshot jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_path, request_id),
    CHECK (snapshot->>'id' = id::text AND snapshot->>'status' = status
        AND snapshot->>'workspacePath' = workspace_path
        AND snapshot->>'programId' = program_id AND snapshot->>'capabilityId' = capability_id)
);
CREATE UNIQUE INDEX tool_execution_one_open ON eap.tool_execution(workspace_path, capability_id)
    WHERE status IN ('CREATED','RUNNING','CANCELLING','UNKNOWN');
CREATE INDEX tool_execution_history ON eap.tool_execution(workspace_path, created_at DESC);
COMMENT ON TABLE eap.tool_execution IS '受控工具操作的持久执行与退出证据；不归属虚构 Mission。';
COMMENT ON COLUMN eap.tool_execution.request_id IS '当前工作区内的启动去重标识，不授予执行权限。';
COMMENT ON COLUMN eap.tool_execution.snapshot IS '脱敏且有界的绑定、子步骤、取消意图和退出证据快照。';
COMMENT ON COLUMN eap.tool_execution.status IS 'UNKNOWN 保留并阻止重复启动；取消请求不等于确认取消。';
