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
  observations?: TaskObservation[];
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
export type RuleCapabilityCheck = { id: string; required: string[]; met: boolean; missing: string[] };
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
  searchKnowledge: (q: string) =>
    client.get("/knowledge/search", { params: { q } }).then((r) => r.data),
  validateExpert: (definition: { id: string; name: string; manifest: string }) =>
    client.post("/experts/validate", definition).then((response) => response.data),
  saveExpert: (definition: { id: string; name: string; manifest: string }) =>
    client.post("/experts", definition).then((response) => response.data),
  health: () => get<RuntimeHealth>("/health"),
  capabilities: () => get<CapabilityResponse>("/capabilities"),
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
    client.post<McpProbeResult>("/mcp-servers/" + encodeURIComponent(id) + "/probe").then((r) => r.data),
  createTask: (goal: string) =>
    client
      .post<TaskResult>("/tasks", { goal }, { timeout: 60_000 })
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
};
