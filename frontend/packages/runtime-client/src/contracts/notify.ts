import { hasWireValue } from './wire.ts'

/** Notify bus kind. Illegal wire values are rejected; never mapped to UNKNOWN. */
export const NotifyKind = {
  PROBE: 'probe',
  SESSION: 'session',
  SYSTEM: 'system',
} as const
export type NotifyKind = (typeof NotifyKind)[keyof typeof NotifyKind]
export const NOTIFY_KINDS = Object.values(NotifyKind)
export function isNotifyKind(value: unknown): value is NotifyKind {
  return hasWireValue(NOTIFY_KINDS, value)
}

export const NotifySeverity = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
} as const
export type NotifySeverity = (typeof NotifySeverity)[keyof typeof NotifySeverity]
export const NOTIFY_SEVERITIES = Object.values(NotifySeverity)
export function isNotifySeverity(value: unknown): value is NotifySeverity {
  return hasWireValue(NOTIFY_SEVERITIES, value)
}

export const NotifySurface = {
  BADGE: 'badge',
  TOAST: 'toast',
  BANNER: 'banner',
  DIALOG: 'dialog',
} as const
export type NotifySurface = (typeof NotifySurface)[keyof typeof NotifySurface]
export const NOTIFY_SURFACES = Object.values(NotifySurface)
export function isNotifySurface(value: unknown): value is NotifySurface {
  return hasWireValue(NOTIFY_SURFACES, value)
}

export type NotifyTarget = {
  conversationId?: string
}

/** Single authority envelope for SSE, WebSocket, and silent REST snapshot. */
export type NotifyEvent = {
  eventId: string
  sequence: number
  occurredAt: string
  protocolVersion: '1'
  kind: NotifyKind
  severity: NotifySeverity
  code: string
  title: string
  text: string
  surfaces: NotifySurface[]
  target?: NotifyTarget
}

export type NotifySnapshot = {
  events: NotifyEvent[]
  latestSequence: number
}

/** Surfaces derived from kind+severity. Callers must not invent a parallel mapping. */
export function surfacesFor(kind: NotifyKind, severity: NotifySeverity): NotifySurface[] {
  if (kind === NotifyKind.PROBE) return []
  if (kind === NotifyKind.SESSION) return [NotifySurface.BADGE, NotifySurface.TOAST]
  if (severity === NotifySeverity.ERROR) return [NotifySurface.BANNER, NotifySurface.DIALOG]
  if (severity === NotifySeverity.WARNING) return [NotifySurface.BANNER]
  return [NotifySurface.TOAST]
}

export function parseNotifyEvent(value: unknown): NotifyEvent {
  if (!value || typeof value !== 'object') throw new Error('NOTIFY_EVENT_INVALID')
  const raw = value as Record<string, unknown>
  if (raw.protocolVersion !== '1') throw new Error('NOTIFY_PROTOCOL_UNSUPPORTED')
  if (typeof raw.eventId !== 'string' || !raw.eventId) throw new Error('NOTIFY_EVENT_INVALID')
  if (typeof raw.sequence !== 'number' || !Number.isFinite(raw.sequence))
    throw new Error('NOTIFY_EVENT_INVALID')
  if (typeof raw.occurredAt !== 'string' || !raw.occurredAt) throw new Error('NOTIFY_EVENT_INVALID')
  if (!isNotifyKind(raw.kind)) throw new Error('NOTIFY_KIND_INVALID')
  if (!isNotifySeverity(raw.severity)) throw new Error('NOTIFY_SEVERITY_INVALID')
  if (typeof raw.code !== 'string' || !raw.code) throw new Error('NOTIFY_EVENT_INVALID')
  if (typeof raw.title !== 'string') throw new Error('NOTIFY_EVENT_INVALID')
  if (typeof raw.text !== 'string') throw new Error('NOTIFY_EVENT_INVALID')
  const surfaces = Array.isArray(raw.surfaces)
    ? raw.surfaces.map((surface) => {
        if (!isNotifySurface(surface)) throw new Error('NOTIFY_SURFACE_INVALID')
        return surface
      })
    : surfacesFor(raw.kind, raw.severity)
  let target: NotifyTarget | undefined
  if (raw.target != null) {
    if (typeof raw.target !== 'object') throw new Error('NOTIFY_EVENT_INVALID')
    const conversationId = (raw.target as Record<string, unknown>).conversationId
    if (conversationId != null && typeof conversationId !== 'string')
      throw new Error('NOTIFY_EVENT_INVALID')
    target = conversationId ? { conversationId } : undefined
  }
  return {
    eventId: raw.eventId,
    sequence: raw.sequence,
    occurredAt: raw.occurredAt,
    protocolVersion: '1',
    kind: raw.kind,
    severity: raw.severity,
    code: raw.code,
    title: raw.title,
    text: raw.text,
    surfaces,
    target,
  }
}
