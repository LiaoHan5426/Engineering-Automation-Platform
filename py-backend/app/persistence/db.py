from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlmodel import Session, SQLModel, create_engine

from app.config import Settings


def make_engine(settings: Settings):
    settings.ensure_layout()
    url = f"sqlite:///{settings.db_path.as_posix()}"
    return create_engine(
        url,
        connect_args={"check_same_thread": False},
        echo=False,
    )


def init_db(engine) -> None:
    import app.catalog.models  # noqa: F401 — register catalog tables on the shared metadata
    import app.persistence.models  # noqa: F401 — conversation, board, plugin tables

    SQLModel.metadata.create_all(engine)
    with engine.begin() as conn:
        rows = conn.exec_driver_sql("PRAGMA table_info(plugin_install)").fetchall()
        names = {row[1] for row in rows}
        if names and "install_spec" not in names:
            conn.exec_driver_sql(
                "ALTER TABLE plugin_install ADD COLUMN install_spec TEXT NOT NULL DEFAULT ''"
            )
        board_columns = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(board_task)")}
        if board_columns and "create_fingerprint" not in board_columns:
            conn.exec_driver_sql("ALTER TABLE board_task ADD COLUMN create_fingerprint TEXT NOT NULL DEFAULT ''")
        conversation = conn.exec_driver_sql("PRAGMA table_info(conversation)").fetchall()
        conversation_columns = {row[1] for row in conversation}
        if conversation_columns and "model_history_floor" not in conversation_columns:
            conn.exec_driver_sql(
                "ALTER TABLE conversation ADD COLUMN model_history_floor INTEGER NOT NULL DEFAULT 0"
            )
        if conversation_columns and "working_memory_json" not in conversation_columns:
            conn.exec_driver_sql(
                "ALTER TABLE conversation ADD COLUMN working_memory_json TEXT NOT NULL DEFAULT ''"
            )


@contextmanager
def session_scope(engine) -> Iterator[Session]:
    with Session(engine, expire_on_commit=False) as session:
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
