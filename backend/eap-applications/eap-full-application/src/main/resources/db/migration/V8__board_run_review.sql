ALTER TABLE eap.board_task_run ADD COLUMN review_snapshot jsonb;
COMMENT ON COLUMN eap.board_task_run.review_snapshot IS 'One immutable, server-collected repository review captured after this Run; includes capture time, redacted diff and whitespace-check evidence, not implementation attribution or acceptance';
