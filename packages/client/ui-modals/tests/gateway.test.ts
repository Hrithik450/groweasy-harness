import test from "node:test";
import assert from "node:assert/strict";

import {
  configureModalsGateway,
  gatewayFetch,
  resetModalsGateway,
  resolveGatewayBaseUrl,
  resolveGatewayHttpBase,
} from "../src/client/gateway";
import {
  configureShellNavigation,
  navigateTo,
} from "../src/client/navigation";

test("resolveGatewayHttpBase converts ws and wss bases to http origins", () => {
  resetModalsGateway();
  configureModalsGateway({ url: "ws://localhost:4000" });
  assert.equal(resolveGatewayHttpBase(), "http://localhost:4000/");
  configureModalsGateway({ url: "wss://gateway.example.com" });
  assert.equal(resolveGatewayHttpBase(), "https://gateway.example.com/");
  resetModalsGateway();
});

test("configureModalsGateway overrides the resolved base", () => {
  resetModalsGateway();
  configureModalsGateway({ url: "ws://gateway.test:5000" });
  assert.equal(resolveGatewayBaseUrl(), "ws://gateway.test:5000");
  resetModalsGateway();
});

test("gatewayFetch addresses application routes on the Gateway origin", async () => {
  resetModalsGateway();
  const calls: string[] = [];
  configureModalsGateway({
    url: "http://gateway.test:4000",
    fetch: (async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response("{}", { status: 200 });
    }) as typeof fetch,
  });

  const response = await gatewayFetch("/api/download?url=x&filename=y.png");
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    "http://gateway.test:4000/api/download?url=x&filename=y.png",
  ]);
  resetModalsGateway();
});

test("shell navigation uses the configured hook", () => {
  const visited: string[] = [];
  configureShellNavigation((href) => visited.push(href));
  navigateTo("/c/session-1");
  assert.deepEqual(visited, ["/c/session-1"]);
  configureShellNavigation(undefined);
});
