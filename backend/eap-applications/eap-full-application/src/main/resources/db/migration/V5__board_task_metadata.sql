-- Metadata only; previously applied V2-V4 remain unchanged.
COMMENT ON TABLE eap.board_task IS 'Project-scoped task preparation; execution and acceptance require separate evidence';
COMMENT ON COLUMN eap.board_task.id IS 'Stable task identifier';
COMMENT ON COLUMN eap.board_task.project_id IS 'Local project scope; not a repository access grant';
COMMENT ON COLUMN eap.board_task.title IS 'Task display title';
COMMENT ON COLUMN eap.board_task.column_id IS 'Saved board state; only planned and ready can be changed by preparation APIs';
COMMENT ON COLUMN eap.board_task.notes IS 'Supplementary user notes';
COMMENT ON COLUMN eap.board_task.session_id IS 'Optional conversation reference; does not start or restore a session';
COMMENT ON COLUMN eap.board_task.revision IS 'Optimistic concurrency version, incremented once per changed update';
COMMENT ON COLUMN eap.board_task.events IS 'Ordered preparation activity labels, not execution evidence';
COMMENT ON COLUMN eap.board_task.created_at IS 'Task creation timestamp';
COMMENT ON COLUMN eap.board_task.priority IS 'User-selected priority: none, p0, p1 or p2';
COMMENT ON COLUMN eap.board_task.goal IS 'Task goal; blank is incomplete preparation';
COMMENT ON COLUMN eap.board_task.acceptance_criteria IS 'Human-readable checkable acceptance criteria; not an acceptance result';
COMMENT ON COLUMN eap.board_task.request_id IS 'Client creation request identity, unique within the project';
COMMENT ON COLUMN eap.board_task.request_fingerprint IS 'SHA-256 of the original normalized create request, stable across later edits';
