/**
 * Outbound-URL policy for tool arguments.
 *
 * Agents can be steered — directly or through retrieved content — into
 * fetching a URL that reaches the host's own network. OWASP LLM06 (excessive
 * agency) and LLM05 (improper output handling → SSRF) both call for restricting
 * what a model-driven tool may reach, so this module accepts only public HTTP(S)
 * destinations and rejects every private, loopback, link-local, and metadata
 * address before the tool body runs.
 *
 * This is a pre-flight check on the literal argument. It cannot follow
 * redirects; a fetch that 302s to `127.0.0.1` is still the tool's problem, which
 * is why tools must use a validating HTTP client (see the package README).
 *
 * @module @openai-harness/guardrails
 */

import { isIP } from "node:net";

const HTTP_SCHEME = /^https?:\/\//i;
const DANGEROUS_SCHEME = /^(?:file|ftp|ftps|gopher|dict|ldap|ldaps|tftp|ssh|telnet|ws|wss|javascript|vbscript):/i;
const DATA_SCHEME = /^data:/i;
const DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml);/i;

/**
 * Whether an IPv4 address is outside the public unicast space.
 *
 * @param address - dotted-quad address.
 * @returns true for loopback, private, link-local, CGNAT, multicast, or reserved.
 */
export function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/**
 * Whether an IPv6 address is loopback, unspecified, unique-local, or link-local.
 *
 * @param address - unbracketed IPv6 address.
 * @returns true when the address is not public unicast.
 */
export function isPrivateIPv6(address: string): boolean {
  const host = address.toLowerCase();
  if (host === "::1" || host === "::") return true;
  if (host.startsWith("fc") || host.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(host)) return true;
  const mapped = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  return mapped !== null && isPrivateIPv4(mapped[1]!);
}

/**
 * Normalize legacy IPv4 spellings Node's URL parser leaves alone.
 *
 * @param hostname - URL hostname.
 * @returns a dotted-quad address, or undefined when it is not numeric.
 */
function numericIPv4(hostname: string): string | undefined {
  if (/^\d+$/.test(hostname)) {
    const value = Number(hostname);
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) return undefined;
    return [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff).join(".");
  }
  const hex = hostname.match(/^0x([0-9a-f]+)$/i);
  if (hex) {
    const value = Number.parseInt(hex[1]!, 16);
    if (!Number.isSafeInteger(value) || value > 0xffffffff) return undefined;
    return [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff).join(".");
  }
  return undefined;
}

/**
 * Whether one hostname resolves inside a non-public network namespace.
 *
 * @param hostname - URL hostname, with or without IPv6 brackets.
 * @returns true for localhost, private IPs, and cloud metadata hosts.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "metadata.google.internal" || host === "metadata") return true;

  const numeric = numericIPv4(host);
  if (numeric !== undefined) return isPrivateIPv4(numeric);

  const version = isIP(host);
  if (version === 4) return isPrivateIPv4(host);
  if (version === 6) return isPrivateIPv6(host);
  return false;
}

/**
 * Classify one argument string as an outbound destination.
 *
 * @param value - candidate string.
 * @param allowPrivateHosts - deployment override for deliberate local access.
 * @returns a denial reason, or undefined when the value is safe or not a URL.
 */
export function unsafeUrlReason(
  value: string,
  allowPrivateHosts = false,
): string | undefined {
  const trimmed = value.trim();
  if (DANGEROUS_SCHEME.test(trimmed)) {
    return `blocked URL scheme in tool arguments: ${trimmed.slice(0, 16)}…`;
  }
  if (DATA_SCHEME.test(trimmed) && !DATA_IMAGE.test(trimmed)) {
    return "blocked data: URL in tool arguments";
  }
  if (!HTTP_SCHEME.test(trimmed)) return undefined;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (allowPrivateHosts) return undefined;
  if (isPrivateHost(url.hostname)) {
    return `blocked private-network URL in tool arguments: ${url.hostname}`;
  }
  return undefined;
}

/**
 * Walk arbitrary tool arguments and report the first unsafe URL.
 *
 * @param args - parsed tool arguments.
 * @param allowPrivateHosts - deployment override for deliberate local access.
 * @returns a denial reason, or undefined when every URL is public.
 */
export function findUnsafeUrl(
  args: unknown,
  allowPrivateHosts = false,
  depth = 0,
): string | undefined {
  if (depth > 8) return undefined;
  if (typeof args === "string") {
    return unsafeUrlReason(args, allowPrivateHosts);
  }
  if (Array.isArray(args)) {
    for (const item of args) {
      const reason = findUnsafeUrl(item, allowPrivateHosts, depth + 1);
      if (reason !== undefined) return reason;
    }
    return undefined;
  }
  if (args !== null && typeof args === "object") {
    for (const value of Object.values(args as Record<string, unknown>)) {
      const reason = findUnsafeUrl(value, allowPrivateHosts, depth + 1);
      if (reason !== undefined) return reason;
    }
  }
  return undefined;
}
