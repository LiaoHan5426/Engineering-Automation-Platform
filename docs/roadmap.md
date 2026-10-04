# Roadmap

1. **Foundation:** Capability SPI, registry, process execution, Git and ripgrep, structured observations, CLI.
2. **Validation:** independent diff/build/test validation and workspace safety policies.
3. **Workflow:** goals, planner, tasks, supervisor, evaluation, replanning and escalation.
4. **Providers:** `CodingAgentProvider` implementations for Codex, Claude and Hermes, behind explicit policy gates.
5. **Master supervision:** aggregate expert observations, judge against acceptance criteria, request validation, and support `awaiting-user` supplements with plan revisions.
6. **Expert registry:** declarative custom experts, scoped capabilities, modification boundaries, and approval permissions.
7. **Knowledge and rules:** versioned knowledge bases with deny-by-default authorization, executable rules, and auditable rule evaluations.
8. **Expert SDK:** typed TypeScript/Node DSL that compiles to a declarative Expert Manifest; add `expert validate`, `expert preview`, and `expert test`.
9. **Sandbox execution:** only if required, add a constrained backend execution capability; keep Node REPL out of the Vue runtime.
10. **Expert authoring:** schema-backed editor, manifest preview, validation errors, version diff, and explicit permission confirmation.
11. **Desktop delivery:** shared Vue client with a Tauri 2 shell, scoped workspace access, local backend connection, native notifications, signed installers, and platform CI.
12. **Desktop portability:** define `DesktopPlatform`, implement the Tauri adapter behind it, and add adapter contract tests so Electron remains a feasible future shell replacement.
13. **Fast decision routing:** introduce optional `DecisionProvider` integration for Jev-like typed decisions, with confidence thresholds, fallback rules, audit records, and no authority over final validation.
