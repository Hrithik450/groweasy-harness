# @openai-harness/gateway

Composition root. `src/index.ts` loads `.env`, creates the root Cordis
`Context`, loads the host adapters (`browserAuth`, `sessionFollow`,
`sessionAgent`) and the transport/service plugins (`webServer`, `connection`,
`sessionController`, `typertGateway`), registers `/health`, and disposes the
root fiber on SIGINT/SIGTERM.

Source references: `apps/cli` in the reference deepseek-harness repository for
the boot/dispose shape, and this repository's former `server/index.ts` for the
process configuration (`GATEWAY_PORT`, `GATEWAY_ALLOWED_ORIGINS`).

No manual `httpServer.on('upgrade')`, heartbeat, or peer lifecycle lives here:
every one of those is owned by a service effect.
