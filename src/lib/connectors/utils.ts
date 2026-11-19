import { slugToTitle } from "@/lib/utils/utils";

/** Display names for provider slugs; the slug itself never changes. */
const PROVIDER_LABELS: Record<string, string> = {
  adsEasy: "Uno",
};

export function getProviderFromSlug(providerSlug: string): string {
  return PROVIDER_LABELS[providerSlug] ?? slugToTitle(providerSlug);
}
