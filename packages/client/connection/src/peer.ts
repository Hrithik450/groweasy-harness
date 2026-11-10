/**
 * The Peer: one party admitted to this Host, whose lifetime owns a Cordis
 * child-context effect scope.
 *
 * Ported from `packages/client/connection/src/peer.ts` in the reference
 * deepseek-harness repository. The reference obtains its scope through
 * `@deepseek-ai/dsh-scope`'s `createScope`; this repository does not vendor
 * that package, so the scope is a child Cordis plugin fiber instead. That is
 * the same lifetime primitive: the Peer's `ctx.effect` registrations run when
 * the fiber is disposed or when its owner unloads.
 *
 * Adaptation: Cordis can only register an effect on an active fiber, so
 * creation is asynchronous (`Peer.create`). The `principal` union is replaced
 * by the gateway's authenticated `userId`; every other Peer member matches the
 * reference.
 *
 * @module @openai-harness/client-connection
 */

import { randomUUID } from "node:crypto";
import type { Context } from "@deepseek-ai/cordis";

/** Construction options for one {@link Peer}. */
export interface PeerOptions {
  /** Authenticated user every call through this Peer speaks for. */
  readonly userId: string;
  /** Omission permits stream participation; non-owner Peers still cannot answer waterfalls. */
  readonly interactions?: "answer" | "none";
}

/** The Peer surface a carrier or Gateway method may rely on. */
export interface PeerScope {
  readonly id: string;
  /** Authenticated user id; the gateway's substitute for the reference principal. */
  readonly userId: string;
  /** Scope context every registration for this Peer hangs under. */
  readonly ctx: Context;
  readonly interactions: "answer" | "none";
  /** Aborted when this Peer's scope ends. */
  readonly signal: AbortSignal;
  /** Dispose the scope; racing calls share one completion. */
  dispose(): Promise<void>;
}

/**
 * One Peer's scope. The instance is its own scope key, so listeners registered
 * through `peer.ctx` hear only this Peer's scoped events.
 */
export class Peer implements PeerScope {
  readonly id: string = randomUUID();
  readonly ctx: Context;
  readonly userId: string;
  readonly interactions: "answer" | "none";
  readonly signal: AbortSignal;
  private readonly fiber: { readonly ctx: Context; dispose: () => Promise<void> };

  private constructor(
    fiber: { readonly ctx: Context; dispose: () => Promise<void> },
    options: PeerOptions,
    lifetime: AbortController,
  ) {
    this.fiber = fiber;
    this.ctx = fiber.ctx;
    this.userId = options.userId;
    this.interactions = options.interactions ?? "answer";
    this.signal = lifetime.signal;
  }

  /**
   * Create one Peer under an owner Context. The peer is disposed when its
   * owner unloads, and every effect it registers ends with it.
   * @param owner - Context the scope fiber hangs under.
   * @param options - the user fixed for this Peer's lifetime.
   * @returns the active Peer.
   */
  static async create(owner: Context, options: PeerOptions): Promise<Peer> {
    const fiber = owner.plugin({ name: "peer", apply: () => {} });
    await fiber;
    const lifetime = new AbortController();
    const peer = new Peer(fiber, options, lifetime);
    // Runs however the scope ends: dispose() or the owner Context unloading.
    peer.ctx.effect(
      () => () => {
        lifetime.abort(new Error(`Peer ${peer.id} was disposed`));
      },
      "client-connection: Peer lifetime",
    );
    return peer;
  }

  /** Tear down every connection-lifetime registration; racing calls share one completion. */
  dispose(): Promise<void> {
    return this.fiber.dispose();
  }
}
