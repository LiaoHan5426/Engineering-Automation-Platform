ALTER TABLE eap.tool_execution DROP CONSTRAINT tool_execution_status_check;
ALTER TABLE eap.tool_execution ADD CONSTRAINT tool_execution_status_check CHECK (status IN
    ('CREATED','RUNNING','CANCELLING','SUCCEEDED','FAILED','REJECTED','TIMED_OUT','CANCELLED','UNKNOWN','CLOSED_UNKNOWN'));
ALTER TABLE eap.tool_execution ADD CONSTRAINT tool_execution_manual_closure_check CHECK (
    CASE WHEN status = 'CLOSED_UNKNOWN' THEN
        COALESCE(jsonb_typeof(snapshot->'resolution') = 'object'
            AND snapshot->'resolution'->>'operator' = 'local-operator'
            AND snapshot->'resolution'->'processTreeStopped' = 'true'::jsonb
            AND length(snapshot->'resolution'->>'note') BETWEEN 1 AND 2000
            AND snapshot->'resolution'->>'requestId' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
            AND snapshot->'resolution'->>'requestDigest' ~ '^[a-f0-9]{64}$'
            AND length(snapshot->'resolution'->>'resolvedAt') > 0, false)
    ELSE snapshot->'resolution' IS NULL OR snapshot->'resolution' = 'null'::jsonb END
);
COMMENT ON COLUMN eap.tool_execution.status IS
    'UNKNOWN阻塞同操作；CLOSED_UNKNOWN为人工核对后关闭阻塞，原执行结果仍未知，不等于成功/取消或进程退出证明。';
COMMENT ON COLUMN eap.tool_execution.snapshot IS
    '脱敏有界执行证据及独立resolution人工核对记录；关闭保留原输出、步骤、未知原因及退出字段。';
