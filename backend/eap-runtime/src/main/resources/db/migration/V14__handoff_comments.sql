COMMENT ON COLUMN eap.handoff.id IS '交接标识。重新记录会新增一行，不覆盖旧行。';
COMMENT ON COLUMN eap.handoff.source IS '来源只能是 chat 或 builder。';
COMMENT ON COLUMN eap.handoff.source_ref IS '来源标签，例如会话 id、draft、builder-alpha。不是路径，也不是授权。';
COMMENT ON COLUMN eap.handoff.summary IS '操作者本次提交的文本，入库前脱敏。';
COMMENT ON COLUMN eap.handoff.status IS '固定 recorded。没有后续状态机。';
COMMENT ON COLUMN eap.handoff.approval IS '固定 not_requested。记录交接不是审批。';
COMMENT ON COLUMN eap.handoff.created_at IS '记录时刻。';
