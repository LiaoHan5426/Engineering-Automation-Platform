# Backend architecture and flow

## Module boundaries

```mermaid
flowchart TB
  UI[Vue frontend] --> API[eap-api]
  API --> Runtime[eap-runtime]
  Runtime --> Registry[CapabilityRegistry]
  Registry --> Git[Git capabilities]
  Registry --> Search[ripgrep capability]
  Registry --> Process[ProcessExecutor]
  Process --> OS[Local process / workspace]
  Runtime --> Experts[Specialist capabilities / agents]
  Experts --> Observe[Structured Observation]
  Observe --> Master[Master / Supervisor]
  Master -.fast typed triage.-> Decision[DecisionProvider / Jev]
  Master --> Validate[Independent Validation]
  Validate --> Result[Task result]
  User[User supplement] --> Master
  Runtime -.future.-> Provider[CodingAgentProvider]
  Provider -.external output as observation.-> Observe
```

`eap-api` contains stable contracts only: `Capability`, `ExecutionContext`, `Observation`, and `ProcessExecutor`. `eap-runtime` contains local execution, capability registration, CLI/API adapters, and later supervisor logic. No LLM SDK belongs in the API module.

## Deterministic execution flow

```mermaid
sequenceDiagram
  participant User
  participant API as Task API
  participant R as Runtime
  participant E as Expert
  participant C as Capability
  participant M as Master / Supervisor
  participant P as ProcessExecutor
  participant V as Validator
  participant Repo as Workspace

  User->>API: submit goal / command / context
  API->>R: create or resume task
  R->>E: assign specialist task
  E->>C: execute(args)
  C->>P: run(argv, workspace)
  P->>Repo: git / rg / shell process
  Repo-->>P: stdout, stderr, exit code
  P-->>C: raw process observation
  C-->>R: structured observation
  R->>M: collect expert result and evidence
  M->>M: compare goal, policy, scope, and peer evidence
  M->>V: request independent validation
  V->>Repo: read VCS state and rerun checks
  Repo-->>V: evidence
  V-->>M: validation result
  M-->>R: accept, reject, replan, or request user input
  User->>API: add context / correction / constraint
  API->>M: append supplement to task record
  M->>R: replan with preserved evidence
  R-->>API: complete, replan, escalate, or awaiting-user
  API-->>User: timeline and evidence
```

## State machine

```mermaid
stateDiagram-v2
  [*] --> Planned
  Planned --> Running
  Running --> ExpertReview
  ExpertReview --> Validating: Master accepts evidence
  ExpertReview --> Replanning: Master rejects / conflicts
  ExpertReview --> AwaitingUser: missing context
  AwaitingUser --> Replanning: user supplements task
  Validating --> Completed: evidence passes
  Validating --> Replanning: evidence fails
  Replanning --> Running
  Running --> Escalated: deterministic capability unavailable
  Escalated --> ExpertReview: external output received
  Completed --> [*]
```

## Master / Supervisor

The Master is a platform-owned decision layer, not another expert. It aggregates specialist observations and user supplements, then decides the next transition. It must map results to acceptance criteria, detect conflicts or out-of-scope changes, require independent validation evidence, preserve prior observations, and pause at `awaiting-user` when a safe decision cannot be inferred.

An expert may propose `done`; only the Master can emit `completed`, and only after the Validator supplies sufficient evidence.

### Optional fast decision layer

The Master may use a `DecisionProvider` such as Jev for small, typed decisions: classify task complexity, select an expert, rank retrieved evidence, decide whether a tool call needs review, or triage a validation result. Jev returns a choice, score, or probability rather than generated code, so it is a good latency/cost optimization for routing and judgment. It is not authoritative: deterministic rules and independent validation remain the final gate.

```text
Observation / candidates
        ↓
DecisionProvider (Jev or local rules)
        ↓
route / rank / confidence / needs-review
        ↓
Master policy
        ↓
Expert, Validator, Replan, or Escalate
```

Integration boundary:

```java
public interface DecisionProvider {
  Decision decide(DecisionRequest request);
}
```

The provider must be optional and fail closed. A timeout, low confidence, schema failure, or provider outage routes back to deterministic rules or asks the Master for a slower review. Never let a Jev decision bypass permission checks, blocking rules, diff inspection, build/test validation, or user authorization.

## User supplements

User additions are append-only task events. They do not erase the submitted goal or prior evidence:

```text
Task
├─ Goal v1
├─ Plan v1
├─ Expert observations
├─ Master decision: awaiting-user
├─ UserSupplement { text, constraints, attachments, author, timestamp }
└─ Plan v2 -> reuses valid evidence, invalidates affected conclusions
```

The API should expose `POST /tasks/{id}/supplements`; the response creates a new plan revision and reports which prior observations remain valid.

## Development phases

| Phase | Scope | Exit evidence |
|---|---|---|
| 1 | Capability SPI, process execution, Git status/diff, ripgrep, CLI | Unit tests and deterministic CLI output |
| 2 | Workspace safety and independent validation | Diff/build/test validator rejects false completion |
| 3 | HTTP API and task state model | Typed API can drive the same runtime as CLI |
| 4 | Frontend task timeline and evidence inspector | UI renders live observations and validation state |
| 5 | Planner, supervisor, replan, escalation | State machine tests cover complete/fail/escalate paths |
| 6 | CodingAgentProvider adapters | Provider output is revalidated before completion |

## Non-negotiable invariants

- Capability commands are argument arrays, not shell-interpolated strings.
- Every execution returns a structured observation with exit code and captured output.
- The validator reads the repository independently of the executor's claims.
- External agent output is observation, not truth.
- Scope, authorization, and changed files are visible before completion.
- Expert, knowledge-base, and rule definitions are versioned and validated before use.
- Knowledge access is deny-by-default and every retrieved source is cited.
- Rules are evaluated by the platform; experts cannot self-certify compliance.
