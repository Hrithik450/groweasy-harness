import type { Response } from "./types";
import * as repo from "@/lib/repositories";
import type {
  Connector,
  ConnectorSlug,
  NewConnector,
  ProviderSlug,
} from "@/lib/db";
import type { ConnectorContext } from "@/lib/connectors/types";
import { deactivateCronJobsByRequires } from "@/lib/repositories";
import { publish } from "@/lib/session/bus";
import { userKey } from "@/lib/session/keys";
import { SESSION_CONNECTOR_EVENT } from "@/lib/session/journal";
import { publishOnboardingStatus } from "@/lib/onboarding/publish";
import {
  AVAILABLE_CONNECTORS,
  toBrowserConnector,
} from "@/lib/connectors/registry";

export { normalizeInstanceKey } from "@/lib/repositories/connectors.repo";

/**
 * Push one connector's stored row to the browser.
 *
 * Reads after the write so clients receive the stored truth; a deleted row
 * falls back to the catalogue's disconnected definition.
 */
function publishConnector(
  userId: string,
  slug: string,
  instance?: string,
): void {
  const row = repo.getConnectorByUserIdAndSlug(
    userId,
    slug as ConnectorSlug,
    instance,
  );

  const connector =
    row ?? AVAILABLE_CONNECTORS.find((item) => item.slug === slug);
  if (connector === undefined || connector === null) return;

  publish(userKey(userId), {
    event: SESSION_CONNECTOR_EVENT,
    data: {
      slug: connector.slug,
      connector: toBrowserConnector(
        connector as unknown as Record<string, unknown>,
      ) as unknown as Record<string, unknown>,
    },
  });
  publishOnboardingStatus(userId);
}

/**
 * Upserts a connector configuration for a user.
 */
export async function upsertConnector(
  data: NewConnector,
): Promise<Response<Connector>> {
  try {
    const result = repo.upsertConnector(data);

    publish(userKey(result.userId), {
      event: SESSION_CONNECTOR_EVENT,
      data: {
        slug: result.slug,
        instance: result.instance,
        connector: toBrowserConnector(
          result as unknown as Record<string, unknown>,
        ) as unknown as Record<string, unknown>,
      },
    });
    publishOnboardingStatus(result.userId);
    return { success: true, data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Returns all active/configured connectors for a specific user.
 */
export async function getConnectorsByUserId(
  userId: string,
): Promise<Response<Connector[]>> {
  try {
    const data = repo.getConnectorsByUserId(userId);
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Retrieves a single connector configuration for a user by connector slug (e.g. "businessProfile", "metaAds").
 */
export async function getConnectorByUserIdAndSlug(
  userId: string,
  slug: ConnectorSlug,
  instance?: string,
): Promise<Response<Connector | null>> {
  try {
    const data = repo.getConnectorByUserIdAndSlug(userId, slug, instance);
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/** Makes one instance the primary for its connector type. */
export async function setPrimaryConnector(
  userId: string,
  slug: string,
  instance: string,
): Promise<Response<boolean>> {
  try {
    const data = repo.setPrimaryConnector(userId, slug, instance);
    if (data) publishConnector(userId, slug, instance);
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/** Returns every instance of one connector type for a user. */
export async function getConnectorInstances(
  userId: string,
  slug: ConnectorSlug,
): Promise<Response<Connector[]>> {
  try {
    const data = repo.getConnectorsByUserIdAndSlug(userId, slug);
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Retrieves a single connector configuration for a user by providerSlug.
 */
export async function getConnectorByUserIdAndProviderSlug(
  userId: string,
  providerSlug: ProviderSlug,
  instance?: string,
): Promise<Response<Connector | null>> {
  try {
    const data = repo.getConnectorByUserIdAndProviderSlug(
      userId,
      providerSlug,
      instance,
    );
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Disconnects a connector for a user by connector slug.
 */
export async function disconnectConnectorBySlug(
  userId: string,
  slug: ConnectorSlug,
  instance?: string,
): Promise<Response<boolean>> {
  try {
    const target = repo.getConnectorByUserIdAndSlug(userId, slug, instance);
    const wasPrimary = instance === undefined || target?.isPrimary === true;

    const data = repo.disconnectConnectorBySlug(userId, slug, instance);
    if (wasPrimary) {
      deactivateCronJobsByRequires(userId, slug);
    }

    publishConnector(userId, slug, instance);
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Deletes a connector connection completely from the database.
 */
export async function deleteConnector(
  userId: string,
  providerSlug: string,
  instance?: string,
): Promise<Response<boolean>> {
  try {
    const data = repo.deleteConnector(userId, providerSlug, instance);
    deactivateCronJobsByRequires(userId, providerSlug);
    publishConnector(userId, providerSlug, instance);
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Resolves authentication context (access token) for a specified connector.
 * If direct access token is passed in overrides, it takes precedence.
 * Otherwise, fetches the user's active connector connection from SQLite.
 */
export async function resolveConnectorContext(
  userId?: string,
  providerSlug: ProviderSlug = "meta",
  overrides?: Partial<ConnectorContext>,
): Promise<Response<ConnectorContext>> {
  try {
    if (!userId) {
      return {
        success: false,
        error:
          "Authentication required: user session is missing or unauthenticated.",
      };
    }

    // Direct token override takes precedence
    if (overrides?.accessToken) {
      return {
        success: true,
        data: {
          userId,
          providerSlug,
          accessToken: overrides.accessToken,
        },
      };
    }

    const conn = repo.getConnectorByUserIdAndProviderSlug(userId, providerSlug);
    if (!conn || !conn.accessToken) {
      return {
        success: false,
        error: `${providerSlug} is not connected. Please connect your account in Connectors.`,
      };
    }

    return {
      success: true,
      data: {
        userId,
        providerSlug,
        accessToken: conn.accessToken,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
