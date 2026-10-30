import axios from "axios";
import NProgress from "nprogress";

export type RuntimeHealth = { status: string; service: string };
/** How a capability gets things done: built-in command, local CLI, MCP tool or HTTP service. */
/**
 * What an operator can do about a capability of a given kind.
 *
 * `description` answers "what can I change here", `creation` answers "how does one come into existence".
 * Both come from the runtime so the UI never promises an edit the backend would refuse.
 */
export type CapabilityManagement = {
  id: string;
  label: string;
  description: string;
  creation: string;
  manageable: boolean;
};
export type CapabilityAvailabilityCounts = Record<string, number> & { total?: number };
export type CapabilityKindSummary = {
  id: string;
  label: string;
  description: string;
  count: number;
  /** Scope this kind is born with: platform-level or expert-level. */
  scope: string;
  scopeLabel: string;
  expertScoped: boolean;
  management: CapabilityManagement;
  manageable: boolean;
  /** A kind earns a sub-page when it can be managed or has entries. */
  visible: boolean;
  availability: CapabilityAvailabilityCounts;
};
/** A registered MCP server, as far as the platform is willing to trust it. */
export type McpServerItem = {
  id: string;
  name: string;
  transport: string;
  endpoint: string;
  trusted: boolean;
  enabled: boolean;
  usable: boolean;
  tools: string[];
  capabilities: string[];
  /** Experts granted one of its tools on activation. */
  authorisedExperts: string[];
  /** Enabled experts that depend on one of its tools. */
  enabledExperts: string[];
  /** Why it is not callable, computed rather than stored. */
  problems: string[];
};
/** Where the binary of a local CLI capability actually lives on this machine. */
export type CapabilityCliChannel = {
  binary: string;
  /** `shipped` (the handler's default) or `operator` (an override). */
  source: string;
  shipped: boolean;
  overridden: boolean;
  resolvedPath: string | null;
  found: boolean;
  availability: string;
  availabilityLabel: string;
};
export type CapabilitySetting = {
  capability: string;
  enabled: boolean;
  notes: string;
  updatedAt: string;
};
export type CapabilityItem = {
  programId?: string;
  builtin?: boolean;
  args?: string[];
  name: string;
  kind: string;
  kindLabel: string;
  management: CapabilityManagement;
  /** platform = the runtime may enable it for every expert; expert = only an expert that declared it may run it. */
  scope: string;
  scopeLabel: string;
  expertScoped: boolean;
  /** False for a capability an MCP server publishes without a handler behind it. */
  registered: boolean;
  title: string;
  summary: string;
  inputs: string[];
  grants: string[];
  executor: string;
  /** For a local CLI capability: the executable it ships with, before any override. */
  binary?: string | null;
  facts: string[];
  evidence: string[];
  readOnly: boolean;
  enabled: boolean;
  disabled: boolean;
  notes: string;
  availability: string;
  availabilityLabel: string;
  /** True only for a platform-scoped capability that is switched on and whose dependency is present. */
  globallyRunnable: boolean;
  cli?: CapabilityCliChannel;
  /** Why a published-but-unimplemented capability cannot run yet. */
  problems?: string[];
  /** Experts that were granted this expert-scoped capability on activation. */
  authorisedExperts: string[];
  /** Experts that are enabled and reference this capability. */
  usedBy: string[];
  /** Experts that reference it, including drafts. */
  declaredBy: string[];
};
export type CapabilityResponse = {
  cliPrograms?: CliProgramItem[];
  items: CapabilityItem[];
  kinds: CapabilityKindSummary[];
  capabilities: string[];
  /** Platform capabilities an expert editor may offer as an ordinary node. */
  globallyUsable: string[];
  /** Platform capabilities the operator switched off, so the editor can explain their absence. */
  disabledPlatform: string[];
  /** Capabilities that must be granted per expert; never globally enabled. */
  expertScoped: string[];
  platformScoped: string[];
  /** Expert-scoped capability ids the platform currently publishes (registered + trusted MCP servers). */
  expertScopedVocabulary: string[];
  mcpServers: McpServerItem[];
  settings: Record<string, CapabilitySetting>;
  disabledCapabilities: string[];
  scopeNotes?: Record<string, string>;
  declared: string[];
  unregistered: string[];
  undeclared: string[];
};
export type CliProbeResult = {
  capability: string;
  binary: string;
  source: string;
  resolvedPath: string | null;
  executed: boolean;
  exitCode?: number;
  success?: boolean;
  output?: string;
  message: string;
};

export type CliOperationRequest = {
  capabilityId: string;
  title: string;
  args: string[];
  description: string;
};
export type CliOperationItem = CliOperationRequest & { programId: string; builtin: boolean };
export type CliProgramRequest = { id: string; name: string; binary: string };
export type CliProgramItem = CliProgramRequest & {
  builtin: boolean;
  channel: { binary: string; source: string; resolvedPath: string | null };
  operations: CliOperationItem[];
};
export type McpProbeResult = {
  id: string;
  checked: boolean;
  transport?: string;
  target?: string;
  /** Always false until an MCP protocol client exists: a declared tool list is not a verified one. */
  verified?: boolean;
  targetResolved?: string | null;
  reachable?: boolean;
  message: string;
};
export type McpServerRequest = {
  id: string;
  name: string;
  transport: string;
  endpoint: string;
  tools: string[];
  trusted: boolean;
  enabled: boolean;
};
/**
 * Real counts behind the overview's headline figures, computed by the runtime from the task table.
 *
 * `model.share` and `deterministicShare` are null until at least one run records which route it took —
 * "no runs yet" is not the same claim as "0%", and only one of them is honest.
 */
export type TaskStatistics = {
  windowDays: number;
  tasksTotal: number;
  tasksInWindow: number;
  observationsInWindow: number;
  byStatus: Record<string, number>;
  byDecision: Record<string, number>;
  model: { recordedRuns: number; calls: number; share: number | null };
  deterministicShare: number | null;
  source: string;
  note: string;
};
export type TaskObservation = {
  capability: string;
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  metadata?: { nodeId?: string; state?: string; required?: boolean; expertId?: string };
};
export type TaskResult = {
  id: string;
  goal: string;
  status: string;
  decision: string;
  /** Which route the judgement stage took: `unverified-observation` / `skipped` / `unavailable`, or "" when the run never reached it. */
  modelEnhancement?: string;
  observations?: TaskObservation[];
  createdAt?: string;
};
export type MissionRecord = {
  id: string;
  handoffId: string;
  source: "chat" | "builder";
  sourceRef: string;
  summary: string;
  status: "created";
  execution: "not_started" | "running" | "cancelling" | "succeeded" | "failed" | "timed_out" | "cancelled" | "interrupted";
  approval: "not_requested";
  grant: "none";
  verification: "not_requested";
  createdAt?: string;
};
export type MissionExecutionRecord = {
  id: string;
  missionId: string;
  status: string;
  capability: "git-status";
  principal: "local-operator";
  exitCode?: number | null;
  exitEvidence?: string | null;
  unconfirmedReason?: string | null;
  approval: "NOT_REQUIRED";
  cancelRequested?: boolean;
};
export type PrototypeVersionRecord = {
  id: string;
  sourceRef: "builder-alpha" | "builder-beta";
  title: string;
  body: string;
  buttonPresses: number;
  interaction: string;
  acceptance: string[];
  contentHash: string;
  createdAt?: string;
};
export type PrototypeDeliveryRecord = {
  id: string;
  versionId: string;
  createdAt?: string;
};
export type HandoffRecord = {
  id: string;
  source: "chat" | "builder";
  sourceRef: string;
  summary: string;
  status: "recorded";
  execution: "not_started";
  approval: "not_requested";
  grant: "none";
  createdAt?: string;
};
export type SqlFinding = {
  code: string;
  title?: string;
  category: string;
  severity: string;
  evidence: string;
  suggestion: string;
  confidence: number;
};
export type BlockedRule = {
  rule: string;
  missingFacts: string[];
  missingCapabilities: string[];
};
export type RuleCapabilityCheck = {
  id: string;
  required: string[];
  met: boolean;
  missing: string[];
};
export type DeterministicAnalysis = {
  parseStatus?: string;
  statementType?: string;
  normalizedSql?: string;
  engineVersion?: string;
  findings?: SqlFinding[];
  rulesFired?: string[];
  blockedRules?: BlockedRule[];
  ruleCapabilities?: RuleCapabilityCheck[];
  suggestions?: string[];
  tables?: string[];
  joinKeys?: string[];
  joinColumns?: Array<Record<string, string>>;
  severityCounts?: Record<string, number>;
  complexity?: number;
  deterministicConfidence?: number;
  requiresModelReview?: boolean;
  summary?: string;
  error?: string;
  facts?: Record<string, unknown>;
};
export type RulePackSummary = {
  id: string;
  name: string;
  description?: string | null;
  version?: number | null;
  ruleCount: number;
  shipped: boolean;
  editable: boolean;
  enabled: boolean;
  revision: number;
  /** Capabilities this pack needs in order to produce findings. */
  requires?: string[];
  requiredFacts?: string[];
};
export type RuleRequirements = { declared: string[]; derived: string[]; facts?: string[] };
/** A saved pack's detail: the manifest as text, plus whether the editor may change it. */
export type RulePackDetail = {
  manifest: string;
  shipped: boolean;
  editable: boolean;
  requirements?: RuleRequirements;
};
/** What the backend says about a candidate manifest — the same checks that gate a save. */
export type RuleValidation = { valid: boolean; errors: string[]; requirements?: RuleRequirements };
export type RulePackWriteResult = { id: string; revision?: number; enabled?: boolean };
export type RuleCondition = {
  fact?: string;
  op?: string;
  value?: unknown;
  all?: RuleCondition[];
  any?: RuleCondition[];
  not?: RuleCondition;
};
export type RuleDefinition = {
  id: string;
  title?: string;
  category?: string;
  severity?: string;
  when?: RuleCondition;
  severityWhen?: Array<{ when?: RuleCondition; severity?: string }>;
  evidence?: string;
  suggestion?: string;
  confidence?: number;
};
export type RulePackManifest = {
  apiVersion?: string;
  kind?: string;
  id: string;
  name: string;
  version?: number;
  description?: string;
  requires?: { capabilities?: string[]; note?: string };
  rules?: RuleDefinition[];
};
export type RuleFact = {
  key: string;
  type: string;
  group: string;
  description: string;
  /** Capability that publishes this fact; a rule pack referencing it therefore needs that capability. */
  producedBy: string;
};
export type DryRunResult = {
  valid: boolean;
  errors: string[];
  parseStatus?: string;
  facts?: Record<string, unknown>;
  findings?: SqlFinding[];
  rulesFired?: string[];
  blockedRules?: BlockedRule[];
  severityCounts?: Record<string, number>;
  complexity?: number;
  summary?: string;
  requirements?: RuleRequirements;
  factProducers?: Record<string, string>;
};
export type ModelAdvisor = {
  attempted?: boolean;
  succeeded?: boolean;
  decision?: string;
  rationale?: string;
  provider?: string | null;
  model?: string | null;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  preprocessing?: {
    estimatedTokens?: number;
    baselineTokens?: number;
    compressionRatio?: number;
    includedSections?: string[];
    droppedSections?: string[];
  };
};
export type SqlAnalysis = {
  modelEnhancement?: string;
  id?: string;
  nodes?: Array<{ id: string; label: string; capability: string; state: string; message: string }>;
  status: string;
  sql: string;
  advice: string[];
  safety: string[];
  expertAdvice: string | null;
  analysisMode: string;
  message?: string;
  deterministicAnalysis?: DeterministicAnalysis;
  modelAdvisor?: ModelAdvisor;
  rulePacks?: Array<{ id: string; name: string; ruleCount: number; requires?: string[] }>;
  /** Per-pack check of whether this run could produce the facts the pack depends on. */
  rulePackRequirements?: RuleCapabilityCheck[];
  executedCapabilities?: string[];
  knowledgeEvidence?: Array<{
    source: string;
    knowledgeBase: string;
    score: number;
    excerpt: string;
  }>;
};

export type AiConnectionState =
  | "disabled"
  | "not_configured"
  | "configured_unverified"
  | "available"
  | "error";
export type AiToolMode = "none" | "git_status";
export type AiStatus = {
  state: AiConnectionState;
  provider: string;
  model: string;
  configurationRevision: string;
  lastObservedAt: string | null;
  errorCode: string;
  tools: { git_status: boolean };
  workspaceLabel: string;
  /** Absolute Java-process machine workspace directory when known; never a local group label. */
  workspacePath?: string;
  /**
   * Optional co-located process-bound root on that same JVM machine; empty when denied/missing.
   * Not a remote user directory grant.
   */
  authorizedRootPath?: string;
  /** Denial code when authorizedRootPath is empty (e.g. AUTHORIZED_ROOT_MISSING, ROOT_CONFLICT). */
  authorizedRootDenial?: string;
  /**
   * Always false when the runtime follows Cursor/Codex-style local hosting:
   * the server does not persist operator directory grants.
   */
  storesUserDirectoryGrants?: boolean;
  /** Post-apply verification flag from local-service config; false by default. */
  verificationEnabled?: boolean;
  /** Configured check names when verification is listed; empty means not_requested even if enabled. */
  verificationCommands?: string[];
};
/** Read-only generation-prep baseline. Never includes file contents. */
export type WorkspaceBaseline = {
  path: string;
  exists: boolean;
  baseHash: string;
  denial: string;
};
/** Read-only workspace excerpt for generation prep. Does not grant write authorization. */
export type WorkspaceSource = {
  path: string;
  exists: boolean;
  baseHash: string;
  bytes: number;
  excerpt: string;
  denial: string;
};
export type WorkspaceFiles = { path: string; entries: Array<{ name: string; path: string; directory: boolean }>; truncated: boolean; denial: string };
export type BoardTask = { id: string; projectId: string; title: string; column: 'planned' | 'ready' | 'running' | 'acceptance' | 'done'; notes: string; sessionId: string; revision: number; events: string[]; priority: 'none' | 'p0' | 'p1' | 'p2' };
/** Read-only dirty-file summary. requested=false means git was not run. */
export type WorkspaceDirty = {
  requested: boolean;
  denial: string;
  count: number;
  paths: string[];
  detail: string;
};
/**
 * Safe verification probe. requested=false means the probe did not run.
 * Never marks apply verification as passed; never enables configured heavy checks.
 */
export type VerificationProbe = {
  requested: boolean;
  denial: string;
  name: string;
  exitCode: number | null;
  summary: string;
};
export type AiConversation = {
  conversationId: string;
  workspaceLabel: string;
  memory: string;
  connectionId?: string | null;
  connectionName?: string | null;
  connectionRevision?: number | null;
  model?: string | null;
};
export type ChatGptLoginAttempt = { loginId: string; authorizationUrl: string; expiresAt: string };
export type ChatGptLoginState = { loginId: string; state: "waiting" | "exchanging" | "connected" | "permission_required" | "failed" | "expired" | "cancelled"; connectionId: string | null; error: string };
export type ModelOption = { id: string; reasoningEfforts: Array<"low" | "medium" | "high"> };
export type ModelSelection = { models: ModelOption[]; allowedModels: string[]; defaultModel: string };
export type ModelConnection = {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  baseUrl: string;
  defaultModel: string;
  models: ModelOption[];
  allowedModels: string[];
  discoveredAt: string;
  discoveryError: string;
  secretPresent: boolean;
  revision: number;
  defaultSelected: boolean;
  configurationRevision: string;
};
export type ModelConnectionList = { items: ModelConnection[]; effectiveDefaultId: string | null };
export type ModelConnectionInput = {
  name: string;
  baseUrl: string;
  secret?: string;
  enabled: boolean;
  defaultSelected: boolean;
};
export type ConversationConnection = {
  conversationId: string;
  connectionId: string;
  connectionName: string;
  model: string;
  endpoint: string;
  revision: number;
  memoryCleared: boolean;
};
export type AiArtifactSummary = {
  artifactId: string;
  executionId: string;
  kind: string;
  sizeBytes: number;
  sha256: string;
};
export type AiToolEvent = { sequence: number; code: string };
export type AiMessageResult = {
  proposal?: CodeProposal | null;
  executionId: string | null;
  answer: string;
  error: string;
  status: string;
  approval: string;
  verification: string;
  toolEvents: AiToolEvent[];
  artifactError: string;
  artifacts: AiArtifactSummary[];
};

export type TaskContext = {
  mode: "chat" | "code";
  expert: "general" | "sql" | "frontend";
  instructions: string;
  reasoning: "default" | "low" | "medium" | "high";
  approval: "review" | "read_only";
  files: Array<{ name: string; content: string }>;
  prototypeVersionId: string;
  /** Workspace-relative page the server may read for generation prep; never a write grant. */
  targetPath: string;
};
export type CodeProposal = {
  id: string;
  conversationId: string;
  workspace: string;
  summary: string;
  files: Array<{ path: string; before: string | null; content: string; baseHash: string }>;
  applied: boolean;
  writeAllowed: boolean;
  verification: string;
};

const baseUrl = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8080/api";

const client = axios.create({
  baseURL: baseUrl,
  timeout: 10_000,
  headers: { Accept: "application/json" },
});

client.interceptors.request.use((config) => {
  if (pendingRequests++ === 0) NProgress.start();
  return config;
});
client.interceptors.response.use(
  (response) => {
    finishRequest();
    return response;
  },
  (error) => {
    finishRequest();
    return Promise.reject(error);
  },
);

let pendingRequests = 0;
function finishRequest() {
  pendingRequests = Math.max(0, pendingRequests - 1);
  if (!pendingRequests) NProgress.done();
}

async function get<T>(path: string): Promise<T> {
  return (await client.get<T>(path)).data;
}

export const runtimeApi = {
  task: (id: string) => get<TaskResult>("/tasks/" + encodeURIComponent(id)),
  expertCatalog: () =>
    get<{
      /** Platform capabilities only: what may be used as an ordinary node. */
      capabilities: string[];
      capabilityItems?: CapabilityItem[];
      capabilityKinds?: CapabilityKindSummary[];
      platformScoped?: string[];
      /** Platform capabilities the operator switched off, so the picker's omissions are explainable. */
      disabledPlatform?: string[];
      /** Expert-scoped capabilities; a node using one must be declared in mcpTools. */
      expertScoped?: string[];
      expertScopedVocabulary?: string[];
      mcpServers?: McpServerItem[];
      scopeNotes?: Record<string, string>;
      rules: string[];
      rulePacks?: RulePackSummary[];
      facts?: RuleFact[];
    }>("/experts/catalog"),
  rulePacks: () => get<{ items: RulePackSummary[] }>("/rule-packs"),
  rulePack: (id: string) =>
    get<{ manifest: string; shipped: boolean; editable: boolean; requirements?: RuleRequirements }>(
      "/rule-packs/" + encodeURIComponent(id),
    ),
  ruleVocabulary: () =>
    get<{ facts: RuleFact[]; operators: string[]; producers?: string[] }>("/rule-packs/vocabulary"),
  dryRunRulePack: (sql: string, manifest: string) =>
    client.post<DryRunResult>("/rule-packs/dry-run", { sql, manifest }).then((r) => r.data),
  /** Validate a candidate pack without saving it — the same checks that gate a save. */
  validateRulePack: (manifest: string) =>
    client.post<RuleValidation>("/rule-packs/validate", { manifest }).then((r) => r.data),
  /**
   * Create a pack. Shipped ids are reserved, so copying a shipped pack *is* this call with a new id —
   * which is why the editor's only remedy on a read-only pack is 复制为自定义.
   */
  createRulePack: (name: string, manifest: string) =>
    client.post<RulePackWriteResult>("/rule-packs", { name, manifest }).then((r) => r.data),
  /** Overwrite an authored pack. The manifest's own id must match; the revision increments server-side. */
  updateRulePack: (id: string, name: string, manifest: string) =>
    client
      .put<RulePackWriteResult>("/rule-packs/" + encodeURIComponent(id), { id, name, manifest })
      .then((r) => r.data),
  setRulePackActivation: (id: string, enabled: boolean) =>
    client
      .put<RulePackWriteResult>("/rule-packs/" + encodeURIComponent(id) + "/activation", {
        enabled,
      })
      .then((r) => r.data),
  /** Refused by the backend while an enabled expert still references the pack, naming the experts. */
  deleteRulePack: (id: string) =>
    client.delete("/rule-packs/" + encodeURIComponent(id)).then((r) => r.data),
  /** Real counts behind the overview's headline figures. Nothing here is sampled. */
  stats: (windowDays = 7) => get<TaskStatistics>("/stats?windowDays=" + windowDays),
  activateExpert: (id: string, enabled: boolean) =>
    client
      .put("/experts/" + encodeURIComponent(id) + "/activation", { enabled })
      .then((r) => r.data),
  database: (id: string) =>
    get<{
      id: string;
      label: string;
      engine: string;
      environment: string;
      metadata: Record<string, unknown>;
    }>("/databases/" + encodeURIComponent(id)),
  saveDatabase: (
    id: string | null,
    profile: {
      label: string;
      engine: string;
      environment: string;
      metadata: Record<string, unknown>;
    },
  ) =>
    (id
      ? client.put("/databases/" + encodeURIComponent(id), profile)
      : client.post("/databases", profile)
    ).then((r) => r.data),
  deleteDatabase: (id: string) =>
    client
      .delete<{ id: string; status: string }>("/databases/" + encodeURIComponent(id))
      .then((r) => r.data),
  tasks: () => get<{ items: TaskResult[] }>("/tasks"),
  knowledgeBases: () =>
    get<{ items: Array<{ id: string; name: string; description: string; documents: number }> }>(
      "/knowledge",
    ),
  createKnowledgeBase: (name: string, description: string) =>
    client.post("/knowledge", { name, description }).then((r) => r.data),
  knowledgeDocuments: (id: string) =>
    get<{ items: Array<{ id: string; title: string; content: string }> }>(
      "/knowledge/" + id + "/documents",
    ),
  addKnowledgeDocument: (id: string, title: string, content: string) =>
    client.post("/knowledge/" + id + "/documents", { title, content }).then((r) => r.data),
  renameKnowledgeBase: (id: string, name: string, description: string) =>
    client.put("/knowledge/" + encodeURIComponent(id), { name, description }).then((r) => r.data),
  deleteKnowledgeBase: (id: string) =>
    client.delete("/knowledge/" + encodeURIComponent(id)).then((r) => r.data),
  deleteKnowledgeDocument: (baseId: string, documentId: string) =>
    client
      .delete(
        "/knowledge/" + encodeURIComponent(baseId) + "/documents/" + encodeURIComponent(documentId),
      )
      .then((r) => r.data),
  searchKnowledge: (q: string, baseId?: string) =>
    client.get("/knowledge/search", { params: { q, baseId } }).then((r) => r.data),
  validateExpert: (definition: { id: string; name: string; manifest: string }) =>
    client.post("/experts/validate", definition).then((response) => response.data),
  saveExpert: (definition: { id: string; name: string; manifest: string }) =>
    client.post("/experts", definition).then((response) => response.data),
  health: () => get<RuntimeHealth>("/health"),
  capabilities: () => get<CapabilityResponse>("/capabilities"),
  cliPrograms: () => get<{ items: CliProgramItem[] }>("/cli-programs"),
  registerCliProgram: (program: CliProgramRequest) =>
    client.post("/cli-programs", program).then((r) => r.data),
  configureCliProgram: (id: string, binary: string) =>
    client.put("/cli-programs/" + encodeURIComponent(id), { binary }).then((r) => r.data),
  deleteCliProgram: (id: string) =>
    client.delete("/cli-programs/" + encodeURIComponent(id)).then((r) => r.data),
  probeCliProgram: (id: string) =>
    client
      .post<CliProbeResult>("/cli-programs/" + encodeURIComponent(id) + "/probe")
      .then((r) => r.data),
  saveCliOperation: (programId: string, operation: CliOperationRequest, editing: boolean) => {
    const url =
      "/cli-programs/" +
      encodeURIComponent(programId) +
      "/operations/" +
      encodeURIComponent(operation.capabilityId);
    return (editing ? client.put(url, operation) : client.post(url, operation)).then((r) => r.data);
  },
  deleteCliOperation: (programId: string, id: string) =>
    client
      .delete(
        "/cli-programs/" + encodeURIComponent(programId) + "/operations/" + encodeURIComponent(id),
      )
      .then((r) => r.data),
  /**
   * The one on/off switch, for any kind. Refused by the backend while an enabled expert runs the
   * capability, and the refusal names the experts.
   */
  setCapabilityActivation: (name: string, enabled: boolean, notes: string) =>
    client
      .put("/capabilities/" + encodeURIComponent(name) + "/activation", { enabled, notes })
      .then((r) => r.data),
  /** Point a local CLI capability at a specific binary; blank restores the shipped default. */
  setCliChannel: (name: string, binary: string) =>
    client
      .put("/capabilities/" + encodeURIComponent(name) + "/cli", { binary })
      .then((r) => r.data),
  /** Explicitly run `<binary> --version`. The only place a binary is executed for a management check. */
  probeCliChannel: (name: string) =>
    client
      .post<CliProbeResult>("/capabilities/" + encodeURIComponent(name) + "/cli/probe")
      .then((r) => r.data),
  mcpServers: () => get<{ items: McpServerItem[] }>("/mcp-servers"),
  saveMcpServer: (server: McpServerRequest) =>
    client.post("/mcp-servers", server).then((r) => r.data),
  updateMcpServer: (id: string, server: McpServerRequest) =>
    client.put("/mcp-servers/" + encodeURIComponent(id), server).then((r) => r.data),
  setMcpServerActivation: (id: string, enabled: boolean, trusted: boolean) =>
    client
      .put("/mcp-servers/" + encodeURIComponent(id) + "/activation", { enabled, trusted })
      .then((r) => r.data),
  deleteMcpServer: (id: string) =>
    client.delete("/mcp-servers/" + encodeURIComponent(id)).then((r) => r.data),
  probeMcpServer: (id: string) =>
    client
      .post<McpProbeResult>("/mcp-servers/" + encodeURIComponent(id) + "/probe")
      .then((r) => r.data),
  createTask: (goal: string) =>
    client
      .post<TaskResult>("/tasks", { goal }, { timeout: 60_000 })
      .then((response) => response.data),
  handoffs: () => get<{ items: HandoffRecord[] }>("/handoffs"),
  boardTasks: (projectId: string) => get<{ items: BoardTask[] }>('/board/tasks?projectId=' + encodeURIComponent(projectId)),
  createBoardTask: (projectId: string, title: string, column: 'planned' | 'ready' = 'planned', sessionId = '') => client.post<BoardTask>('/board/tasks', { projectId, title, column, sessionId: String(sessionId ?? '').trim().slice(0, 120) }).then(response => response.data),
  updateBoardTask: (id: string, update: { revision: number; column?: BoardTask['column']; notes?: string; priority?: BoardTask['priority'] }) => client.post<BoardTask>('/board/tasks/' + encodeURIComponent(id), update).then(response => response.data),
  recordHandoff: (draft: { source: "chat" | "builder"; sourceRef: string; summary: string }) =>
    client
      .post<HandoffRecord>("/handoffs", draft)
      .then((response) => response.data),
  missions: () => get<{ items: MissionRecord[] }>("/missions"),
  createMission: (handoffId: string) =>
    client
      .post<MissionRecord>("/missions", { handoffId })
      .then((response) => response.data),
  prototypeVersions: (sourceRef: "builder-alpha" | "builder-beta") =>
    get<{ items: PrototypeVersionRecord[] }>("/prototype-versions?sourceRef=" + encodeURIComponent(sourceRef)),
  savePrototypeVersion: (draft: {
    sourceRef: "builder-alpha" | "builder-beta";
    title: string;
    body: string;
    buttonPresses: number;
    acceptance: string[];
  }) =>
    client
      .post<PrototypeVersionRecord>("/prototype-versions", draft)
      .then((response) => response.data),
  prototypeVersion: (id: string) =>
    get<PrototypeVersionRecord>("/prototype-versions/" + encodeURIComponent(id)),
  createPrototypeDelivery: (versionId: string) =>
    client
      .post<PrototypeDeliveryRecord>("/prototype-deliveries", { versionId })
      .then((response) => response.data),
  startMissionGitStatus: (missionId: string) =>
    client
      .post<MissionExecutionRecord>("/missions/" + encodeURIComponent(missionId) + "/executions", { missionId }, { timeout: 60_000 })
      .then((response) => response.data),
  analyzeSql: (
    sql: string,
    question = "",
    options: {
      expertId?: string;
      databaseId?: string;
      explainPlan?: Record<string, unknown>;
      enhanceWithModel?: boolean;
      pattern?: string;
    } = {},
  ) =>
    client
      .post<SqlAnalysis>("/sql/analyze", { sql, question, ...options }, { timeout: 90_000 })
      .then((response) => response.data),
  databases: () =>
    get<{
      items: Array<{
        id: string;
        label: string;
        engine: string;
        environment: string;
        credentialsExposed: boolean;
      }>;
      policy: string;
    }>("/databases"),
  experts: () =>
    get<{
      items: string[];
      states?: Record<string, { enabled: boolean; builtin: boolean; revision: number }>;
    }>("/experts"),
  ...createChatApi(baseUrl, client),
};

export function createChatApi(baseURL: string, transport = axios.create({ baseURL, timeout: 10_000, headers: { Accept: "application/json" } })) {
  const client = transport;
  const get = <T>(path: string) => client.get<T>(path).then(response => response.data);
  return {
  aiStatus: () => get<AiStatus>("/ai/status"),
  workspaceBaseline: (path: string) =>
    get<WorkspaceBaseline>("/ai/workspace/baseline?path=" + encodeURIComponent(path)),
  workspaceSource: (path: string) =>
    get<WorkspaceSource>("/ai/workspace/source?path=" + encodeURIComponent(path)),
  workspaceDirty: () => get<WorkspaceDirty>("/ai/workspace/dirty"),
  workspaceFiles: (path = '') => get<WorkspaceFiles>('/ai/workspace/files?path=' + encodeURIComponent(path)),
  workspaceVerificationProbe: () =>
    client
      .post<VerificationProbe>("/ai/workspace/verification/probe", {})
      .then((response) => response.data),
  aiConversation: (id: string) => get<{ conversationId: string; workspaceLabel: string; memory: string; connectionId?: string | null }>("/ai/conversations/" + encodeURIComponent(id)),
  deleteAiConversation: (id: string) => client.delete("/ai/conversations/" + encodeURIComponent(id)).then(() => undefined),
  openAiConversation: () =>
    client.post<AiConversation>("/ai/conversations", {}, { timeout: 10_000 }).then((response) => response.data),
  sendAiMessage: (id: string, message: string, toolMode: AiToolMode, context?: TaskContext) =>
    client
      .post<AiMessageResult>(
        "/ai/conversations/" + encodeURIComponent(id) + "/messages",
        { message, toolMode, ...(context ? { context } : {}) },
        { timeout: 90_000 },
      )
      .then((response) => response.data),
  applyCodeProposal: (id: string, proposal: string) =>
    client.post<{ id: string; written: string[]; verification: string; checks: Array<{ name: string; exitCode: number | null; summary: string }> }>(
      "/ai/conversations/" + encodeURIComponent(id) + "/proposals/" + encodeURIComponent(proposal) + "/apply",
      { confirmed: true },
    ).then((response) => response.data),
  startChatGptLogin: (connectionId?: string) => client.post<ChatGptLoginAttempt>("/ai/chatgpt/login" + (connectionId ? "?connectionId=" + encodeURIComponent(connectionId) : ""), {}).then(response => response.data),
  chatGptLoginState: (id: string) => get<ChatGptLoginState>("/ai/chatgpt/login/" + encodeURIComponent(id)),
  cancelChatGptLogin: (id: string) => client.delete("/ai/chatgpt/login/" + encodeURIComponent(id)),
  disconnectChatGpt: (id: string) => client.delete("/ai/chatgpt/login/accounts/" + encodeURIComponent(id)),
  modelConnections: () => get<ModelConnectionList>("/ai/connections"),
  saveModelConnection: (input: ModelConnectionInput, id?: string) =>
    client
      .post<ModelConnection>(id ? "/ai/connections/" + encodeURIComponent(id) : "/ai/connections", input)
      .then((response) => response.data),
  setModelConnectionEnabled: (id: string, enabled: boolean) =>
    client
      .post<ModelConnection>("/ai/connections/" + encodeURIComponent(id) + "/enabled", { enabled })
      .then((response) => response.data),
  setDefaultModelConnection: (id: string) =>
    client
      .post<ModelConnection>("/ai/connections/" + encodeURIComponent(id) + "/default", {})
      .then((response) => response.data),
  refreshConnectionModels: (id: string) => client.post<ModelConnection>("/ai/connections/" + encodeURIComponent(id) + "/models/refresh", {}).then(response => response.data),
  configureConnectionModels: (id: string, selection: ModelSelection) => client.post<ModelConnection>("/ai/connections/" + encodeURIComponent(id) + "/models", selection).then(response => response.data),
  assignConversationConnection: (id: string, connectionId: string, confirmTargetChange: boolean, model: string) =>
    client
      .post<ConversationConnection>("/ai/conversations/" + encodeURIComponent(id) + "/connection", {
        connectionId,
        confirmTargetChange,
        model,
      })
      .then((response) => response.data),
  };
}
