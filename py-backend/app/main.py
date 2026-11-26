from __future__ import annotations

from contextlib import asynccontextmanager
from functools import partial
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.board import router as board_router
from app.api.catalog import router as catalog_router
from app.api.connections import router as connections_router
from app.api.conversations import router as conversations_router
from app.api.dsh_session import router as dsh_session_router
from app.api.dsh_workspace import router as dsh_workspace_router
from app.api.git_executions import router as git_executions_router
from app.api.local_workspace import router as local_workspace_router
from app.api.notify import router as notify_router
from app.api.plugins import router as plugins_router
from app.api.problem import unhandled_error_handler
from app.api.sidebar_gateway import router as sidebar_gateway_router
from app.application.chat import ChatService
from app.application.git_executions import GitExecutionService
from app.application.plugins import PluginService
from app.catalog.service import CatalogService
from app.config import Settings, get_settings
from app.domain.execution_journal import ExecutionJournal
from app.infrastructure.chat_conversations import SqlChatConversations
from app.infrastructure.board.store import SqlBoardTaskStore
from app.infrastructure.git_execution_store import SqlGitExecutionStore
from app.infrastructure.git_runner import LocalGitRunner
from app.infrastructure.local_workspace.changes import CHANGES_LOG
from app.infrastructure.llm_openai import fake_stream, stream_chat_completion
from app.persistence.connections import ConnectionStore
from app.persistence.db import init_db, make_engine
from app.infrastructure.plugins.host_bridge import PluginHostBridge
from app.infrastructure.plugins.installer import install_from_spec
from app.infrastructure.plugins.registry import PluginRegistry
from app.services.notify_hub import NotifyHub
from app.services.tools.registry import CapabilityRegistry


def create_app(
    settings: Settings | None = None,
    *,
    offline_reply: str | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    journal = ExecutionJournal()
    notify_hub = NotifyHub()
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
        plugin_registry = PluginRegistry(settings, engine)
        plugin_host_bridge = PluginHostBridge(
            plugin_registry, settings.workspace_root,
            write_enabled=settings.eap_local_workspace_write_enabled,
            remote_git_enabled=settings.eap_local_workspace_remote_git_enabled,
        )
        tools.bind_host_bridge(plugin_host_bridge)
        app.state.settings = settings
        app.state.notify_hub = notify_hub
        app.state.connections = connections
        app.state.catalog = CatalogService(engine)
        app.state.board_tasks = SqlBoardTaskStore(engine)
        app.state.git_executions = GitExecutionService(
            SqlGitExecutionStore(engine), LocalGitRunner(settings.workspace_root)
        )
        app.state.plugins = PluginService(
            plugin_registry, plugin_host_bridge,
            partial(install_from_spec, plugin_registry), notify_hub,
        )
        app.state.chat_service = ChatService(
            settings=settings,
            conversations=SqlChatConversations(engine),
            stream_completion=stream_chat_completion,
            offline_stream=fake_stream,
            journal=journal,
            connections=connections,
            tools=tools,
            catalog=app.state.catalog,
            record_file_read=CHANGES_LOG.record_read,
            notify_hub=notify_hub,
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
            "service": "py-backend",
            "host": "py-backend",
            "db": str(settings.db_path),
        }

    app.include_router(board_router, prefix="/api")
    app.include_router(catalog_router, prefix="/api")
    app.include_router(git_executions_router, prefix="/api")
    app.include_router(conversations_router, prefix="/api")
    app.include_router(dsh_session_router, prefix="/api")
    app.include_router(dsh_workspace_router, prefix="/api")
    app.include_router(connections_router, prefix="/api")
    app.include_router(notify_router, prefix="/api")
    app.include_router(local_workspace_router, prefix="/api")
    app.include_router(plugins_router, prefix="/api")
    app.include_router(sidebar_gateway_router)
    if settings.eap_dsh_web_dist is not None:
        dist = settings.eap_dsh_web_dist.resolve()
        if not (dist / "index.html").is_file() or not (dist / "eap-dsh/core-graph.json").is_file():
            raise ValueError("EAP_DSH_WEB_DIST must point to a built EAP DSH Web directory")
        app.mount("/", StaticFiles(directory=dist, html=True), name="dsh-web")
    app.add_exception_handler(Exception, unhandled_error_handler)
    return app


app = create_app()


def main() -> None:
    import os
    import socket

    import uvicorn
    from uvicorn.supervisors import ChangeReload

    settings = get_settings()
    # Import-string form is required for reload workers.
    app_dir = Path(__file__).resolve().parent
    # Windows drive-letter / subst roots (e.g. J:\) often miss native FS
    # events; force polling so edits under app/ actually restart the worker.
    if settings.eap_reload:
        os.environ.setdefault("WATCHFILES_FORCE_POLLING", "1")
    config = uvicorn.Config(
        "app.main:app",
        host=settings.eap_host,
        port=settings.eap_port,
        reload=settings.eap_reload,
        reload_dirs=[str(app_dir)] if settings.eap_reload else None,
        reload_delay=0.35 if settings.eap_reload else None,
    )
    server = uvicorn.Server(config)
    if not hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
        if config.should_reload:
            with config.bind_socket() as listener:
                ChangeReload(config, target=server.run, sockets=[listener]).run()
        else:
            server.run()
        return

    # Windows SO_REUSEADDR can let a second reload supervisor bind the same
    # port. Use an exclusive listener so an old worker cannot serve requests.
    family = socket.AF_INET6 if ":" in settings.eap_host else socket.AF_INET
    with socket.socket(family, socket.SOCK_STREAM) as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        listener.bind((settings.eap_host, settings.eap_port))
        listener.set_inheritable(True)
        if config.should_reload:
            ChangeReload(config, target=server.run, sockets=[listener]).run()
        else:
            server.run(sockets=[listener])


if __name__ == "__main__":
    main()
