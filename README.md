# Engineering Automation Platform

A cross-platform engineering automation platform with a Vue frontend and a Java backend. Python is reserved for auxiliary scripts and tooling, not the primary runtime.

## Repository layout

```text
frontend/   Vue 3 / TypeScript monorepo managed by Vite+
backend/    Java 25 / Spring Boot / Maven multi-module runtime
scripts/    Optional Python tooling and automation helpers
docs/       Architecture and roadmap
```

## First phase

```text
Workspace -> Capability SPI -> Capability Registry -> Process Executor
                                      |-> Git detect/status/diff
                                      |-> ripgrep search
                         -> Structured Observation -> Validation -> CLI
```

The runtime deliberately has no Spring AI or LLM dependency in this phase. External agent providers and planning/supervision are future extensions.

## Build and run

Requires JDK 25 and Maven 3.9+.

```shell
cd backend
mvn test
mvn package
java -cp target/classes com.lh.eap.cli.Main status .
```

Frontend commands use Vite+ from the `frontend/` workspace:

```shell
vp install
vp check
vp build
vp dev

# Remove node_modules, caches and build output, then reinstall dependencies
pnpm clean
pnpm install
```

Licensed under Apache-2.0.
