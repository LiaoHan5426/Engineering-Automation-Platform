export const TaskMode = {
  CHAT: 'chat',
  CODE: 'code',
  PLAN: 'plan',
} as const
export type TaskMode = (typeof TaskMode)[keyof typeof TaskMode]
