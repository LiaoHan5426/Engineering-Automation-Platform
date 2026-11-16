/** Fixed display policy for isolated Assistant Markdown fixtures. */
import { computed } from 'vue'
import type { UsePresentation } from '../src/client/contract/slots.ts'
import { presentationPolicyFor } from '../src/client/presentation-policy.ts'

/**
 * Select from a fixed policy that shows settled reasoning previews.
 * @param selector - component's policy selection.
 * @returns the selected Detailed policy value.
 */
export const useDetailedPresentation: UsePresentation = selector => computed(() => selector(presentationPolicyFor('detailed')))
