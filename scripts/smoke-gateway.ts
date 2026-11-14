/**
 * Local gateway smoke test: bootstraps an anonymous user, calls one unary
 * endpoint over the HTTP carrier, then opens a `session/follow` stream over the
 * Remote stream mux.
 * Run with: pnpm exec tsx scripts/smoke-gateway.ts
 */
import process from "node:process";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { createAuthSession } from "../apps/gateway/src/auth";
import { createAnonymousUser } from "@openai-harness/google-account";
import { getSessionsByUserIdView } from "@openai-harness/session-persistence";
import { endpointForMethod } from "@openai-harness/client-connection";
import {
  parseRemoteStreamServerMessage,
  REMOTE_STREAM_MUX_PATH,
  type SessionFollowFrame,
} from "@openai-harness/sdk-protocol";

process.loadEnvFile(".env");
const port = process.env.GATEWAY_PORT ?? "4000";
const origin = process.env.GATEWAY_ALLOWED_ORIGINS?.split(",")[0] ?? "http://localhost:3000";

async function main(): Promise<void> {
  const userRes = await createAnonymousUser();
  if (!userRes.success || !userRes.data) throw new Error(userRes.error);
  const sessionsRes = await getSessionsByUserIdView(userRes.data.id);
  if (!sessionsRes.success || !sessionsRes.data?.length) {
    throw new Error("default sessions were not seeded");
  }
  const sessions = sessionsRes.data;
  const token = await createAuthSession(userRes.data);
  const cookie = `ads-easy-session=${token}`;

  const rpcId = randomUUID();
  const response = await fetch(
    `http://127.0.0.1:${port}/api/${endpointForMethod("session.list")}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie, origin },
      body: JSON.stringify({
        type: "client-request",
        rpcId,
        method: endpointForMethod("session.list"),
        payload: { args: {} },
      }),
    },
  );
  const envelope = (await response.json()) as {
    rpcId?: string;
    result?: { ok?: boolean; value?: unknown };
  };
  if (
    envelope.rpcId !== rpcId ||
    envelope.result?.ok !== true ||
    !Array.isArray(envelope.result.value)
  ) {
    throw new Error(`session.list failed: ${JSON.stringify(envelope)}`);
  }
  console.log(`session.list: ${String(envelope.result.value.length)} sessions`);

  const streamId = randomUUID();
  const ws = new WebSocket(`ws://127.0.0.1:${port}${REMOTE_STREAM_MUX_PATH}`, {
    headers: { cookie, origin },
  });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });

  await new Promise<void>((resolve, reject) => {
    ws.on("message", (raw) => {
      const frame = parseRemoteStreamServerMessage(raw.toString());
      if (frame.type === "item") {
        const value = frame.value as SessionFollowFrame;
        if (value.type === "snapshot") {
          console.log(
            `session/follow snapshot: ${String(value.records.length)} records, cursor ${String(value.cursor)}`,
          );
          // Cancel is terminal for the Host and sends no end or error frame.
          ws.send(JSON.stringify({ type: "cancel", streamId }));
          resolve();
        }
        return;
      }
      if (frame.type === "end") {
        resolve();
        return;
      }
      reject(new Error(`stream failed: ${frame.error.message}`));
    });
    ws.once("error", reject);
    ws.send(
      JSON.stringify({
        type: "open",
        streamId,
        endpoint: "session/follow",
        payload: { args: { sessionId: sessions[0]!.id } },
      }),
    );
  });

  ws.close();
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
