# Agent guidance

This project is deterministic-first, LLM-last. Prefer local capabilities (Git, SVN, ripgrep, shell, Maven) and use an external coding agent only when deterministic capabilities cannot reliably complete the task.

The repository is multi-language: `backend/` is a Java/Maven reactor with `eap-api` and `eap-runtime`; `frontend/` is a Vue monorepo managed by Vite+ with `apps/*` and `packages/*`; `scripts/` may contain Python utilities. Do not put backend build files at repository root.

**External agent output is observation, not truth.** The platform must independently inspect VCS diff, rebuild, rerun tests, and verify the modification scope before accepting completion.

Keep capabilities bounded, observable, testable, and free of hidden network or filesystem side effects.

## Working contract

- Start with `git status`, relevant implementation, tests and configuration. Preserve existing local changes. Current user instructions define scope; documents describe targets, while code and reproducible tests establish implementation facts. Record conflicts.
- Prototype tasks: provide clickable, explicitly simulated interactions and obtain interaction acceptance before production integration. Architecture tasks: deliver evidence, boundaries and a staged plan before major changes. Approved feature tasks: implement the smallest verifiable slice. Bug fixes: reproduce, fix the cause, run relevant regression checks.
- Apply KISS, YAGNI, DRY and SOLID through incremental reuse. Do not create parallel capability registries or replace the stack without demonstrated need and authorization.
- Read `backend/AGENTS.md` or `frontend/AGENTS.md` for the affected module; agents without hierarchical loading must read these explicitly. Detailed acceptance criteria and verified command locations are in `docs/agent-development-guide.md`.
- LLM-last permits real model or external-agent calls when reasoning requires them. Treat their output as evidence requiring independent scope, diff, build and test verification.
- Do not overwrite user changes, perform destructive operations, write outside the authorized repository, push or merge without authorization. Inspect the target checkout before delegating writes; prefer an isolated worktree when implementation needs it.
- Run checks appropriate to the change. Report passed, failed, skipped and unverified separately. Configuration, HTTP success, compilation and mock interaction never establish business completion.
- Deliver changed files and reasons, retained/replaced implementations, exact validation commands and results, remaining risks, next steps and decisions requiring confirmation. Save files as UTF-8 without BOM.
