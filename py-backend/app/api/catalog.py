"""Catalog HTTP surface shared with `@eap/runtime-client`."""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.problem import problem
from app.catalog.service import CatalogError, CatalogService, data_layout, trusted_tools

router = APIRouter()


def _catalog(request: Request) -> CatalogService:
    return request.app.state.catalog


def _run(action):
    try:
        return action()
    except CatalogError as exc:
        return problem(exc.status, exc.code, exc.detail)


@router.get("/runtime/trusted-tools")
def runtime_trusted_tools():
    return trusted_tools()


@router.get("/runtime/data-layout")
def runtime_data_layout(request: Request):
    return data_layout(request.app.state.settings)


@router.get("/capabilities")
def capabilities(request: Request):
    return _catalog(request).capabilities()


@router.get("/databases")
def databases(request: Request):
    return _catalog(request).list_databases()


@router.get("/databases/{profile_id}")
def database(profile_id: str, request: Request):
    return _run(lambda: _catalog(request).get_database(profile_id))


@router.post("/databases")
def create_database(body: dict, request: Request):
    return _run(
        lambda: _catalog(request).save_database(
            None,
            body.get("label"),
            body.get("engine"),
            body.get("environment"),
            body.get("metadata") if "metadata" in body else {},
        )
    )


@router.put("/databases/{profile_id}")
def update_database(profile_id: str, body: dict, request: Request):
    return _run(
        lambda: _catalog(request).save_database(
            profile_id,
            body.get("label"),
            body.get("engine"),
            body.get("environment"),
            body.get("metadata") if "metadata" in body else {},
        )
    )


@router.delete("/databases/{profile_id}")
def delete_database(profile_id: str, request: Request):
    return _run(lambda: _catalog(request).delete_database(profile_id))


@router.get("/experts")
def experts(request: Request):
    return _catalog(request).list_experts()


@router.get("/experts/catalog")
def expert_catalog(request: Request):
    return _catalog(request).expert_catalog()


@router.post("/experts/validate")
def validate_expert(body: dict, request: Request):
    return _catalog(request).validate_expert(body.get("id"), body.get("name"), body.get("manifest"))


@router.post("/experts")
def save_expert(body: dict, request: Request):
    return _run(
        lambda: _catalog(request).save_expert(body.get("id"), body.get("name"), body.get("manifest"))
    )


@router.put("/experts/{expert_id}/activation")
def activate_expert(expert_id: str, body: dict, request: Request):
    return _run(lambda: _catalog(request).set_expert_activation(expert_id, body.get("enabled")))


@router.get("/tasks")
def tasks():
    return {"items": []}


@router.get("/stats")
def stats(request: Request, windowDays: int = 7):
    return _run(lambda: _catalog(request).stats(windowDays))


@router.get("/knowledge")
def knowledge(request: Request):
    return _catalog(request).list_knowledge()


@router.post("/knowledge")
def create_knowledge(body: dict, request: Request):
    return _run(
        lambda: _catalog(request).create_knowledge_base(body.get("name"), body.get("description") or "")
    )


@router.put("/knowledge/{base_id}")
def rename_knowledge(base_id: str, body: dict, request: Request):
    return _run(
        lambda: _catalog(request).rename_knowledge_base(
            base_id, body.get("name"), body.get("description") or ""
        )
    )


@router.delete("/knowledge/{base_id}")
def delete_knowledge(base_id: str, request: Request):
    return _run(lambda: _catalog(request).delete_knowledge_base(base_id))


@router.get("/knowledge/search")
def search_knowledge(request: Request, q: str = "", baseId: str | None = None):
    return _catalog(request).search_knowledge(q, baseId)


@router.get("/knowledge/{base_id}/documents")
def knowledge_documents(base_id: str, request: Request):
    return _run(lambda: _catalog(request).list_documents(base_id))


@router.post("/knowledge/{base_id}/documents")
def add_document(base_id: str, body: dict, request: Request):
    return _run(
        lambda: _catalog(request).add_document(base_id, body.get("title"), body.get("content") or "")
    )


@router.put("/knowledge/{base_id}/documents/{document_id}")
def update_document(base_id: str, document_id: str, body: dict, request: Request):
    return _run(
        lambda: _catalog(request).update_document(
            base_id,
            document_id,
            body.get("title"),
            body.get("content") or "",
            body.get("expectedHash") or "",
        )
    )


@router.delete("/knowledge/{base_id}/documents/{document_id}")
def delete_document(base_id: str, document_id: str, request: Request):
    return _run(lambda: _catalog(request).delete_document(base_id, document_id))


@router.get("/rule-packs")
def rule_packs(request: Request):
    return _catalog(request).list_rule_packs()


@router.get("/rule-packs/vocabulary")
def rule_vocabulary():
    return {"facts": [], "operators": [], "producers": []}


@router.post("/rule-packs/validate")
def validate_rule_pack(body: dict, request: Request):
    return _catalog(request).validate_rule_pack(body.get("manifest"))


@router.post("/rule-packs")
def create_rule_pack(body: dict, request: Request):
    return _run(lambda: _catalog(request).create_rule_pack(body.get("name"), body.get("manifest")))


@router.get("/rule-packs/{pack_id}")
def rule_pack(pack_id: str, request: Request):
    return _run(lambda: _catalog(request).get_rule_pack(pack_id))


@router.put("/rule-packs/{pack_id}")
def update_rule_pack(pack_id: str, body: dict, request: Request):
    return _run(
        lambda: _catalog(request).update_rule_pack(pack_id, body.get("name"), body.get("manifest"))
    )


@router.put("/rule-packs/{pack_id}/activation")
def activate_rule_pack(pack_id: str, body: dict, request: Request):
    return _run(lambda: _catalog(request).set_rule_activation(pack_id, body.get("enabled")))


@router.delete("/rule-packs/{pack_id}")
def delete_rule_pack(pack_id: str, request: Request):
    return _run(lambda: _catalog(request).delete_rule_pack(pack_id))


@router.get("/mcp-servers")
def mcp_servers(request: Request):
    return _catalog(request).mcp_servers()


@router.post("/mcp-servers")
def create_mcp(body: dict, request: Request):
    return _run(lambda: _catalog(request).save_mcp(body))


@router.put("/mcp-servers/{server_id}")
def update_mcp(server_id: str, body: dict, request: Request):
    return _run(lambda: _catalog(request).save_mcp(body, server_id=server_id))


@router.put("/mcp-servers/{server_id}/activation")
def activate_mcp(server_id: str, body: dict, request: Request):
    return _run(
        lambda: _catalog(request).set_mcp_activation(
            server_id, body.get("enabled"), body.get("trusted")
        )
    )


@router.delete("/mcp-servers/{server_id}")
def delete_mcp(server_id: str, request: Request):
    return _run(lambda: _catalog(request).delete_mcp(server_id))


@router.post("/mcp-servers/{server_id}/probe")
def probe_mcp(server_id: str, request: Request):
    return _run(lambda: _catalog(request).probe_mcp(server_id))


@router.get("/skills")
def skills(request: Request):
    return _catalog(request).list_skills()


@router.post("/skills/preview")
def preview_skill(body: dict, request: Request):
    return _run(lambda: _catalog(request).preview_skill(body))


@router.post("/skills")
def save_skill(body: dict, request: Request):
    return _run(lambda: _catalog(request).save_skill(body))


@router.get("/skills/{skill_id}/versions/{version}")
def skill(skill_id: str, version: str, request: Request):
    return _run(lambda: _catalog(request).get_skill(skill_id, version))


@router.post("/skills/{skill_id}/versions/{version}/activation")
def activate_skill(skill_id: str, version: str, body: dict, request: Request):
    return _run(
        lambda: _catalog(request).set_skill_activation(
            skill_id, version, body.get("enabled"), body.get("stateRevision")
        )
    )


@router.get("/scenarios/workflows/prototype-to-code/dependencies")
def scenario_workflow_dependencies():
    from datetime import datetime, timezone

    return {
        "contractVersion": 1,
        "workflow": "prototype-to-code",
        "observedAt": datetime.now(timezone.utc).isoformat(),
        "plugins": [
            {"id": "builder", "required": True},
            {"id": "board", "required": False},
        ],
        "services": [{"id": "prototype-versions", "state": "READABLE"}],
        "resources": [{"id": "prototype-version", "required": True, "count": 0}],
    }


@router.get("/prototype-versions")
def prototype_versions(sourceRef: str = ""):
    if sourceRef not in {"builder-alpha", "builder-beta"}:
        return problem(400, "INVALID_PROTOTYPE_SOURCE", "sourceRef must be builder-alpha or builder-beta")
    return {"items": []}


@router.get("/scenarios")
def scenarios(request: Request):
    return _catalog(request).list_scenarios()


@router.get("/scenarios/{scenario_id}")
def scenario(scenario_id: str, request: Request):
    return _run(lambda: _catalog(request).get_scenario(scenario_id))


@router.put("/scenarios/{scenario_id}")
def save_scenario(scenario_id: str, body: dict, request: Request):
    return _run(
        lambda: _catalog(request).save_scenario(
            scenario_id, body.get("revision"), body.get("definition")
        )
    )


@router.delete("/scenarios/{scenario_id}")
def delete_scenario(scenario_id: str, request: Request, revision: int):
    return _run(lambda: _catalog(request).delete_scenario(scenario_id, revision))
