export type RuntimeHealth = { status: string; service: string }

export type DataLayoutEntry = {
  logical: string
  resolved: string
  exists: boolean
  note: string
  /** FS-01 observational kind; directories never carry recursive byteSize. */
  kind?: 'missing' | 'file' | 'directory' | 'other' | string
  byteSize?: number
}

export type DataLayoutMigrationCandidate = {
  id: string
  resolved: string
  present: boolean
  note: string
}

export type DataLayoutCandidateCounts = {
  present: number
  absent: number
  total: number
}

export type DataLayoutMigrationReadiness = {
  status: string
  physicalMigration: boolean
  approved: boolean
  note: string
  candidates: DataLayoutMigrationCandidate[]
  /** Observational present/absent over candidates; not migration progress. */
  candidateCounts?: DataLayoutCandidateCounts
}

export type DataLayoutInventoryByKind = {
  file: number
  directory: number
  missing: number
  other: number
}

export type DataLayoutInventory = {
  present: number
  missing: number
  total: number
  /** Observational kind tallies over entries; not recursive disk scan. */
  byKind?: DataLayoutInventoryByKind
}

export type DataLayoutResponse = {
  entries: DataLayoutEntry[]
  physicalMigration: boolean
  /** FS-01 observational counts over entries; not a migration progress meter. */
  inventory?: DataLayoutInventory
  migrationReadiness?: DataLayoutMigrationReadiness
}
