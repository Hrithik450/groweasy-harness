/**
 * Server-side live website verification (Node only).
 *
 * Ported from the GeTopFloor/Outbid verifier: syntax, DNS resolution,
 * private-range blocking (SSRF/DNS rebinding), strict TLS, HTTP status
 * liveness, redirect inspection, Cloudflare Family adult/threat classification
 * and content age-gate/rating inspection.
 *
 * @module @/lib/validation/website.server
 */

import dns from "node:dns";
import tls from "node:tls";
import {
  isPrivateIpAddress,
  validateWebsiteSyntax,
  type WebsiteValidationResult,
} from "./website";

const TLS_TIMEOUT_MS = 4500;
const MAX_REDIRECTS = 3;

/**
 * Cloudflare 1.1.1.3 Family resolver: adult/threat domains are sinkholed to
 * 0.0.0.0 or 127.0.0.1.
 */
export async function checkAdultDomainClassification(
  domain: string,
): Promise<{ isAdult: boolean; reason?: string }> {
  if (!domain) return { isAdult: false };

  try {
    const resolver = new dns.promises.Resolver();
    resolver.setServers(["1.1.1.3", "1.0.0.3"]);

    const lookupPromise = resolver.resolve4(domain);
    const timeoutPromise = new Promise<string[]>((_, reject) =>
      setTimeout(() => reject(new Error("Family DNS lookup timed out")), 2000),
    );

    const addresses = await Promise.race([lookupPromise, timeoutPromise]);
    const sinkholed = addresses.some(
      (ip) => ip === "0.0.0.0" || ip === "127.0.0.1",
    );
    if (sinkholed) {
      return {
        isAdult: true,
        reason:
          "The domain is classified as adult or explicit content by global threat intelligence.",
      };
    }
    return { isAdult: false };
  } catch {
    // Classification is best-effort; content inspection still runs.
    return { isAdult: false };
  }
}

/** RTA/ICRA/age-gate markers that identify adult content. */
export function inspectContentForAdultCompliance(content: string): {
  isAdult: boolean;
  reason?: string;
} {
  if (!content || typeof content !== "string") return { isAdult: false };
  const lower = content.toLowerCase();

  if (lower.includes("rta-5042-1996-1404-00-rta")) {
    return { isAdult: true, reason: "Restricted To Adults (RTA) tag detected." };
  }

  if (
    /<meta\s+[^>]*name=["']rating["']\s+[^>]*content=["'](adult|mature|restricted|rta)[^"']*["']/i.test(
      content,
    ) ||
    /<meta\s+[^>]*content=["'](adult|mature|restricted|rta)[^"']*["']\s+[^>]*name=["']rating["']/i.test(
      content,
    ) ||
    /^rating:\s*(?:rta|adult|mature|restricted)/im.test(content)
  ) {
    return { isAdult: true, reason: "Adult content rating metadata detected." };
  }

  if (
    /<meta\s+[^>]*(?:og:rating|age-restriction|content-rating)["']\s+[^>]*content=["'](?:adult|18\+|mature|restricted)/i.test(
      content,
    )
  ) {
    return { isAdult: true, reason: "Age-restriction metadata detected." };
  }

  const ageGatePatterns = [
    /\b(?:are\s+you|must\s+be)\s+(?:at\s+least\s+)?18\b/i,
    /\b18\s+years\s+(?:of\s+age\s+)?or\s+older\b/i,
    /\bi\s+am\s+(?:at\s+least\s+)?18\b/i,
    /\benter\s+18\+\b/i,
    /\b(?:contains\s+)?(?:sexually\s+explicit|adult\s+entertainment|hardcore\s+porn)\b/i,
    /\bfor\s+adults\s+only\b/i,
  ];
  for (const pattern of ageGatePatterns) {
    if (pattern.test(content)) {
      return { isAdult: true, reason: "Adult age-gate disclaimer detected." };
    }
  }

  return { isAdult: false };
}

/** Syntax → adult classification → live TLS/HTTP check. */
export async function verifyWebsiteLive(
  inputUrl: string,
): Promise<WebsiteValidationResult> {
  const syntax = validateWebsiteSyntax(inputUrl);
  if (!syntax.valid || !syntax.cleanUrl) return syntax;

  const targetUrl = syntax.cleanUrl;
  const requestedDomain = syntax.domain ?? "";

  try {
    const parsed = new URL(targetUrl);
    const host = parsed.hostname.toLowerCase();
    const path = `${parsed.pathname || ""}${parsed.search || ""}`;

    const adult = await checkAdultDomainClassification(host);
    if (adult.isAdult) {
      return {
        valid: false,
        error: adult.reason ?? "Adult or explicit websites are not supported.",
      };
    }

    const check = await checkSecureTlsLiveness(host, path, requestedDomain, 0);
    if (!check.valid) {
      return {
        valid: false,
        error: check.error ?? "Website unreachable: could not verify liveness.",
      };
    }

    const status = check.status ?? 0;
    if (status === 404 || status === 410) {
      return {
        valid: false,
        error: `Website returned HTTP ${status} Not Found. Make sure the site is published.`,
      };
    }
    if (status >= 500 && status !== 503) {
      return {
        valid: false,
        error: `Website server returned HTTP ${status}. Make sure the site is online.`,
      };
    }

    const live =
      (status >= 200 && status < 400) ||
      status === 401 ||
      status === 403 ||
      status === 405 ||
      status === 429 ||
      status === 503;
    if (!live) {
      return {
        valid: false,
        error: `Website is unreachable (HTTP status ${status}). Make sure it is publicly accessible.`,
      };
    }

    return { valid: true, cleanUrl: targetUrl, domain: requestedDomain };
  } catch {
    return {
      valid: false,
      error:
        "Website unreachable: could not establish a secure HTTPS connection. Make sure the site is live.",
    };
  }
}

async function checkSecureTlsLiveness(
  currentHost: string,
  path: string,
  initialDomain: string,
  hops: number,
): Promise<{ valid: boolean; status?: number; error?: string }> {
  if (hops > MAX_REDIRECTS) {
    return {
      valid: false,
      error: "Too many redirects. Enter the site's direct domain.",
    };
  }

  let records: dns.LookupAddress[];
  try {
    records = await dns.promises.lookup(currentHost, { all: true });
  } catch {
    return {
      valid: false,
      error: "Website unreachable: the domain does not exist or DNS failed.",
    };
  }
  if (!records || records.length === 0) {
    return {
      valid: false,
      error: "Website unreachable: the domain does not exist or DNS failed.",
    };
  }
  for (const record of records) {
    if (isPrivateIpAddress(record.address)) {
      return {
        valid: false,
        error: "The domain resolves to a private or restricted address.",
      };
    }
  }

  return new Promise((resolve) => {
    let settled = false;
    let buffer = "";
    let headersParsed = false;
    let bodyTimer: ReturnType<typeof setTimeout> | undefined;

    const socket = tls.connect({
      host: currentHost,
      port: 443,
      servername: currentHost,
      timeout: TLS_TIMEOUT_MS,
      rejectUnauthorized: true,
    });

    const finish = (result: { valid: boolean; status?: number; error?: string }) => {
      if (settled) return;
      settled = true;
      if (bodyTimer) clearTimeout(bodyTimer);
      try {
        socket.destroy();
      } catch {}
      resolve(result);
    };

    const inspectBody = () => {
      const adult = inspectContentForAdultCompliance(buffer);
      if (adult.isAdult) {
        finish({
          valid: false,
          error: adult.reason ?? "Adult or explicit websites are not supported.",
        });
        return;
      }
      finish({ valid: true, status: currentStatus() });
    };

    const currentStatus = (): number => {
      const match = buffer.split(/\r?\n/)[0]?.match(/^HTTP\/[0-9.]+\s+([0-9]{3})/);
      return match ? Number.parseInt(match[1], 10) : 0;
    };

    socket.on("secureConnect", () => {
      const remoteIp = socket.remoteAddress;
      if (remoteIp && isPrivateIpAddress(remoteIp)) {
        finish({
          valid: false,
          error: "The site connected to a private or restricted address.",
        });
        return;
      }
      socket.write(
        `GET ${path || "/"} HTTP/1.1\r\n` +
          `Host: ${currentHost}\r\n` +
          "User-Agent: Uno-Bot/1.0 (+https://uno.mhrithik.com; domain verification)\r\n" +
          "Accept: text/html,application/xhtml+xml,*/*\r\n" +
          "Connection: close\r\n\r\n",
      );
    });

    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      if (!headersParsed && (buffer.includes("\r\n\r\n") || buffer.includes("\n\n"))) {
        headersParsed = true;
        const status = currentStatus();

        if ([301, 302, 307, 308].includes(status)) {
          let location = "";
          for (const line of buffer.split(/\r?\n/)) {
            if (/^location:/i.test(line)) {
              location = line.replace(/^location:\s*/i, "").trim();
              break;
            }
          }
          if (location) {
            try {
              const next = new URL(location, `https://${currentHost}`);
              if (next.protocol !== "https:") {
                finish({
                  valid: false,
                  error: "The site redirected to a non-secure HTTP address. Only HTTPS is accepted.",
                });
                return;
              }
              const nextHost = next.hostname.toLowerCase();
              if (isPrivateIpAddress(nextHost)) {
                finish({
                  valid: false,
                  error: "The site redirected to a private or restricted address.",
                });
                return;
              }
              const requestedRoot = initialDomain.split(".").slice(-2).join(".");
              const nextRoot = nextHost.split(".").slice(-2).join(".");
              const requestedName = initialDomain.replace(/^www\./, "").split(".")[0];
              const nextName = nextHost.replace(/^www\./, "").split(".")[0];
              const sameBrand =
                requestedName === nextName ||
                nextHost.includes(requestedName) ||
                initialDomain.includes(nextName);

              if (
                requestedRoot &&
                nextRoot &&
                requestedRoot !== nextRoot &&
                !nextHost.includes(requestedRoot) &&
                !sameBrand
              ) {
                finish({
                  valid: false,
                  error: "The site redirected to a different destination. Enter its direct domain.",
                });
                return;
              }

              void checkSecureTlsLiveness(
                nextHost,
                next.pathname + next.search,
                initialDomain,
                hops + 1,
              ).then(finish);
              return;
            } catch {
              // Fall through to the current status.
            }
          }
        }

        if (
          buffer.length >= 8192 ||
          buffer.includes("</head>") ||
          buffer.includes("</html>")
        ) {
          inspectBody();
        } else {
          bodyTimer = setTimeout(inspectBody, 200);
        }
      } else if (
        headersParsed &&
        (buffer.length >= 8192 ||
          buffer.includes("</head>") ||
          buffer.includes("</html>"))
      ) {
        inspectBody();
      }
    });

    socket.on("end", inspectBody);

    socket.setTimeout(TLS_TIMEOUT_MS, () => {
      finish({
        valid: false,
        error: "Website unreachable: the server timed out. Make sure the site is responsive.",
      });
    });

    socket.on("error", (error: Error) => {
      const message = String(error?.message ?? error).toLowerCase();
      if (
        /cert_|certificate|self[- ]signed|unable_to_verify|depth_zero|ssl|tls/.test(
          message,
        )
      ) {
        finish({
          valid: false,
          error: "This website does not have a valid, trusted HTTPS certificate.",
        });
      } else if (/econnrefused|econnreset/.test(message)) {
        finish({
          valid: false,
          error: "Website unreachable: the connection was refused.",
        });
      } else if (/enotfound|eai_again/.test(message)) {
        finish({
          valid: false,
          error: "Website unreachable: the domain does not exist or DNS failed.",
        });
      } else {
        finish({
          valid: false,
          error:
            "Website unreachable: could not establish a secure HTTPS connection.",
        });
      }
    });
  });
}
