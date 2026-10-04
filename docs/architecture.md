# Architecture

The repository has three independently buildable areas: a Vue/Vite frontend for cross-platform interaction, a Spring Boot Java backend for the runtime, and optional Python scripts for maintenance or data-processing tasks. The frontend communicates with backend APIs; it does not own capability execution.

## Technology decisions

- Backend: Java 25, Spring Boot 4.1.x, Maven, Spring MVC, embedded Tomcat, Jackson, Actuator and JUnit 5. The server is a local single-machine process started with `mvn spring-boot:run` or `java -jar`; Docker, Kubernetes and Spring Cloud are out of scope.
- Frontend: Vue 3, TypeScript, Vite+, pnpm workspace, Tailwind CSS 4 through the Vite plugin, and Stylelint through the reusable `@eap/stylelint-config` package in `frontend/internal/stylelint-config`.
- Frontend linting: Vite+ remains responsible for TypeScript/Vue lint and formatting; Stylelint is responsible for CSS and Vue SFC style blocks. The frontend root `clean` script uses Node's filesystem API to remove dependencies, caches and build output because Vite+ does not provide the required clean-and-reinstall workflow.

The runtime is a Spring Boot application in `eap-runtime` and exposes HTTP APIs through Spring MVC. The runtime exposes small synchronous capabilities through a stable SPI. A `Capability` receives an `ExecutionContext` and returns an immutable `Observation`; it does not claim that an observation is correct beyond what it measured.

`ProcessExecutor` is the only abstraction responsible for launching local processes. Git and ripgrep capabilities build argument lists without shell interpolation, making command execution deterministic and inspectable. `CapabilityRegistry` provides explicit name-to-capability lookup.

Validation is intentionally independent from capability output. Later phases can add a validator that reads the VCS diff and reruns build/test commands, including after a CodingAgentProvider response.

Future flow: `Goal -> Planner -> Task -> Capability -> Observation -> Supervisor -> Evaluate -> Replan / Escalate / Complete`.
