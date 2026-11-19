/**
 * Server-sent-event frame parsing.
 *
 * The reader that consumes this lives with the chat stream; the parsing does
 * not, so it can be reused and tested on its own.
 *
 * @module @/lib/utils/sse
 */

/** One decoded SSE frame: its event name and joined data lines. */
export interface SSEFrame {
  event: string;
  data: string;
}

/** Parse one raw `event:`/`data:` block; comment-only blocks yield null. */
export function parseFrame(raw: string): SSEFrame | null {
  let event = "message";
  const data: string[] = [];

  for (const line of raw.split("\n")) {
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice(5).trim());
    }
  }

  return data.length > 0 ? { event, data: data.join("\n") } : null;
}

/** Decode a byte stream into frames as they complete. */
export async function* readFrames(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SSEFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = parseFrame(buffer.slice(0, boundary));
        if (frame) yield frame;
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
      }
    }

    const tail = parseFrame(buffer);
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}
