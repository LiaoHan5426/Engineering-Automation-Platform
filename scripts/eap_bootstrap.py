#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""EAP local bootstrap guide (MVP).

Per docs/running-context.md:
  - Detect tools, write a local config template, print start/health steps.
  - Not an Agent host, not a model runtime, not multi-tenant cloud deploy.

Usage:
  python scripts/eap_bootstrap.py
  python scripts/eap_bootstrap.py --check
  python scripts/eap_bootstrap.py --write-config
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EAP_DIR = ROOT / ".eap"
CONFIG_PATH = EAP_DIR / "local-bootstrap.json"


def which(cmd: str) -> str | None:
    return shutil.which(cmd)


def run_version(cmd: list[str]) -> str:
    try:
        completed = subprocess.run(
            cmd,
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=20,
        )
        out = (completed.stdout or completed.stderr or "").strip().splitlines()
        return out[0] if out else f"exit {completed.returncode}"
    except Exception as exc:  # noqa: BLE001 — operator-facing probe
        return f"unavailable ({exc})"


def collect_checks() -> dict:
    java = which("java")
    mvn = which("mvn") or which("mvn.cmd")
    node = which("node")
    pnpm = which("pnpm")
    python = sys.executable
    return {
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "repoRoot": str(ROOT),
        "tools": {
            "python": {"path": python, "version": run_version([python, "--version"])},
            "java": {"path": java, "version": run_version(["java", "-version"]) if java else None},
            "mvn": {"path": mvn, "version": run_version([mvn, "-v"]) if mvn else None},
            "node": {"path": node, "version": run_version(["node", "-v"]) if node else None},
            "pnpm": {"path": pnpm, "version": run_version(["pnpm", "-v"]) if pnpm else None},
        },
        "defaults": {
            "uiUrl": "http://127.0.0.1:5173/",
            "apiHealth": "http://127.0.0.1:8080/api/health",
            "notes": [
                "Java local service is the product runtime; Python only guides install/start.",
                "Do not treat this script as an Agent host or model credential store.",
                "Electron shell: pnpm --dir frontend --filter @eap/desktop dev (after UI is up).",
            ],
        },
    }


def write_config(payload: dict) -> Path:
    EAP_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return CONFIG_PATH


def print_report(payload: dict) -> int:
    tools = payload["tools"]
    missing = [name for name, row in tools.items() if name != "python" and not row.get("path")]
    print("EAP local bootstrap (MVP) — not an Agent host")
    print(f"repo: {payload['repoRoot']}")
    for name, row in tools.items():
        path = row.get("path") or "MISSING"
        version = row.get("version") or "—"
        print(f"  {name:6} {path} · {version}")
    print()
    print("Suggested next steps:")
    print("  1) Start local Java service from IDEA or: mvn -f backend/pom.xml -pl eap-runtime spring-boot:run")
    print("  2) Start UI: pnpm --dir frontend --filter @eap/web dev")
    print("  3) Optional desktop shell: pnpm --dir frontend --filter @eap/desktop dev")
    print(f"  4) Health: GET {payload['defaults']['apiHealth']}")
    print(f"  5) UI:     {payload['defaults']['uiUrl']}")
    if missing:
        print()
        print("Missing tools (install on this machine before continuing): " + ", ".join(missing))
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="EAP local bootstrap guide (not an Agent host)")
    parser.add_argument("--check", action="store_true", help="Only print tool detection")
    parser.add_argument("--write-config", action="store_true", help=f"Write {CONFIG_PATH}")
    args = parser.parse_args(argv)
    payload = collect_checks()
    if args.write_config or not args.check:
        path = write_config(payload)
        print(f"wrote {path}")
    return print_report(payload)


if __name__ == "__main__":
    raise SystemExit(main())
