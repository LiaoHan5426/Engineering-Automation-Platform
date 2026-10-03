# Agent guidance

This project is deterministic-first, LLM-last. Prefer local capabilities (Git, SVN, ripgrep, shell, Maven) and use an external coding agent only when deterministic capabilities cannot reliably complete the task.

The repository is multi-language: `backend/` is a Java/Maven reactor with `eap-api` and `eap-runtime`; `frontend/` is a Vue monorepo managed by Vite+ with `apps/*` and `packages/*`; `scripts/` may contain Python utilities. Do not put backend build files at repository root.

**External agent output is observation, not truth.** The platform must independently inspect VCS diff, rebuild, rerun tests, and verify the modification scope before accepting completion.

Keep capabilities bounded, observable, testable, and free of hidden network or filesystem side effects.
