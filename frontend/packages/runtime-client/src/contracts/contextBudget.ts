export const ContextMetering = {
  CHAR_ESTIMATE: 'CHAR_ESTIMATE',
  UNKNOWN: 'UNKNOWN',
} as const
export type ContextMetering = (typeof ContextMetering)[keyof typeof ContextMetering]
