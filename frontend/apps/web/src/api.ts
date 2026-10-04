import axios from 'axios'
import NProgress from 'nprogress'

export type RuntimeHealth = { status: string; service: string }
export type CapabilityResponse = { capabilities: string[] }
export type TaskObservation = { capability: string; success: boolean; exitCode: number; stdout: string; stderr: string }
export type TaskResult = { id: string; goal: string; status: string; decision: string; observations: TaskObservation[] }
export type SqlAnalysis = { status: string; sql: string; advice: string[]; safety: string[]; expertAdvice: string | null; analysisMode: string; message?: string }

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8080/api'

const client = axios.create({ baseURL: baseUrl, timeout: 10_000, headers: { Accept: 'application/json' } })

client.interceptors.request.use((config) => { NProgress.start(); return config })
client.interceptors.response.use(
  (response) => { NProgress.done(); return response },
  (error) => { NProgress.done(); return Promise.reject(error) },
)

async function get<T>(path: string): Promise<T> { return (await client.get<T>(path)).data }

export const runtimeApi = {
  health: () => get<RuntimeHealth>('/health'),
  capabilities: () => get<CapabilityResponse>('/capabilities'),
  createTask: (goal: string) => client.post<TaskResult>('/tasks', { goal }).then((response) => response.data),
  analyzeSql: (sql: string) => client.post<SqlAnalysis>('/sql/analyze', { sql }).then((response) => response.data),
  databases: () => get<{ items: Array<{ id: string; label: string; engine: string; environment: string; credentialsExposed: boolean }>; policy: string }>('/databases'),
}
