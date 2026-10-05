import axios from "axios";
import NProgress from "nprogress";

export type RuntimeHealth = { status: string; service: string };
export type CapabilityResponse = { capabilities: string[] };
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
  expertCatalog: () => get<{ capabilities: string[]; rules: string[] }>("/experts/catalog"),
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
