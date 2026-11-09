import { createHash } from "node:crypto";
import { type AgentFunctionCallOutputParam } from "openai/resources/beta/agents/agents";

export function sanitizeError(error: unknown, maxLength = 4000): string {
  if (!error) return "Tool execution failed";
  let str =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : JSON.stringify(error);

  str = str.replace(
    /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]{100,}/g,
    "[base64 image data truncated]",
  );

  str = str.replace(/[A-Za-z0-9+/]{300,}={0,2}/g, "[binary data truncated]");

  if (str.length > maxLength) {
    return (
      str.slice(0, maxLength) +
      `... [truncated ${str.length - maxLength} chars]`
    );
  }

  return str;
}

const MAX_DURABLE_MCP_BYTES = 950_000;

export function sanitizeOutput(
  output: unknown,
  maxStringLength = 200000,
): AgentFunctionCallOutputParam {
  if (Array.isArray(output)) {
    const sanitized = output.map((item) => {
      if (item && typeof item === "object" && item.type === "input_text") {
        const text =
          typeof item.text === "string" ? item.text : String(item.text ?? "");
        if (text.length > maxStringLength) {
          return {
            ...item,
            text:
              text.slice(0, maxStringLength) +
              `... [truncated ${text.length - maxStringLength} chars]`,
          };
        }
        return {
          ...item,
          text,
        };
      }
      if (item && typeof item === "object" && item.type === "input_image") {
        return {
          type: "input_image" as const,
          image_url: (item as { image_url: string }).image_url,
        };
      }
      return item;
    });

    const currentBytes = JSON.stringify(sanitized).length;
    if (currentBytes > MAX_DURABLE_MCP_BYTES) {
      return [
        {
          type: "input_text" as const,
          text: `Error: Tool output size (${Math.round(currentBytes / 1024)}KB) exceeds the 1MB payload limit. Please reduce the timeline or scope of the asset you want to read/analyze (e.g. inspect a smaller 5-10s time segment) so it can be processed in smaller chunks.`,
        },
      ];
    }

    return sanitized;
  }

  if (typeof output === "string") {
    if (output.length > maxStringLength) {
      return (
        output.slice(0, maxStringLength) +
        `... [truncated ${output.length - maxStringLength} chars]`
      );
    }
    return output;
  }

  if (output) {
    try {
      const jsonStr = JSON.stringify(output);
      if (jsonStr.length > maxStringLength) {
        return (
          jsonStr.slice(0, maxStringLength) +
          `... [truncated ${jsonStr.length - maxStringLength} chars]`
        );
      }
      return jsonStr;
    } catch {
      return "Tool execution succeeded";
    }
  }

  return "Tool execution succeeded";
}

/**
 * Robustly parses a JSON string that may be embedded in markdown code blocks or conversational text.
 */
export function extractJsonFromResponse(
  text: string,
): Record<string, unknown> | null {
  if (!text) return null;

  try {
    return JSON.parse(text.trim());
  } catch {
  }

  const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    try {
      return JSON.parse(jsonBlockMatch[1].trim());
    } catch {
    }
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
    }
  }

  return null;
}

/**
 * Computes a deterministic SHA-256 fingerprint for an agent's combined configuration (instructions + tools).
 * Used for cache-invalidation: if the prompt or tools change, the combinative hash changes, triggering
 * session deletion on OpenAI and the creation of a clean new session.
 */
export function computeAgentHash(
  instructions: string,
  tools: unknown[],
): string {
  return createHash("sha256")
    .update(JSON.stringify({ instructions, tools }))
    .digest("hex")
    .slice(0, 16);
}
