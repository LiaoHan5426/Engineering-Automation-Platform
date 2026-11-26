"""Intersect a dsh-personal upstream plan with the EAP import closure."""

import argparse
import json
from pathlib import Path


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def report(plan: dict, imports: dict) -> dict:
    if plan["B"] != imports["acceptedUpstreamCommit"]:
        raise ValueError("The upstream plan does not start at the EAP accepted baseline")
    if plan["U"] != imports["pendingUpstreamCommit"]:
        raise ValueError("The upstream plan does not match the EAP candidate commit")
    incremental = plan["incremental"]
    packages = {entry["name"]: entry for entry in incremental["packages"]}
    direct = {entry["npm"] for entry in imports["packages"]}
    paths = {entry["path"].removeprefix("dsh-personal/") for entry in imports["packages"]}
    closure = set(direct)
    pending = list(direct)
    while pending:
        package = packages.get(pending.pop())
        if package is not None:
            additional = (set(package["dependencies"]) & packages.keys()) - closure
            closure.update(additional)
            pending.extend(additional)

    changes = []
    for change in incremental["changes"]:
        sides = (change["path"], change.get("oldPath", change["path"]))
        explicit_match = any(
            name == path or name.startswith(path + "/") for path in paths for name in sides
        )
        owners = {change.get("oldOwner"), change.get("newOwner")}
        if explicit_match or owners & closure:
            changes.append(change)

    return {
        "baseline": plan["B"],
        "target": plan["U"],
        "consumerCheckpoint": plan["P"]["head"],
        "upstreamEntries": len(plan["entries"]),
        "directPackages": sorted(direct),
        "transitivePackages": sorted(closure - direct),
        "missingFromUpstreamPlan": sorted(direct - packages.keys()),
        "affectedEntries": len(changes),
        "changes": changes,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--imports", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = report(read_json(args.plan), read_json(args.imports))
    except (KeyError, OSError, TypeError, ValueError) as error:
        parser.error(str(error))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
