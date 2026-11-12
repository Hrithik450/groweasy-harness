import test from "node:test";
import assert from "node:assert/strict";

import {
  configureConnectorsClient,
  connectorsFetch,
  resetConnectorsClient,
  resolveGatewayHttpBase,
  resolveGatewayUrl,
} from "../src/client/connectors.client";

test("resolveGatewayHttpBase converts ws and wss bases to http origins", () => {
  assert.equal(resolveGatewayHttpBase("ws://localhost:4000"), "http://localhost:4000/");
  assert.equal(resolveGatewayHttpBase("wss://gateway.example.com"), "https://gateway.example.com/");
  assert.equal(
    resolveGatewayHttpBase("https://gateway.example.com/base?x=1#y"),
    "https://gateway.example.com/",
  );
});

test("configureConnectorsClient overrides the resolved origin", () => {
  resetConnectorsClient();
  configureConnectorsClient({ baseUrl: "ws://gateway.test:5000" });
  assert.equal(resolveGatewayUrl(), "ws://gateway.test:5000");
  resetConnectorsClient();
});

test("connectorsFetch resolves connector routes on the gateway origin", async () => {
  resetConnectorsClient();
  const calls: string[] = [];
  configureConnectorsClient({
    baseUrl: "http://gateway.test:4000",
    fetch: (async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response("{}", { status: 200 });
    }) as typeof fetch,
  });

  const response = await connectorsFetch("/api/connectors", {
    method: "GET",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["http://gateway.test:4000/api/connectors"]);
  resetConnectorsClient();
});
