/**
 * Connector service: the Cordis `ctx.connectors` facade plus the free-function
 * API the application's call sites already use.
 *
 * The facade owns the domain lifecycle (`ctx.storageDomain.open`), registers
 * named provider descriptors, and delegates all state operations to
 * {@link ConnectorRepository}. The free functions preserve the application's
 * former `connectors.service.ts` contract exactly: they resolve the
 * process-wide repository and wrap failures in `{ success, error }` instead of
 * throwing.
 *
 * Provider packages (`@openai-harness/connector-meta`,
 * `@openai-harness/connector-shopify`, ...) export a `ConnectorProvider`
 * descriptor. Host composition registers them:
 *
 * ```ts
 * ctx.plugin(ConnectorService);
 * ctx.connectors.registerProvider(metaConnectorProvider);
 * ```
 *
 * @module @openai-harness/connector/src/service
 */

import { Service } from "@deepseek-ai/cordis";
import type { Context } from "@deepseek-ai/cordis";

import { ConnectorRepository } from "./repository";
import { connectorDomain } from "./storage";
import {
  configureConnectorRepository,
  releaseConnectorRepository,
  requireConnectorRepository,
} from "./store";
import type { StoredConnector } from "./storage";
import type {
  Connector,
  ConnectorContext,
  ConnectorProvider,
  ConnectorResponse,
  NewConnector,
} from "./types";
import { ConnectorStoreError } from "./types";

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** Durable connector state and the named provider registry. */
    connectors: ConnectorService;
  }
}

/** Human-readable message for an unknown thrown value. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Run a repository operation and translate failures into the application's
 * service envelope. The repository itself stays throwing.
 */
async function guard<T>(
  run: () => Promise<T>,
): Promise<ConnectorResponse<T>> {
  try {
    return { success: true, data: await run() };
  } catch (error) {
    return { success: false, error: messageOf(error) };
  }
}

/**
 * Upsert one connector configuration for a user.
 * @param data - fields to write; `undefined` preserves stored values.
 */
export function upsertConnector(
  data: NewConnector,
): Promise<ConnectorResponse<Connector>> {
  return guard(() => requireConnectorRepository().upsert(data));
}

/** Every connector owned by one user, ordered by slug. */
export function getConnectorsByUserId(
  userId: string,
): Promise<ConnectorResponse<Connector[]>> {
  return guard(() => requireConnectorRepository().listByUserId(userId));
}

/** One connector by stored connector slug. */
export function getConnectorByUserIdAndSlug(
  userId: string,
  slug: string,
): Promise<ConnectorResponse<Connector | null>> {
  return guard(() => requireConnectorRepository().getBySlug(userId, slug));
}

/** One connector by provider slug, including legacy provider aliases. */
export function getConnectorByUserIdAndProviderSlug(
  userId: string,
  providerSlug: string,
): Promise<ConnectorResponse<Connector | null>> {
  return guard(() =>
    requireConnectorRepository().getByProviderSlug(userId, providerSlug),
  );
}

/** Disconnect one connector by exact stored slug, keeping the row. */
export function disconnectConnectorBySlug(
  userId: string,
  slug: string,
): Promise<ConnectorResponse<boolean>> {
  return guard(() => requireConnectorRepository().disconnectBySlug(userId, slug));
}

/** Delete one connector by slug or provider slug, aliases included. */
export function deleteConnector(
  userId: string,
  providerSlug: string,
): Promise<ConnectorResponse<boolean>> {
  return guard(() =>
    requireConnectorRepository().deleteBySlugOrProviderSlug(userId, providerSlug),
  );
}

/**
 * Resolve authentication context (access token) for a connector. An explicit
 * token in `overrides` wins; otherwise the token stored on the connector
 * record is read from the connector domain.
 */
export async function resolveConnectorContext(
  userId?: string,
  providerSlug = "meta",
  overrides?: Partial<ConnectorContext>,
): Promise<ConnectorResponse<ConnectorContext>> {
  try {
    if (!userId) {
      return {
        success: false,
        error:
          "Authentication required: user session is missing or unauthenticated.",
      };
    }

    if (overrides?.accessToken) {
      return {
        success: true,
        data: { userId, providerSlug, accessToken: overrides.accessToken },
      };
    }

    const connector = await requireConnectorRepository().getByProviderSlug(
      userId,
      providerSlug,
    );
    if (!connector?.accessToken) {
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
        accessToken: connector.accessToken,
      },
    };
  } catch (error) {
    return { success: false, error: messageOf(error) };
  }
}

/**
 * Synchronous non-secret lookup for callers that cannot await (the workflow
 * host reads connector metadata while building a run).
 */
export function getConnectorRecordByUserIdAndSlug(
  userId: string,
  slug: string,
): StoredConnector | null {
  return requireConnectorRepository().findRecordBySlug(userId, slug);
}

/** Synchronous non-secret provider lookup, alias-aware. */
export function getConnectorRecordByUserIdAndProviderSlug(
  userId: string,
  providerSlug: string,
): StoredConnector | null {
  return requireConnectorRepository().findRecordByProviderSlug(
    userId,
    providerSlug,
  );
}

/**
 * `ctx.connectors`: opens the `connectors` domain, binds its repository, and
 * keeps the named provider registry.
 *
 * Opening the domain is the only lifecycle work; closing it releases the
 * process-wide binding.
 */
export class ConnectorService extends Service {
  /** The storage-domain facility must be mounted before the domain opens. */
  static inject = ["storageDomain"];

  /** Provider registry: provider slug → descriptor. */
  private readonly providers = new Map<string, ConnectorProvider>();
  /** Domain-open and teardown registration; awaited by `Service.init`. */
  private readonly initialized: PromiseLike<unknown>;

  constructor(ctx: Context) {
    super(ctx, "connectors");
    this.initialized = ctx.effect(async () => {
      const domain = await ctx.storageDomain.open(connectorDomain);
      const repository = new ConnectorRepository(domain);
      configureConnectorRepository(repository);
      return async () => {
        releaseConnectorRepository(repository);
        await domain.close();
      };
    });
  }

  async [Service.init](): Promise<void> {
    await this.initialized;
  }

  /** The bound repository; requires the domain to be open. */
  get repository(): ConnectorRepository {
    return requireConnectorRepository();
  }

  /**
   * Register one provider descriptor for this deployment.
   * @param provider - descriptor exported by a connector package.
   * @returns a disposer that removes this registration.
   */
  registerProvider(provider: ConnectorProvider): () => void {
    if (this.providers.has(provider.providerSlug)) {
      throw new ConnectorStoreError(
        "connector_invalid",
        `Connector provider "${provider.providerSlug}" is already registered`,
      );
    }
    this.providers.set(provider.providerSlug, provider);
    return () => {
      if (this.providers.get(provider.providerSlug) === provider) {
        this.providers.delete(provider.providerSlug);
      }
    };
  }

  /** Registered providers, in registration order. */
  listProviders(): readonly ConnectorProvider[] {
    return [...this.providers.values()];
  }

  /** Resolve one provider by provider slug, stored slug, or alias. */
  providerFor(value: string): ConnectorProvider | undefined {
    for (const provider of this.providers.values()) {
      if (provider.providerSlug === value || provider.slug === value) {
        return provider;
      }
      if (provider.aliases?.includes(value)) return provider;
    }
    return undefined;
  }

  /** See {@link ConnectorRepository.upsert}. */
  upsert(data: NewConnector): Promise<Connector> {
    return this.repository.upsert(data);
  }

  /** See {@link ConnectorRepository.listByUserId}. */
  list(userId: string): Promise<Connector[]> {
    return this.repository.listByUserId(userId);
  }

  /** See {@link ConnectorRepository.getBySlug}. */
  getBySlug(userId: string, slug: string): Promise<Connector | null> {
    return this.repository.getBySlug(userId, slug);
  }

  /** See {@link ConnectorRepository.getByProviderSlug}. */
  getByProviderSlug(
    userId: string,
    providerSlug: string,
  ): Promise<Connector | null> {
    return this.repository.getByProviderSlug(userId, providerSlug);
  }

  /** See {@link ConnectorRepository.disconnectBySlug}. */
  disconnect(userId: string, slug: string): Promise<boolean> {
    return this.repository.disconnectBySlug(userId, slug);
  }

  /** See {@link ConnectorRepository.deleteBySlugOrProviderSlug}. */
  delete(userId: string, providerSlug: string): Promise<boolean> {
    return this.repository.deleteBySlugOrProviderSlug(userId, providerSlug);
  }
}

export default ConnectorService;
