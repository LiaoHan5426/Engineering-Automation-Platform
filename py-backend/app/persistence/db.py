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
    SQLModel.metadata.create_all(engine)


@contextmanager
def session_scope(engine) -> Iterator[Session]:
    with Session(engine) as session:
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
