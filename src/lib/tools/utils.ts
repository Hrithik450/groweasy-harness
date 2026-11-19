/**
 * Tool result helpers shared by every tab writer.
 *
 * A failing tool always answers the same way: `success: false`, one readable
 * line for the model, and the same line as `error` for the caller.
 *
 * @module @/lib/tools/utils
 */

import type { InputContentParam } from "openai/resources/beta/agents/agents";
import type { ToolOutput } from "@/lib/tools/types";

/**
 * One failed tool result.
 *
 * @param errorMsg - what went wrong, in plain words the model can act on.
 */
export function toolFailure<TData = unknown>(
  errorMsg: string,
): ToolOutput<TData> {
  return {
    success: false,
    data: {
      contentParts: [{ type: "input_text", text: `Error: ${errorMsg}` }],
    } as unknown as TData,
    error: errorMsg,
  };
}
