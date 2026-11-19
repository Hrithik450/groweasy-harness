import { configureDefaultAgentLoop } from "./host-adapter";

export * from "./client";
export * from "./sessions";
export * from "./types";
export * from "./utils";
export * from "./video";
export * from "./loop/agent";
export * from "./loop/inbox";
export * from "./loop/tool.calls";
export * from "./registry";
export * from "./compose.turn";
export { configureDefaultAgentLoop };

configureDefaultAgentLoop();
