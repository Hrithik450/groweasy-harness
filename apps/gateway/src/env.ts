/**
 * Loads `.env` for the standalone gateway.
 *
 * Next.js loads `.env` itself, but a plain `tsx apps/gateway/src/index.ts`
 * process does not. This module must be imported before any module that reads environment
 * variables at module-evaluation time (notably the database singleton).
 *
 * @module @openai-harness/gateway
 */

import path from "node:path";
import { PROJECT_ROOT } from "@openai-harness/paths";

const loadEnvFile = (
  process as unknown as {
    loadEnvFile?: (path?: string) => void;
  }
).loadEnvFile;

if (typeof loadEnvFile === "function") {
  try {
    // Resolve from the project root, not the caller's cwd, so the gateway
    // boots the same way from repo root or `apps/gateway`. A deployed
    // checkout keeps its environment outside the repository and points
    // here, because `loadEnvFile` overwrites inherited variables and the
    // repository's `.env` belongs to local development.
    loadEnvFile(
      process.env.GATEWAY_ENV_FILE?.trim() ||
        path.join(PROJECT_ROOT, ".env"),
    );
  } catch {
    // No .env file (or an older Node without support): rely on the process env.
  }
}

export {};
