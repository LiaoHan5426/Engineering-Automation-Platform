# Architecture

The repository has three independently buildable areas: a Vue/Vite frontend for cross-platform interaction, a Java backend for the runtime, and optional Python scripts for maintenance or data-processing tasks. The frontend communicates with backend APIs; it does not own capability execution.

The runtime exposes small synchronous capabilities through a stable SPI. A `Capability` receives an `ExecutionContext` and returns an immutable `Observation`; it does not claim that an observation is correct beyond what it measured.

`ProcessExecutor` is the only abstraction responsible for launching local processes. Git and ripgrep capabilities build argument lists without shell interpolation, making command execution deterministic and inspectable. `CapabilityRegistry` provides explicit name-to-capability lookup.

Validation is intentionally independent from capability output. Later phases can add a validator that reads the VCS diff and reruns build/test commands, including after a CodingAgentProvider response.

Future flow: `Goal -> Planner -> Task -> Capability -> Observation -> Supervisor -> Evaluate -> Replan / Escalate / Complete`.
