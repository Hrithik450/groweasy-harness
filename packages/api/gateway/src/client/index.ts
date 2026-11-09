/**
 * Browser half of the Gateway transport.
 *
 * Exported from the reference deepseek-harness `packages/api/gateway/src/client`
 * entry. This transport step ports the physical mux client it is built on
 * (`RemoteStreamMuxClient`) and the uplink queue it uses; the domain
 * `ClientRemoteService` supervisor stays in the harness client until the
 * browser Connection layer is cloned.
 *
 * @module @openai-harness/api-gateway/client
 */

export {
  ClientUplinkQueue,
  RemoteStreamCarrierError,
  RemoteStreamMuxClient,
  type ConnectionWebSocket,
  type RemoteStreamSocketEvent,
} from "./stream-client";
