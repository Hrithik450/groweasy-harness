/**
 * Browser RPC transport for the agent gateway.
 *
 * The package is framework-free: it reads no application configuration and
 * imports no Next.js or `@/lib` modules. The host application constructs
 * {@link RpcClient} with its own gateway URL.
 *
 * @module @openai-harness/client-rpc
 */

export { RpcClient, RpcClientError } from "./client";
export type {
  RpcCallOptions,
  RpcClientOptions,
  RpcSocket,
  RpcSocketFactory,
  RpcSubscription,
} from "./client";
