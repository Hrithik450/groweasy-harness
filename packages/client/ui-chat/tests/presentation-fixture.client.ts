/** Fixed display policy for isolated Assistant Markdown fixtures. */
import type { CodingToolsInjected, UsePresentation } from '../src/client/contract/slots.ts'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { presentationPolicyFor } from '../src/client/presentation-policy.ts'

/**
 * Select from a fixed policy that shows settled reasoning previews.
 * @param selector - component's policy selection.
 * @returns the selected Detailed policy value.
 */
export const useDetailedPresentation: UsePresentation = selector => selector(presentationPolicyFor('detailed'))

/**
 * Select the enabled Coding Tools mode for technical-content fixtures.
 * @param selector - component's preference selection.
 * @returns the selected enabled value.
 */
export const useCodingTools: InjectFace<CodingToolsInjected>['useDeveloperTools'] = selector => selector(true)
