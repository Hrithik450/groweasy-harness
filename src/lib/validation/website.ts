/**
 * Website-address validation (client + server safe).
 *
 * Ported from the GeTopFloor/Outbid validator: syntax, HTTPS-only, no
 * localhost/raw IPs, no test/placeholder domains, no adult TLDs or keywords.
 * Pair with `verifyWebsiteLive` on the server for DNS/TLS/content checks.
 *
 * @module @/lib/validation/website
 */

const BLOCKED_TLDS = new Set([
  "local",
  "localhost",
  "internal",
  "invalid",
  "test",
  "example",
  "lan",
  "home",
  "onion",
  "corp",
]);

const ADULT_TLDS = new Set([
  "xxx",
  "adult",
  "porn",
  "sex",
  "sexy",
  "cam",
  "dating",
  "fetish",
  "tube",
  "webcam",
  "strip",
]);

const BLOCKED_DOMAINS = new Set([
  "test.com",
  "test.org",
  "test.net",
  "example.com",
  "example.org",
  "example.net",
  "dummy.com",
  "fake.com",
  "placeholder.com",
  "testsite.com",
  "mytest.com",
  "testdomain.com",
  "sample.com",
  "demo.com",
]);

const ADULT_KEYWORD_PATTERNS: RegExp[] = [
  /(?:porn|porno|xxx|nsfw|erotic|erotica|stripchat|onlyfans|xhamster|redtube|youporn|xvideos|chaturbate|brazzers|adultwork|escort|camgirl|camsoda|livejasmin|beeg|spankbang|hentai|rule34)/i,
  /(?:^|[.-])(?:porn|xxx|nsfw|sex|erotic|escort|hentai|camgirl|stripchat)(?:[.-]|$)/i,
];

export interface WebsiteValidationResult {
  valid: boolean;
  cleanUrl?: string;
  domain?: string;
  error?: string;
}

/** Bare hostname without `www.`, for identity/instance matching. */
export function extractRootHostname(urlOrHost: string): string {
  if (!urlOrHost) return "";
  try {
    const raw = urlOrHost.trim();
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProto).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return urlOrHost
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      .split(":")[0]
      .toLowerCase()
      .trim();
  }
}

/**
 * Private, loopback, link-local, carrier-grade NAT, documentation and metadata
 * ranges. Keeps user-supplied URLs from reaching internal services (SSRF).
 */
export function isPrivateIpAddress(ip: string): boolean {
  if (!ip || typeof ip !== "string") return true;
  const clean = ip
    .trim()
    .toLowerCase()
    .replace(/^::ffff:/, "");

  const ipv4 = clean.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const p = ipv4.slice(1, 5).map(Number);
    if (p.some((n) => n > 255)) return true;
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
    if (p[0] === 169 && p[1] === 254) return true; // link-local + cloud metadata
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
    if (p[0] === 192 && p[1] === 0 && p[2] === 2) return true;
    if (p[0] === 198 && p[1] === 51 && p[2] === 100) return true;
    if (p[0] === 203 && p[1] === 0 && p[2] === 113) return true;
    if (p[0] >= 224) return true;
    return false;
  }

  return (
    clean === "::1" ||
    clean === "::" ||
    clean === "0:0:0:0:0:0:0:1" ||
    clean === "0:0:0:0:0:0:0:0" ||
    clean.startsWith("fc") ||
    clean.startsWith("fd") ||
    clean.startsWith("fe8") ||
    clean.startsWith("fe9") ||
    clean.startsWith("fea") ||
    clean.startsWith("feb")
  );
}

export function isAdultOrBlockedHostname(hostname: string): {
  blocked: boolean;
  isAdult?: boolean;
  reason?: string;
} {
  const host = hostname.toLowerCase().trim();
  const tld = host.split(".").pop() ?? "";

  if (ADULT_TLDS.has(tld)) {
    return {
      blocked: true,
      isAdult: true,
      reason: `The .${tld} domain extension is reserved for adult content and is not accepted.`,
    };
  }
  if (BLOCKED_TLDS.has(tld)) {
    return {
      blocked: true,
      reason: `The .${tld} domain extension is not a valid public web extension.`,
    };
  }
  if (
    BLOCKED_DOMAINS.has(host) ||
    host.startsWith("teststartup.") ||
    host.startsWith("fakestartup.") ||
    host.startsWith("dummystartup.")
  ) {
    return {
      blocked: true,
      reason:
        "Test and placeholder domains (like example.com or dummy.com) are not accepted. Enter the real website.",
    };
  }
  if (ADULT_KEYWORD_PATTERNS.some((pattern) => pattern.test(host))) {
    return {
      blocked: true,
      isAdult: true,
      reason:
        "Adult (18+), sexually explicit, or NSFW websites are not supported.",
    };
  }
  return { blocked: false };
}

/**
 * Validate syntax, HTTPS-only protocol and hostname structure. Synchronous and
 * safe on the client; the business-profile routes also call the live verifier.
 */
export function validateWebsiteSyntax(inputUrl: string): WebsiteValidationResult {
  if (!inputUrl || typeof inputUrl !== "string") {
    return {
      valid: false,
      error: "Please enter a website URL (e.g. acme.com or yourbrand.ai).",
    };
  }

  let trimmed = inputUrl.trim();
  if (/\s/.test(trimmed)) {
    return { valid: false, error: "Website address can’t contain spaces." };
  }

  if (/^[a-z0-9+.-]+:/i.test(trimmed)) {
    if (!trimmed.toLowerCase().startsWith("https://")) {
      return {
        valid: false,
        error: "Only secure HTTPS websites (https://...) are accepted.",
      };
    }
  } else {
    trimmed = `https://${trimmed}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      error: "Enter a valid website address, like https://acme.com.",
    };
  }

  if (parsed.protocol !== "https:") {
    return {
      valid: false,
      error: "Only secure HTTPS websites (https://...) are accepted.",
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0" ||
    hostname === "::"
  ) {
    return {
      valid: false,
      error: "Localhost addresses are not permitted. Enter a public website.",
    };
  }

  if (
    /^[0-9.]+$/.test(hostname) ||
    hostname.startsWith("[") ||
    hostname.includes(":") ||
    isPrivateIpAddress(hostname)
  ) {
    return {
      valid: false,
      error: "Raw IP addresses are not permitted. Enter a valid domain name.",
    };
  }

  const parts = hostname.split(".");
  if (parts.length < 2) {
    return {
      valid: false,
      error: "Enter a complete domain name with an extension (e.g. brand.com).",
    };
  }
  for (const part of parts) {
    if (!part || part.length > 63 || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(part)) {
      return {
        valid: false,
        error: "The domain contains invalid characters. Check the URL.",
      };
    }
  }

  const tld = parts[parts.length - 1];
  if (BLOCKED_TLDS.has(tld) || !/^[a-z]{2,24}$/.test(tld)) {
    return {
      valid: false,
      error: `The .${tld} domain extension is not a valid public web extension.`,
    };
  }

  const hostCheck = isAdultOrBlockedHostname(hostname);
  if (hostCheck.blocked) {
    return { valid: false, error: hostCheck.reason };
  }

  return {
    valid: true,
    cleanUrl: parsed.toString().replace(/\/$/, ""),
    domain: hostname,
  };
}
