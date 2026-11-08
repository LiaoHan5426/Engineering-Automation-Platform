ALTER TABLE eap.board_task
    ADD COLUMN priority varchar(8) NOT NULL DEFAULT 'none'
    CHECK (priority IN ('none', 'p0', 'p1', 'p2'));
