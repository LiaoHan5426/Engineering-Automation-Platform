export const SourceDependencyKind = {
  MODULE: 'MODULE',
  LAZY_MODULE: 'LAZY_MODULE',
  STYLESHEET: 'STYLESHEET',
} as const

export type SourceDependencyKind = (typeof SourceDependencyKind)[keyof typeof SourceDependencyKind]

export type SourceDependency = { from: string; to: string; kind: SourceDependencyKind }
