/** Current platform problem contract. Human detail never controls business behavior. */
export type PlatformProblem = {
  status: number
  code: string
  detail: string
  title?: string
  requestId: string
  knowledgeMemoryCleared?: boolean
  contextMemoryCleared?: boolean
}

export function platformErrorCode(error: unknown): string {
  const code = (error as { response?: { data?: { code?: unknown } } } | null)?.response?.data?.code
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,119}$/.test(code) ? code : ''
}

export type RuntimeLanguage = 'zh-CN' | 'en-US'
let currentLanguage: () => RuntimeLanguage = () => 'zh-CN'
export function configureRuntimeLanguage(read: () => RuntimeLanguage): void {
  currentLanguage = read
}
export function runtimeLanguage(): RuntimeLanguage {
  return currentLanguage() === 'en-US' ? 'en-US' : 'zh-CN'
}
