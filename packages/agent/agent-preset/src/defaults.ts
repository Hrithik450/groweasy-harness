/**
 * Default session catalog.
 *
 * A fresh user owns one session per canonical slug. Titles are derived from the
 * slug unless an override names one; hidden sessions stay out of the sidebar
 * but remain addressable.
 *
 * The data lives here rather than in the host because the presets below name
 * the same slugs: a new preset without a default session (or the reverse) is a
 * catalog bug found in one place.
 *
 * @module @openai-harness/agent-preset/defaults
 */

import { slugToTitle } from "@openai-harness/util-values";

/** Canonical session slugs this deployment ships. */
export const SESSION_SLUGS = [
  "adManager",
  "adCreator",
  "adStrategist",
  "businessProfile",
] as const;

/** A canonical session slug. */
export type SessionSlug = (typeof SESSION_SLUGS)[number];

/** One default session to create for a new user. */
export interface DefaultSessionConfig {
  /** Canonical slug; also the agent-preset scope. */
  slug: string;
  /** Display title. */
  title: string;
  /** Whether the session is hidden from the default listing. */
  hidden?: boolean;
}

/**
 * Per-session overrides applied over the derived defaults.
 * Visibility, custom titles, and future per-session parameters belong here
 * instead of growing a switch in the seeding code.
 */
export const SESSION_CONFIG_OVERRIDES: Partial<
  Record<SessionSlug, Partial<Omit<DefaultSessionConfig, "slug">>>
> = {
  businessProfile: {
    hidden: true,
  },
};

/** Every default session, with the overrides merged in. */
export const DEFAULT_SESSIONS: DefaultSessionConfig[] = SESSION_SLUGS.map(
  (slug) => {
    const override = SESSION_CONFIG_OVERRIDES[slug];
    return {
      slug,
      title: override?.title || slugToTitle(slug),
      hidden: override?.hidden ?? false,
    };
  },
);
