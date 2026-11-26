/**
 * 工作空间在服务端不是 task 的字段——这是已定的范围，不是缺口：真正决定本地 CLI 在哪里执行的是
 * 运行时进程的执行目录（`EAP_WORKSPACE`）。所以这里只是**本机视图范围**：它只过滤控制台
 * 自己标注过的执行，能力目录 / 规则库 / 知识库是应用级配置，不随它变化。
 */
export const DEFAULT_WORKSPACE = 'engineering-automation-platform'
export const WORKSPACE_KEY = 'eap.console.workspace'
export const WORKSPACES_KEY = 'eap.console.workspaces'
export const TASK_TAGS_KEY = 'eap.console.task-workspaces'

export function readStore(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    // 无 localStorage（SSR / 隐私模式）时退化为内存状态，而不是让整个页面加载失败。
    return fallback
  }
}

export function writeStore(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 同上：写不进去只影响持久化，不影响本次会话 */
  }
}

export function readTags(): Record<string, string> {
  try {
    return JSON.parse(readStore(TASK_TAGS_KEY, '{}')) as Record<string, string>
  } catch {
    return {}
  }
}

export function readList(key: string): string[] {
  try {
    const parsed = JSON.parse(readStore(key, '[]')) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}
