from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.connections import router as connections_router
from app.api.conversations import router as conversations_router
from app.api.problem import unhandled_error_handler
from app.config import Settings, get_settings
from app.persistence.connections import ConnectionStore
from app.persistence.db import init_db, make_engine
from app.persistence.execution_journal import ExecutionJournal
from app.services.chat_service import ChatService
from app.services.tools.registry import CapabilityRegistry


def create_app(
    settings: Settings | None = None,
    *,
    offline_reply: str | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    journal = ExecutionJournal()
    # Engine/DB initialized in lifespan (and eagerly below for TestClient without lifespan race).
    engine_holder: dict[str, object] = {"engine": None}

    def _bootstrap() -> None:
        if engine_holder["engine"] is not None:
            return
        settings.ensure_layout()
        engine = make_engine(settings)
        init_db(engine)
        engine_holder["engine"] = engine
        connections = ConnectionStore(settings)
        tools = CapabilityRegistry(settings.workspace_root)
        app.state.settings = settings
        app.state.engine = engine
        app.state.journal = journal
        app.state.connections = connections
        app.state.chat_service = ChatService(
            settings=settings,
            engine=engine,
            journal=journal,
            connections=connections,
            tools=tools,
            offline_reply=offline_reply,
        )

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        _bootstrap()
        yield
        journal.mark_unknown_on_shutdown()

    app = FastAPI(title="EAP py-backend", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://127.0.0.1:5173",
            "http://localhost:5173",
            "http://127.0.0.1:5174",
            "http://localhost:5174",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # Eager bootstrap so TestClient and import-time app work without waiting for lifespan.
    _bootstrap()

    @app.get("/api/health")
    def health():
        return {
            "status": "ok",
            "host": "py-backend",
            "db": str(settings.db_path),
        }

    app.include_router(conversations_router, prefix="/api")
    app.include_router(connections_router, prefix="/api")
    app.add_exception_handler(Exception, unhandled_error_handler)
    return app


app = create_app()


def main() -> None:
    import uvicorn

    settings = get_settings()
    # Import-string form is required for reload workers.
    app_dir = Path(__file__).resolve().parent
    uvicorn.run(
        "app.main:app",
        host=settings.eap_host,
        port=settings.eap_port,
        reload=settings.eap_reload,
        reload_dirs=[str(app_dir)] if settings.eap_reload else None,
    )


if __name__ == "__main__":
    main()
