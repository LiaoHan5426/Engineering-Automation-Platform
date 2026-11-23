import {
  deliveryBlockers,
  type PrototypePublicationRequest,
  type PrototypeSchema,
} from '@eap/runtime-client'

/** The scene designer publishes to the same source it lists versions from. */
export const SCENE_PUBLICATION_SOURCE = 'builder-alpha' as const

/**
 * Build the immutable-version request from the canvas schema only. The body
 * uses the shared eap-prototype-v1 format so Builder and task previews decode
 * exactly what the designer produced.
 */
export function scenePublicationRequest(
  schema: PrototypeSchema,
  requestId: string,
): PrototypePublicationRequest {
  return {
    requestId,
    sourceRef: SCENE_PUBLICATION_SOURCE,
    title: schema.title,
    body: JSON.stringify({ format: 'eap-prototype-v1', schema }),
    acceptance: ['semantic-preview'],
  }
}

/** Real delivery blockers from the shared contract; no invented readiness. */
export function scenePublicationBlockers(schema: PrototypeSchema): string[] {
  return deliveryBlockers(schema)
}
