import { publish } from "@/lib/session/bus";
import { userKey } from "@/lib/session/keys";
import { SESSION_ONBOARDING_EVENT } from "@/lib/session/journal";

/** Tell every open stream for this user to refetch onboarding status. */
export function publishOnboardingStatus(userId: string): void {
  publish(userKey(userId), { event: SESSION_ONBOARDING_EVENT, data: {} });
}
