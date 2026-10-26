# Backend guidance

- Retain Java 25, Spring Boot and the Maven reactor in this directory. `eap-api` holds stable contracts without Spring/model SDK dependencies; `eap-runtime` owns application, persistence and runtime adapters.
- Verify with `rtk proxy mvn -f backend/pom.xml test` from repository root. Inspect test conditions before claiming integration coverage; environment-gated tests may skip. Never enable tests that create/drop databases against an unapproved database.
- Flyway application migrations live only in `eap-runtime/src/main/resources/db/migration`. The user-approved development reset consolidated V1-V18 into `V1__initial_schema.sql` on 2026-10-26; `backend/db` was removed. Existing development databases require an explicit reset before this baseline. Subsequent changes use incremental migrations; do not rewrite applied versions or silently clean, repair or baseline a database.
- Reuse Capability handlers/catalog/settings, Expert DAG, Rule packs, CLI program/operation registration, MCP grant/session boundaries and knowledge services. Expert DAG is static orchestration, not autonomous planning.
- CLI execution must use argument arrays, validated repository cwd, bounded output/time, redaction and propagated cancellation. A binary existing or exiting zero does not prove repository work complete.
- MCP registration/probing is not protocol execution. Require actual initialization, discovery, authorized calls and error/isolation verification before claiming support.
- Knowledge acceptance includes import, retrieval, source citation, update and deletion consistency plus expert scope denial. Evaluate retrieval quality before adding semantic infrastructure.
- Keep Skill instructions/resources separate from executable Capability and Expert workflows. Mission execution must own durable state, approval and recovery independently of request transactions or chat UI.
