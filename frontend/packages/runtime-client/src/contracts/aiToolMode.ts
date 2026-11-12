export const AiToolMode = {
  NONE: 'none',
  GIT_STATUS: 'git_status',
  CODE_SOURCES: 'code_sources',
} as const
export type AiToolMode = (typeof AiToolMode)[keyof typeof AiToolMode]
