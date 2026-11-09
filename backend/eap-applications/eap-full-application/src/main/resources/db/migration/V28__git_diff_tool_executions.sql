ALTER TABLE eap.tool_execution
    DROP CONSTRAINT tool_execution_capability_id_check;
ALTER TABLE eap.tool_execution
    ADD CONSTRAINT tool_execution_capability_id_check
    CHECK (capability_id IN ('git-status', 'git-diff'));
COMMENT ON COLUMN eap.tool_execution.capability_id IS
    '内置只读 git-status 或 git-diff；在途及 UNKNOWN 按工作区和操作互锁。';
