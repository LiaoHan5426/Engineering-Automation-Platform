-- V26 was already applied by the local development service; preserve its checksum.
COMMENT ON COLUMN eap.tool_execution.id IS '平台生成的调用标识，同一次调用的所有预检与进程归属此记录。';
COMMENT ON COLUMN eap.tool_execution.workspace_path IS '服务端授权工作区的规范实路径，用于读取隔离与在途互锁。';
COMMENT ON COLUMN eap.tool_execution.program_id IS '受控操作所属的本地程序，本切片固定为 git。';
COMMENT ON COLUMN eap.tool_execution.capability_id IS '稳定操作能力标识，本切片固定为 git-status。';
COMMENT ON COLUMN eap.tool_execution.created_at IS '调用持久化创建时间，用于历史排序。';
