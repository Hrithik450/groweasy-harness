/** Chat presentation derived from Host-backed detail and collapse timing. */

import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { CollapseTiming, TranscriptViewMode } from '../chat-settings.ts'
export { COLLAPSE_TIMINGS, type CollapseTiming } from '../chat-settings.ts'

/** Presentation capabilities that one work-details mode enables. */
export interface ChatPresentationPolicy {
  /** Preference identity for layout resets and diagnostics; renderers select the capabilities below. */
  readonly mode: TranscriptViewMode
  /** Saved collapse timing; completion retains the default immediate folding and scrolling. */
  readonly collapseTiming: CollapseTiming
  /** Whether a normally completed Turn folds its process rows behind the whole-Turn control. */
  readonly foldCompletedTurns: boolean
  /** Collapsible group headers for all Turns, historical Turns only, or no Turns. */
  readonly stepGrouping: 'collapsed' | 'history' | 'none'
  /** Show the running command, path, query, or reasoning detail in group titles. */
  readonly liveProcessDetail: boolean
  /** Whether a settled reasoning row previews its first line beside the Think title. */
  readonly settledReasoningPreview: boolean
}

const POLICIES: Readonly<Record<TranscriptViewMode, Omit<ChatPresentationPolicy, 'collapseTiming'>>> = {
  compact: {
    mode: 'compact',
    foldCompletedTurns: true,
    stepGrouping: 'collapsed',
    liveProcessDetail: false,
    settledReasoningPreview: false,
  },
  standard: {
    mode: 'standard',
    foldCompletedTurns: true,
    stepGrouping: 'collapsed',
    liveProcessDetail: true,
    settledReasoningPreview: true,
  },
  detailed: {
    mode: 'detailed',
    foldCompletedTurns: true,
    stepGrouping: 'history',
    liveProcessDetail: true,
    settledReasoningPreview: true,
  },
  verbose: {
    mode: 'verbose',
    foldCompletedTurns: false,
    stepGrouping: 'none',
    liveProcessDetail: false,
    settledReasoningPreview: true,
  },
}

function withTiming(collapseTiming: CollapseTiming, showDetails = true): Readonly<Record<TranscriptViewMode, ChatPresentationPolicy>> {
  return {
    compact: { ...POLICIES.compact, collapseTiming, liveProcessDetail: showDetails && POLICIES.compact.liveProcessDetail },
    standard: { ...POLICIES.standard, collapseTiming, liveProcessDetail: showDetails && POLICIES.standard.liveProcessDetail },
    detailed: { ...POLICIES.detailed, collapseTiming, liveProcessDetail: showDetails && POLICIES.detailed.liveProcessDetail },
    verbose: { ...POLICIES.verbose, collapseTiming, liveProcessDetail: showDetails && POLICIES.verbose.liveProcessDetail },
  }
}

const TIMING_POLICIES = {
  completion: withTiming('completion'),
  'next-input': withTiming('next-input'),
}

const ACTIVITY_POLICIES = {
  completion: withTiming('completion', false),
  'next-input': withTiming('next-input', false),
}

/**
 * Resolve a stable policy for one detail mode and collapse timing.
 * @param mode - persisted work-details mode.
 * @param collapseTiming - persisted timing; defaults to immediate completion folding.
 * @returns the same policy object for the same pair of choices.
 */
export function presentationPolicyFor(
  mode: TranscriptViewMode,
  collapseTiming: CollapseTiming = 'completion',
): ChatPresentationPolicy {
  return TIMING_POLICIES[collapseTiming][mode]
}

/**
 * Combine Host-backed detail, timing, and optional Coding Tools without owning subscriptions.
 * @param mode - live work-details mode.
 * @param collapseTiming - live Host-backed collapse timing.
 * @param developerTools - accepted Coding Tools choice; omitted by standalone presentation consumers.
 * @returns Observable policy that omits live fragments when Coding Tools is disabled.
 */
export function derivePresentationPolicy(
  mode: ObservableSnapshot<TranscriptViewMode>,
  collapseTiming: ObservableSnapshot<CollapseTiming>,
  developerTools?: ObservableSnapshot<boolean>,
): ObservableSnapshot<ChatPresentationPolicy> {
  return {
    getSnapshot: () => developerTools?.getSnapshot() === false
      ? ACTIVITY_POLICIES[collapseTiming.getSnapshot()][mode.getSnapshot()]
      : presentationPolicyFor(mode.getSnapshot(), collapseTiming.getSnapshot()),
    subscribe: (listener) => {
      const unsubscribeMode = mode.subscribe(listener)
      const unsubscribeTiming = collapseTiming.subscribe(listener)
      const unsubscribeDeveloperTools = developerTools?.subscribe(listener)
      return () => { unsubscribeMode(); unsubscribeTiming(); unsubscribeDeveloperTools?.() }
    },
  }
}
